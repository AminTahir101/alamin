"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type ChatRole = "user" | "assistant";
type ChatMessage = { id: string; role: ChatRole; content: string };
type OrgAiCopilotProps = { slug: string };
type ActionType = "chat" | "create_okr" | "generate_jtbd" | "create_tasks" | "rewrite_kpi" | "diagnose_underperformance" | "update_kpi_value";
type SseEvent = { event: string; data: string };
type ResponseCompletedPayload = { response?: { output?: Array<{ type?: string; role?: string; content?: Array<{ type?: string; text?: string }> }> } };
type ActionPreviewResponse = { ok?: boolean; error?: string; action?: string; mode?: "preview" | "executed"; preview?: Record<string, unknown>; wrote?: boolean; entity?: string; summary?: string; message?: string; created?: Record<string, unknown> | null };
type PreviewState = { action: Exclude<ActionType, "chat">; prompt: string; data: Record<string, unknown> };
type UploadedFile = { id: string; file_name: string; file_type: string; size_bytes: number; created_at: string };

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
function safeString(v: unknown) { return typeof v === "string" ? v : ""; }
function asObject(v: unknown): Record<string, unknown> | null { return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null; }
function asArray(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }

function parseSseEvents(chunk: string) {
  const blocks = chunk.replace(/\r\n/g, "\n").split("\n\n");
  const events: SseEvent[] = [];
  for (const block of blocks.slice(0, -1)) {
    let event = ""; const dp: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) { event = line.slice(6).trim(); continue; }
      if (line.startsWith("data:")) dp.push(line.slice(5).trim());
    }
    const data = dp.join("\n");
    if (data) events.push({ event, data });
  }
  return { events, remainder: blocks[blocks.length - 1] ?? "" };
}

function extractTextFromCompleted(payload: ResponseCompletedPayload): string {
  return (payload.response?.output ?? []).flatMap(item =>
    item.type === "message" ? (item.content ?? []).filter(c => c.type === "output_text" && typeof c.text === "string").map(c => c.text!) : []
  ).join("\n").trim();
}

function tryJson(text: string) { try { return JSON.parse(text) as Record<string, unknown>; } catch { return null; } }

const PLACEHOLDERS: Record<ActionType, string> = {
  chat: "Ask about performance, blockers, OKR quality, KPI gaps, or what to prioritize...",
  create_okr: "Create a Q2 OKR for Sales to improve qualified pipeline and close rate...",
  generate_jtbd: "Generate JTBD for Customer Success to improve onboarding completion...",
  create_tasks: "Create execution tasks for the most at-risk KR in Sales...",
  rewrite_kpi: "Rewrite 'Increase sales' into a measurable KPI with baseline and target...",
  diagnose_underperformance: "Diagnose why the company is underperforming this quarter...",
  update_kpi_value: "Update the MQL to SQL KPI — we closed 24 leads out of 90 MQLs this month...",
};


async function exportPdf(message: ChatMessage, slug: string) {
  try {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "position:absolute;left:-9999px;top:0;width:900px;background:#fff;padding:40px;font-family:Arial,sans-serif;color:#111;";
    wrapper.innerHTML = `<div style="border-bottom:2px solid #e5e7eb;padding-bottom:20px;margin-bottom:30px;"><div style="font-size:22px;font-weight:700;">ALAMIN AI</div><div style="font-size:13px;color:#6b7280;">${slug} · ${new Date().toLocaleString()}</div></div><div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;white-space:pre-wrap;line-height:1.8;font-size:14px;">${message.content.split(/---\s*\nAsk next:/i)[0].trim()}</div>`;
    document.body.appendChild(wrapper);
    const canvas = await html2canvas(wrapper, { scale: 2, useCORS: true });
    document.body.removeChild(wrapper);
    const pdf = new jsPDF("p", "mm", "a4");
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, (canvas.height * 210) / canvas.width);
    pdf.save(`ALAMIN-AI-${Date.now()}.pdf`);
  } catch { alert("Failed to export PDF."); }
}

