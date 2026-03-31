import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

type ScopeLike = {
  org: {
    id: string;
    name: string;
    slug: string;
  };
  role: string;
  mode: "org" | "department" | "employee";
  departmentId: string | null;
  userId: string;
};

export type CycleRow = {
  id: string;
  year: number;
  quarter: number;
  status: string;
};

export type DepartmentRow = {
  id: string;
  name: string;
};

export type MemberRow = {
  user_id: string;
  role: string;
  department_id?: string | null;
  title?: string | null;
};

export type ObjectiveRow = {
  id: string;
  title: string;
  description?: string | null;
  department_id?: string | null;
  owner_user_id?: string | null;
  status: string;
  progress?: number | null;
};

export type OkrRow = {
  id: string;
  title: string;
  description?: string | null;
  objective_id?: string | null;
  department_id?: string | null;
  owner_user_id?: string | null;
  status: string;
  progress?: number | null;
};

export type KeyResultRow = {
  id: string;
  okr_id?: string | null;
  objective_id?: string | null;
  department_id?: string | null;
  title: string;
  metric_name?: string | null;
  metric_type?: string | null;
  unit?: string | null;
  start_value?: number | null;
  current_value?: number | null;
  target_value?: number | null;
  status?: string | null;
  progress?: number | null;
  owner_user_id?: string | null;
  kpi_id?: string | null;
  position?: number | null;
};

export type KpiRow = {
  id: string;
  title: string;
  description?: string | null;
  department_id?: string | null;
  owner_user_id?: string | null;
  current_value?: number | null;
  target_value?: number | null;
  weight?: number | null;
  direction?: string | null;
  unit?: string | null;
  is_active?: boolean | null;
  updated_at?: string | null;
  measurement_type?: string | null;
  frequency?: string | null;
  baseline_value?: number | null;
  formula?: string | null;
};

export type JtbdClusterRow = {
  id: string;
  title: string;
  description?: string | null;
  department_id?: string | null;
  objective_id?: string | null;
  okr_id?: string | null;
  key_result_id?: string | null;
  status?: string | null;
  owner_user_id?: string | null;
  due_date?: string | null;
};

export type TaskRow = {
  id: string;
  title: string;
  description?: string | null;
  department_id?: string | null;
  objective_id?: string | null;
  okr_id?: string | null;
  key_result_id?: string | null;
  kpi_id?: string | null;
  jtbd_cluster_id?: string | null;
  assigned_to_user_id?: string | null;
  status: string;
  priority: string;
  due_date?: string | null;
};

export type AiReportRow = {
  id: string;
  title: string;
  summary?: string | null;
  created_at: string;
};

export type SnapshotRow = {
  id: string;
  score?: number | null;
  label?: string | null;
  summary?: string | null;
  objective_id?: string | null;
  okr_id?: string | null;
  department_id?: string | null;
};

export type JsonObject = Record<string, unknown>;

export type AiWorkspaceContext = {
  scope: ScopeLike;
  cycle: CycleRow | null;
  orgData: JsonObject;
  departments: DepartmentRow[];
  members: Array<{
    userId: string;
    role: string;
    departmentId: string | null;
    title: string | null;
  }>;
  objectives: ObjectiveRow[];
  okrs: OkrRow[];
  keyResults: KeyResultRow[];
  kpis: KpiRow[];
  jtbdClusters: JtbdClusterRow[];
  tasks: TaskRow[];
  latestAiReport: AiReportRow | null;
  latestSnapshot: SnapshotRow | null;
  deptMap: Map<string, string>;
  memberLabelMap: Map<string, string>;
  objectiveMap: Map<string, string>;
  okrMap: Map<string, string>;
  krMap: Map<string, string>;
  kpiMap: Map<string, string>;
  clusterMap: Map<string, string>;
};

