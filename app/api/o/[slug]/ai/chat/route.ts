import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type ChatBody = {
  messages?: ChatMessage[];
};

type JsonObject = Record<string, unknown>;

type DepartmentRow = {
  id: string;
  name: string;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function env(name: string) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function truncate(text: string, max = 180) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function clampMessages(messages: ChatMessage[]) {
  return messages
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0
    )
    .slice(-12);
}

function buildBlock(title: string, lines: string[]) {
  if (!lines.length) return `${title}: none`;
  return `${title}:\n- ${lines.join("\n- ")}`;
}

function belongsToScope<
  T extends {
    department_id?: string | null;
    owner_user_id?: string | null;
    assigned_to_user_id?: string | null;
  },
>(
  row: T,
  mode: "org" | "department" | "employee",
  departmentId: string | null,
  userId: string
) {
  if (mode === "org") return true;

  if (mode === "department") {
    return row.department_id === departmentId || row.department_id === null;
  }

  return (
    row.assigned_to_user_id === userId ||
    row.owner_user_id === userId ||
    row.department_id === departmentId ||
    row.department_id === null
  );
}

function buildOpenAiInput(messages: ChatMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

async function getLatestAiReportSummary(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  cycleId: string | null
): Promise<string> {
  try {
    let query = admin
      .from("ai_reports")
      .select("title,summary,created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (cycleId) {
      query = query.eq("cycle_id", cycleId);
    }

    const { data, error } = await query.maybeSingle();

    if (error || !data) return "none";

    const row = data as JsonObject;
    const title = safeString(row.title);
    const summary = safeString(row.summary);

    if (!title && !summary) return "none";

    return `${title || "Untitled AI report"} | ${truncate(summary || "No summary", 240)}`;
  } catch {
    return "none";
  }
}

export async function POST(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const body = (await req.json().catch(() => null)) as ChatBody | null;
    const messages = clampMessages(body?.messages ?? []);

    if (!slug) {
      return json({ ok: false, error: "Slug is required" }, 400);
    }

    if (!messages.length) {
      return json({ ok: false, error: "At least one message is required" }, 400);
    }

    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();

    const { data: orgRow, error: orgErr } = await admin
      .from("organizations")
      .select("*")
      .eq("id", scope.org.id)
      .maybeSingle<JsonObject>();

    if (orgErr) throw new Error(orgErr.message);

    const { data: cycleRow, error: cycleErr } = await admin
      .from("quarterly_cycles")
      .select("id,year,quarter,status")
      .eq("org_id", scope.org.id)
      .eq("status", "active")
      .order("year", { ascending: false })
      .order("quarter", { ascending: false })
      .maybeSingle();

    if (cycleErr) throw new Error(cycleErr.message);

    const cycleId = safeString(cycleRow?.id) || null;

    const [
      departmentsRes,
      objectivesRes,
      okrsRes,
      keyResultsRes,
      kpisRes,
      jtbdRes,
      tasksRes,
      latestAiReport,
    ] = await Promise.all([
      admin
        .from("departments")
        .select("id,name")
        .eq("org_id", scope.org.id)
        .eq("is_active", true)
        .order("name", { ascending: true }),

      cycleId
        ? admin
            .from("objectives")
            .select("id,title,status,progress,department_id,owner_user_id")
            .eq("org_id", scope.org.id)
            .eq("cycle_id", cycleId)
            .order("created_at", { ascending: false })
        : admin.from("objectives").select("id").eq("org_id", "__none__"),

      cycleId
        ? admin
            .from("okrs")
            .select("id,title,status,progress,department_id,owner_user_id,objective_id")
            .eq("org_id", scope.org.id)
            .eq("cycle_id", cycleId)
            .order("created_at", { ascending: false })
        : admin.from("okrs").select("id").eq("org_id", "__none__"),

      cycleId
        ? admin
            .from("key_results")
            .select("id,title,status,progress,department_id,owner_user_id,okr_id,objective_id,kpi_id,metric_name,current_value,target_value,unit")
            .eq("org_id", scope.org.id)
            .eq("cycle_id", cycleId)
            .order("position", { ascending: true })
        : admin.from("key_results").select("id").eq("org_id", "__none__"),

      cycleId
        ? admin
            .from("kpis")
            .select("id,title,current_value,target_value,department_id,owner_user_id,weight,direction,unit,is_active,measurement_type,frequency,baseline_value,formula")
            .eq("org_id", scope.org.id)
            .eq("cycle_id", cycleId)
            .order("updated_at", { ascending: false })
        : admin.from("kpis").select("id").eq("org_id", "__none__"),

      cycleId
        ? admin
            .from("jtbd_clusters")
            .select("id,title,status,department_id,objective_id,okr_id,key_result_id,owner_user_id,due_date")
            .eq("org_id", scope.org.id)
            .eq("cycle_id", cycleId)
            .order("created_at", { ascending: false })
        : admin.from("jtbd_clusters").select("id").eq("org_id", "__none__"),

      cycleId
        ? admin
            .from("tasks")
            .select("id,title,status,priority,department_id,assigned_to_user_id,due_date,objective_id,okr_id,key_result_id,kpi_id,jtbd_cluster_id")
            .eq("org_id", scope.org.id)
            .eq("cycle_id", cycleId)
            .order("created_at", { ascending: false })
        : admin.from("tasks").select("id").eq("org_id", "__none__"),

      getLatestAiReportSummary(admin, scope.org.id, cycleId),
    ]);

    if (departmentsRes.error) throw new Error(departmentsRes.error.message);
    if (objectivesRes.error) throw new Error(objectivesRes.error.message);
    if (okrsRes.error) throw new Error(okrsRes.error.message);
    if (keyResultsRes.error) throw new Error(keyResultsRes.error.message);
    if (kpisRes.error) throw new Error(kpisRes.error.message);
    if (jtbdRes.error) throw new Error(jtbdRes.error.message);
    if (tasksRes.error) throw new Error(tasksRes.error.message);

    const departments = (departmentsRes.data ?? []) as DepartmentRow[];
    const deptMap = new Map(departments.map((d) => [d.id, d.name]));

    const objectives = ((objectivesRes.data ?? []) as Array<Record<string, unknown>>).filter((row) =>
      belongsToScope(row, scope.mode, scope.departmentId, scope.userId)
    );

    const okrs = ((okrsRes.data ?? []) as Array<Record<string, unknown>>).filter((row) =>
      belongsToScope(row, scope.mode, scope.departmentId, scope.userId)
    );

    const keyResults = ((keyResultsRes.data ?? []) as Array<Record<string, unknown>>).filter((row) =>
      belongsToScope(row, scope.mode, scope.departmentId, scope.userId)
    );

    const kpis = ((kpisRes.data ?? []) as Array<Record<string, unknown>>).filter((row) =>
      belongsToScope(row, scope.mode, scope.departmentId, scope.userId)
    );

    const jtbds = ((jtbdRes.data ?? []) as Array<Record<string, unknown>>).filter((row) =>
      belongsToScope(row, scope.mode, scope.departmentId, scope.userId)
    );

    const tasks = ((tasksRes.data ?? []) as Array<Record<string, unknown>>).filter((row) =>
      belongsToScope(row, scope.mode, scope.departmentId, scope.userId)
    );

    const orgData = (orgRow ?? {}) as JsonObject;
    const companyName = safeString(orgData.name) || scope.org.name;
    const industry = safeString(orgData.industry) || "unknown";
    const employeeCount =
      safeNumber(orgData.employee_count) ??
      safeNumber(orgData.employees_count) ??
      safeNumber(orgData.number_of_employees) ??
      0;
    const companySize = safeString(orgData.company_size) || "unknown";

    const objectiveLines = objectives.slice(0, 20).map((row) => {
      const title = safeString(row.title) || "Untitled objective";
      const status = safeString(row.status) || "unknown";
      const progress = safeNumber(row.progress) ?? 0;
      const departmentName = row.department_id
        ? deptMap.get(String(row.department_id)) ?? String(row.department_id)
        : "company-wide";

      return `${truncate(title, 120)} | status: ${status} | progress: ${Math.round(progress)}% | department: ${departmentName}`;
    });

    const okrLines = okrs.slice(0, 20).map((row) => {
      const title = safeString(row.title) || "Untitled OKR";
      const status = safeString(row.status) || "unknown";
      const progress = safeNumber(row.progress) ?? 0;
      const departmentName = row.department_id
        ? deptMap.get(String(row.department_id)) ?? String(row.department_id)
        : "company-wide";

      return `${truncate(title, 120)} | status: ${status} | progress: ${Math.round(progress)}% | department: ${departmentName}`;
    });

    const keyResultLines = keyResults.slice(0, 24).map((row) => {
      const title = safeString(row.title) || "Untitled key result";
      const status = safeString(row.status) || "unknown";
      const progress = safeNumber(row.progress) ?? 0;
      const metricName = safeString(row.metric_name) || "n/a";
      const current = safeNumber(row.current_value) ?? 0;
      const target = safeNumber(row.target_value) ?? 0;
      const unit = safeString(row.unit);
      const departmentName = row.department_id
        ? deptMap.get(String(row.department_id)) ?? String(row.department_id)
        : "company-wide";

      return `${truncate(title, 120)} | status: ${status} | progress: ${Math.round(progress)}% | metric: ${metricName} | current: ${current}${unit ? ` ${unit}` : ""} | target: ${target}${unit ? ` ${unit}` : ""} | department: ${departmentName}`;
    });

    const kpiLines = kpis.slice(0, 24).map((row) => {
      const title = safeString(row.title) || "Untitled KPI";
      const current = safeNumber(row.current_value) ?? 0;
      const target = safeNumber(row.target_value) ?? 0;
      const unit = safeString(row.unit);
      const direction = safeString(row.direction) || "increase";
      const departmentName = row.department_id
        ? deptMap.get(String(row.department_id)) ?? String(row.department_id)
        : "company-wide";

      return `${truncate(title, 120)} | current: ${current}${unit ? ` ${unit}` : ""} | target: ${target}${unit ? ` ${unit}` : ""} | direction: ${direction} | department: ${departmentName}`;
    });

    const jtbdLines = jtbds.slice(0, 20).map((row) => {
      const title = safeString(row.title) || "Untitled JTBD";
      const status = safeString(row.status) || "unknown";
      const dueDate = safeString(row.due_date) || "none";
      const departmentName = row.department_id
        ? deptMap.get(String(row.department_id)) ?? String(row.department_id)
        : "company-wide";

      return `${truncate(title, 120)} | status: ${status} | due: ${dueDate} | department: ${departmentName}`;
    });

    const taskLines = tasks.slice(0, 24).map((row) => {
      const title = safeString(row.title) || "Untitled task";
      const status = safeString(row.status) || "unknown";
      const priority = safeString(row.priority) || "medium";
      const dueDate = safeString(row.due_date) || "none";
      const departmentName = row.department_id
        ? deptMap.get(String(row.department_id)) ?? String(row.department_id)
        : "company-wide";

      return `${truncate(title, 120)} | status: ${status} | priority: ${priority} | due: ${dueDate} | department: ${departmentName}`;
    });

    const instructions = `
You are ALAMIN AI, the embedded performance intelligence assistant inside this company workspace.

You must answer using the live company context below.
Do not give generic advice unless company data is missing.
Be direct and operational.
Do not hallucinate KPIs, OKRs, key results, objectives, JTBD, or tasks.

When useful, structure the answer like this:
1. Diagnosis
2. What it means
3. What to do next
4. Suggested KPI / Objective / OKR / KR / JTBD / Task updates

LIVE COMPANY CONTEXT
Organization: ${companyName}
Org slug: ${scope.org.slug}
Industry: ${industry}
Company size: ${companySize}
Employee count: ${employeeCount}
User role: ${scope.role}
Visibility scope: ${scope.mode}
Active cycle: ${cycleRow ? `Q${cycleRow.quarter} ${cycleRow.year} (${cycleRow.status})` : "none"}

${buildBlock("Departments", departments.map((d) => d.name))}
${buildBlock("Objectives", objectiveLines)}
${buildBlock("OKRs", okrLines)}
${buildBlock("Key Results", keyResultLines)}
${buildBlock("KPIs", kpiLines)}
${buildBlock("JTBD", jtbdLines)}
${buildBlock("Tasks", taskLines)}
Latest AI report:
- ${latestAiReport}
    `.trim();

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL?.trim() || "gpt-4.1-mini",
        stream: true,
        store: false,
        max_output_tokens: 1400,
        instructions,
        input: buildOpenAiInput(messages),
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      return json(
        {
          ok: false,
          error: "OpenAI request failed",
          detail,
        },
        500
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to run AI chat";
    return json({ ok: false, error: message }, 400);
  }
}