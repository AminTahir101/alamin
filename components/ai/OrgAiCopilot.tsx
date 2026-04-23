"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase } from "@/lib/supabaseClient";

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
  return (payload.response?.output ?? []).flatMap(item => item.type === "message" ? (item.content ?? []).filter(c => c.type === "output_text" && typeof c.text === "string").map(c => c.text!) : []).join("\n").trim();
}

function tryJson(text: string) { try { return JSON.parse(text) as Record<string, unknown>; } catch { return null; } }

const QUICK_ACTIONS: Array<{ key: ActionType; label: string; icon: string }> = [
  { key: "diagnose_underperformance", label: "Diagnose", icon: "M" },
  { key: "create_okr", label: "Create OKR", icon: "O" },
  { key: "generate_jtbd", label: "JTBD", icon: "J" },
  { key: "create_tasks", label: "Tasks", icon: "T" },
  { key: "rewrite_kpi", label: "Rewrite KPI", icon: "K" },
  { key: "update_kpi_value", label: "Update KPI", icon: "U" },
];

const PLACEHOLDERS: Record<ActionType, string> = {
  chat: "Ask about performance, blockers, OKR quality, or what to prioritize...",
  create_okr: "Create a Q2 OKR for Sales to improve qualified pipeline...",
  generate_jtbd: "Generate JTBD for Customer Success to improve onboarding...",
  create_tasks: "Create execution tasks for the most at-risk KR in Sales...",
  rewrite_kpi: "Rewrite 'Increase sales' into a measurable KPI with baseline...",
  diagnose_underperformance: "Diagnose why the company is underperforming this quarter...",
  update_kpi_value: "Update the MQL to SQL KPI — we closed 24 leads out of 90 this month...",
};

const STARTER_PROMPTS = [
  { label: "Diagnose performance", prompt: "What is the biggest execution risk this cycle?", action: "chat" as ActionType },
  { label: "Create OKR", prompt: "Create an OKR for improving qualified pipeline conversion.", action: "create_okr" as ActionType },
  { label: "Generate tasks", prompt: "Create tasks for the weakest KPI in the company.", action: "create_tasks" as ActionType },
  { label: "Rewrite a KPI", prompt: "Rewrite 'Increase revenue' into a measurable KPI with target.", action: "rewrite_kpi" as ActionType },
];

function labelForAction(a: ActionType) {
  return QUICK_ACTIONS.find(m => m.key === a)?.label ?? (a === "chat" ? "Chat" : a);
}

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