export function env(name: string) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function safeBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function pickString(row: JsonObject, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function pickNumber(row: JsonObject, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

export function truncate(text: string, max = 220) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function inferCompanySize(employeeCount: number) {
  if (employeeCount <= 0) return "unknown";
  if (employeeCount <= 10) return "1-10 employees";
  if (employeeCount <= 50) return "11-50 employees";
  if (employeeCount <= 200) return "51-200 employees";
  if (employeeCount <= 500) return "201-500 employees";
  return "500+ employees";
}

export function pct(value?: number | null) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function normalizeOkrStatus(value?: string | null) {
  const allowed = new Set([
    "draft",
    "pending_approval",
    "active",
    "on_track",
    "at_risk",
    "off_track",
    "completed",
    "cancelled",
  ]);
  const candidate = String(value ?? "draft").trim().toLowerCase();
  return allowed.has(candidate) ? candidate : "draft";
}

export function normalizeKrStatus(value?: string | null) {
  const allowed = new Set([
    "not_started",
    "in_progress",
    "on_track",
    "at_risk",
    "off_track",
    "completed",
    "cancelled",
  ]);
  const candidate = String(value ?? "not_started").trim().toLowerCase();
  return allowed.has(candidate) ? candidate : "not_started";
}

export function normalizeTaskStatus(value?: string | null) {
  const allowed = new Set(["todo", "in_progress", "blocked", "done", "cancelled"]);
  const candidate = String(value ?? "todo").trim().toLowerCase();
  return allowed.has(candidate) ? candidate : "todo";
}

export function normalizeTaskPriority(value?: string | null) {
  const allowed = new Set(["low", "medium", "high", "critical"]);
  const candidate = String(value ?? "medium").trim().toLowerCase();
  return allowed.has(candidate) ? candidate : "medium";
}

export function normalizeClusterStatus(value?: string | null) {
  const allowed = new Set(["draft", "active", "blocked", "completed", "cancelled"]);
  const candidate = String(value ?? "draft").trim().toLowerCase();
  return allowed.has(candidate) ? candidate : "draft";
}

export function clampMessages(messages: ChatMessage[]) {
  return messages
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0
    )
    .slice(-16);
}

export function buildBlock(title: string, lines: string[]) {
  if (!lines.length) return `${title}: none`;
  return `${title}:\n- ${lines.join("\n- ")}`;
}

export function belongsToScope<
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

async function getMembers(admin: ReturnType<typeof supabaseAdmin>, orgId: string) {
  const { data, error } = await admin
    .from("organization_members")
    .select("user_id,role,department_id,title")
    .eq("org_id", orgId)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as MemberRow[];

  return rows
    .map((row) => ({
      userId: row.user_id,
      role: row.role,
      departmentId: row.department_id ?? null,
      title: row.title ?? null,
    }))
    .sort((a, b) => String(a.userId).localeCompare(String(b.userId)));
}

export async function loadAiWorkspaceContext(
  req: Request,
  slug: string
): Promise<AiWorkspaceContext> {
  const scope = (await requireAccessScope(req, slug)) as ScopeLike;
  const admin = supabaseAdmin();
  const cycle = await getActiveCycle(admin, scope.org.id);

  const { data: orgRow, error: orgErr } = await admin
    .from("organizations")
    .select("*")
    .eq("id", scope.org.id)
    .maybeSingle<JsonObject>();

  if (orgErr) throw new Error(orgErr.message);

  const [
    departmentsRes,
    members,
    objectivesRes,
    okrsRes,
    keyResultsRes,
    kpisRes,
    jtbdClustersRes,
    tasksRes,
    aiReportRes,
    snapshotRes,
  ] = await Promise.all([
    admin
      .from("departments")
      .select("id,name")
      .eq("org_id", scope.org.id)
      .eq("is_active", true)
      .order("name", { ascending: true }),

    getMembers(admin, scope.org.id),

    cycle
      ? admin
          .from("objectives")
          .select("id,title,description,department_id,owner_user_id,status,progress")
          .eq("org_id", scope.org.id)
          .eq("cycle_id", cycle.id)
          .order("created_at", { ascending: false })
      : admin.from("objectives").select("id").eq("org_id", "__no_active_cycle__"),

    cycle
      ? admin
          .from("okrs")
          .select("id,title,description,objective_id,department_id,owner_user_id,status,progress")
          .eq("org_id", scope.org.id)
          .eq("cycle_id", cycle.id)
          .order("created_at", { ascending: false })
      : admin.from("okrs").select("id").eq("org_id", "__no_active_cycle__"),

    cycle
      ? admin
          .from("key_results")
          .select("id,okr_id,objective_id,department_id,title,metric_name,metric_type,unit,start_value,current_value,target_value,status,progress,owner_user_id,kpi_id,position")
          .eq("org_id", scope.org.id)
          .eq("cycle_id", cycle.id)
          .order("position", { ascending: true })
      : admin.from("key_results").select("id").eq("org_id", "__no_active_cycle__"),

    cycle
      ? admin
          .from("kpis")
          .select("id,title,description,department_id,owner_user_id,current_value,target_value,weight,direction,unit,is_active,updated_at,measurement_type,frequency,baseline_value,formula")
          .eq("org_id", scope.org.id)
          .eq("cycle_id", cycle.id)
          .order("updated_at", { ascending: false })
      : admin.from("kpis").select("id").eq("org_id", "__no_active_cycle__"),

    cycle
      ? admin
          .from("jtbd_clusters")
          .select("id,title,description,department_id,objective_id,okr_id,key_result_id,status,owner_user_id,due_date")
          .eq("org_id", scope.org.id)
          .eq("cycle_id", cycle.id)
          .order("created_at", { ascending: false })
      : admin.from("jtbd_clusters").select("id").eq("org_id", "__no_active_cycle__"),

    cycle
      ? admin
          .from("tasks")
          .select("id,title,description,department_id,objective_id,okr_id,key_result_id,kpi_id,jtbd_cluster_id,assigned_to_user_id,status,priority,due_date")
          .eq("org_id", scope.org.id)
          .eq("cycle_id", cycle.id)
          .order("created_at", { ascending: false })
      : admin.from("tasks").select("id").eq("org_id", "__no_active_cycle__"),

    admin
      .from("ai_reports")
      .select("id,title,summary,created_at")
      .eq("org_id", scope.org.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<AiReportRow>(),

    cycle
      ? admin
          .from("performance_snapshots")
          .select("id,score,label,summary,objective_id,okr_id,department_id")
          .eq("org_id", scope.org.id)
          .eq("cycle_id", cycle.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<SnapshotRow>()
      : admin
          .from("performance_snapshots")
          .select("id,score,label,summary,objective_id,okr_id,department_id")
          .eq("org_id", "__no_active_cycle__")
          .maybeSingle<SnapshotRow>(),
  ]);

  if (departmentsRes.error) throw new Error(departmentsRes.error.message);
  if (objectivesRes.error) throw new Error(objectivesRes.error.message);
  if (okrsRes.error) throw new Error(okrsRes.error.message);
  if (keyResultsRes.error) throw new Error(keyResultsRes.error.message);
  if (kpisRes.error) throw new Error(kpisRes.error.message);
  if (jtbdClustersRes.error) throw new Error(jtbdClustersRes.error.message);
  if (tasksRes.error) throw new Error(tasksRes.error.message);
  if (aiReportRes.error) throw new Error(aiReportRes.error.message);
  if (snapshotRes.error) throw new Error(snapshotRes.error.message);

  const departments = (departmentsRes.data ?? []) as DepartmentRow[];
  const objectives = ((objectivesRes.data ?? []) as ObjectiveRow[]).filter((row) =>
    belongsToScope(row, scope.mode, scope.departmentId, scope.userId)
  );
  const okrs = ((okrsRes.data ?? []) as OkrRow[]).filter((row) =>
    belongsToScope(row, scope.mode, scope.departmentId, scope.userId)
  );
  const keyResults = ((keyResultsRes.data ?? []) as KeyResultRow[]).filter((row) =>
    belongsToScope(row, scope.mode, scope.departmentId, scope.userId)
  );
  const kpis = ((kpisRes.data ?? []) as KpiRow[]).filter((row) =>
    belongsToScope(row, scope.mode, scope.departmentId, scope.userId)
  );
  const jtbdClusters = ((jtbdClustersRes.data ?? []) as JtbdClusterRow[]).filter((row) =>
    belongsToScope(row, scope.mode, scope.departmentId, scope.userId)
  );
  const tasks = ((tasksRes.data ?? []) as TaskRow[]).filter((row) =>
    belongsToScope(row, scope.mode, scope.departmentId, scope.userId)
  );

  const deptMap = new Map(departments.map((row) => [row.id, row.name]));
  const memberLabelMap = new Map(
    members.map((row) => [
      row.userId,
      `${row.userId}${row.departmentId ? ` · ${deptMap.get(row.departmentId) ?? row.departmentId}` : ""} · ${row.role}${row.title ? ` · ${row.title}` : ""}`,
    ])
  );
  const objectiveMap = new Map(objectives.map((row) => [row.id, row.title]));
  const okrMap = new Map(okrs.map((row) => [row.id, row.title]));
  const krMap = new Map(keyResults.map((row) => [row.id, row.title]));
  const kpiMap = new Map(kpis.map((row) => [row.id, row.title]));
  const clusterMap = new Map(jtbdClusters.map((row) => [row.id, row.title]));

  return {
    scope,
    cycle,
    orgData: (orgRow ?? {}) as JsonObject,
    departments,
    members,
    objectives,
    okrs,
    keyResults,
    kpis,
    jtbdClusters,
    tasks,
    latestAiReport: aiReportRes.data ?? null,
    latestSnapshot: snapshotRes.data ?? null,
    deptMap,
    memberLabelMap,
    objectiveMap,
    okrMap,
    krMap,
    kpiMap,
    clusterMap,
  };
}

export function buildWorkspaceContextText(context: AiWorkspaceContext) {
  const {
    scope,
    cycle,
    orgData,
    departments,
    members,
    objectives,
    okrs,
    keyResults,
    kpis,
    jtbdClusters,
    tasks,
    latestAiReport,
    latestSnapshot,
  } = context;

  const employeeCount =
    pickNumber(orgData, ["employee_count", "employees_count", "number_of_employees", "headcount"]) ??
    members.length;

  const industry =
    pickString(orgData, ["industry", "sector", "business_industry"]) || "unknown";

  const companySize =
    pickString(orgData, ["company_size", "size", "company_stage"]) ||
    inferCompanySize(employeeCount);

  const objectiveLines = objectives.slice(0, 24).map((row) => {
    const departmentName = row.department_id
      ? context.deptMap.get(row.department_id) ?? row.department_id
      : "company-wide";
    const owner = row.owner_user_id
      ? context.memberLabelMap.get(row.owner_user_id) ?? row.owner_user_id
      : "unassigned";

    return `${truncate(row.title, 120)} | status: ${row.status} | progress: ${pct(row.progress)}% | department: ${departmentName} | owner: ${owner}`;
  });

  const okrLines = okrs.slice(0, 24).map((row) => {
    const departmentName = row.department_id
      ? context.deptMap.get(row.department_id) ?? row.department_id
      : "company-wide";
    const objectiveTitle = row.objective_id
      ? context.objectiveMap.get(row.objective_id) ?? row.objective_id
      : "none";
    const owner = row.owner_user_id
      ? context.memberLabelMap.get(row.owner_user_id) ?? row.owner_user_id
      : "unassigned";

    return `${truncate(row.title, 120)} | status: ${row.status} | progress: ${pct(row.progress)}% | objective: ${truncate(objectiveTitle, 90)} | department: ${departmentName} | owner: ${owner}`;
  });

  const keyResultLines = keyResults.slice(0, 28).map((row) => {
    const okrTitle = row.okr_id ? context.okrMap.get(row.okr_id) ?? row.okr_id : "none";
    const kpiTitle = row.kpi_id ? context.kpiMap.get(row.kpi_id) ?? row.kpi_id : "none";

    return `${truncate(row.title, 120)} | status: ${row.status ?? "unknown"} | progress: ${pct(row.progress)}% | metric: ${row.metric_name ?? "n/a"} | current: ${row.current_value ?? 0}${row.unit ? ` ${row.unit}` : ""} | target: ${row.target_value ?? 0}${row.unit ? ` ${row.unit}` : ""} | OKR: ${truncate(okrTitle, 90)} | KPI: ${truncate(kpiTitle, 90)}`;
  });

  const kpiLines = kpis.slice(0, 28).map((row) => {
    const departmentName = row.department_id
      ? context.deptMap.get(row.department_id) ?? row.department_id
      : "company-wide";
    const owner = row.owner_user_id
      ? context.memberLabelMap.get(row.owner_user_id) ?? row.owner_user_id
      : "unassigned";
    const activeLabel = safeBool(row.is_active) === false ? "inactive" : "active";

    return `${truncate(row.title, 120)} | current: ${row.current_value ?? 0}${row.unit ? ` ${row.unit}` : ""} | target: ${row.target_value ?? 0}${row.unit ? ` ${row.unit}` : ""} | direction: ${row.direction ?? "increase"} | weight: ${row.weight ?? 1} | department: ${departmentName} | owner: ${owner} | ${activeLabel}`;
  });

  const jtbdLines = jtbdClusters.slice(0, 20).map((row) => {
    const departmentName = row.department_id
      ? context.deptMap.get(row.department_id) ?? row.department_id
      : "company-wide";
    const objectiveTitle = row.objective_id
      ? context.objectiveMap.get(row.objective_id) ?? row.objective_id
      : "none";
    const okrTitle = row.okr_id
      ? context.okrMap.get(row.okr_id) ?? row.okr_id
      : "none";
    const krTitle = row.key_result_id
      ? context.krMap.get(row.key_result_id) ?? row.key_result_id
      : "none";

    return `${truncate(row.title, 120)} | status: ${row.status ?? "unknown"} | due: ${row.due_date ?? "none"} | department: ${departmentName} | objective: ${truncate(objectiveTitle, 90)} | OKR: ${truncate(okrTitle, 90)} | KR: ${truncate(krTitle, 90)}`;
  });

  const taskLines = tasks.slice(0, 32).map((row) => {
    const departmentName = row.department_id
      ? context.deptMap.get(row.department_id) ?? row.department_id
      : "company-wide";
    const owner = row.assigned_to_user_id
      ? context.memberLabelMap.get(row.assigned_to_user_id) ?? row.assigned_to_user_id
      : "unassigned";
    const objectiveTitle = row.objective_id
      ? context.objectiveMap.get(row.objective_id) ?? row.objective_id
      : "none";
    const okrTitle = row.okr_id ? context.okrMap.get(row.okr_id) ?? row.okr_id : "none";
    const krTitle = row.key_result_id ? context.krMap.get(row.key_result_id) ?? row.key_result_id : "none";
    const kpiTitle = row.kpi_id ? context.kpiMap.get(row.kpi_id) ?? row.kpi_id : "none";
    const clusterTitle = row.jtbd_cluster_id
      ? context.clusterMap.get(row.jtbd_cluster_id) ?? row.jtbd_cluster_id
      : "none";

    return `${truncate(row.title, 120)} | status: ${row.status} | priority: ${row.priority} | owner: ${owner} | due: ${row.due_date ?? "none"} | cluster: ${truncate(clusterTitle, 70)} | department: ${departmentName} | objective: ${truncate(objectiveTitle, 70)} | OKR: ${truncate(okrTitle, 70)} | KR: ${truncate(krTitle, 70)} | KPI: ${truncate(kpiTitle, 70)}`;
  });

  const memberLines = members.slice(0, 40).map((row) => {
    const dept = row.departmentId ? context.deptMap.get(row.departmentId) ?? row.departmentId : "no department";
    return `${row.userId} | role: ${row.role} | department: ${dept}${row.title ? ` | title: ${row.title}` : ""}`;
  });

  return `
Organization: ${scope.org.name}
Org slug: ${scope.org.slug}
Industry: ${industry}
Company size: ${companySize}
Employee count: ${employeeCount}
Current user role: ${scope.role}
Visibility scope: ${scope.mode}
Department scope: ${scope.departmentId ? context.deptMap.get(scope.departmentId) ?? scope.departmentId : "all"}
Active cycle: ${cycle ? `Q${cycle.quarter} ${cycle.year} (${cycle.status})` : "none"}

${buildBlock("Departments", departments.map((row) => row.name))}
${buildBlock("Members", memberLines)}
${buildBlock("Objectives", objectiveLines)}
${buildBlock("OKRs", okrLines)}
${buildBlock("Key Results", keyResultLines)}
${buildBlock("KPIs", kpiLines)}
${buildBlock("JTBD Clusters", jtbdLines)}
${buildBlock("Tasks", taskLines)}
${
  latestAiReport
    ? `Latest AI report:\n- ${truncate(latestAiReport.title, 150)} | ${truncate(latestAiReport.summary ?? "No summary", 300)}`
    : "Latest AI report: none"
}
${
  latestSnapshot
    ? `Latest performance snapshot:\n- score: ${latestSnapshot.score ?? 0} | label: ${latestSnapshot.label ?? "n/a"} | summary: ${truncate(latestSnapshot.summary ?? "No summary", 240)}`
    : "Latest performance snapshot: none"
}
  `.trim();
}

export function buildReferenceDataText(context: AiWorkspaceContext) {
  return [
    buildBlock(
      "Available objectives",
      context.objectives.map((row) => {
        const department = row.department_id
          ? context.deptMap.get(row.department_id) ?? row.department_id
          : "company-wide";
        return `${row.id} | ${truncate(row.title, 120)} | department: ${department} | status: ${row.status}`;
      })
    ),
    buildBlock(
      "Available OKRs",
      context.okrs.map((row) => {
        const department = row.department_id
          ? context.deptMap.get(row.department_id) ?? row.department_id
          : "company-wide";
        return `${row.id} | ${truncate(row.title, 120)} | department: ${department} | status: ${row.status}`;
      })
    ),
    buildBlock(
      "Available key results",
      context.keyResults.map((row) => {
        return `${row.id} | ${truncate(row.title, 120)} | okr_id: ${row.okr_id ?? "none"} | kpi_id: ${row.kpi_id ?? "none"}`;
      })
    ),
    buildBlock(
      "Available KPIs",
      context.kpis.map((row) => {
        const department = row.department_id
          ? context.deptMap.get(row.department_id) ?? row.department_id
          : "company-wide";
        return `${row.id} | ${truncate(row.title, 120)} | department: ${department} | current: ${row.current_value ?? 0} | target: ${row.target_value ?? 0}`;
      })
    ),
    buildBlock(
      "Available members",
      context.members.map((row) => {
        const department = row.departmentId
          ? context.deptMap.get(row.departmentId) ?? row.departmentId
          : "no department";
        return `${row.userId} | role: ${row.role} | department: ${department}${row.title ? ` | title: ${row.title}` : ""}`;
      })
    ),
    buildBlock(
      "Available departments",
      context.departments.map((row) => `${row.id} | ${row.name}`)
    ),
    buildBlock(
      "Existing JTBD clusters",
      context.jtbdClusters.map((row) => `${row.id} | ${truncate(row.title, 120)} | status: ${row.status ?? "unknown"}`)
    ),
  ].join("\n\n");
}

export function canManageKpis(role: string) {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "manager" ||
    role === "dept_head" ||
    role === "finance"
  );
}

export function canManageWork(role: string) {
  return role === "owner" || role === "admin" || role === "manager" || role === "dept_head";
}

export function buildOpenAiInput(messages: ChatMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}