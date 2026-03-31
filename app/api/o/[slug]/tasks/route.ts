import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };
type CycleRow = { id: string; year: number; quarter: number; status: string };
type DepartmentRow = { id: string; name: string };
type MemberRow = { user_id: string; role: string; department_id?: string | null };
type SimpleRow = { id: string; title: string; department_id?: string | null };
type ClusterRow = { id: string; title: string; department_id?: string | null; objective_id?: string | null; okr_id?: string | null; key_result_id?: string | null; status: string };
type TaskRow = {
  id: string; org_id: string; cycle_id?: string | null; department_id?: string | null; jtbd_cluster_id?: string | null; objective_id?: string | null; okr_id?: string | null; key_result_id?: string | null; kpi_id?: string | null; parent_task_id?: string | null; title: string; description?: string | null; details?: Record<string, unknown> | null; status: string; priority: string; assigned_to_user_id?: string | null; assigned_by_user_id?: string | null; created_by?: string | null; visible_to_department: boolean; ai_generated: boolean; due_date?: string | null; started_at?: string | null; completed_at?: string | null; position: number; created_at: string; updated_at: string;
};
type CreateBody = {
  jtbd_cluster_id?: string | null;
  cluster_title?: string;
  cluster_description?: string;
  department_id?: string | null;
  objective_id?: string | null;
  okr_id?: string | null;
  key_result_id?: string | null;
  kpi_id?: string | null;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assigned_to_user_id?: string | null;
  visible_to_department?: boolean;
  due_date?: string | null;
};
const TASK_STATUSES = new Set(["todo", "in_progress", "blocked", "done", "cancelled"]);
const TASK_PRIORITIES = new Set(["low", "medium", "high", "critical"]);
const CLUSTER_STATUSES = new Set(["draft", "active", "blocked", "completed", "cancelled"]);
const normalizeTaskStatus = (v?: string | null) => { const c = String(v ?? "todo").trim().toLowerCase(); return TASK_STATUSES.has(c) ? c : "todo"; };
const normalizeTaskPriority = (v?: string | null) => { const c = String(v ?? "medium").trim().toLowerCase(); return TASK_PRIORITIES.has(c) ? c : "medium"; };
const normalizeClusterStatus = (v?: string | null) => { const c = String(v ?? "draft").trim().toLowerCase(); return CLUSTER_STATUSES.has(c) ? c : "draft"; };
async function getActiveCycle(admin: ReturnType<typeof supabaseAdmin>, orgId: string) { const { data, error } = await admin.from("quarterly_cycles").select("id,year,quarter,status").eq("org_id", orgId).eq("status", "active").order("year", { ascending: false }).order("quarter", { ascending: false }).maybeSingle<CycleRow>(); if (error) throw new Error(error.message); return data ?? null; }
async function getDepartments(admin: ReturnType<typeof supabaseAdmin>, orgId: string) { const { data, error } = await admin.from("departments").select("id,name").eq("org_id", orgId).eq("is_active", true).order("name", { ascending: true }); if (error) throw new Error(error.message); return (data ?? []) as DepartmentRow[]; }
async function getMembers(admin: ReturnType<typeof supabaseAdmin>, orgId: string) { const { data, error } = await admin.from("organization_members").select("user_id,role,department_id").eq("org_id", orgId).eq("is_active", true); if (error) throw new Error(error.message); const rows = (data ?? []) as MemberRow[]; const hydrated = await Promise.all(rows.map(async (row) => { const authUser = await admin.auth.admin.getUserById(row.user_id); return { userId: row.user_id, role: row.role, departmentId: row.department_id ?? null, email: authUser.data.user?.email ?? null }; })); return hydrated.sort((a, b) => String(a.email ?? a.userId).localeCompare(String(b.email ?? b.userId))); }
async function getSimple(admin: ReturnType<typeof supabaseAdmin>, table: "objectives" | "okrs" | "key_results" | "kpis", orgId: string, cycleId: string, departmentId?: string | null) {
  let query = admin.from(table).select("id,title,department_id").eq("org_id", orgId);
  if (table !== "kpis") query = query.eq("cycle_id", cycleId);
  if (table === "kpis") query = query.eq("cycle_id", cycleId).eq("is_active", true);
  if (departmentId) query = query.eq("department_id", departmentId);
  const { data, error } = await query.order("title", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SimpleRow[];
}
async function getClusters(admin: ReturnType<typeof supabaseAdmin>, params: { orgId:string; cycleId:string; mode:"org"|"department"|"employee"; departmentId:string|null; userId:string; mine:boolean; }) {
  let query = admin.from("jtbd_clusters").select("id,title,department_id,objective_id,okr_id,key_result_id,status").eq("org_id", params.orgId).eq("cycle_id", params.cycleId).order("created_at", { ascending: false });
  if (params.mode === "department") { if (!params.departmentId) return [] as ClusterRow[]; query = query.eq("department_id", params.departmentId); }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ClusterRow[];
  if (params.mine) return rows;
  return rows;
}
async function getTasks(admin: ReturnType<typeof supabaseAdmin>, params: { orgId:string; cycleId:string; mode:"org"|"department"|"employee"; departmentId:string|null; userId:string; mine:boolean; }) {
  let query = admin.from("tasks").select("id,org_id,cycle_id,department_id,jtbd_cluster_id,objective_id,okr_id,key_result_id,kpi_id,parent_task_id,title,description,details,status,priority,assigned_to_user_id,assigned_by_user_id,created_by,visible_to_department,ai_generated,due_date,started_at,completed_at,position,created_at,updated_at").eq("org_id", params.orgId).eq("cycle_id", params.cycleId).order("created_at", { ascending: false });
  if (params.mode === "department") { if (!params.departmentId) return [] as TaskRow[]; query = query.eq("department_id", params.departmentId); }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  let rows = (data ?? []) as TaskRow[];
  if (params.mode === "employee" || params.mine) rows = rows.filter((row) => row.assigned_to_user_id === params.userId);
  return rows;
}
async function createCluster(admin: ReturnType<typeof supabaseAdmin>, scope: Awaited<ReturnType<typeof requireAccessScope>>, cycleId: string, body: CreateBody) {
  const title = String(body.cluster_title ?? body.title ?? "Execution plan").trim() || "Execution plan";
  const payload = {
    org_id: scope.org.id,
    cycle_id: cycleId,
    department_id: body.department_id ? String(body.department_id).trim() : (scope.mode === "department" || scope.mode === "employee" ? scope.departmentId : null),
    objective_id: body.objective_id ? String(body.objective_id).trim() : null,
    okr_id: body.okr_id ? String(body.okr_id).trim() : null,
    key_result_id: body.key_result_id ? String(body.key_result_id).trim() : null,
    title,
    description: String(body.cluster_description ?? "").trim() || null,
    status: normalizeClusterStatus("active"),
    owner_user_id: body.assigned_to_user_id ? String(body.assigned_to_user_id).trim() : null,
    created_by: scope.userId,
    assigned_by_user_id: scope.userId,
  };
  const { data, error } = await admin.from("jtbd_clusters").insert(payload).select("id").single<{ id: string }>();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function GET(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();
    const cycle = await getActiveCycle(admin, scope.org.id);
    const mine = req.nextUrl.searchParams.get("mine") === "1";
    if (!cycle) return NextResponse.json({ ok: true, cycle: null, departments: [], members: [], objectives: [], okrs: [], keyResults: [], kpis: [], clusters: [], tasks: [], visibility: scope.mode, role: scope.role, canManage: scope.role !== "employee" });
    const scopedDepartmentId = scope.mode === "org" ? null : scope.departmentId;
    const [departments, members, objectives, okrs, keyResults, kpis, clusters, tasks] = await Promise.all([
      getDepartments(admin, scope.org.id),
      getMembers(admin, scope.org.id),
      getSimple(admin, "objectives", scope.org.id, cycle.id, scopedDepartmentId),
      getSimple(admin, "okrs", scope.org.id, cycle.id, scopedDepartmentId),
      getSimple(admin, "key_results", scope.org.id, cycle.id, scopedDepartmentId),
      getSimple(admin, "kpis", scope.org.id, cycle.id, scopedDepartmentId),
      getClusters(admin, { orgId: scope.org.id, cycleId: cycle.id, mode: scope.mode, departmentId: scope.departmentId, userId: scope.userId, mine }),
      getTasks(admin, { orgId: scope.org.id, cycleId: cycle.id, mode: scope.mode, departmentId: scope.departmentId, userId: scope.userId, mine }),
    ]);
    const deptMap = new Map(departments.map((d) => [d.id, d.name]));
    const titleMaps = {
      objective: new Map(objectives.map((r) => [r.id, r.title])),
      okr: new Map(okrs.map((r) => [r.id, r.title])),
      kr: new Map(keyResults.map((r) => [r.id, r.title])),
      kpi: new Map(kpis.map((r) => [r.id, r.title])),
      cluster: new Map(clusters.map((r) => [r.id, r.title])),
    };
    return NextResponse.json({
      ok: true,
      cycle,
      departments,
      members,
      objectives,
      okrs,
      keyResults,
      kpis,
      clusters: clusters.map((row) => ({ ...row, department_name: row.department_id ? deptMap.get(row.department_id) ?? null : null, objective_title: row.objective_id ? titleMaps.objective.get(row.objective_id) ?? null : null, okr_title: row.okr_id ? titleMaps.okr.get(row.okr_id) ?? null : null, key_result_title: row.key_result_id ? titleMaps.kr.get(row.key_result_id) ?? null : null })),
      tasks: tasks.map((row) => ({ ...row, department_name: row.department_id ? deptMap.get(row.department_id) ?? null : null, cluster_title: row.jtbd_cluster_id ? titleMaps.cluster.get(row.jtbd_cluster_id) ?? null : null, objective_title: row.objective_id ? titleMaps.objective.get(row.objective_id) ?? null : null, okr_title: row.okr_id ? titleMaps.okr.get(row.okr_id) ?? null : null, key_result_title: row.key_result_id ? titleMaps.kr.get(row.key_result_id) ?? null : null, kpi_title: row.kpi_id ? titleMaps.kpi.get(row.kpi_id) ?? null : null, is_assigned_to_me: row.assigned_to_user_id === scope.userId })),
      visibility: scope.mode,
      role: scope.role,
      canManage: scope.role !== "employee",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load tasks";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    if (scope.role === "employee") return NextResponse.json({ ok: false, error: "You do not have permission to create tasks" }, { status: 403 });
    const admin = supabaseAdmin();
    const cycle = await getActiveCycle(admin, scope.org.id);
    if (!cycle) return NextResponse.json({ ok: false, error: "No active cycle found" }, { status: 400 });
    const body = (await req.json()) as CreateBody;
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ ok: false, error: "Task title is required" }, { status: 400 });
    const clusterId = body.jtbd_cluster_id ? String(body.jtbd_cluster_id).trim() : await createCluster(admin, scope, cycle.id, body);
    const departmentId = body.department_id ? String(body.department_id).trim() : (scope.mode === "department" || scope.mode === "employee" ? scope.departmentId : null);
    const payload = {
      org_id: scope.org.id,
      cycle_id: cycle.id,
      department_id: departmentId,
      jtbd_cluster_id: clusterId,
      objective_id: body.objective_id ? String(body.objective_id).trim() : null,
      okr_id: body.okr_id ? String(body.okr_id).trim() : null,
      key_result_id: body.key_result_id ? String(body.key_result_id).trim() : null,
      kpi_id: body.kpi_id ? String(body.kpi_id).trim() : null,
      title,
      description: String(body.description ?? "").trim() || null,
      status: normalizeTaskStatus(body.status),
      priority: normalizeTaskPriority(body.priority),
      assigned_to_user_id: body.assigned_to_user_id ? String(body.assigned_to_user_id).trim() : null,
      assigned_by_user_id: scope.userId,
      created_by: scope.userId,
      visible_to_department: body.visible_to_department ?? true,
      due_date: body.due_date ? String(body.due_date).trim() : null,
    };
    const { data, error } = await admin.from("tasks").insert(payload).select("id").single<{ id: string }>();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create task";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
