"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import EmptyState from "@/components/ui/EmptyState";
import ProgressBar from "@/components/ui/ProgressBar";
import SectionCard from "@/components/ui/SectionCard";
import StatusBadge from "@/components/ui/StatusBadge";
import { supabase } from "@/lib/supabaseClient";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type OrgAiCopilotProps = {
  slug: string;
};

type ActionType =
  | "chat"
  | "create_okr"
  | "generate_jtbd"
  | "create_tasks"
  | "rewrite_kpi"
  | "diagnose_underperformance";

type SseEvent = {
  event: string;
  data: string;
};

type ResponseCompletedPayload = {
  response?: {
    output?: Array<{
      type?: string;
      role?: string;
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };
};

type ActionPreviewResponse = {
  ok?: boolean;
  error?: string;
  action?: string;
  mode?: "preview" | "executed";
  preview?: Record<string, unknown>;
  wrote?: boolean;
  entity?: string;
  summary?: string;
  message?: string;
  created?: Record<string, unknown> | null;
};

type PreviewState = {
  action: Exclude<ActionType, "chat">;
  prompt: string;
  data: Record<string, unknown>;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function chipClass() {
  return "rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--foreground-soft)]";
}

function labelForAction(action: ActionType) {
  switch (action) {
    case "chat":
      return "Ask Your AI";
    case "create_okr":
      return "Create OKR";
    case "generate_jtbd":
      return "Generate JTBD";
    case "create_tasks":
      return "Create Tasks";
    case "rewrite_kpi":
      return "Rewrite KPI";
    case "diagnose_underperformance":
      return "Diagnose Underperformance";
  }
}

function placeholderForAction(action: ActionType) {
  switch (action) {
    case "chat":
      return "Ask about KPI underperformance, blocked execution, OKR quality, JTBD gaps, weak ownership, or what leadership should do next.";
    case "create_okr":
      return "Example: Create a Q2 OKR for Sales to improve qualified pipeline and close rate under the revenue objective.";
    case "generate_jtbd":
      return "Example: Generate JTBD for Customer Success to improve onboarding completion and reduce early churn.";
    case "create_tasks":
      return "Example: Create execution tasks for the most at-risk KR in the Sales department.";
    case "rewrite_kpi":
      return "Example: Rewrite the KPI 'Increase sales' into a measurable KPI with baseline, target, unit, and formula.";
    case "diagnose_underperformance":
      return "Example: Diagnose why the company is underperforming this quarter and tell me the biggest blockers.";
  }
}

function actionCardClass(active: boolean) {
  return active
    ? "border-[var(--border-active)] bg-[var(--foreground)] text-[var(--background)]"
    : "border-[var(--border)] bg-[var(--card-soft)] text-[var(--foreground)] hover:border-[var(--border-strong)] hover:bg-[var(--card-strong)]";
}

function parseSseEvents(chunk: string) {
  const normalized = chunk.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const completeBlocks = blocks.slice(0, -1);
  const remainder = blocks[blocks.length - 1] ?? "";

  const events: SseEvent[] = [];

  for (const block of completeBlocks) {
    const lines = block.split("\n");
    let event = "";
    const dataParts: string[] = [];

    for (const line of lines) {
      if (line.startsWith(":")) continue;

      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
        continue;
      }

      if (line.startsWith("data:")) {
        dataParts.push(line.slice(5).trim());
      }
    }

    const data = dataParts.join("\n");
    if (data) {
      events.push({ event, data });
    }
  }

  return { events, remainder };
}

function extractTextFromCompletedEvent(payload: ResponseCompletedPayload): string {
  const outputs = payload.response?.output ?? [];
  const parts: string[] = [];

  for (const item of outputs) {
    if (item.type !== "message") continue;

    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string" && content.text.trim()) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

function tryParseJson(text: string) {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toneFromStatus(status?: string | null) {
  const value = String(status ?? "").toLowerCase();
  if (["active", "on_track", "on track", "completed", "done"].includes(value)) return "success" as const;
  if (["at_risk", "at risk", "blocked", "high"].includes(value)) return "warning" as const;
  if (["off_track", "off track", "critical", "cancelled"].includes(value)) return "danger" as const;
  if (["todo", "in_progress", "in progress", "pending_approval", "draft"].includes(value)) return "info" as const;
  return "neutral" as const;
}

const actionCards: Array<{
  key: ActionType;
  title: string;
  description: string;
}> = [
  {
    key: "chat",
    title: "Ask Your AI",
    description:
      "Live grounded answers based on objectives, OKRs, KRs, KPIs, JTBD, tasks, and the active cycle.",
  },
  {
    key: "diagnose_underperformance",
    title: "Diagnose Underperformance",
    description: "Find what is weak, what it means, and what should happen next.",
  },
  {
    key: "create_okr",
    title: "Create OKR",
    description: "Generate one structured OKR preview before committing it.",
  },
  {
    key: "generate_jtbd",
    title: "Generate JTBD",
    description: "Preview a JTBD cluster before saving it into the workspace.",
  },
  {
    key: "create_tasks",
    title: "Create Tasks",
    description: "Generate execution tasks tied to a weak area of the business.",
  },
  {
    key: "rewrite_kpi",
    title: "Rewrite KPI",
    description: "Turn vague KPIs into measurable ones with clear targets.",
  },
];

const starterPrompts: Record<ActionType, string[]> = {
  chat: [
    "What is the biggest execution risk this cycle?",
    "What should leadership fix this week?",
    "Which KPI is likely creating the most downstream damage?",
  ],
  diagnose_underperformance: [
    "Diagnose why Sales is underperforming this quarter.",
    "Explain the main reasons our execution is slipping.",
    "Tell me what is off track and what should be fixed first.",
  ],
  create_okr: [
    "Create an OKR for improving qualified pipeline conversion.",
    "Create an OKR for reducing onboarding drop-off.",
    "Create an OKR for raising repeat purchase rate.",
  ],
  generate_jtbd: [
    "Generate JTBD for improving onboarding completion.",
    "Generate JTBD for fixing lead handoff quality.",
    "Generate JTBD for raising on-time delivery rate.",
  ],
  create_tasks: [
    "Create tasks for the weakest KPI in Sales.",
    "Create tasks to improve onboarding completion.",
    "Create tasks to resolve delayed execution in Operations.",
  ],
  rewrite_kpi: [
    "Rewrite the KPI 'Increase revenue' into a measurable KPI.",
    "Rewrite 'Improve retention' into a proper KPI.",
    "Rewrite 'More leads' into a KPI with baseline and target.",
  ],
};

export default function OrgAiCopilot({ slug }: OrgAiCopilotProps) {
  const [action, setAction] = useState<ActionType>("chat");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uid(),
      role: "assistant",
      content:
        "I’m grounded in your company workspace. Ask me to diagnose weak performance, generate OKRs, create JTBD, create tasks, or rewrite KPIs into something measurable.",
    },
  ]);

  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const activePrompts = useMemo(() => starterPrompts[action], [action]);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollerRef.current?.scrollTo({
        top: scrollerRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) {
      throw new Error("Your session expired. Log in again.");
    }
    return session.access_token;
  }

  async function runChat(inputText: string) {
    const finalText = inputText.trim();
    if (!finalText) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setPreview(null);
    setChatLoading(true);

    const nextMessages: ChatMessage[] = [
      ...messages,
      { id: uid(), role: "user", content: finalText },
      { id: uid(), role: "assistant", content: "" },
    ];

    setMessages(nextMessages);
    setPrompt("");
    scrollToBottom();

    try {
      const accessToken = await getAccessToken();
      const bodyMessages = nextMessages
        .filter((msg) => !(msg.role === "assistant" && msg.content === ""))
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

      const res = await fetch(`/api/o/${encodeURIComponent(slug)}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ messages: bodyMessages }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        throw new Error(detail || "Failed to run AI chat");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalTextFromStream = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const parsed = parseSseEvents(buffer);
        buffer = parsed.remainder;

        for (const event of parsed.events) {
          if (!event.data || event.data === "[DONE]") continue;
          const parsedData = tryParseJson(event.data);
          if (!parsedData) continue;

          const eventType = safeString(parsedData.type);

          if (eventType === "response.output_text.delta") {
            const delta = safeString(parsedData.delta);
            if (delta) {
              finalTextFromStream += delta;
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === "assistant") {
                  copy[copy.length - 1] = { ...last, content: finalTextFromStream };
                }
                return copy;
              });
            }
          }

          if (eventType === "response.completed") {
            const extracted = extractTextFromCompletedEvent(parsedData as ResponseCompletedPayload);
            if (extracted) {
              finalTextFromStream = extracted;
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === "assistant") {
                  copy[copy.length - 1] = { ...last, content: extracted };
                }
                return copy;
              });
            }
          }
        }

        scrollToBottom();
      }

      if (!finalTextFromStream.trim()) {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant") {
            copy[copy.length - 1] = {
              ...last,
              content: "No response was returned. Try again.",
            };
          }
          return copy;
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to run AI chat";
      setErrorMsg(message);
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") {
          copy[copy.length - 1] = {
            ...last,
            content: `AI error: ${message}`,
          };
        }
        return copy;
      });
    } finally {
      setChatLoading(false);
      scrollToBottom();
    }
  }

  async function runStructuredAction(inputText: string) {
    const finalText = inputText.trim();
    if (!finalText) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setPreview(null);
    setActionLoading(true);

    try {
      const accessToken = await getAccessToken();

      const res = await fetch(`/api/o/${encodeURIComponent(slug)}/ai/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action,
          prompt: finalText,
        }),
      });

      const raw = await res.text();
      const parsed = tryParseJson(raw) as ActionPreviewResponse | null;

      if (!res.ok || !parsed?.ok || !parsed.preview || action === "chat") {
        throw new Error(parsed?.error || raw || "Failed to run AI action");
      }

      setPreview({
        action: action as Exclude<ActionType, "chat">,
        prompt: finalText,
        data: parsed.preview,
      });

      setSuccessMsg("Preview generated. Review it before saving.");
      setPrompt("");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to run AI action");
    } finally {
      setActionLoading(false);
    }
  }

  async function approvePreview() {
    if (!preview) return;

    setApproveLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const accessToken = await getAccessToken();

      const res = await fetch(`/api/o/${encodeURIComponent(slug)}/ai/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "x-ai-mode": "execute",
        },
        body: JSON.stringify({
          action: preview.action,
          prompt: preview.prompt,
          preview: preview.data,
        }),
      });

      const raw = await res.text();
      const parsed = tryParseJson(raw) as ActionPreviewResponse | null;

      if (!res.ok || !parsed?.ok) {
        throw new Error(parsed?.error || raw || "Failed to approve AI action");
      }

      const assistantMessage =
        parsed.message ||
        parsed.summary ||
        `${labelForAction(preview.action)} completed successfully.`;

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: assistantMessage,
        },
      ]);

      setPreview(null);
      setSuccessMsg(parsed.summary || "Saved successfully.");
      scrollToBottom();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to approve preview");
    } finally {
      setApproveLoading(false);
    }
  }

  async function handleSubmit() {
    if (!prompt.trim()) return;

    if (action === "chat") {
      await runChat(prompt);
      return;
    }

    await runStructuredAction(prompt);
  }

  function handleStarterPrompt(text: string) {
    setPrompt(text);
  }

  const actionModeLabel = action === "chat" ? "Conversation" : "Structured AI workflow";

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.12fr_0.88fr]">
      <SectionCard
        title="AI Modes"
        subtitle="Choose the job you want AI to do"
        className="bg-[var(--card)]"
      >
        <div className="grid gap-3">
          {actionCards.map((item) => {
            const active = item.key === action;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setAction(item.key);
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`rounded-[22px] border p-4 text-left transition ${actionCardClass(active)}`}
              >
                <div className="text-sm font-semibold">{item.title}</div>
                <div
                  className={
                    active
                      ? "mt-2 text-sm text-[color:rgba(7,17,31,0.72)]"
                      : "mt-2 text-sm text-[var(--foreground-muted)]"
                  }
                >
                  {item.description}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-5 rounded-[22px] border border-[var(--border)] bg-[var(--card-soft)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
            Mode
          </div>
          <div className="mt-2 text-base font-semibold text-[var(--foreground)]">
            {actionModeLabel}
          </div>
          <div className="mt-2 text-sm leading-6 text-[var(--foreground-muted)]">
            {action === "chat"
              ? "Use this when you want reasoning and explanation."
              : "Use this when you want a structured preview before writing anything to the database."}
          </div>
        </div>

        <div className="mt-5 rounded-[22px] border border-[var(--border)] bg-[var(--card-soft)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
            Best use cases
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {activePrompts.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => handleStarterPrompt(example)}
                className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3 py-2 text-left text-xs font-semibold text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="AI Workspace"
        subtitle="Prompt, review, and move work forward"
        className="bg-[linear-gradient(180deg,rgba(109,94,252,0.08),rgba(55,207,255,0.03))]"
      >
        {(errorMsg || successMsg) && (
          <div className="mb-5 grid gap-3">
            {errorMsg ? (
              <div className="rounded-[18px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-100">
                {errorMsg}
              </div>
            ) : null}

            {successMsg ? (
              <div className="rounded-[18px] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">
                {successMsg}
              </div>
            ) : null}
          </div>
        )}

        <div
          ref={scrollerRef}
          className="mb-5 h-[420px] overflow-y-auto rounded-[24px] border border-[var(--border)] bg-[var(--card-soft)] p-4"
        >
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={
                    message.role === "user"
                      ? "max-w-[88%] rounded-[22px] border border-[var(--border-active)] bg-[var(--foreground)] px-4 py-3 text-sm leading-7 text-[var(--background)] shadow-[0_12px_30px_rgba(0,0,0,0.10)]"
                      : "max-w-[88%] rounded-[22px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm leading-7 text-[var(--foreground)]"
                  }
                >
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] opacity-60">
                    {message.role === "user" ? "You" : "Your AI"}
                  </div>
                  <div className="whitespace-pre-wrap">
                    {message.content || (chatLoading && message.role === "assistant" ? "Thinking..." : "")}
                  </div>
                </div>
              </div>
            ))}

            {messages.length === 0 ? (
              <EmptyState
                title="No messages yet"
                description="Start a chat or run a structured AI workflow from the left-side action panel."
              />
            ) : null}
          </div>
        </div>

        <div className="rounded-[24px] border border-[var(--border)] bg-[var(--card-soft)] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                Prompt
              </div>
              <div className="mt-1 text-sm text-[var(--foreground-muted)]">
                {labelForAction(action)}
              </div>
            </div>
            <StatusBadge tone={action === "chat" ? "info" : "neutral"}>
              {action === "chat" ? "Live" : "Preview first"}
            </StatusBadge>
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={placeholderForAction(action)}
            className="min-h-[140px] w-full resize-none rounded-[20px] border border-[var(--border)] bg-[var(--card)] px-4 py-4 text-sm leading-7 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
          />

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {activePrompts.slice(0, 2).map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => handleStarterPrompt(example)}
                  className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
                >
                  Use example
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={chatLoading || actionLoading || approveLoading || !prompt.trim()}
              className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {chatLoading || actionLoading
                ? "Working..."
                : action === "chat"
                  ? "Ask Your AI"
                  : "Generate preview"}
            </button>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-6">
        <SectionCard
          title="Preview & Approval"
          subtitle="Review structured output before it writes to the workspace"
          className="bg-[var(--card)]"
        >
          {preview ? (
            <PreviewPanel
              preview={preview}
              onApprove={() => void approvePreview()}
              onDiscard={() => {
                setPreview(null);
                setSuccessMsg(null);
                setErrorMsg(null);
              }}
              executing={approveLoading}
            />
          ) : (
            <EmptyState
              title="No preview generated yet"
              description="Run Create OKR, Generate JTBD, Create Tasks, Rewrite KPI, or Diagnose Underperformance to populate this panel."
            />
          )}
        </SectionCard>

        <SectionCard
          title="AI guardrails"
          subtitle="How this workspace behaves"
          className="bg-[linear-gradient(180deg,rgba(109,94,252,0.08),rgba(55,207,255,0.03))]"
        >
          <div className="grid gap-3">
            <GuardrailRow
              title="Grounded in your workspace"
              desc="Chat uses the active company context instead of generic advice."
            />
            <GuardrailRow
              title="Preview before save"
              desc="Structured actions generate previews first, then write only after approval."
            />
            <GuardrailRow
              title="Built for execution"
              desc="Use AI to move KPIs, OKRs, JTBD, and tasks forward, not just generate text."
            />
          </div>

          <div className="mt-5 rounded-[20px] border border-[var(--border)] bg-[var(--card-soft)] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
              Next useful pages
            </div>
            <div className="mt-3 grid gap-2">
              <MiniLink href={`/o/${slug}/dashboard`} label="Dashboard" />
              <MiniLink href={`/o/${slug}/kpis`} label="KPIs" />
              <MiniLink href={`/o/${slug}/objectives`} label="Objectives" />
              <MiniLink href={`/o/${slug}/tasks`} label="Tasks" />
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function GuardrailRow({
  title,
  desc,
}: {
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card-soft)] p-4">
      <div className="text-sm font-semibold text-[var(--foreground)]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[var(--foreground-muted)]">{desc}</div>
    </div>
  );
}

function MiniLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[16px] border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-3 text-sm font-semibold text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
    >
      {label}
    </Link>
  );
}

function PreviewPanel({
  preview,
  onApprove,
  onDiscard,
  executing,
}: {
  preview: PreviewState;
  onApprove: () => void;
  onDiscard: () => void;
  executing: boolean;
}) {
  const data = preview.data;
  const summary = safeString(data.summary);
  const diagnosis = safeString(data.diagnosis);
  const causes = asArray(data.causes);
  const actions = asArray(data.actions);

  const okr = asObject(data.okr);
  const cluster = asObject(data.cluster);
  const kpi = asObject(data.kpi);
  const tasks = asArray(data.tasks);
  const suggestedUpdates = asObject(data.suggested_updates);

  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card-soft)] p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
              Preview
            </div>
            <div className="mt-2 text-xl font-bold text-[var(--foreground)]">
              {labelForAction(preview.action)}
            </div>
            {summary ? (
              <div className="mt-2 text-sm leading-6 text-[var(--foreground-muted)]">
                {summary}
              </div>
            ) : null}
          </div>

          <div className="flex gap-2">
            {preview.action !== "diagnose_underperformance" ? (
              <button
                type="button"
                onClick={onApprove}
                disabled={executing}
                className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {executing ? "Saving..." : "Approve & Save"}
              </button>
            ) : null}

            <button
              type="button"
              onClick={onDiscard}
              disabled={executing}
              className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)] disabled:opacity-50"
            >
              {preview.action === "diagnose_underperformance" ? "Close" : "Discard"}
            </button>
          </div>
        </div>
      </div>

      {preview.action === "diagnose_underperformance" ? (
        <>
          {diagnosis ? (
            <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card-soft)] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                Diagnosis
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[var(--foreground)]">
                {diagnosis}
              </div>
            </div>
          ) : null}

          {causes.length ? (
            <PreviewListCard
              title="Likely causes"
              items={causes.map((item) => safeString(item)).filter(Boolean)}
            />
          ) : null}

          {actions.length ? (
            <PreviewListCard
              title="Recommended actions"
              items={actions.map((item) => safeString(item)).filter(Boolean)}
            />
          ) : null}

          {suggestedUpdates ? (
            <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card-soft)] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                Suggested updates
              </div>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-[var(--foreground-soft)]">
                {JSON.stringify(suggestedUpdates, null, 2)}
              </pre>
            </div>
          ) : null}
        </>
      ) : null}

      {preview.action === "create_okr" && okr ? (
        <>
          <StructuredCard
            title={safeString(okr.title) || "Untitled OKR"}
            subtitle={safeString(okr.description)}
            chips={[
              `Objective ID: ${safeString(okr.objective_id) || "—"}`,
              `Department ID: ${safeString(okr.department_id) || "—"}`,
              `Owner ID: ${safeString(okr.owner_user_id) || "—"}`,
              `Status: ${safeString(okr.status) || "draft"}`,
            ]}
          />
          {asArray(okr.key_results).length ? (
            <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card-soft)] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                Key results
              </div>
              <div className="mt-3 grid gap-3">
                {asArray(okr.key_results).map((item, index) => {
                  const kr = asObject(item) ?? {};
                  const current = Number(kr.current_value ?? 0);
                  const target = Number(kr.target_value ?? 0);
                  const progress =
                    target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : 0;

                  return (
                    <div
                      key={index}
                      className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-4"
                    >
                      <div className="text-sm font-semibold text-[var(--foreground)]">
                        {safeString(kr.title) || `Key Result ${index + 1}`}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className={chipClass()}>{`Metric: ${safeString(kr.metric_name) || "—"}`}</span>
                        <span className={chipClass()}>{`Current: ${String(
                          kr.current_value ?? 0
                        )} ${safeString(kr.unit)}`}</span>
                        <span className={chipClass()}>{`Target: ${String(
                          kr.target_value ?? 0
                        )} ${safeString(kr.unit)}`}</span>
                        <span className={chipClass()}>{`Status: ${safeString(kr.status) || "not_started"}`}</span>
                      </div>
                      <div className="mt-3">
                        <ProgressBar value={progress} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {(preview.action === "generate_jtbd" || preview.action === "create_tasks") && cluster ? (
        <StructuredCard
          title={safeString(cluster.title) || "Untitled cluster"}
          subtitle={safeString(cluster.description)}
          chips={[
            `Department ID: ${safeString(cluster.department_id) || "—"}`,
            `Objective ID: ${safeString(cluster.objective_id) || "—"}`,
            `OKR ID: ${safeString(cluster.okr_id) || "—"}`,
            `KR ID: ${safeString(cluster.key_result_id) || "—"}`,
            `Owner ID: ${safeString(cluster.owner_user_id) || "—"}`,
          ]}
        />
      ) : null}

      {(preview.action === "generate_jtbd" || preview.action === "create_tasks") && tasks.length ? (
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card-soft)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
            Tasks
          </div>
          <div className="mt-3 grid gap-3">
            {tasks.map((task, index) => {
              const row = asObject(task) ?? {};
              return (
                <div
                  key={index}
                  className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-4"
                >
                  <div className="text-sm font-semibold text-[var(--foreground)]">
                    {safeString(row.title) || `Task ${index + 1}`}
                  </div>
                  {safeString(row.description) ? (
                    <div className="mt-2 text-sm leading-6 text-[var(--foreground-muted)]">
                      {safeString(row.description)}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge tone={toneFromStatus(safeString(row.status) || "todo")}>
                      {safeString(row.status) || "todo"}
                    </StatusBadge>
                    <StatusBadge tone={toneFromStatus(safeString(row.priority) || "medium")}>
                      {safeString(row.priority) || "medium"}
                    </StatusBadge>
                    <span className={chipClass()}>{`Due: ${safeString(row.due_date) || "—"}`}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {preview.action === "rewrite_kpi" && kpi ? (
        <StructuredCard
          title={safeString(kpi.title) || "Untitled KPI"}
          subtitle={safeString(kpi.description)}
          chips={[
            `Department ID: ${safeString(kpi.department_id) || "—"}`,
            `Owner ID: ${safeString(kpi.owner_user_id) || "—"}`,
            `Unit: ${safeString(kpi.unit) || "—"}`,
            `Direction: ${safeString(kpi.direction) || "increase"}`,
            `Current: ${String(kpi.current_value ?? 0)}`,
            `Target: ${String(kpi.target_value ?? 0)}`,
          ]}
        />
      ) : null}

      {!summary &&
      !diagnosis &&
      !okr &&
      !cluster &&
      !kpi &&
      !tasks.length &&
      !causes.length &&
      !actions.length ? (
        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card-soft)] p-4">
          <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-[var(--foreground-soft)]">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function PreviewListCard({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card-soft)] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
        {title}
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div
            key={item}
            className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm leading-6 text-[var(--foreground)]"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function StructuredCard({
  title,
  subtitle,
  chips,
}: {
  title: string;
  subtitle?: string;
  chips: string[];
}) {
  return (
    <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card-soft)] p-4">
      <div className="text-lg font-semibold text-[var(--foreground)]">{title}</div>
      {subtitle ? (
        <div className="mt-2 text-sm leading-6 text-[var(--foreground-muted)]">{subtitle}</div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span key={chip} className={chipClass()}>
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}