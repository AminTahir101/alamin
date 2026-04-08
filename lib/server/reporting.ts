import { supabaseAdmin, type AccessScope } from "@/lib/server/accessScope";

export type ReportCadence =
  | "weekly"
  | "bi_weekly"
  | "monthly"
  | "quarterly"
  | "bi_annual"
  | "annual"
  | "custom";

export type ReportDefinitionRow = {
  id: string;
  org_id: string;
  cycle_id: string | null;
  department_id: string | null;
  title: string;
  description: string | null;
  cadence: ReportCadence;
  custom_label: string | null;
  custom_date_from: string | null;
  custom_date_to: string | null;
  recipients: string[] | null;
  export_formats: string[] | null;
  include_company_summary: boolean;
  include_department_breakdown: boolean;
  include_objectives: boolean;
  include_okrs: boolean;
  include_kpis: boolean;
  include_tasks: boolean;
  auto_generate: boolean;
  auto_email: boolean;
  is_active: boolean;
  filters: Record<string, unknown> | null;
  last_generated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ReportRunRow = {
  id: string;
  report_definition_id: string;
  org_id: string;
  cycle_id: string | null;
  status: string;
  period_label: string;
  date_from: string | null;
  date_to: string | null;
  report_payload: Record<string, unknown>;
  report_text: string | null;
  exported_formats: string[] | null;
  emailed_to: string[] | null;
  email_status: string;
  email_error: string | null;
  generated_by: string | null;
  generated_at: string;
};

type CycleRow = { id: string; year: number; quarter: number; status: string };
type DepartmentRow = { id: string; name: string };
type ObjectiveRow = { id: string; title: string; status: string; progress: number | null; department_id: string | null; created_at: string };
type OkrRow = { id: string; title: string; status: string; progress: number | null; objective_id: string | null; department_id: string | null; created_at: string };
type KpiRow = { id: string; title: string; description: string | null; department_id: string | null; current_value: number | null; target_value: number | null; weight: number | null; direction: string | null; updated_at: string };
type TaskRow = { id: string; title: string; status: string; priority: string; department_id: string | null; assigned_to_user_id: string | null; due_date: string | null; created_at: string };

function asNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function scoreLabel(score: number) {
  if (score >= 85) return "On Track";
  if (score >= 60) return "At Risk";
  return "Off Track";
}

function computeKpiScore(kpi: Pick<KpiRow, "current_value" | "target_value" | "direction">) {
  const current = asNumber(kpi.current_value, 0);
  const target = asNumber(kpi.target_value, 0);
  const direction = String(kpi.direction ?? "increase").toLowerCase();

  if (target <= 0 && current <= 0) return 0;
  if (direction === "decrease") {
    if (current <= 0 && target <= 0) return 100;
    if (current <= 0) return 100;
    if (target <= 0) return 0;
    return clamp((target / current) * 100);
  }

  if (target <= 0) return 0;
  return clamp((current / target) * 100);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function cadenceDays(cadence: ReportCadence) {
  switch (cadence) {
    case "weekly":
      return 7;
    case "bi_weekly":
      return 14;
    case "monthly":
      return 30;
    case "quarterly":
      return 90;
    case "bi_annual":
      return 182;
    case "annual":
      return 365;
    default:
      return 0;
  }
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function resolvePeriod(definition: ReportDefinitionRow, baseDate = new Date()) {
  const today = startOfDay(baseDate);

  if (definition.cadence === "custom") {
    const from = definition.custom_date_from ? new Date(`${definition.custom_date_from}T00:00:00.000Z`) : today;
    const to = definition.custom_date_to ? new Date(`${definition.custom_date_to}T00:00:00.000Z`) : today;
    const label = definition.custom_label || `Custom (${toDateOnly(from)} → ${toDateOnly(to)})`;
    return { label, dateFrom: toDateOnly(from), dateTo: toDateOnly(to) };
  }

  const days = cadenceDays(definition.cadence);
  const from = addDays(today, -days + 1);
  const label = `${definition.cadence.replace(/_/g, " ")} (${toDateOnly(from)} → ${toDateOnly(today)})`;
  return { label, dateFrom: toDateOnly(from), dateTo: toDateOnly(today) };
}

export function isDue(definition: ReportDefinitionRow, lastGeneratedAt?: string | null, now = new Date()) {
  if (!definition.is_active || !definition.auto_generate) return false;
  if (definition.cadence === "custom") return false;
  if (!lastGeneratedAt) return true;

  const days = cadenceDays(definition.cadence);
  const last = new Date(lastGeneratedAt);
  const next = addDays(startOfDay(last), days);
  return startOfDay(now).getTime() >= next.getTime();
}

export async function getActiveCycle(admin: ReturnType<typeof supabaseAdmin>, orgId: string) {
  const { data, error } = await admin
    .from("quarterly_cycles")
    .select("id,year,quarter,status")
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("year", { ascending: false })
    .order("quarter", { ascending: false })
    .maybeSingle<CycleRow>();

  if (error) throw new Error(error.message);
  return data ?? null;
}

async function getDepartmentMap(admin: ReturnType<typeof supabaseAdmin>, orgId: string) {
  const { data, error } = await admin
    .from("departments")
    .select("id,name")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as DepartmentRow[];
  return new Map(rows.map((row) => [row.id, row.name]));
}

function departmentFilter(definition: ReportDefinitionRow, departmentId: string | null) {
  return definition.department_id ?? departmentId ?? null;
}

export async function buildReportPayload(args: {
  scope: Pick<AccessScope, "org" | "mode" | "departmentId" | "userId">;
  definition: ReportDefinitionRow;
  cycle: CycleRow | null;
}) {
  const admin = supabaseAdmin();
  const scopedDepartmentId = departmentFilter(args.definition, args.scope.mode === "org" ? null : args.scope.departmentId);
  const cycleId = args.definition.cycle_id ?? args.cycle?.id ?? null;
  const departmentMap = await getDepartmentMap(admin, args.scope.org.id);

  let objectives: ObjectiveRow[] = [];
  let okrs: OkrRow[] = [];
  let kpis: KpiRow[] = [];
  let tasks: TaskRow[] = [];

  if (cycleId) {
    if (args.definition.include_objectives) {
      let q = admin
        .from("objectives")
        .select("id,title,status,progress,department_id,created_at")
        .eq("org_id", args.scope.org.id)
        .eq("cycle_id", cycleId)
        .order("created_at", { ascending: false });
      if (scopedDepartmentId) q = q.eq("department_id", scopedDepartmentId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      objectives = (data ?? []) as ObjectiveRow[];
    }

    if (args.definition.include_okrs) {
      let q = admin
        .from("okrs")
        .select("id,title,status,progress,objective_id,department_id,created_at")
        .eq("org_id", args.scope.org.id)
        .eq("cycle_id", cycleId)
        .order("created_at", { ascending: false });
      if (scopedDepartmentId) q = q.eq("department_id", scopedDepartmentId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      okrs = (data ?? []) as OkrRow[];
    }

    if (args.definition.include_kpis) {
      let q = admin
        .from("kpis")
        .select("id,title,description,department_id,current_value,target_value,weight,direction,updated_at")
        .eq("org_id", args.scope.org.id)
        .eq("cycle_id", cycleId)
        .eq("is_active", true)
        .order("updated_at", { ascending: false });
      if (scopedDepartmentId) q = q.eq("department_id", scopedDepartmentId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      kpis = (data ?? []) as KpiRow[];
    }

    if (args.definition.include_tasks) {
      let q = admin
        .from("tasks")
        .select("id,title,status,priority,department_id,assigned_to_user_id,due_date,created_at")
        .eq("org_id", args.scope.org.id)
        .eq("cycle_id", cycleId)
        .order("created_at", { ascending: false });
      if (scopedDepartmentId) q = q.eq("department_id", scopedDepartmentId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      tasks = (data ?? []) as TaskRow[];
    }
  }

  const kpiWithScore = kpis.map((kpi) => {
    const score = computeKpiScore(kpi);
    return {
      ...kpi,
      score,
      label: scoreLabel(score),
      department_name: kpi.department_id ? departmentMap.get(kpi.department_id) ?? null : null,
    };
  });

  const departmentIds = new Set<string>();
  for (const row of [...objectives, ...okrs, ...kpis, ...tasks]) {
    if (row.department_id) departmentIds.add(row.department_id);
  }

  const departments = args.definition.include_department_breakdown
    ? Array.from(departmentIds).map((departmentId) => {
        const deptObjectives = objectives.filter((row) => row.department_id === departmentId);
        const deptOkrs = okrs.filter((row) => row.department_id === departmentId);
        const deptKpis = kpiWithScore.filter((row) => row.department_id === departmentId);
        const deptTasks = tasks.filter((row) => row.department_id === departmentId);

        const score = average(deptKpis.map((row) => row.score));

        return {
          id: departmentId,
          name: departmentMap.get(departmentId) ?? departmentId,
          score,
          label: scoreLabel(score),
          objectives: deptObjectives.length,
          okrs: deptOkrs.length,
          kpis: deptKpis.length,
          open_tasks: deptTasks.filter((row) => !["done", "cancelled"].includes(row.status)).length,
          completed_tasks: deptTasks.filter((row) => row.status === "done").length,
        };
      })
    : [];

  const companyScore = average(kpiWithScore.map((row) => row.score));
  const completedTasks = tasks.filter((row) => row.status === "done").length;
  const openTasks = tasks.filter((row) => !["done", "cancelled"].includes(row.status)).length;
  const overdueTasks = tasks.filter((row) => row.due_date && new Date(row.due_date).getTime() < Date.now() && row.status !== "done").length;

  const reportSummary = {
    score: companyScore,
    label: scoreLabel(companyScore),
    objectives: objectives.length,
    okrs: okrs.length,
    kpis: kpiWithScore.length,
    open_tasks: openTasks,
    completed_tasks: completedTasks,
    overdue_tasks: overdueTasks,
    task_completion_rate: tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0,
  };

  return {
    org: args.scope.org,
    cycle: args.cycle,
    definition: {
      id: args.definition.id,
      title: args.definition.title,
      cadence: args.definition.cadence,
      description: args.definition.description,
    },
    summary: reportSummary,
    departments,
    objectives: objectives.map((row) => ({
      ...row,
      progress: asNumber(row.progress, 0),
      department_name: row.department_id ? departmentMap.get(row.department_id) ?? null : null,
    })),
    okrs: okrs.map((row) => ({
      ...row,
      progress: asNumber(row.progress, 0),
      department_name: row.department_id ? departmentMap.get(row.department_id) ?? null : null,
    })),
    kpis: kpiWithScore,
    tasks: tasks.map((row) => ({
      ...row,
      department_name: row.department_id ? departmentMap.get(row.department_id) ?? null : null,
    })),
    generated_at: new Date().toISOString(),
  };
}

export function renderReportText(payload: Record<string, unknown>) {
  const org = payload.org as { name?: string; slug?: string } | undefined;
  const cycle = payload.cycle as { year?: number; quarter?: number; status?: string } | null | undefined;
  const summary = (payload.summary ?? {}) as Record<string, unknown>;

  const lines = [
    `${org?.name ?? org?.slug ?? "Organization"} Report`,
    cycle ? `Cycle: Q${cycle.quarter} ${cycle.year} (${cycle.status})` : "Cycle: No active cycle",
    `Generated: ${String(payload.generated_at ?? new Date().toISOString())}`,
    "",
    `Company score: ${String(summary.score ?? 0)} (${String(summary.label ?? "No label")})`,
    `Objectives: ${String(summary.objectives ?? 0)}`,
    `OKRs: ${String(summary.okrs ?? 0)}`,
    `KPIs: ${String(summary.kpis ?? 0)}`,
    `Open tasks: ${String(summary.open_tasks ?? 0)}`,
    `Completed tasks: ${String(summary.completed_tasks ?? 0)}`,
    `Overdue tasks: ${String(summary.overdue_tasks ?? 0)}`,
  ];

  return lines.join("\n");
}

export function reportPayloadToCsv(payload: Record<string, unknown>) {
  const lines: string[] = [];
  const push = (...cells: Array<string | number | null | undefined>) => {
    lines.push(cells.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","));
  };

  const org = payload.org as { name?: string; slug?: string } | undefined;
  const cycle = payload.cycle as { year?: number; quarter?: number; status?: string } | null | undefined;
  const summary = (payload.summary ?? {}) as Record<string, unknown>;

  push("Section", "Key", "Value");
  push("meta", "organization", org?.name ?? org?.slug ?? "");
  push("meta", "cycle", cycle ? `Q${cycle.quarter} ${cycle.year}` : "No active cycle");
  push("meta", "generated_at", String(payload.generated_at ?? ""));
  push("summary", "score", String(summary.score ?? 0));
  push("summary", "label", String(summary.label ?? ""));
  push("summary", "objectives", String(summary.objectives ?? 0));
  push("summary", "okrs", String(summary.okrs ?? 0));
  push("summary", "kpis", String(summary.kpis ?? 0));
  push("summary", "open_tasks", String(summary.open_tasks ?? 0));
  push("summary", "completed_tasks", String(summary.completed_tasks ?? 0));
  push("summary", "overdue_tasks", String(summary.overdue_tasks ?? 0));
  push("summary", "task_completion_rate", String(summary.task_completion_rate ?? 0));
  lines.push("");

  const sections: Array<[string, unknown[], string[]]> = [
    ["departments", Array.isArray(payload.departments) ? payload.departments : [], ["name", "score", "label", "objectives", "okrs", "kpis", "open_tasks", "completed_tasks"]],
    ["objectives", Array.isArray(payload.objectives) ? payload.objectives : [], ["title", "status", "progress", "department_name", "created_at"]],
    ["okrs", Array.isArray(payload.okrs) ? payload.okrs : [], ["title", "status", "progress", "department_name", "created_at"]],
    ["kpis", Array.isArray(payload.kpis) ? payload.kpis : [], ["title", "label", "score", "current_value", "target_value", "department_name", "updated_at"]],
    ["tasks", Array.isArray(payload.tasks) ? payload.tasks : [], ["title", "status", "priority", "department_name", "due_date", "created_at"]],
  ];

  for (const [section, rows, keys] of sections) {
    if (!rows.length) continue;
    push(section, ...keys);
    for (const row of rows) {
      const obj = (row ?? {}) as Record<string, unknown>;
      push(section, ...keys.map((key) => String(obj[key] ?? "")));
    }
    lines.push("");
  }

  return lines.join("\n");
}

function env(name: string) {
  return process.env[name]?.trim() || "";
}

export async function sendReportEmail(args: {
  to: string[];
  subject: string;
  html: string;
}) {
  const apiKey = env("RESEND_API_KEY");
  const from = env("REPORTS_FROM_EMAIL");

  console.log("REPORT EMAIL DEBUG", {
    hasApiKey: Boolean(apiKey),
    hasFromEmail: Boolean(from),
    fromEmailValue: from || null,
    recipientsCount: args.to.length,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV || null,
  });

  if (!apiKey || !from || !args.to.length) {
    return {
      sent: false,
      skipped: true,
      error: !args.to.length
        ? "No recipients"
        : "Missing RESEND_API_KEY or REPORTS_FROM_EMAIL",
    };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return {
      sent: false,
      skipped: false,
      error: detail || `Email send failed (${res.status})`,
    };
  }

  return { sent: true, skipped: false, error: null };
}
export function reportEmailHtml(args: {
  title: string;
  periodLabel: string;
  payload: Record<string, unknown>;
}) {
  const summary = (args.payload.summary ?? {}) as Record<string, unknown>;
  const departments = Array.isArray(args.payload.departments) ? args.payload.departments.slice(0, 6) : [];

  const departmentHtml = departments
    .map((row) => {
      const r = row as Record<string, unknown>;
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${String(r.name ?? "")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${String(r.score ?? "")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${String(r.label ?? "")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${String(r.open_tasks ?? 0)}</td>
      </tr>`;
    })
    .join("");

  return `
    <div style="font-family:Inter,Arial,sans-serif;background:#f6f7fb;padding:24px;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border-radius:20px;padding:28px;border:1px solid #ececf3;">
        <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#6b7280;">ALAMIN Reports</div>
        <h1 style="margin:10px 0 0;font-size:28px;line-height:1.1;color:#111827;">${args.title}</h1>
        <p style="margin:12px 0 0;color:#4b5563;font-size:15px;line-height:1.7;">Period: ${args.periodLabel}</p>

        <div style="margin-top:24px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;">
          <div style="background:#111827;color:#fff;border-radius:16px;padding:16px;"><div style="font-size:12px;opacity:.72;">Company score</div><div style="margin-top:8px;font-size:24px;font-weight:700;">${String(summary.score ?? 0)}</div></div>
          <div style="background:#f9fafb;border-radius:16px;padding:16px;"><div style="font-size:12px;color:#6b7280;">Objectives</div><div style="margin-top:8px;font-size:24px;font-weight:700;color:#111827;">${String(summary.objectives ?? 0)}</div></div>
          <div style="background:#f9fafb;border-radius:16px;padding:16px;"><div style="font-size:12px;color:#6b7280;">KPIs</div><div style="margin-top:8px;font-size:24px;font-weight:700;color:#111827;">${String(summary.kpis ?? 0)}</div></div>
          <div style="background:#f9fafb;border-radius:16px;padding:16px;"><div style="font-size:12px;color:#6b7280;">Open tasks</div><div style="margin-top:8px;font-size:24px;font-weight:700;color:#111827;">${String(summary.open_tasks ?? 0)}</div></div>
        </div>

        <div style="margin-top:28px;">
          <h2 style="margin:0 0 12px;font-size:18px;color:#111827;">Department breakdown</h2>
          <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:16px;overflow:hidden;">
            <thead>
              <tr style="background:#f9fafb;text-align:left;">
                <th style="padding:10px 12px;border-bottom:1px solid #eee;">Department</th>
                <th style="padding:10px 12px;border-bottom:1px solid #eee;">Score</th>
                <th style="padding:10px 12px;border-bottom:1px solid #eee;">Label</th>
                <th style="padding:10px 12px;border-bottom:1px solid #eee;">Open tasks</th>
              </tr>
            </thead>
            <tbody>${departmentHtml || `<tr><td colspan="4" style="padding:12px;color:#6b7280;">No department breakdown available.</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export async function generateAndStoreReport(args: {
  definition: ReportDefinitionRow;
  scope: Pick<AccessScope, "org" | "mode" | "departmentId" | "userId">;
  generatedBy: string | null;
}) {
  const admin = supabaseAdmin();
  const cycle = args.definition.cycle_id ? null : await getActiveCycle(admin, args.scope.org.id);
  const period = resolvePeriod(args.definition);
  const payload = await buildReportPayload({ scope: args.scope, definition: args.definition, cycle });
  const reportText = renderReportText(payload);

  const inserted = await admin
    .from("report_runs")
    .insert({
      report_definition_id: args.definition.id,
      org_id: args.scope.org.id,
      cycle_id: args.definition.cycle_id ?? cycle?.id ?? null,
      status: "generated",
      period_label: period.label,
      date_from: period.dateFrom,
      date_to: period.dateTo,
      report_payload: payload,
      report_text: reportText,
      generated_by: args.generatedBy,
      email_status: args.definition.auto_email ? "pending" : "skipped",
    })
    .select("*")
    .single<ReportRunRow>();

  if (inserted.error || !inserted.data) {
    throw new Error(inserted.error?.message || "Failed to store report run");
  }

  await admin
    .from("report_definitions")
    .update({ last_generated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", args.definition.id);

  const recipients = (args.definition.recipients ?? []).filter(Boolean);
  if (args.definition.auto_email && recipients.length) {
    const emailResult = await sendReportEmail({
      to: recipients,
      subject: `${args.definition.title} · ${period.label}`,
      html: reportEmailHtml({ title: args.definition.title, periodLabel: period.label, payload }),
    });

    await admin
      .from("report_runs")
      .update({
        status: emailResult.sent ? "emailed" : "generated",
        emailed_to: emailResult.sent ? recipients : [],
        email_status: emailResult.sent ? "sent" : emailResult.skipped ? "skipped" : "failed",
        email_error: emailResult.error,
      })
      .eq("id", inserted.data.id);

    return {
      ...inserted.data,
      emailed_to: emailResult.sent ? recipients : [],
      email_status: emailResult.sent ? "sent" : emailResult.skipped ? "skipped" : "failed",
      email_error: emailResult.error,
      status: emailResult.sent ? "emailed" : "generated",
    };
  }

  return inserted.data;
}