export default function OrgAiCopilot({ slug }: OrgAiCopilotProps) {
  const [action, setAction] = useState<ActionType>("chat");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showFiles, setShowFiles] = useState(false);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const companyFileRef = useRef<HTMLInputElement>(null);
  const financialFileRef = useRef<HTMLInputElement>(null);

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

  async function handleUpload(file: File, fileType: "company_doc" | "financial") {
    if (file.size > 2 * 1024 * 1024) { setErrorMsg("File exceeds 2 MB"); return; }
    setUploading(true); setErrorMsg(null);
    try {
      const token = await getToken();
      const form = new FormData();
      form.append("file", file); form.append("type", fileType);
      const res = await fetch(`/api/o/${encodeURIComponent(slug)}/ai/files`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) setErrorMsg(data.error ?? "Upload failed");
      else { await loadFiles(); }
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
    const nextMessages: ChatMessage[] = [...messages, { id: uid(), role: "user", content: text }, { id: uid(), role: "assistant", content: "" }];
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
          if (type === "response.output_text.delta") { const delta = safeString(d.delta); if (delta) { finalText += delta; setMessages(prev => { const c = [...prev]; const last = c[c.length - 1]; if (last?.role === "assistant") c[c.length - 1] = { ...last, content: finalText }; return c; }); } }
          if (type === "response.completed") { const ex = extractTextFromCompleted(d as ResponseCompletedPayload); if (ex) { finalText = ex; setMessages(prev => { const c = [...prev]; const last = c[c.length - 1]; if (last?.role === "assistant") c[c.length - 1] = { ...last, content: ex }; return c; }); } }
        }
        scrollToBottom();
      }
      if (!finalText.trim()) setMessages(prev => { const c = [...prev]; const last = c[c.length - 1]; if (last?.role === "assistant") c[c.length - 1] = { ...last, content: "No response returned. Try again." }; return c; });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chat failed";
      setErrorMsg(msg);
      setMessages(prev => { const c = [...prev]; const last = c[c.length - 1]; if (last?.role === "assistant") c[c.length - 1] = { ...last, content: `Error: ${msg}` }; return c; });
    } finally { setChatLoading(false); scrollToBottom(); }
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
      setSuccessMsg("Preview ready — review before saving.");
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
    <div className="flex h-full flex-col" style={{ minHeight: "calc(100vh - 80px)" }}>

      {/* Hidden file inputs */}
      <input ref={companyFileRef} type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f, "company_doc"); e.target.value = ""; }} />
      <input ref={financialFileRef} type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f, "financial"); e.target.value = ""; }} />

      {/* ── Message thread (scrollable) ── */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>

        {/* Empty state — centered, like the reference */}
        {isEmpty && !isLoading && (
          <div className="flex h-full min-h-[400px] flex-col items-center justify-center px-4 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-[var(--foreground)] md:text-4xl">
              How can I help today?
            </h2>
            <p className="mt-3 text-sm text-[var(--foreground-muted)]">
              Ask about performance, generate OKRs, diagnose blockers, or update KPIs.
            </p>
          </div>
        )}

        {/* Messages */}
        {messages.length > 0 && (
          <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
            {messages.map((message) => {
              const raw = message.content || (chatLoading && message.role === "assistant" ? "…" : "");
              const display = raw.split(/---\s*\nAsk next:/i)[0].trim();
              const followUps = (() => {
                const parts = raw.split(/---\s*\nAsk next:/i);
                if (parts.length < 2) return [];
                return parts[1].trim().split("\n").filter(l => /^\d+\./.test(l.trim())).map(l => l.replace(/^\d+\.\s*/, "").trim()).filter(Boolean).slice(0, 3);
              })();

              return (
                <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  {message.role === "assistant" && (
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--foreground)] text-[11px] font-bold text-[var(--background)]">A</div>
                  )}
                  <div className={["max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-7",
                    message.role === "user"
                      ? "bg-[var(--foreground)] text-[var(--background)]"
                      : "bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)]",
                  ].join(" ")}>
                    <div className="whitespace-pre-wrap">{display}</div>
                    {message.role === "assistant" && message.content && !chatLoading && (
                      <div className="mt-3 space-y-2">
                        {followUps.length > 0 && (
                          <div className="border-t border-[var(--border)] pt-3">
                            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--foreground-faint)]">Ask next</div>
                            <div className="flex flex-col gap-1.5">
                              {followUps.map((s) => (
                                <button key={s} type="button"
                                  onClick={() => { setPrompt(s); setAction("chat"); textareaRef.current?.focus(); }}
                                  className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3 py-1.5 text-left text-xs text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]">
                                  {s}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <button type="button" onClick={() => void exportPdf(message, slug)}
                          className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3 py-1.5 text-[11px] text-[var(--foreground-faint)] transition hover:text-[var(--foreground)]">
                          ↓ Export PDF
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
          <div className="mx-auto w-full max-w-2xl px-4 pb-4">
            <div className="rounded-2xl border border-[var(--border-active)] bg-[var(--card)] p-4">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--foreground-faint)]">Preview · {labelForAction(preview.action)}</div>
                  {safeString(preview.data.summary) && <div className="mt-1 text-sm text-[var(--foreground-muted)]">{safeString(preview.data.summary)}</div>}
                </div>
                <div className="flex shrink-0 gap-2">
                  {preview.action !== "diagnose_underperformance" && (
                    <button type="button" onClick={() => void approvePreview()} disabled={approveLoading}
                      className="inline-flex h-8 items-center rounded-full bg-[var(--foreground)] px-4 text-xs font-semibold text-[var(--background)] transition hover:opacity-90 disabled:opacity-50">
                      {approveLoading ? "Saving..." : "Approve & Save"}
                    </button>
                  )}
                  <button type="button" onClick={() => { setPreview(null); setSuccessMsg(null); }} disabled={approveLoading}
                    className="inline-flex h-8 items-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] disabled:opacity-50">
                    {preview.action === "diagnose_underperformance" ? "Close" : "Discard"}
                  </button>
                </div>
              </div>
              <PreviewContent preview={preview} />
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom area ── */}
      <div className="shrink-0 px-4 pb-4 pt-2">
        <div className="mx-auto w-full max-w-2xl space-y-3">

          {/* Alerts */}
          {errorMsg && (
            <div className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-700 dark:text-red-300">
              {errorMsg}
              <button type="button" onClick={() => setErrorMsg(null)} className="ml-3 opacity-50 hover:opacity-100">✕</button>
            </div>
          )}
          {successMsg && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-300">
              {successMsg}
              <button type="button" onClick={() => setSuccessMsg(null)} className="ml-3 opacity-50 hover:opacity-100">✕</button>
            </div>
          )}

          {/* Input box — matching the reference exactly */}
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] transition-shadow focus-within:border-[var(--border-strong)] focus-within:shadow-[0_0_0_3px_rgba(0,0,0,0.06)]">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value); autoResize(); }}
              onKeyDown={handleKeyDown}
              placeholder={PLACEHOLDERS[action]}
              rows={2}
              className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-sm leading-6 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)]"
              style={{ minHeight: "60px", maxHeight: "200px" }}
            />
            {/* Bottom toolbar */}
            <div className="flex items-center gap-2 border-t border-[var(--border)] px-3 py-2">
              {/* File attach — company doc */}
              <button type="button" onClick={() => companyFileRef.current?.click()} title="Upload company document"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--foreground-faint)] transition hover:bg-[var(--button-secondary-bg)] hover:text-[var(--foreground)]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </button>
              {/* File attach — financial */}
              <button type="button" onClick={() => financialFileRef.current?.click()} title="Upload financial statement"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--foreground-faint)] transition hover:bg-[var(--button-secondary-bg)] hover:text-[var(--foreground)]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              </button>
              {/* Files indicator */}
              {files.length > 0 && (
                <button type="button" onClick={() => setShowFiles(v => !v)}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--button-secondary-bg)] px-2.5 text-[11px] font-semibold text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)]">
                  {files.length} file{files.length > 1 ? "s" : ""}
                </button>
              )}
              <div className="h-4 w-px bg-[var(--border)]" />
              {/* Mode indicator */}
              <span className="text-[11px] text-[var(--foreground-faint)]">
                {action === "chat" ? "Chat" : `${labelForAction(action)} · preview first`}
              </span>

              {/* Send button — right-aligned */}
              <div className="ml-auto">
                <button type="button" onClick={() => void handleSubmit()} disabled={isLoading || !prompt.trim()}
                  className="inline-flex h-8 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)] disabled:opacity-30">
                  {isLoading ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--foreground)]" />
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                    </svg>
                  )}
                  Send
                </button>
              </div>
            </div>
          </div>

          {/* Quick action buttons — row below input, matching reference */}
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_ACTIONS.map((qa) => (
              <button key={qa.key} type="button"
                onClick={() => { setAction(qa.key); textareaRef.current?.focus(); }}
                className={["inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition",
                  action === qa.key
                    ? "border-[var(--border-active)] bg-[var(--foreground)] text-[var(--background)]"
                    : "border-[var(--border)] bg-[var(--button-secondary-bg)] text-[var(--foreground-soft)] hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]",
                ].join(" ")}>
                {qa.label}
              </button>
            ))}
            {/* Files toggle */}
            <button type="button" onClick={() => setShowFiles(v => !v)}
              className={["ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition",
                showFiles
                  ? "border-[var(--border-active)] bg-[var(--foreground)] text-[var(--background)]"
                  : "border-[var(--border)] bg-[var(--button-secondary-bg)] text-[var(--foreground-soft)] hover:border-[var(--border-strong)]",
              ].join(" ")}>
              ⊕ Files
            </button>
          </div>

          {/* Starter prompts — only on empty state */}
          {isEmpty && (
            <div className="flex flex-wrap items-center gap-2">
              {STARTER_PROMPTS.map((s) => (
                <button key={s.label} type="button"
                  onClick={() => { setPrompt(s.prompt); setAction(s.action); textareaRef.current?.focus(); }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card-soft)] px-3 py-2 text-xs font-medium text-[var(--foreground-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)] hover:text-[var(--foreground)]">
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* Files panel */}
          {showFiles && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--foreground-faint)]">Context files — AI reads these in every response</span>
                <button type="button" onClick={() => setShowFiles(false)} className="text-[var(--foreground-faint)] hover:text-[var(--foreground)]">✕</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={uploading} onClick={() => companyFileRef.current?.click()}
                  className="rounded-lg border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] disabled:opacity-50">
                  {uploading ? "Uploading..." : "↑ Company doc (PDF, DOCX, TXT · max 2MB)"}
                </button>
                <button type="button" disabled={uploading} onClick={() => financialFileRef.current?.click()}
                  className="rounded-lg border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] disabled:opacity-50">
                  {uploading ? "Uploading..." : "↑ Financial statement (CSV, XLSX · max 2MB)"}
                </button>
              </div>
              {files.length > 0 && (
                <div className="mt-3 grid gap-1.5">
                  {files.map((f) => (
                    <div key={f.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                      <div>
                        <div className="max-w-[260px] truncate text-xs font-semibold text-[var(--foreground)]">{f.file_name}</div>
                        <div className="text-[10px] text-[var(--foreground-faint)]">{f.file_type === "company_doc" ? "Company doc" : "Financial"} · {fmtBytes(f.size_bytes)}</div>
                      </div>
                      <button type="button" onClick={() => void handleDeleteFile(f.id)}
                        className="px-2 py-1 text-[11px] text-[var(--foreground-faint)] transition hover:text-red-500">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Nav links */}
          <div className="flex flex-wrap items-center justify-center gap-2 pb-1">
            {[{ href: `/o/${slug}/dashboard`, label: "Dashboard" }, { href: `/o/${slug}/kpis`, label: "KPIs" }, { href: `/o/${slug}/objectives`, label: "Objectives" }, { href: `/o/${slug}/tasks`, label: "Tasks" }].map(link => (
              <Link key={link.href} href={link.href}
                className="text-xs text-[var(--foreground-faint)] transition hover:text-[var(--foreground)]">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewContent({ preview }: { preview: PreviewState }) {
  const data = preview.data;
  const chip = "rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-2.5 py-1 text-[11px] text-[var(--foreground-soft)]";

  if (preview.action === "diagnose_underperformance") {
    const causes = asArray(data.causes); const actions = asArray(data.actions);
    return (
      <div className="space-y-3 text-sm">
        {safeString(data.diagnosis) && <div className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4 leading-7 whitespace-pre-wrap text-[var(--foreground)]">{safeString(data.diagnosis)}</div>}
        {causes.length > 0 && <div><div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--foreground-faint)]">Likely causes</div><div className="space-y-1.5">{causes.map((c, i) => <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--card-soft)] px-4 py-2.5 text-[var(--foreground)]">{safeString(c)}</div>)}</div></div>}
        {actions.length > 0 && <div><div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--foreground-faint)]">Recommended actions</div><div className="space-y-1.5">{actions.map((a, i) => <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--card-soft)] px-4 py-2.5 text-[var(--foreground)]">{safeString(a)}</div>)}</div></div>}
      </div>
    );
  }

  const okr = asObject(data.okr);
  if (preview.action === "create_okr" && okr) {
    return (
      <div className="space-y-2 text-sm">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4">
          <div className="font-semibold text-[var(--foreground)]">{safeString(okr.title) || "Untitled OKR"}</div>
          {safeString(okr.description) && <div className="mt-1 text-[var(--foreground-muted)]">{safeString(okr.description)}</div>}
          <div className="mt-2 flex flex-wrap gap-1.5">{[`Status: ${safeString(okr.status) || "draft"}`, `Progress: ${okr.progress ?? 0}%`].map(c => <span key={c} className={chip}>{c}</span>)}</div>
        </div>
        {asArray(okr.key_results).map((kr, i) => {
          const row = asObject(kr) ?? {}; const cur = Number(row.current_value ?? 0); const tgt = Number(row.target_value ?? 0); const pct = tgt > 0 ? Math.max(0, Math.min(100, (cur / tgt) * 100)) : 0;
          return <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4"><div className="font-medium text-[var(--foreground)]">{safeString(row.title) || `KR ${i + 1}`}</div><div className="mt-2 flex flex-wrap gap-1.5">{[`${cur}/${tgt} ${safeString(row.unit)}`, safeString(row.status) || "not_started"].map(c => <span key={c} className={chip}>{c}</span>)}</div><div className="mt-2 h-1 w-full rounded-full bg-[var(--border)]"><div className="h-full rounded-full bg-[var(--foreground)] transition-all" style={{ width: `${pct}%` }} /></div></div>;
        })}
      </div>
    );
  }

  const cluster = asObject(data.cluster);
  if ((preview.action === "generate_jtbd" || preview.action === "create_tasks") && cluster) {
    return (
      <div className="space-y-2 text-sm">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4"><div className="font-semibold text-[var(--foreground)]">{safeString(cluster.title) || "Untitled"}</div>{safeString(cluster.description) && <div className="mt-1 text-[var(--foreground-muted)]">{safeString(cluster.description)}</div>}</div>
        {asArray(data.tasks).map((task, i) => { const row = asObject(task) ?? {}; return <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4"><div className="font-medium text-[var(--foreground)]">{safeString(row.title) || `Task ${i + 1}`}</div>{safeString(row.description) && <div className="mt-1 text-[var(--foreground-muted)]">{safeString(row.description)}</div>}<div className="mt-2 flex flex-wrap gap-1.5">{[safeString(row.status) || "todo", safeString(row.priority) || "medium"].map(c => <span key={c} className={chip}>{c}</span>)}</div></div>; })}
      </div>
    );
  }

  const kpi = asObject(data.kpi);
  if (preview.action === "rewrite_kpi" && kpi) {
    return <div className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4 text-sm space-y-2"><div className="font-semibold text-[var(--foreground)]">{safeString(kpi.title) || "Untitled KPI"}</div>{safeString(kpi.description) && <div className="text-[var(--foreground-muted)]">{safeString(kpi.description)}</div>}<div className="flex flex-wrap gap-1.5">{[`Unit: ${safeString(kpi.unit) || "—"}`, `Direction: ${safeString(kpi.direction) || "increase"}`, `Current: ${kpi.current_value ?? 0}`, `Target: ${kpi.target_value ?? 0}`].map(c => <span key={c} className={chip}>{c}</span>)}</div></div>;
  }

  if (preview.action === "update_kpi_value") {
    return <div className="rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4 text-sm space-y-2"><div className="font-semibold text-[var(--foreground)]">{safeString(data.kpi_title) || "KPI Update"}</div><div className="flex flex-wrap gap-1.5">{[`New value: ${data.current_value ?? "—"}`, `Target: ${data.target_value ?? "—"}`].map(c => <span key={c} className={chip}>{c}</span>)}</div>{safeString(data.rationale) && <div className="text-[var(--foreground-muted)]">{safeString(data.rationale)}</div>}</div>;
  }

  return <pre className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card-soft)] p-4 text-xs text-[var(--foreground-soft)] whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>;
}