/* ── Streaming cursor animation ── */
function StreamingCursor() {
  return (
    <span className="inline-block align-middle">
      <style>{`
        @keyframes alamin-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .alamin-cursor { display:inline-block; width:2px; height:1.1em; background:currentColor; margin-left:2px; vertical-align:text-bottom; animation:alamin-blink 1s step-end infinite; border-radius:1px; }
        @keyframes alamin-dot { 0%,80%,100%{transform:scale(0);opacity:0} 40%{transform:scale(1);opacity:1} }
        .alamin-thinking span { display:inline-block; width:7px; height:7px; border-radius:50%; background:currentColor; margin:0 2px; opacity:0.4; animation:alamin-dot 1.4s ease-in-out infinite; }
        .alamin-thinking span:nth-child(2){animation-delay:.2s}
        .alamin-thinking span:nth-child(3){animation-delay:.4s}
        @keyframes alamin-fade-in { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .alamin-msg-in { animation: alamin-fade-in 0.22s ease-out both; }
        @keyframes alamin-word { from{opacity:0} to{opacity:1} }
      `}</style>
      <span className="alamin-cursor" />
    </span>
  );
}

function ThinkingDots() {
  return (
    <span className="alamin-thinking">
      <span /><span /><span />
    </span>
  );
}

export default function OrgAiCopilot({ slug }: OrgAiCopilotProps) {
  const { t } = useLanguage();
  const pg = t.pages.yourAI;

  const QUICK_ACTIONS = useMemo<Array<{ key: ActionType; label: string }>>(() => [
    { key: "chat", label: pg.actionTellMe },
    { key: "diagnose_underperformance", label: pg.actionDiagnose },
    { key: "create_okr", label: pg.actionCreateOKR },
    { key: "generate_jtbd", label: pg.actionJTBD },
    { key: "create_tasks", label: pg.actionTasks },
    { key: "rewrite_kpi", label: pg.actionRewriteKPI },
    { key: "update_kpi_value", label: pg.actionUpdateKPI },
  ], [pg]);

  const STARTERS = useMemo(() => [
    { label: pg.starterDiagnose, prompt: "What is the biggest execution risk this cycle?", action: "chat" as ActionType },
    { label: pg.starterCreateOKR, prompt: "Create an OKR for improving qualified pipeline conversion.", action: "create_okr" as ActionType },
    { label: pg.starterTasks, prompt: "Create tasks for the weakest KPI in the company.", action: "create_tasks" as ActionType },
    { label: pg.starterRewriteKPI, prompt: "Rewrite 'Increase revenue' into a measurable KPI with target.", action: "rewrite_kpi" as ActionType },
  ], [pg]);

  const labelForAction = useCallback((a: ActionType) => {
    return QUICK_ACTIONS.find(m => m.key === a)?.label ?? a;
  }, [QUICK_ACTIONS]);

  const [action, setAction] = useState<ActionType>("chat");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showFiles, setShowFiles] = useState(false);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isLoading = chatLoading || actionLoading;
  const isEmpty = messages.length === 0 && !preview;

  function scrollToBottom() {
    requestAnimationFrame(() => { scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" }); });
  }

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Session expired.");
    return data.session.access_token;
  }

  const loadFiles = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/o/${encodeURIComponent(slug)}/ai/files`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json() as { ok: boolean; files?: UploadedFile[] };
      if (data.ok) setFiles(data.files ?? []);
    } catch { /* silent */ }
  }, [slug]);

  useEffect(() => { void loadFiles(); }, [loadFiles]);

  async function handleUpload(file: File) {
    if (file.size > 2 * 1024 * 1024) { setErrorMsg("File exceeds 2 MB limit"); return; }
    setUploading(true); setErrorMsg(null);
    const mimeType = file.type;
    const isFinancial = mimeType.includes("csv") || mimeType.includes("excel") || mimeType.includes("spreadsheet") || file.name.match(/\.(csv|xlsx|xls)$/i);
    const fileType = isFinancial ? "financial" : "company_doc";
    try {
      const token = await getToken();
      const form = new FormData();
      form.append("file", file); form.append("type", fileType);
      const res = await fetch(`/api/o/${encodeURIComponent(slug)}/ai/files`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) setErrorMsg(data.error ?? "Upload failed");
      else { await loadFiles(); setShowFiles(true); }
    } catch { setErrorMsg("Upload failed"); }
    finally { setUploading(false); }
  }

  async function handleDeleteFile(id: string) {
    try {
      const token = await getToken();
      await fetch(`/api/o/${encodeURIComponent(slug)}/ai/files`, { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      await loadFiles();
    } catch { /* silent */ }
  }

  function fmtBytes(b: number) { return b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`; }

  async function runChat(inputText: string) {
    const text = inputText.trim(); if (!text) return;
    setErrorMsg(null); setSuccessMsg(null); setPreview(null); setChatLoading(true);
    const assistantId = uid();
    setStreamingId(assistantId);
    const nextMessages: ChatMessage[] = [...messages, { id: uid(), role: "user", content: text }, { id: assistantId, role: "assistant", content: "" }];
    setMessages(nextMessages); setPrompt(""); scrollToBottom();
    try {
      const token = await getToken();
      const res = await fetch(`/api/o/${encodeURIComponent(slug)}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: nextMessages.filter(m => !(m.role === "assistant" && m.content === "")).map(m => ({ role: m.role, content: m.content })) }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text().catch(() => "") || "Chat failed");
      const reader = res.body.getReader(); const decoder = new TextDecoder();
      let buffer = ""; let finalText = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, remainder } = parseSseEvents(buffer); buffer = remainder;
        for (const ev of events) {
          if (!ev.data || ev.data === "[DONE]") continue;
          const d = tryJson(ev.data); if (!d) continue;
          const type = safeString(d.type);
          if (type === "response.output_text.delta") {
            const delta = safeString(d.delta);
            if (delta) {
              finalText += delta;
              setMessages(prev => { const c = [...prev]; const last = c[c.length - 1]; if (last?.role === "assistant") c[c.length - 1] = { ...last, content: finalText }; return c; });
            }
          }
          if (type === "response.completed") {
            const ex = extractTextFromCompleted(d as ResponseCompletedPayload);
            if (ex) { finalText = ex; setMessages(prev => { const c = [...prev]; const last = c[c.length - 1]; if (last?.role === "assistant") c[c.length - 1] = { ...last, content: ex }; return c; }); }
          }
        }
        scrollToBottom();
      }
      if (!finalText.trim()) setMessages(prev => { const c = [...prev]; const last = c[c.length - 1]; if (last?.role === "assistant") c[c.length - 1] = { ...last, content: "No response returned. Try again." }; return c; });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chat failed";
      setErrorMsg(msg);
      setMessages(prev => { const c = [...prev]; const last = c[c.length - 1]; if (last?.role === "assistant") c[c.length - 1] = { ...last, content: `Error: ${msg}` }; return c; });
    } finally { setChatLoading(false); setStreamingId(null); scrollToBottom(); }
  }

  async function runAction(inputText: string) {
    const text = inputText.trim(); if (!text) return;
    setErrorMsg(null); setSuccessMsg(null); setPreview(null); setActionLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/o/${encodeURIComponent(slug)}/ai/actions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, prompt: text }) });
      const parsed = tryJson(await res.text()) as ActionPreviewResponse | null;
      if (!res.ok || !parsed?.ok || !parsed.preview) throw new Error(parsed?.error ?? "Action failed");
      setPreview({ action: action as Exclude<ActionType, "chat">, prompt: text, data: parsed.preview });
      setSuccessMsg(pg.previewReady);
      setPrompt("");
    } catch (err) { setErrorMsg(err instanceof Error ? err.message : "Action failed"); }
    finally { setActionLoading(false); }
  }

  async function approvePreview() {
    if (!preview) return;
    setApproveLoading(true); setErrorMsg(null); setSuccessMsg(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/o/${encodeURIComponent(slug)}/ai/actions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-ai-mode": "execute" }, body: JSON.stringify({ action: preview.action, prompt: preview.prompt, preview: preview.data }) });
      const parsed = tryJson(await res.text()) as ActionPreviewResponse | null;
      if (!res.ok || !parsed?.ok) throw new Error(parsed?.error ?? "Approval failed");
      setMessages(prev => [...prev, { id: uid(), role: "assistant", content: parsed.message || parsed.summary || `${labelForAction(preview.action)} completed.` }]);
      setPreview(null); setSuccessMsg(parsed.summary || "Saved."); scrollToBottom();
    } catch (err) { setErrorMsg(err instanceof Error ? err.message : "Approval failed"); }
    finally { setApproveLoading(false); }
  }

  async function handleSubmit() {
    if (!prompt.trim() || isLoading) return;
    if (action === "chat") await runChat(prompt); else await runAction(prompt);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSubmit(); }
  }

  return (
    <>
      <style>{`
        @keyframes alamin-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .alamin-cursor { display:inline-block;width:2px;height:1.1em;background:currentColor;margin-left:2px;vertical-align:text-bottom;animation:alamin-blink 1s step-end infinite;border-radius:1px; }
        @keyframes alamin-dot { 0%,80%,100%{transform:scale(0);opacity:0} 40%{transform:scale(1);opacity:1} }
        .alamin-thinking { display:inline-flex;align-items:center;gap:4px;padding:2px 0; }
        .alamin-thinking span { display:inline-block;width:7px;height:7px;border-radius:50%;background:currentColor;opacity:0.5;animation:alamin-dot 1.4s ease-in-out infinite; }
        .alamin-thinking span:nth-child(2){animation-delay:.2s}
        .alamin-thinking span:nth-child(3){animation-delay:.4s}
        @keyframes alamin-msg { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .alamin-msg-in { animation:alamin-msg 0.2s ease-out both; }
      `}</style>

      <div className="flex h-full flex-col" style={{ minHeight: "calc(100vh - 80px)" }}>

        {/* Hidden file input — single, auto-detects type */}
        <input ref={fileRef} type="file" className="hidden"
          accept=".pdf,.docx,.txt,.csv,.xlsx,.xls"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ""; }} />

        {/* ── Scrollable message area ── */}
        <div ref={scrollerRef} className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>

          {/* Empty state */}
          {isEmpty && !isLoading && (
            <div className="flex h-full min-h-[360px] flex-col items-center justify-center px-4 text-center">
              <h2 className="text-4xl font-semibold tracking-tight text-[var(--foreground)] md:text-5xl">
                {pg.howCanIHelp}
              </h2>
              <p className="mt-4 text-base text-[var(--foreground-muted)]">
                {pg.copilotSubtext}
              </p>
            </div>
          )}

          {/* Messages */}
          {messages.length > 0 && (
            <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
              {messages.map((message) => {
                const isStreaming = message.id === streamingId;
                const raw = message.content;
                const display = raw.split(/---\s*\nAsk next:/i)[0].trim();
                const followUps = (() => {
                  const parts = raw.split(/---\s*\nAsk next:/i);
                  if (parts.length < 2) return [];
                  return parts[1].trim().split("\n").filter(l => /^\d+\./.test(l.trim())).map(l => l.replace(/^\d+\.\s*/, "").trim()).filter(Boolean).slice(0, 3);
                })();

                return (
                  <div key={message.id} className={`alamin-msg-in flex gap-3 ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    {message.role === "assistant" && (
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--foreground)] text-xs font-bold text-[var(--background)]">A</div>
                    )}
                    <div className={[
                      "max-w-[85%] rounded-2xl px-5 py-4 text-base leading-8",
                      message.role === "user"
                        ? "bg-[var(--foreground)] text-[var(--background)]"
                        : "bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)]",
                    ].join(" ")}>
                      {/* Thinking state — empty assistant message */}
                      {message.role === "assistant" && !display && isStreaming && (
                        <span className="alamin-thinking text-[var(--foreground-muted)]">
                          <span /><span /><span />
                        </span>
                      )}
                      {/* Content */}
                      {display && (
                        <div className="whitespace-pre-wrap">
                          {display}
                          {isStreaming && <span className="alamin-cursor" />}
                        </div>
                      )}
                      {/* Follow-ups + export — only on complete messages */}
                      {message.role === "assistant" && display && !isStreaming && (
                        <div className="mt-4 space-y-3">
                          {followUps.length > 0 && (
                            <div className="border-t border-[var(--border)] pt-3">
                              <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--foreground-faint)]">{pg.askNext}</div>
                              <div className="flex flex-col gap-2">
                                {followUps.map((s) => (
                                  <button key={s} type="button"
                                    onClick={() => { setPrompt(s); setAction("chat"); textareaRef.current?.focus(); }}
                                    className="rounded-xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2.5 text-left text-sm text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]">
                                    {s}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          <button type="button" onClick={() => void exportPdf(message, slug)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3.5 py-2 text-xs text-[var(--foreground-faint)] transition hover:text-[var(--foreground)]">
                            ↓ {pg.exportPDF}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Preview panel */}
          {preview && (
            <div className="mx-auto w-full max-w-2xl px-4 pb-6">
              <div className="alamin-msg-in rounded-2xl border border-[var(--border-active)] bg-[var(--card)] p-5">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-[var(--foreground-faint)]">Preview · {labelForAction(preview.action)}</div>
                    {safeString(preview.data.summary) && <div className="mt-1.5 text-sm text-[var(--foreground-muted)]">{safeString(preview.data.summary)}</div>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {preview.action !== "diagnose_underperformance" && (
                      <button type="button" onClick={() => void approvePreview()} disabled={approveLoading}
                        className="inline-flex h-9 items-center rounded-xl bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:opacity-50">
                        {approveLoading ? t.pages.common.saving : pg.approveAndSave}
                      </button>
                    )}
                    <button type="button" onClick={() => { setPreview(null); setSuccessMsg(null); }} disabled={approveLoading}
                      className="inline-flex h-9 items-center rounded-xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] disabled:opacity-50">
                      {preview.action === "diagnose_underperformance" ? t.pages.common.close : pg.discard}
                    </button>
                  </div>
                </div>
                <PreviewContent preview={preview} />
              </div>
            </div>
          )}
        </div>

        {/* ── Bottom: input + controls ── */}
        <div className="shrink-0 px-4 pb-6 pt-3">
          <div className="mx-auto w-full max-w-2xl space-y-3">

            {/* Alerts */}
            {errorMsg && (
              <div className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {errorMsg}
                <button type="button" onClick={() => setErrorMsg(null)} className="ml-3 opacity-50 hover:opacity-100">✕</button>
              </div>
            )}
            {successMsg && (
              <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                {successMsg}
                <button type="button" onClick={() => setSuccessMsg(null)} className="ml-3 opacity-50 hover:opacity-100">✕</button>
              </div>
            )}

            {/* Input box */}
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm transition-shadow focus-within:border-[var(--border-strong)] focus-within:shadow-[0_0_0_3px_rgba(0,0,0,0.06)]">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => { setPrompt(e.target.value); autoResize(); }}
                onKeyDown={handleKeyDown}
                placeholder={PLACEHOLDERS[action]}
                rows={2}
                className="w-full resize-none bg-transparent px-5 pt-4 pb-2 text-base leading-7 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)]"
                style={{ minHeight: "68px", maxHeight: "200px" }}
              />
              {/* Toolbar */}
              <div className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-2.5">
                {/* Single file attach button */}
                <button type="button" onClick={() => fileRef.current?.click()} title="Attach file (PDF, DOCX, TXT, CSV, XLSX)"
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--foreground-faint)] transition hover:bg-[var(--button-secondary-bg)] hover:text-[var(--foreground)]">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                  </svg>
                </button>
                {/* Files count badge */}
                {files.length > 0 && (
                  <button type="button" onClick={() => setShowFiles(v => !v)}
                    className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3 text-xs font-semibold text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)]">
                    {files.length} file{files.length > 1 ? "s" : ""}
                  </button>
                )}
                <div className="h-4 w-px bg-[var(--border)]" />
                <span className="text-xs text-[var(--foreground-faint)]">
                  {action === "chat" ? pg.tellMeAnything : `${labelForAction(action)} · ${pg.previewFirst}`}
                </span>
                {/* Send — icon only */}
                <div className="ml-auto">
                  <button type="button" onClick={() => void handleSubmit()} disabled={isLoading || !prompt.trim()}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--foreground)] text-[var(--background)] transition hover:opacity-80 disabled:opacity-25">
                    {isLoading ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--background)]/30 border-t-[var(--background)]" />
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Quick action chips */}
            <div className="flex flex-wrap items-center gap-2">
              {QUICK_ACTIONS.map((qa) => (
                <button key={qa.key} type="button"
                  onClick={() => { setAction(qa.key); textareaRef.current?.focus(); }}
                  className={[
                    "inline-flex items-center rounded-xl border px-4 py-2 text-sm font-medium transition",
                    action === qa.key
                      ? "border-[var(--border-active)] bg-[var(--foreground)] text-[var(--background)]"
                      : "border-[var(--border)] bg-[var(--button-secondary-bg)] text-[var(--foreground-soft)] hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]",
                  ].join(" ")}>
                  {qa.label}
                </button>
              ))}
              <button type="button" onClick={() => setShowFiles(v => !v)}
                className={[
                  "ml-auto inline-flex items-center rounded-xl border px-4 py-2 text-sm font-medium transition",
                  showFiles
                    ? "border-[var(--border-active)] bg-[var(--foreground)] text-[var(--background)]"
                    : "border-[var(--border)] bg-[var(--button-secondary-bg)] text-[var(--foreground-soft)] hover:border-[var(--border-strong)]",
                ].join(" ")}>
                {pg.filesToggle}
              </button>
            </div>

            {/* Starter prompts — empty state only */}
            {isEmpty && (
              <div className="flex flex-wrap items-center gap-2">
                {STARTERS.map((s) => (
                  <button key={s.label} type="button"
                    onClick={() => { setPrompt(s.prompt); setAction(s.action); textareaRef.current?.focus(); }}
                    className="inline-flex items-center rounded-xl border border-[var(--border)] bg-[var(--card-soft)] px-4 py-2 text-sm font-medium text-[var(--foreground-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)] hover:text-[var(--foreground)]">
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {/* Files panel */}
            {showFiles && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-soft)] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-widest text-[var(--foreground-faint)]">{pg.contextFiles}</span>
                  <button type="button" onClick={() => setShowFiles(false)} className="text-[var(--foreground-faint)] hover:text-[var(--foreground)] text-sm">✕</button>
                </div>
                <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
                  className="rounded-xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2.5 text-sm font-medium text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] disabled:opacity-50">
                  {uploading ? pg.uploading : pg.attachFile}
                </button>
                {files.length > 0 && (
                  <div className="mt-3 grid gap-2">
                    {files.map((f) => (
                      <div key={f.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5">
                        <div>
                          <div className="max-w-[280px] truncate text-sm font-semibold text-[var(--foreground)]">{f.file_name}</div>
                          <div className="text-xs text-[var(--foreground-faint)]">{f.file_type === "company_doc" ? pg.companyDoc : pg.financial} · {fmtBytes(f.size_bytes)}</div>
                        </div>
                        <button type="button" onClick={() => void handleDeleteFile(f.id)}
                          className="px-2 py-1 text-xs text-[var(--foreground-faint)] transition hover:text-red-500">
                          {pg.removeFile}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Nav links */}
            <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
              {[{ href: `/o/${slug}/dashboard`, label: "Dashboard" }, { href: `/o/${slug}/kpis`, label: "KPIs" }, { href: `/o/${slug}/objectives`, label: "Objectives" }, { href: `/o/${slug}/tasks`, label: "Tasks" }].map(link => (
                <Link key={link.href} href={link.href} className="text-sm text-[var(--foreground-faint)] transition hover:text-[var(--foreground)]">{link.label}</Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function PreviewContent({ preview }: { preview: PreviewState }) {
  const data = preview.data;
  const chip = "rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3 py-1.5 text-xs text-[var(--foreground-soft)]";

  if (preview.action === "diagnose_underperformance") {
    const causes = asArray(data.causes); const actions = asArray(data.actions);
    return (
      <div className="space-y-3 text-sm">
        {safeString(data.diagnosis) && <div className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4 leading-7 whitespace-pre-wrap text-[var(--foreground)]">{safeString(data.diagnosis)}</div>}
        {causes.length > 0 && <div><div className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--foreground-faint)]">Likely causes</div><div className="space-y-1.5">{causes.map((c, i) => <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] px-4 py-3 text-[var(--foreground)]">{safeString(c)}</div>)}</div></div>}
        {actions.length > 0 && <div><div className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--foreground-faint)]">Recommended actions</div><div className="space-y-1.5">{actions.map((a, i) => <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] px-4 py-3 text-[var(--foreground)]">{safeString(a)}</div>)}</div></div>}
      </div>
    );
  }

  const okr = asObject(data.okr);
  if (preview.action === "create_okr" && okr) {
    return (
      <div className="space-y-2 text-sm">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4">
          <div className="text-base font-semibold text-[var(--foreground)]">{safeString(okr.title) || "Untitled OKR"}</div>
          {safeString(okr.description) && <div className="mt-1.5 text-[var(--foreground-muted)]">{safeString(okr.description)}</div>}
          <div className="mt-3 flex flex-wrap gap-1.5">{[`Status: ${safeString(okr.status) || "draft"}`, `Progress: ${okr.progress ?? 0}%`].map(c => <span key={c} className={chip}>{c}</span>)}</div>
        </div>
        {asArray(okr.key_results).map((kr, i) => {
          const row = asObject(kr) ?? {}; const cur = Number(row.current_value ?? 0); const tgt = Number(row.target_value ?? 0); const pct = tgt > 0 ? Math.max(0, Math.min(100, (cur / tgt) * 100)) : 0;
          return <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4"><div className="font-medium text-[var(--foreground)]">{safeString(row.title) || `KR ${i + 1}`}</div><div className="mt-2 flex flex-wrap gap-1.5">{[`${cur}/${tgt} ${safeString(row.unit)}`, safeString(row.status) || "not_started"].map(c => <span key={c} className={chip}>{c}</span>)}</div><div className="mt-3 h-1.5 w-full rounded-full bg-[var(--border)]"><div className="h-full rounded-full bg-[var(--foreground)] transition-all" style={{ width: `${pct}%` }} /></div></div>;
        })}
      </div>
    );
  }

  const cluster = asObject(data.cluster);
  if ((preview.action === "generate_jtbd" || preview.action === "create_tasks") && cluster) {
    return (
      <div className="space-y-2 text-sm">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4"><div className="text-base font-semibold text-[var(--foreground)]">{safeString(cluster.title) || "Untitled"}</div>{safeString(cluster.description) && <div className="mt-1.5 text-[var(--foreground-muted)]">{safeString(cluster.description)}</div>}</div>
        {asArray(data.tasks).map((task, i) => { const row = asObject(task) ?? {}; return <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4"><div className="font-medium text-[var(--foreground)]">{safeString(row.title) || `Task ${i + 1}`}</div>{safeString(row.description) && <div className="mt-1.5 text-[var(--foreground-muted)]">{safeString(row.description)}</div>}<div className="mt-2 flex flex-wrap gap-1.5">{[safeString(row.status) || "todo", safeString(row.priority) || "medium"].map(c => <span key={c} className={chip}>{c}</span>)}</div></div>; })}
      </div>
    );
  }

  const kpi = asObject(data.kpi);
  if (preview.action === "rewrite_kpi" && kpi) {
    return <div className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4 text-sm space-y-2"><div className="text-base font-semibold text-[var(--foreground)]">{safeString(kpi.title) || "Untitled KPI"}</div>{safeString(kpi.description) && <div className="text-[var(--foreground-muted)]">{safeString(kpi.description)}</div>}<div className="flex flex-wrap gap-1.5">{[`Unit: ${safeString(kpi.unit) || "—"}`, `Direction: ${safeString(kpi.direction) || "increase"}`, `Current: ${kpi.current_value ?? 0}`, `Target: ${kpi.target_value ?? 0}`].map(c => <span key={c} className={chip}>{c}</span>)}</div></div>;
  }

  if (preview.action === "update_kpi_value") {
    return <div className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4 text-sm space-y-2"><div className="text-base font-semibold text-[var(--foreground)]">{safeString(data.kpi_title) || "KPI Update"}</div><div className="flex flex-wrap gap-1.5">{[`New value: ${data.current_value ?? "—"}`, `Target: ${data.target_value ?? "—"}`].map(c => <span key={c} className={chip}>{c}</span>)}</div>{safeString(data.rationale) && <div className="text-[var(--foreground-muted)]">{safeString(data.rationale)}</div>}</div>;
  }

  return <pre className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4 text-sm text-[var(--foreground-soft)] whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>;
}
