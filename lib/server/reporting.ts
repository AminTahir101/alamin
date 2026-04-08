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

type ObjectiveRow = {
  id: string;
  title: string;
  status: string;
  progress: number | null;
  department_id: string | null;
  created_at: string;
};

type OkrRow = {
  id: string;
  title: string;
  status: string;
  progress: number | null;
  objective_id: string | null;
  department_id: string | null;
  created_at: string;
};

type KpiRow = {
  id: string;
  title: string;
  description: string | null;
  department_id: string | null;
  current_value: number | null;
  target_value: number | null;
  weight: number | null;
  direction: string | null;
  updated_at: string;
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  department_id: string | null;
  assigned_to_user_id: string | null;
  due_date: string | null;
  created_at: string;
};

type PayloadDepartmentRow = {
  id: string;
  name: string;
  score: number;
  label: string;
  execution_score: number;
  kpi_score: number;
  objective_health: number;
  okr_health: number;
  task_completion_rate: number;
  objectives: number;
  okrs: number;
  kpis: number;
  open_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  risk_level: string;
  narrative: string;
};

type EnterpriseSummary = {
  score: number;
  label: string;
  evaluation_band: string;
  strategic_execution_score: number;
  kpi_health_score: number;
  objective_health_score: number;
  okr_health_score: number;
  task_execution_score: number;
  execution_consistency_score: number;
  objectives: number;
  okrs: number;
  kpis: number;
  open_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  task_completion_rate: number;
  critical_departments: number;
  at_risk_departments: number;
  strong_departments: number;
};

function asNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function weightedAverage(items: Array<{ value: number; weight: number }>) {
  const safe = items
    .map((item) => ({
      value: clamp(item.value),
      weight: Math.max(0, asNumber(item.weight, 0)),
    }))
    .filter((item) => item.weight > 0);

  if (!safe.length) return 0;

  const totalWeight = safe.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;

  const total = safe.reduce((sum, item) => sum + item.value * item.weight, 0);
  return Math.round(total / totalWeight);
}

function ratioPercent(done: number, total: number) {
  if (!total) return 0;
  return clamp(Math.round((done / total) * 100));
}

function scoreLabel(score: number) {
  if (score >= 85) return "On Track";
  if (score >= 60) return "At Risk";
  return "Off Track";
}

function evaluationBand(score: number) {
  if (score >= 90) return "World-class execution";
  if (score >= 80) return "High-performing enterprise";
  if (score >= 70) return "Operationally solid";
  if (score >= 60) return "Mixed execution";
  if (score >= 45) return "Execution pressure";
  return "Critical execution gap";
}

function riskLevel(score: number) {
  if (score >= 85) return "low";
  if (score >= 60) return "medium";
  return "high";
}

