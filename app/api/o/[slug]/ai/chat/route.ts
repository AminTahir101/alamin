import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";
import { loadAiContextFiles } from "@/lib/server/aiFileContext";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };
type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };
type ChatBody = { messages?: ChatMessage[] };
type JsonObject = Record<string, unknown>;
type DepartmentRow = { id: string; name: string };

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function env(name: string) {
  const v = process.env[name];
  if (!v?.trim()) throw new Error(`Missing env: ${name}`);
  return v;
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function truncate(text: string, max = 180) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}\u2026`;
}

function clampMessages(messages: ChatMessage[]) {
  return messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0)
    .slice(-20);
}

function buildBlock(title: string, lines: string[]) {
  if (!lines.length) return `${title}: none`;
  return `${title}:\n- ${lines.join("\n- ")}`;
}

function belongsToScope<T extends { department_id?: string | null; owner_user_id?: string | null; assigned_to_user_id?: string | null }>(
  row: T, mode: "org" | "department" | "employee", departmentId: string | null, userId: string
) {
  if (mode === "org") return true;
  if (mode === "department") return row.department_id === departmentId || row.department_id === null;
  return row.assigned_to_user_id === userId || row.owner_user_id === userId || row.department_id === departmentId || row.department_id === null;
}

async function getLatestAiReportSummary(admin: ReturnType<typeof supabaseAdmin>, orgId: string, cycleId: string | null): Promise<string> {
  try {
    let q = admin.from("ai_reports").select("title,summary,created_at").eq("org_id", orgId).order("created_at", { ascending: false }).limit(1);
    if (cycleId) q = q.eq("cycle_id", cycleId);
    const { data, error } = await q.maybeSingle();
    if (error || !data) return "none";
    const row = data as JsonObject;
    return `${safeString(row.title) || "Untitled"} | ${truncate(safeString(row.summary) || "No summary", 300)}`;
  } catch { return "none"; }
}

function buildSuggestedFollowUps(messages: ChatMessage[], kpiCount: number, blockedCount: number, hasOkrs: boolean): string {
  const lastText = safeString([...messages].reverse().find((m) => m.role === "user")?.content).toLowerCase();
  const s: string[] = [];

  if (lastText.includes("diagnos") || lastText.includes("underperform") || lastText.includes("weak")) {
    s.push("Which KPI should I fix first to have the biggest impact?");
    s.push("Generate tasks to resolve the biggest blocker you found.");
    s.push("Create an OKR to address the main underperformance area.");
  } else if (lastText.includes("okr") || lastText.includes("objective")) {
    s.push("Which key result is most at risk right now?");
    s.push("Create tasks for the weakest key result.");
    if (blockedCount > 0) s.push(`There are ${blockedCount} blocked tasks — what should I unblock first?`);
    else s.push("Diagnose the root cause of the lowest-progress OKR.");
  } else if (lastText.includes("kpi")) {
    s.push("Which KPIs are pulling down the company score the most?");
    s.push("Diagnose why our KPIs are underperforming this cycle.");
    s.push("Rewrite our weakest KPI into something more measurable.");
  } else if (lastText.includes("financial") || lastText.includes("revenue") || lastText.includes("budget")) {
    s.push("Which KPI is most misaligned with the financial targets?");
    s.push("Generate an OKR to close the gap between revenue target and current performance.");
    s.push("Diagnose which department is driving the most financial risk.");
  } else {
    if (blockedCount > 0) s.push(`What is blocking ${blockedCount} tasks and how should we fix it?`);
    if (hasOkrs) s.push("Which OKR is most at risk of failing this cycle?");
    s.push("What should the leadership team prioritize this week?");
    if (kpiCount > 0) s.push("Which KPI needs the most urgent attention?");
  }

  return s.slice(0, 3).map((line, i) => `${i + 1}. ${line}`).join("\n");
}

export async function POST(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const body = (await req.json().catch(() => null)) as ChatBody | null;
    const messages = clampMessages(body?.messages ?? []);

    if (!slug) return json({ ok: false, error: "Slug is required" }, 400);
    if (!messages.length) return json({ ok: false, error: "At least one message is required" }, 400);

    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();

    const { data: orgRow, error: orgErr } = await admin.from("organizations").select("*").eq("id", scope.org.id).maybeSingle<JsonObject>();
    if (orgErr) throw new Error(orgErr.message);

    const { data: cycleRow, error: cycleErr } = await admin
      .from("quarterly_cycles").select("id,year,quarter,status")
      .eq("org_id", scope.org.id).eq("status", "active")
      .order("year", { ascending: false }).order("quarter", { ascending: false })
      .maybeSingle();
    if (cycleErr) throw new Error(cycleErr.message);

    const cycleId = safeString(cycleRow?.id) || null;
    const none = admin.from("objectives").select("id").eq("org_id", "__none__");

    const [deptRes, objRes, okrRes, krRes, kpiRes, jtbdRes, taskRes] = await Promise.all([
      admin.from("departments").select("id,name").eq("org_id", scope.org.id).eq("is_active", true).order("name"),
      cycleId ? admin.from("objectives").select("id,title,status,progress,department_id,owner_user_id").eq("org_id", scope.org.id).eq("cycle_id", cycleId).order("created_at", { ascending: false }) : none,
      cycleId ? admin.from("okrs").select("id,title,status,progress,department_id,owner_user_id,objective_id").eq("org_id", scope.org.id).eq("cycle_id", cycleId).order("created_at", { ascending: false }) : none,
      cycleId ? admin.from("key_results").select("id,title,status,progress,department_id,owner_user_id,okr_id,objective_id,kpi_id,metric_name,current_value,target_value,unit").eq("org_id", scope.org.id).eq("cycle_id", cycleId).order("position", { ascending: true }) : none,
      cycleId ? admin.from("kpis").select("id,title,current_value,target_value,department_id,owner_user_id,weight,direction,unit,is_active,measurement_type,frequency,baseline_value,formula").eq("org_id", scope.org.id).eq("cycle_id", cycleId).order("updated_at", { ascending: false }) : none,
      cycleId ? admin.from("jtbd_clusters").select("id,title,status,department_id,objective_id,okr_id,key_result_id,owner_user_id,due_date").eq("org_id", scope.org.id).eq("cycle_id", cycleId).order("created_at", { ascending: false }) : none,
      cycleId ? admin.from("tasks").select("id,title,status,priority,department_id,assigned_to_user_id,due_date,objective_id,okr_id,key_result_id,kpi_id,jtbd_cluster_id").eq("org_id", scope.org.id).eq("cycle_id", cycleId).order("created_at", { ascending: false }) : none,
    ]);

    if (deptRes.error) throw new Error(deptRes.error.message);

    const departments = (deptRes.data ?? []) as DepartmentRow[];
    const deptMap = new Map(departments.map((d) => [d.id, d.name]));
    const filter = (rows: unknown[]) =>
      (rows as Array<Record<string, unknown>>).filter((row) => belongsToScope(row, scope.mode, scope.departmentId, scope.userId));

    const objectives = filter(objRes.data ?? []);
    const okrs = filter(okrRes.data ?? []);
    const keyResults = filter(krRes.data ?? []);
    const kpis = filter(kpiRes.data ?? []);
    const jtbds = filter(jtbdRes.data ?? []);
    const tasks = filter(taskRes.data ?? []);
    const blockedTasks = tasks.filter((t) => safeString(t.status).toLowerCase() === "blocked");

    const deptName = (row: Record<string, unknown>) =>
      row.department_id ? deptMap.get(String(row.department_id)) ?? String(row.department_id) : "company-wide";

    const [latestAiReport, fileContext] = await Promise.all([
      getLatestAiReportSummary(admin, scope.org.id, cycleId),
      loadAiContextFiles(scope.org.id),
    ]);

    const orgData = (orgRow ?? {}) as JsonObject;
    const suggestedFollowUps = buildSuggestedFollowUps(messages, kpis.length, blockedTasks.length, okrs.length > 0);

    const objectiveLines = objectives.slice(0, 20).map((r) => `${truncate(safeString(r.title) || "Untitled", 120)} | status: ${safeString(r.status)} | progress: ${Math.round(safeNumber(r.progress) ?? 0)}% | dept: ${deptName(r)}`);
    const okrLines = okrs.slice(0, 20).map((r) => `${truncate(safeString(r.title) || "Untitled", 120)} | status: ${safeString(r.status)} | progress: ${Math.round(safeNumber(r.progress) ?? 0)}% | dept: ${deptName(r)}`);
    const krLines = keyResults.slice(0, 24).map((r) => { const u = safeString(r.unit); return `${truncate(safeString(r.title) || "Untitled", 120)} | ${safeNumber(r.current_value) ?? 0}${u}/${safeNumber(r.target_value) ?? 0}${u} | dept: ${deptName(r)}`; });
    const kpiLines = kpis.slice(0, 24).map((r) => { const u = safeString(r.unit); const cur = safeNumber(r.current_value) ?? 0; const tgt = safeNumber(r.target_value) ?? 0; const gap = tgt > 0 ? Math.round(((tgt - cur) / tgt) * 100) : 0; return `${truncate(safeString(r.title) || "Untitled", 120)} | ${cur}${u}/${tgt}${u} | gap: ${gap}% | dept: ${deptName(r)}`; });
    const jtbdLines = jtbds.slice(0, 20).map((r) => `${truncate(safeString(r.title) || "Untitled", 120)} | status: ${safeString(r.status)} | dept: ${deptName(r)}`);
    const taskLines = tasks.slice(0, 24).map((r) => `${truncate(safeString(r.title) || "Untitled", 120)} | status: ${safeString(r.status)} | priority: ${safeString(r.priority) || "medium"} | dept: ${deptName(r)}`);

    const instructions = `
