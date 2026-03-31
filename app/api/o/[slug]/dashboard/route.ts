import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };

type CycleRow = { id: string; year: number; quarter: number; status: string };
type DepartmentRow = { id: string; name: string };
type ObjectiveRow = {
  id: string;
  title: string;
  status: string;
  progress: number | null;
  department_id: string | null;
  owner_user_id: string | null;
  created_at: string;
};
type OkrRow = {
  id: string;
  title: string;
  status: string;
  progress: number | null;
  objective_id: string;
  department_id: string | null;
  owner_user_id: string | null;
  created_at: string;
};
type KpiRow = {
  id: string;
  title: string;
  description: string | null;
  department_id: string | null;
  owner_user_id: string | null;
  current_value: number | null;
  target_value: number | null;
  weight: number | null;
  direction: string | null;
  is_active: boolean | null;
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
type SnapshotRow = {
  id: string;
  score: number | null;
  label: string | null;
  summary: string | null;
  department_id: string | null;
  created_at: string;
};
type AiReportRow = {
  id: string;
  title: string;
  summary: string | null;
  created_at: string;
};

type DashboardResponse = {
  ok: true;
  org: { id: string; slug: string; name: string };
  cycle: CycleRow | null;
  company: {
    score: number;
    label: string;
    summary: string;
    total_objectives: number;
    active_okrs: number;
    active_kpis: number;
    open_tasks: number;
    completed_tasks: number;
    overdue_tasks: number;
    task_completion_rate: number;
  };
  departments: Array<{
    id: string;
    name: string;
    score: number;
    label: string;
    objectives: number;
    okrs: number;
    kpis: number;
    open_tasks: number;
    completed_tasks: number;
  }>;
  objectives: Array<{
    id: string;
    title: string;
    status: string;
    progress: number;
    department_id: string | null;
    department_name: string | null;
    okr_count: number;
  }>;
  kpis: Array<{
    id: string;
    title: string;
    description: string | null;
    department_id: string | null;
    department_name: string | null;
    current_value: number;
    target_value: number;
    weight: number;
    score: number;
    label: string;
    updated_at: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    department_id: string | null;
    department_name: string | null;
    assigned_to_user_id: string | null;
    due_date: string | null;
  }>;
  ai_report: {
    title: string;
    summary: string | null;
    created_at: string;
  } | null;
  role: string;
  visibility: "org" | "department" | "employee";
};

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function asNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function scoreLabel(score: number) {
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

function taskCompletionRate(tasks: TaskRow[]) {
  if (!tasks.length) return 0;
  const done = tasks.filter((task) => task.status === "done").length;
  return Math.round((done / tasks.length) * 100);
}

function belongsToScope<T extends { department_id: string | null; owner_user_id?: string | null; assigned_to_user_id?: string | null }>(
  row: T,
  mode: "org" | "department" | "employee",
  departmentId: string | null,
  userId: string
) {
  if (mode === "org") return true;
  if (mode === "department") return row.department_id === departmentId || row.department_id === null;
  return row.assigned_to_user_id === userId || row.owner_user_id === userId || row.department_id === departmentId || row.department_id === null;
}

async function getActiveCycle(admin: ReturnType<typeof supabaseAdmin>, orgId: string) {
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

export async function GET(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const admin = supabaseAdmin();
    const scope = await requireAccessScope(req, slug);
    const cycle = await getActiveCycle(admin, scope.org.id);

    if (!cycle) {
      const empty: DashboardResponse = {
        ok: true,
        org: scope.org,
        cycle: null,
        company: {
          score: 0,
          label: "No Active Cycle",
          summary: "Create an active quarterly cycle to start tracking objectives, OKRs, KPIs, and execution.",
          total_objectives: 0,
          active_okrs: 0,
          active_kpis: 0,
          open_tasks: 0,
          completed_tasks: 0,
          overdue_tasks: 0,
          task_completion_rate: 0,
        },
        departments: [],
        objectives: [],
        kpis: [],
        tasks: [],
        ai_report: null,
        role: scope.role,
        visibility: scope.mode,
      };
      return NextResponse.json(empty, { headers: { "Cache-Control": "no-store" } });
    }

    const [departmentsRes, objectivesRes, okrsRes, kpisRes, tasksRes, snapshotsRes, aiReportRes] = await Promise.all([
      admin
        .from("departments")
        .select("id,name")
        .eq("org_id", scope.org.id)
        .eq("is_active", true)
        .order("name", { ascending: true }),
      admin
        .from("objectives")
        .select("id,title,status,progress,department_id,owner_user_id,created_at")
        .eq("org_id", scope.org.id)
        .eq("cycle_id", cycle.id)
        .order("created_at", { ascending: false }),
      admin
        .from("okrs")
        .select("id,title,status,progress,objective_id,department_id,owner_user_id,created_at")
        .eq("org_id", scope.org.id)
        .eq("cycle_id", cycle.id)
        .order("created_at", { ascending: false }),
      admin
        .from("kpis")
        .select("id,title,description,department_id,owner_user_id,current_value,target_value,weight,direction,is_active,updated_at")
        .eq("org_id", scope.org.id)
        .eq("cycle_id", cycle.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false }),
      admin
        .from("tasks")
        .select("id,title,status,priority,department_id,assigned_to_user_id,due_date,created_at")
        .eq("org_id", scope.org.id)
        .eq("cycle_id", cycle.id)
        .order("created_at", { ascending: false }),
      admin
        .from("performance_snapshots")
        .select("id,score,label,summary,department_id,created_at")
        .eq("org_id", scope.org.id)
        .eq("cycle_id", cycle.id)
        .order("created_at", { ascending: false }),
      admin
        .from("ai_reports")
        .select("id,title,summary,created_at")
        .eq("org_id", scope.org.id)
        .eq("cycle_id", cycle.id)
        .eq("layer", "mach3")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<AiReportRow>(),
    ]);

    if (departmentsRes.error) throw new Error(departmentsRes.error.message);
    if (objectivesRes.error) throw new Error(objectivesRes.error.message);
    if (okrsRes.error) throw new Error(okrsRes.error.message);
    if (kpisRes.error) throw new Error(kpisRes.error.message);
    if (tasksRes.error) throw new Error(tasksRes.error.message);
    if (snapshotsRes.error) throw new Error(snapshotsRes.error.message);
    if (aiReportRes.error) throw new Error(aiReportRes.error.message);

    const departments = ((departmentsRes.data ?? []) as DepartmentRow[]);
    const departmentById = new Map(departments.map((department) => [department.id, department.name]));
    const objectivesRaw = ((objectivesRes.data ?? []) as ObjectiveRow[]).filter((row) =>
      belongsToScope(row, scope.mode, scope.departmentId, scope.userId)
    );
    const okrsRaw = ((okrsRes.data ?? []) as OkrRow[]).filter((row) =>
      belongsToScope(row, scope.mode, scope.departmentId, scope.userId)
    );
    const kpisRaw = ((kpisRes.data ?? []) as KpiRow[]).filter((row) =>
      belongsToScope(row, scope.mode, scope.departmentId, scope.userId)
    );
    const tasksRaw = ((tasksRes.data ?? []) as TaskRow[]).filter((row) =>
      belongsToScope(row, scope.mode, scope.departmentId, scope.userId)
    );
    const snapshotsRaw = ((snapshotsRes.data ?? []) as SnapshotRow[]).filter((row) =>
      scope.mode === "org"
        ? true
        : scope.mode === "department"
          ? row.department_id === scope.departmentId || row.department_id === null
          : row.department_id === scope.departmentId || row.department_id === null
    );

    const okrCountsByObjective = new Map<string, number>();
    for (const okr of okrsRaw) {
      okrCountsByObjective.set(okr.objective_id, (okrCountsByObjective.get(okr.objective_id) ?? 0) + 1);
    }

    const kpis = kpisRaw.map((kpi) => {
      const score = Math.round(computeKpiScore(kpi));
      return {
        id: kpi.id,
        title: kpi.title,
        description: kpi.description,
        department_id: kpi.department_id,
        department_name: kpi.department_id ? departmentById.get(kpi.department_id) ?? null : null,
        current_value: asNumber(kpi.current_value, 0),
        target_value: asNumber(kpi.target_value, 0),
        weight: asNumber(kpi.weight, 1),
        score,
        label: scoreLabel(score),
        updated_at: kpi.updated_at,
      };
    });

    const objectives = objectivesRaw.map((objective) => ({
      id: objective.id,
      title: objective.title,
      status: objective.status,
      progress: clamp(asNumber(objective.progress, 0)),
      department_id: objective.department_id,
      department_name: objective.department_id ? departmentById.get(objective.department_id) ?? null : null,
      okr_count: okrCountsByObjective.get(objective.id) ?? 0,
    }));

    const tasks = tasksRaw.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      department_id: task.department_id,
      department_name: task.department_id ? departmentById.get(task.department_id) ?? null : null,
      assigned_to_user_id: task.assigned_to_user_id,
      due_date: task.due_date,
    }));

    const overdueTasks = tasksRaw.filter((task) => {
      if (!task.due_date) return false;
      if (task.status === "done" || task.status === "cancelled") return false;
      const due = new Date(task.due_date);
      const now = new Date();
      due.setHours(23, 59, 59, 999);
      return due.getTime() < now.getTime();
    }).length;

    const companySnapshot = snapshotsRaw.find((snapshot) => snapshot.department_id === null) ?? null;
    const latestAiReport = aiReportRes.data ?? null;

    const companyScoreFromData = average([
      average(kpis.map((kpi) => kpi.score)),
      average(objectives.map((objective) => objective.progress)),
      average(okrsRaw.map((okr) => clamp(asNumber(okr.progress, 0)))),
      taskCompletionRate(tasksRaw),
    ]);

    const companyScore = Math.round(
      clamp(asNumber(companySnapshot?.score, companyScoreFromData))
    );

    const company = {
      score: companyScore,
      label: companySnapshot?.label ?? scoreLabel(companyScore),
      summary:
        companySnapshot?.summary ??
        latestAiReport?.summary ??
        `${scope.org.name} is currently ${scoreLabel(companyScore).toLowerCase()} based on KPI progress, OKR progress, and task execution in the active cycle.`,
      total_objectives: objectives.length,
      active_okrs: okrsRaw.filter((okr) => !["draft", "cancelled", "completed"].includes(okr.status)).length,
      active_kpis: kpis.length,
      open_tasks: tasksRaw.filter((task) => !["done", "cancelled"].includes(task.status)).length,
      completed_tasks: tasksRaw.filter((task) => task.status === "done").length,
      overdue_tasks: overdueTasks,
      task_completion_rate: taskCompletionRate(tasksRaw),
    };

    const departmentRows = departments
      .filter((department) => {
        if (scope.mode === "org") return true;
        return department.id === scope.departmentId;
      })
      .map((department) => {
        const deptObjectives = objectives.filter((objective) => objective.department_id === department.id);
        const deptOkrs = okrsRaw.filter((okr) => okr.department_id === department.id);
        const deptKpis = kpis.filter((kpi) => kpi.department_id === department.id);
        const deptTasks = tasksRaw.filter((task) => task.department_id === department.id);
        const deptSnapshot = snapshotsRaw.find((snapshot) => snapshot.department_id === department.id) ?? null;

        const deptScore = Math.round(
          clamp(
            asNumber(
              deptSnapshot?.score,
              average([
                average(deptKpis.map((kpi) => kpi.score)),
                average(deptObjectives.map((objective) => objective.progress)),
                average(deptOkrs.map((okr) => clamp(asNumber(okr.progress, 0)))),
                taskCompletionRate(deptTasks),
              ])
            )
          )
        );

        return {
          id: department.id,
          name: department.name,
          score: deptScore,
          label: deptSnapshot?.label ?? scoreLabel(deptScore),
          objectives: deptObjectives.length,
          okrs: deptOkrs.length,
          kpis: deptKpis.length,
          open_tasks: deptTasks.filter((task) => !["done", "cancelled"].includes(task.status)).length,
          completed_tasks: deptTasks.filter((task) => task.status === "done").length,
        };
      })
      .sort((a, b) => b.score - a.score);

    const response: DashboardResponse = {
      ok: true,
      org: scope.org,
      cycle,
      company,
      departments: departmentRows,
      objectives: objectives.sort((a, b) => b.progress - a.progress),
      kpis: kpis.sort((a, b) => a.score - b.score),
      tasks: tasks.sort((a, b) => {
        const aOverdue = a.due_date && !["done", "cancelled"].includes(a.status) && new Date(a.due_date).getTime() < Date.now();
        const bOverdue = b.due_date && !["done", "cancelled"].includes(b.status) && new Date(b.due_date).getTime() < Date.now();
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;
        return a.title.localeCompare(b.title);
      }),
      ai_report: latestAiReport
        ? {
            title: latestAiReport.title,
            summary: latestAiReport.summary,
            created_at: latestAiReport.created_at,
          }
        : null,
      role: scope.role,
      visibility: scope.mode,
    };

    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load dashboard";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