function normalizeStatus(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function computeKpiScore(kpi: Pick<KpiRow, "current_value" | "target_value" | "direction">) {
  const current = asNumber(kpi.current_value, 0);
  const target = asNumber(kpi.target_value, 0);
  const direction = normalizeStatus(kpi.direction || "increase");

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

function objectiveStatusScore(status: string, progress: number | null) {
  const normalized = normalizeStatus(status);
  const progressScore = clamp(asNumber(progress, 0));

  if (normalized === "completed") return 100;
  if (normalized === "active") return Math.max(55, progressScore);
  if (normalized === "pending_approval") return Math.max(50, progressScore);
  if (normalized === "draft") return Math.min(45, progressScore || 35);
  if (normalized === "cancelled") return 0;

  return progressScore;
}

function okrStatusScore(status: string, progress: number | null) {
  const normalized = normalizeStatus(status);
  const progressScore = clamp(asNumber(progress, 0));

  if (normalized === "completed") return 100;
  if (normalized === "on_track") return Math.max(80, progressScore);
  if (normalized === "active") return Math.max(65, progressScore);
  if (normalized === "at_risk") return Math.min(64, Math.max(35, progressScore));
  if (normalized === "off_track") return Math.min(40, progressScore || 30);
  if (normalized === "draft") return Math.min(45, progressScore || 35);
  if (normalized === "cancelled") return 0;

  return progressScore;
}

function taskExecutionScore(tasks: TaskRow[]) {
  if (!tasks.length) return 0;

  const completed = tasks.filter((row) => normalizeStatus(row.status) === "done").length;
  const overdue = tasks.filter(
    (row) =>
      Boolean(row.due_date) &&
      new Date(String(row.due_date)).getTime() < Date.now() &&
      normalizeStatus(row.status) !== "done" &&
      normalizeStatus(row.status) !== "cancelled"
  ).length;

  const completionRate = ratioPercent(completed, tasks.length);
  const overduePenalty = Math.min(40, overdue * 6);

  return clamp(completionRate - overduePenalty);
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

function daysOld(iso: string | null | undefined) {
  if (!iso) return 999;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 999;
  return Math.max(0, Math.floor((Date.now() - ts) / 86400000));
}

function listToBullets(items: string[], fallback = "None") {
  if (!items.length) return fallback;
  return items.map((item) => `- ${item}`).join("\n");
}

export function resolvePeriod(definition: ReportDefinitionRow, baseDate = new Date()) {
  const today = startOfDay(baseDate);

  if (definition.cadence === "custom") {
    const from = definition.custom_date_from
      ? new Date(`${definition.custom_date_from}T00:00:00.000Z`)
      : today;
    const to = definition.custom_date_to
      ? new Date(`${definition.custom_date_to}T00:00:00.000Z`)
      : today;
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

function buildDepartmentNarrative(row: PayloadDepartmentRow) {
  const strengths: string[] = [];
  const issues: string[] = [];

  if (row.kpi_score >= 80) strengths.push("strong KPI attainment");
  if (row.task_completion_rate >= 80) strengths.push("reliable task delivery");
  if (row.objective_health >= 75) strengths.push("healthy objective execution");

  if (row.kpi_score < 60) issues.push("KPI delivery is lagging");
  if (row.overdue_tasks > 0) issues.push("overdue execution is accumulating");
  if (row.okr_health < 60) issues.push("OKR health is weak");
  if (row.open_tasks > row.completed_tasks) issues.push("work-in-progress is too high");

  if (!issues.length && strengths.length) {
    return `This department is performing steadily with ${strengths.join(", ")}.`;
  }

  if (issues.length && !strengths.length) {
    return `This department requires intervention because ${issues.join(", ")}.`;
  }

  if (issues.length && strengths.length) {
    return `This department shows mixed performance: ${strengths.join(", ")}, but ${issues.join(", ")}.`;
  }

  return "This department has limited measurable activity in the current reporting window.";
}

function buildBoardNarrative(summary: EnterpriseSummary, departments: PayloadDepartmentRow[]) {
  const strongest = [...departments].sort((a, b) => b.score - a.score).slice(0, 3);
  const weakest = [...departments].sort((a, b) => a.score - b.score).slice(0, 3);

  const strongestLine = strongest.length
    ? strongest.map((row) => `${row.name} (${row.score})`).join(", ")
    : "No strong departments identified";

  const weakestLine = weakest.length
    ? weakest.map((row) => `${row.name} (${row.score})`).join(", ")
    : "No weak departments identified";

  return [
    `Enterprise performance is currently rated ${summary.score}/100, which falls into the "${summary.evaluation_band}" band.`,
    `The strongest departments in this cycle are ${strongestLine}.`,
    `The largest operational drag is coming from ${weakestLine}.`,
    `The board-level concern is whether KPI health and execution throughput are improving at the same pace; if not, strategy quality may appear better than real delivery.`,
  ].join(" ");
}

function buildCeoNarrative(summary: EnterpriseSummary, departments: PayloadDepartmentRow[]) {
  const highRisk = departments.filter((row) => row.risk_level === "high");
  const mediumRisk = departments.filter((row) => row.risk_level === "medium");

  return [
    `The CEO view points to a strategic execution score of ${summary.strategic_execution_score}/100 and a task execution score of ${summary.task_execution_score}/100.`,
    highRisk.length
      ? `${highRisk.length} department(s) are in high-risk territory and require direct intervention.`
      : `No departments are currently in high-risk territory.`,
    mediumRisk.length
      ? `${mediumRisk.length} department(s) are in medium-risk territory and should be watched closely.`
      : `There are no medium-risk departments at the moment.`,
    `The key management challenge is converting active work into completed outcomes without allowing open or overdue tasks to keep expanding.`,
  ].join(" ");
}

function buildDeptHeadNarrative(departments: PayloadDepartmentRow[]) {
  if (!departments.length) {
    return "No department-level report scope was found for this run.";
  }

  return departments
    .map(
      (row) =>
        `${row.name}: score ${row.score}/100, KPI health ${row.kpi_score}/100, OKR health ${row.okr_health}/100, task completion ${row.task_completion_rate}%, overdue tasks ${row.overdue_tasks}. ${row.narrative}`
    )
    .join(" ");
}

function buildRecommendations(summary: EnterpriseSummary, departments: PayloadDepartmentRow[]) {
  const recommendations: string[] = [];

  if (summary.kpi_health_score < 70) {
    recommendations.push("Reset KPI ownership and tighten weekly performance review on underperforming metrics.");
  }

  if (summary.task_execution_score < 70) {
    recommendations.push("Reduce execution drag by closing stale work, limiting parallel tasks, and escalating overdue deliverables.");
  }

  if (summary.objective_health_score < 70 || summary.okr_health_score < 70) {
    recommendations.push("Recalibrate objectives and OKRs so active work maps to measurable outcomes instead of broad intent.");
  }

  const weakDepartments = departments.filter((row) => row.score < 60);
  if (weakDepartments.length) {
    recommendations.push(
      `Intervene in weak departments first: ${weakDepartments.map((row) => row.name).join(", ")}.`
    );
  }

  if (!recommendations.length) {
    recommendations.push("Maintain current operating cadence and focus on consistency across departments.");
  }

  return {
    immediate: recommendations.slice(0, 3),
    thirty_day: [
      "Run an executive review of KPI slippage versus departmental workload.",
      "Retire or merge low-value tasks that do not support an objective, OKR, or KPI.",
      "Set explicit owner accountability for every at-risk OKR and KPI.",
    ],
    ninety_day: [
      "Standardize enterprise planning quality across departments using one scoring rubric.",
      "Rebalance staffing or management attention toward the lowest-performing departments.",
      "Track improvement in execution consistency, not just raw activity volume.",
    ],
  };
}

export async function buildReportPayload(args: {
  scope: Pick<AccessScope, "org" | "mode" | "departmentId" | "userId">;
  definition: ReportDefinitionRow;
  cycle: CycleRow | null;
}) {
  const admin = supabaseAdmin();
  const scopedDepartmentId = departmentFilter(
    args.definition,
    args.scope.mode === "org" ? null : args.scope.departmentId
  );
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
      age_days: daysOld(kpi.updated_at),
      department_name: kpi.department_id ? departmentMap.get(kpi.department_id) ?? null : null,
    };
  });

  const objectiveWithHealth = objectives.map((row) => ({
    ...row,
    progress: asNumber(row.progress, 0),
    health_score: objectiveStatusScore(row.status, row.progress),
    department_name: row.department_id ? departmentMap.get(row.department_id) ?? null : null,
  }));

  const okrWithHealth = okrs.map((row) => ({
    ...row,
    progress: asNumber(row.progress, 0),
    health_score: okrStatusScore(row.status, row.progress),
    department_name: row.department_id ? departmentMap.get(row.department_id) ?? null : null,
  }));

  const tasksWithMeta = tasks.map((row) => {
    const status = normalizeStatus(row.status);
    const overdue =
      Boolean(row.due_date) &&
      new Date(String(row.due_date)).getTime() < Date.now() &&
      status !== "done" &&
      status !== "cancelled";

    return {
      ...row,
      overdue,
      department_name: row.department_id ? departmentMap.get(row.department_id) ?? null : null,
    };
  });

  const departmentIds = new Set<string>();
  for (const row of [...objectives, ...okrs, ...kpis, ...tasks]) {
    if (row.department_id) departmentIds.add(row.department_id);
  }

  const departments: PayloadDepartmentRow[] = args.definition.include_department_breakdown
    ? Array.from(departmentIds).map((departmentId) => {
        const deptObjectives = objectiveWithHealth.filter((row) => row.department_id === departmentId);
        const deptOkrs = okrWithHealth.filter((row) => row.department_id === departmentId);
        const deptKpis = kpiWithScore.filter((row) => row.department_id === departmentId);
        const deptTasks = tasksWithMeta.filter((row) => row.department_id === departmentId);

        const completedTasks = deptTasks.filter((row) => normalizeStatus(row.status) === "done").length;
        const openTasks = deptTasks.filter(
          (row) => normalizeStatus(row.status) !== "done" && normalizeStatus(row.status) !== "cancelled"
        ).length;
        const overdueTasks = deptTasks.filter((row) => row.overdue).length;

        const kpiScore = average(deptKpis.map((row) => row.score));
        const objectiveHealth = average(deptObjectives.map((row) => row.health_score));
        const okrHealth = average(deptOkrs.map((row) => row.health_score));
        const executionScore = taskExecutionScore(deptTasks);
        const taskCompletionRate = ratioPercent(completedTasks, deptTasks.length);

        const score = weightedAverage([
          { value: kpiScore, weight: 0.4 },
          { value: objectiveHealth, weight: 0.15 },
          { value: okrHealth, weight: 0.2 },
          { value: executionScore, weight: 0.25 },
        ]);

        const row: PayloadDepartmentRow = {
          id: departmentId,
          name: departmentMap.get(departmentId) ?? departmentId,
          score,
          label: scoreLabel(score),
          execution_score: executionScore,
          kpi_score: kpiScore,
          objective_health: objectiveHealth,
          okr_health: okrHealth,
          task_completion_rate: taskCompletionRate,
          objectives: deptObjectives.length,
          okrs: deptOkrs.length,
          kpis: deptKpis.length,
          open_tasks: openTasks,
          completed_tasks: completedTasks,
          overdue_tasks: overdueTasks,
          risk_level: riskLevel(score),
          narrative: "",
        };

        row.narrative = buildDepartmentNarrative(row);
        return row;
      })
    : [];

  const completedTasks = tasksWithMeta.filter((row) => normalizeStatus(row.status) === "done").length;
  const openTasks = tasksWithMeta.filter(
    (row) => normalizeStatus(row.status) !== "done" && normalizeStatus(row.status) !== "cancelled"
  ).length;
  const overdueTasks = tasksWithMeta.filter((row) => row.overdue).length;

  const kpiHealthScore = average(kpiWithScore.map((row) => row.score));
  const objectiveHealthScore = average(objectiveWithHealth.map((row) => row.health_score));
  const okrHealthScore = average(okrWithHealth.map((row) => row.health_score));
  const taskExecution = taskExecutionScore(tasksWithMeta);
  const executionConsistency = departments.length
    ? clamp(100 - (Math.max(...departments.map((row) => row.score)) - Math.min(...departments.map((row) => row.score))))
    : 0;

  const strategicExecutionScore = weightedAverage([
    { value: objectiveHealthScore, weight: 0.25 },
    { value: okrHealthScore, weight: 0.3 },
    { value: kpiHealthScore, weight: 0.25 },
    { value: taskExecution, weight: 0.2 },
  ]);

  const enterpriseScore = weightedAverage([
    { value: strategicExecutionScore, weight: 0.45 },
    { value: kpiHealthScore, weight: 0.2 },
    { value: taskExecution, weight: 0.2 },
    { value: executionConsistency, weight: 0.15 },
  ]);

  const summary: EnterpriseSummary = {
    score: enterpriseScore,
    label: scoreLabel(enterpriseScore),
    evaluation_band: evaluationBand(enterpriseScore),
    strategic_execution_score: strategicExecutionScore,
    kpi_health_score: kpiHealthScore,
    objective_health_score: objectiveHealthScore,
    okr_health_score: okrHealthScore,
    task_execution_score: taskExecution,
    execution_consistency_score: executionConsistency,
    objectives: objectiveWithHealth.length,
    okrs: okrWithHealth.length,
    kpis: kpiWithScore.length,
    open_tasks: openTasks,
    completed_tasks: completedTasks,
    overdue_tasks: overdueTasks,
    task_completion_rate: ratioPercent(completedTasks, tasksWithMeta.length),
    critical_departments: departments.filter((row) => row.score < 45).length,
    at_risk_departments: departments.filter((row) => row.score >= 45 && row.score < 70).length,
    strong_departments: departments.filter((row) => row.score >= 85).length,
  };

  const rankedDepartments = [...departments].sort((a, b) => b.score - a.score);
  const strongestDepartments = rankedDepartments.slice(0, 5);
  const weakestDepartments = [...rankedDepartments].reverse().slice(0, 5);

  const boardNarrative = buildBoardNarrative(summary, departments);
  const ceoNarrative = buildCeoNarrative(summary, departments);
  const deptHeadNarrative = buildDeptHeadNarrative(departments);
  const recommendations = buildRecommendations(summary, departments);

  const boardView = {
    enterprise_score: summary.score,
    evaluation_band: summary.evaluation_band,
    strategic_execution_score: summary.strategic_execution_score,
    top_strengths: strongestDepartments.map((row) => `${row.name} (${row.score})`),
    top_risks: weakestDepartments.map((row) => `${row.name} (${row.score})`),
    narrative: boardNarrative,
    recommendations: {
      immediate: recommendations.immediate,
      thirty_day: recommendations.thirty_day,
      ninety_day: recommendations.ninety_day,
    },
  };

  const ceoView = {
    execution_score: summary.strategic_execution_score,
    kpi_health_score: summary.kpi_health_score,
    task_execution_score: summary.task_execution_score,
    departments_requiring_intervention: weakestDepartments.map((row) => ({
      name: row.name,
      score: row.score,
      risk_level: row.risk_level,
      narrative: row.narrative,
    })),
    strongest_departments: strongestDepartments.map((row) => ({
      name: row.name,
      score: row.score,
      narrative: row.narrative,
    })),
    narrative: ceoNarrative,
    focus_areas: recommendations.immediate,
  };

  const departmentHeadView = {
    departments: rankedDepartments.map((row) => ({
      name: row.name,
      score: row.score,
      kpi_score: row.kpi_score,
      okr_health: row.okr_health,
      objective_health: row.objective_health,
      execution_score: row.execution_score,
      task_completion_rate: row.task_completion_rate,
      overdue_tasks: row.overdue_tasks,
      narrative: row.narrative,
    })),
    narrative: deptHeadNarrative,
  };

  const enterpriseDiagnostics = {
    strongest_departments: strongestDepartments,
    weakest_departments: weakestDepartments,
    score_components: {
      strategic_execution_score: summary.strategic_execution_score,
      kpi_health_score: summary.kpi_health_score,
      objective_health_score: summary.objective_health_score,
      okr_health_score: summary.okr_health_score,
      task_execution_score: summary.task_execution_score,
      execution_consistency_score: summary.execution_consistency_score,
    },
    risks: {
      overdue_tasks: summary.overdue_tasks,
      critical_departments: summary.critical_departments,
      at_risk_departments: summary.at_risk_departments,
    },
  };

  return {
    org: args.scope.org,
    cycle: args.cycle,
    definition: {
      id: args.definition.id,
      title: args.definition.title,
      cadence: args.definition.cadence,
      description: args.definition.description,
      scope: scopedDepartmentId ? "department" : "organization",
    },
    summary,
    executive_views: {
      board: boardView,
      ceo: ceoView,
      department_heads: departmentHeadView,
    },
    enterprise_diagnostics: enterpriseDiagnostics,
    recommendations,
    departments: rankedDepartments,
    objectives: objectiveWithHealth,
    okrs: okrWithHealth,
    kpis: kpiWithScore,
    tasks: tasksWithMeta,
    generated_at: new Date().toISOString(),
  };
}

export function renderReportText(payload: Record<string, unknown>) {
  const org = payload.org as { name?: string; slug?: string } | undefined;
  const cycle = payload.cycle as { year?: number; quarter?: number; status?: string } | null | undefined;
  const summary = (payload.summary ?? {}) as Record<string, unknown>;
  const executiveViews = (payload.executive_views ?? {}) as Record<string, unknown>;
  const board = (executiveViews.board ?? {}) as Record<string, unknown>;
  const ceo = (executiveViews.ceo ?? {}) as Record<string, unknown>;
  const recommendations = (payload.recommendations ?? {}) as Record<string, unknown>;

  const boardNarrative = String(board.narrative ?? "");
  const ceoNarrative = String(ceo.narrative ?? "");
  const immediate = Array.isArray(recommendations.immediate)
    ? recommendations.immediate.map((item) => String(item))
    : [];
  const thirtyDay = Array.isArray(recommendations.thirty_day)
    ? recommendations.thirty_day.map((item) => String(item))
    : [];
  const ninetyDay = Array.isArray(recommendations.ninety_day)
    ? recommendations.ninety_day.map((item) => String(item))
    : [];

  const lines = [
    `${org?.name ?? org?.slug ?? "Organization"} Enterprise Evaluation Report`,
    cycle ? `Cycle: Q${cycle.quarter} ${cycle.year} (${cycle.status})` : "Cycle: No active cycle",
    `Generated: ${String(payload.generated_at ?? new Date().toISOString())}`,
    "",
    "Executive Summary",
    `Enterprise score: ${String(summary.score ?? 0)} (${String(summary.label ?? "No label")})`,
    `Evaluation band: ${String(summary.evaluation_band ?? "Unknown")}`,
    `Strategic execution score: ${String(summary.strategic_execution_score ?? 0)}`,
    `KPI health score: ${String(summary.kpi_health_score ?? 0)}`,
    `Objective health score: ${String(summary.objective_health_score ?? 0)}`,
    `OKR health score: ${String(summary.okr_health_score ?? 0)}`,
    `Task execution score: ${String(summary.task_execution_score ?? 0)}`,
    `Execution consistency score: ${String(summary.execution_consistency_score ?? 0)}`,
    `Objectives: ${String(summary.objectives ?? 0)}`,
    `OKRs: ${String(summary.okrs ?? 0)}`,
    `KPIs: ${String(summary.kpis ?? 0)}`,
    `Open tasks: ${String(summary.open_tasks ?? 0)}`,
    `Completed tasks: ${String(summary.completed_tasks ?? 0)}`,
    `Overdue tasks: ${String(summary.overdue_tasks ?? 0)}`,
    `Task completion rate: ${String(summary.task_completion_rate ?? 0)}%`,
    "",
    "Board View",
    boardNarrative || "No board narrative available.",
    "",
    "CEO View",
    ceoNarrative || "No CEO narrative available.",
    "",
    "Immediate Actions",
    listToBullets(immediate),
    "",
    "30-Day Actions",
    listToBullets(thirtyDay),
    "",
    "90-Day Actions",
    listToBullets(ninetyDay),
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
  const departments = Array.isArray(payload.departments) ? payload.departments : [];
  const objectives = Array.isArray(payload.objectives) ? payload.objectives : [];
  const okrs = Array.isArray(payload.okrs) ? payload.okrs : [];
  const kpis = Array.isArray(payload.kpis) ? payload.kpis : [];
  const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];

  push("section", "key", "value");
  push("meta", "organization", org?.name ?? org?.slug ?? "");
  push("meta", "cycle", cycle ? `Q${cycle.quarter} ${cycle.year}` : "No active cycle");
  push("meta", "generated_at", String(payload.generated_at ?? ""));
  push("summary", "enterprise_score", String(summary.score ?? 0));
  push("summary", "label", String(summary.label ?? ""));
  push("summary", "evaluation_band", String(summary.evaluation_band ?? ""));
  push("summary", "strategic_execution_score", String(summary.strategic_execution_score ?? 0));
  push("summary", "kpi_health_score", String(summary.kpi_health_score ?? 0));
  push("summary", "objective_health_score", String(summary.objective_health_score ?? 0));
  push("summary", "okr_health_score", String(summary.okr_health_score ?? 0));
  push("summary", "task_execution_score", String(summary.task_execution_score ?? 0));
  push("summary", "execution_consistency_score", String(summary.execution_consistency_score ?? 0));
  push("summary", "objectives", String(summary.objectives ?? 0));
  push("summary", "okrs", String(summary.okrs ?? 0));
  push("summary", "kpis", String(summary.kpis ?? 0));
  push("summary", "open_tasks", String(summary.open_tasks ?? 0));
  push("summary", "completed_tasks", String(summary.completed_tasks ?? 0));
  push("summary", "overdue_tasks", String(summary.overdue_tasks ?? 0));
  push("summary", "task_completion_rate", String(summary.task_completion_rate ?? 0));
  lines.push("");

  const sections: Array<[string, unknown[], string[]]> = [
    [
      "departments",
      departments,
      [
        "name",
        "score",
        "label",
        "risk_level",
        "kpi_score",
        "objective_health",
        "okr_health",
        "execution_score",
        "task_completion_rate",
        "open_tasks",
        "completed_tasks",
        "overdue_tasks",
        "narrative",
      ],
    ],
    ["objectives", objectives, ["title", "status", "progress", "health_score", "department_name", "created_at"]],
    ["okrs", okrs, ["title", "status", "progress", "health_score", "department_name", "created_at"]],
    ["kpis", kpis, ["title", "label", "score", "current_value", "target_value", "department_name", "age_days", "updated_at"]],
    ["tasks", tasks, ["title", "status", "priority", "department_name", "overdue", "due_date", "created_at"]],
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

  if (!apiKey || !from || !args.to.length) {
    return {
      sent: false,
      skipped: true,
      error: !args.to.length ? "No recipients" : "Missing RESEND_API_KEY or REPORTS_FROM_EMAIL",
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

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function reportEmailHtml(args: {
  title: string;
  periodLabel: string;
  payload: Record<string, unknown>;
}) {
  const summary = (args.payload.summary ?? {}) as Record<string, unknown>;
  const executiveViews = (args.payload.executive_views ?? {}) as Record<string, unknown>;
  const board = (executiveViews.board ?? {}) as Record<string, unknown>;
  const ceo = (executiveViews.ceo ?? {}) as Record<string, unknown>;
  const departments = Array.isArray(args.payload.departments)
    ? (args.payload.departments as Record<string, unknown>[]).slice(0, 8)
    : [];

  const immediate = Array.isArray((args.payload.recommendations as Record<string, unknown> | undefined)?.immediate)
    ? ((args.payload.recommendations as Record<string, unknown>).immediate as unknown[]).map((item) => String(item))
    : [];

  const departmentHtml = departments
    .map((row) => {
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #ececf3;">${htmlEscape(row.name)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #ececf3;">${htmlEscape(row.score)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #ececf3;">${htmlEscape(row.label)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #ececf3;">${htmlEscape(row.risk_level)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #ececf3;">${htmlEscape(row.overdue_tasks)}</td>
      </tr>`;
    })
    .join("");

  const immediateHtml = immediate.length
    ? `<ul style="margin:10px 0 0;padding-left:18px;color:#374151;">${immediate
        .map((item) => `<li style="margin:0 0 8px;">${htmlEscape(item)}</li>`)
        .join("")}</ul>`
    : `<div style="margin-top:10px;color:#6b7280;">No immediate actions generated.</div>`;

  return `
    <div style="font-family:Inter,Arial,sans-serif;background:#f5f7fb;padding:24px;">
      <div style="max-width:920px;margin:0 auto;background:#ffffff;border-radius:24px;border:1px solid #e8eaf2;overflow:hidden;">
        <div style="padding:28px 30px;background:#0f172a;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;opacity:.72;">ALAMIN Enterprise Report</div>
          <h1 style="margin:10px 0 0;font-size:30px;line-height:1.08;">${htmlEscape(args.title)}</h1>
          <p style="margin:10px 0 0;font-size:15px;line-height:1.7;opacity:.86;">Period: ${htmlEscape(args.periodLabel)}</p>
        </div>

        <div style="padding:28px 30px;">
          <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;">
            <div style="background:#111827;color:#fff;border-radius:18px;padding:16px;">
              <div style="font-size:12px;opacity:.72;">Enterprise score</div>
              <div style="margin-top:8px;font-size:28px;font-weight:800;">${htmlEscape(summary.score)}</div>
              <div style="margin-top:6px;font-size:12px;opacity:.8;">${htmlEscape(summary.evaluation_band)}</div>
            </div>
            <div style="background:#f8fafc;border-radius:18px;padding:16px;">
              <div style="font-size:12px;color:#64748b;">Strategic execution</div>
              <div style="margin-top:8px;font-size:26px;font-weight:800;color:#0f172a;">${htmlEscape(summary.strategic_execution_score)}</div>
            </div>
            <div style="background:#f8fafc;border-radius:18px;padding:16px;">
              <div style="font-size:12px;color:#64748b;">KPI health</div>
              <div style="margin-top:8px;font-size:26px;font-weight:800;color:#0f172a;">${htmlEscape(summary.kpi_health_score)}</div>
            </div>
            <div style="background:#f8fafc;border-radius:18px;padding:16px;">
              <div style="font-size:12px;color:#64748b;">Task execution</div>
              <div style="margin-top:8px;font-size:26px;font-weight:800;color:#0f172a;">${htmlEscape(summary.task_execution_score)}</div>
            </div>
            <div style="background:#f8fafc;border-radius:18px;padding:16px;">
              <div style="font-size:12px;color:#64748b;">Overdue tasks</div>
              <div style="margin-top:8px;font-size:26px;font-weight:800;color:#0f172a;">${htmlEscape(summary.overdue_tasks)}</div>
            </div>
          </div>

          <div style="margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:18px;">
            <div style="border:1px solid #ececf3;border-radius:18px;padding:18px;">
              <div style="font-size:13px;font-weight:700;color:#0f172a;">Board View</div>
              <div style="margin-top:10px;color:#374151;font-size:14px;line-height:1.75;">${htmlEscape(board.narrative)}</div>
            </div>
            <div style="border:1px solid #ececf3;border-radius:18px;padding:18px;">
              <div style="font-size:13px;font-weight:700;color:#0f172a;">CEO View</div>
              <div style="margin-top:10px;color:#374151;font-size:14px;line-height:1.75;">${htmlEscape(ceo.narrative)}</div>
            </div>
          </div>

          <div style="margin-top:28px;">
            <div style="font-size:18px;font-weight:800;color:#0f172a;">Department Performance Ranking</div>
            <table style="width:100%;margin-top:12px;border-collapse:collapse;border:1px solid #ececf3;border-radius:16px;overflow:hidden;">
              <thead>
                <tr style="background:#f8fafc;text-align:left;">
                  <th style="padding:12px;border-bottom:1px solid #ececf3;">Department</th>
                  <th style="padding:12px;border-bottom:1px solid #ececf3;">Score</th>
                  <th style="padding:12px;border-bottom:1px solid #ececf3;">Label</th>
                  <th style="padding:12px;border-bottom:1px solid #ececf3;">Risk</th>
                  <th style="padding:12px;border-bottom:1px solid #ececf3;">Overdue Tasks</th>
                </tr>
              </thead>
              <tbody>
                ${
                  departmentHtml ||
                  `<tr><td colspan="5" style="padding:12px;color:#6b7280;">No department data available.</td></tr>`
                }
              </tbody>
            </table>
          </div>

          <div style="margin-top:28px;border:1px solid #ececf3;border-radius:18px;padding:18px;">
            <div style="font-size:16px;font-weight:800;color:#0f172a;">Immediate Executive Actions</div>
            ${immediateHtml}
          </div>
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
    .update({
      last_generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.definition.id);

  const recipients = (args.definition.recipients ?? []).filter(Boolean);

  if (args.definition.auto_email && recipients.length) {
    const emailResult = await sendReportEmail({
      to: recipients,
      subject: `${args.definition.title} · ${period.label}`,
      html: reportEmailHtml({
        title: args.definition.title,
        periodLabel: period.label,
        payload,
      }),
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