You are ALAMIN AI — the embedded performance intelligence assistant inside this company workspace.

Answer using the live company data below. Be direct and operational. Name actual KPIs, OKRs, tasks, and departments.
Do not hallucinate records. Only reference items from the context.
Structure answers: Diagnosis → What it means → What to do next.
Keep responses under 600 words unless asked for a detailed report.

After every answer, append exactly this section:
---
Ask next:
${suggestedFollowUps}

LIVE COMPANY CONTEXT
Organization: ${safeString(orgData.name) || scope.org.name}
Active cycle: ${cycleRow ? `Q${cycleRow.quarter} ${cycleRow.year} (${cycleRow.status})` : "none"}
User role: ${scope.role} | Scope: ${scope.mode}

${buildBlock("Departments", departments.map((d) => d.name))}
${buildBlock("Objectives", objectiveLines)}
${buildBlock("OKRs", okrLines)}
${buildBlock("Key Results", krLines)}
${buildBlock("KPIs", kpiLines)}
${buildBlock("JTBD", jtbdLines)}
${buildBlock("Tasks", taskLines)}
${blockedTasks.length ? `Blocked tasks (${blockedTasks.length}): ${blockedTasks.slice(0, 6).map((t) => safeString(t.title)).join(", ")}` : "Blocked tasks: none"}
Latest AI report: ${latestAiReport}
${fileContext.companyDocs !== "none" ? `\nCOMPANY DOCUMENTS:\n${fileContext.companyDocs.slice(0, 4000)}` : ""}
${fileContext.financialDocs !== "none" ? `\nFINANCIAL STATEMENTS:\n${fileContext.financialDocs.slice(0, 4000)}` : ""}
    `.trim();

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.AI_MODEL?.trim() || "gpt-4.1-mini",
        stream: true,
        store: false,
        max_output_tokens: 1600,
        instructions,
        input: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      return json({ ok: false, error: "OpenAI request failed", detail }, 500);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
    });
  } catch (error: unknown) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Failed to run AI chat" }, 400);
  }
}
