import { NextRequest, NextResponse } from "next/server";
import { canManageWorkRole, requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };

type CycleRow = { id: string; year: number; quarter: number; status: string };
type DepartmentRow = { id: string; name: string };
type MemberRow = { user_id: string; role: string; department_id?: string | null };
type ObjectiveRow = { id: string; title: string; department_id?: string | null };
type KpiRow = { id: string; title: string; department_id?: string | null };
type OkrRow = {
  id: string;
  org_id: string;
  cycle_id: string;
  department_id?: string | null;
  objective_id: string;
  title: string;
  description?: string | null;
  owner_user_id?: string | null;
  status: string;
  progress: number;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
};
type KrRow = {
  id: string;
  okr_id: string;
  objective_id: string;
  department_id?: string | null;
  title: string;
  metric_name?: string | null;
  metric_type: string;
  unit?: string | null;
  start_value: number;
  current_value: number;
  target_value: number;
  status: string;
  progress: number;
  owner_user_id?: string | null;
  kpi_id?: string | null;
  position: number;
};

type KeyResultInput = {
  id?: string;
  title: string;
  metric_name?: string;
  metric_type?: string;
  unit?: string;
  start_value?: number;
  current_value?: number;
  target_value?: number;
  status?: string;
  progress?: number;
  owner_user_id?: string | null;
  kpi_id?: string | null;
};

type CreateBody = {
  objective_id: string;
  title: string;
  description?: string;
  department_id?: string | null;
  owner_user_id?: string | null;
  status?: string;
  progress?: number;
  key_results?: KeyResultInput[];
};

const OKR_STATUSES = new Set(["draft", "pending_approval", "active", "on_track", "at_risk", "off_track", "completed", "cancelled"]);
const KR_STATUSES = new Set(["not_started", "in_progress", "on_track", "at_risk", "off_track", "completed", "cancelled"]);

function normalizeOkrStatus(value?: string | null) {
  const candidate = String(value ?? "draft").trim().toLowerCase();
  return OKR_STATUSES.has(candidate) ? candidate : "draft";
}
function normalizeKrStatus(value?: string | null) {
  const candidate = String(value ?? "not_started").trim().toLowerCase();
  return KR_STATUSES.has(candidate) ? candidate : "not_started";
}
function pct(value?: number | null) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
async function getActiveCycle(admin: ReturnType<typeof supabaseAdmin>, orgId: string) {
  const { data, error } = await admin.from("quarterly_cycles").select("id,year,quarter,status").eq("org_id", orgId).eq("status", "active").order("year", { ascending: false }).order("quarter", { ascending: false }).maybeSingle<CycleRow>();
  if (error) throw new Error(error.message);
  return data ?? null;
}
async function getDepartments(admin: ReturnType<typeof supabaseAdmin>, orgId: string) {
  const { data, error } = await admin.from("departments").select("id,name").eq("org_id", orgId).eq("is_active", true).order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DepartmentRow[];
}
async function getMembers(admin: ReturnType<typeof supabaseAdmin>, orgId: string) {
  const { data, error } = await admin.from("organization_members").select("user_id,role,department_id").eq("org_id", orgId).eq("is_active", true);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as MemberRow[];
  const hydrated = await Promise.all(rows.map(async (row) => {
    const authUser = await admin.auth.admin.getUserById(row.user_id);
    return { userId: row.user_id, role: row.role, departmentId: row.department_id ?? null, email: authUser.data.user?.email ?? null };
  }));
  return hydrated.sort((a, b) => String(a.email ?? a.userId).localeCompare(String(b.email ?? b.userId)));
}
async function getObjectives(admin: ReturnType<typeof supabaseAdmin>, orgId: string, cycleId: string, departmentId?: string | null) {
  let query = admin.from("objectives").select("id,title,department_id").eq("org_id", orgId).eq("cycle_id", cycleId).order("title", { ascending: true });
  if (departmentId) query = query.eq("department_id", departmentId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ObjectiveRow[];
}
async function getKpis(admin: ReturnType<typeof supabaseAdmin>, orgId: string, cycleId: string, departmentId?: string | null) {
  let query = admin.from("kpis").select("id,title,department_id").eq("org_id", orgId).eq("cycle_id", cycleId).eq("is_active", true).order("title", { ascending: true });
  if (departmentId) query = query.eq("department_id", departmentId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as KpiRow[];
}
async function getOkrs(admin: ReturnType<typeof supabaseAdmin>, params: {orgId:string; cycleId:string; mode:"org"|"department"|"employee"; departmentId:string|null; userId:string;}) {
  let query = admin.from("okrs").select("id,org_id,cycle_id,department_id,objective_id,title,description,owner_user_id,status,progress,approved_by,approved_at,created_at").eq("org_id", params.orgId).eq("cycle_id", params.cycleId).order("created_at", { ascending: false });
  if (params.mode === "department") {
    if (!params.departmentId) return [] as OkrRow[];
    query = query.eq("department_id", params.departmentId);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as OkrRow[];
  if (params.mode === "employee") return rows.filter((r) => r.owner_user_id === params.userId);
  return rows;
}
async function getKeyResults(admin: ReturnType<typeof supabaseAdmin>, okrIds: string[]) {
  if (!okrIds.length) return [] as KrRow[];
  const { data, error } = await admin.from("key_results").select("id,okr_id,objective_id,department_id,title,metric_name,metric_type,unit,start_value,current_value,target_value,status,progress,owner_user_id,kpi_id,position").in("okr_id", okrIds).order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as KrRow[];
}
async function replaceKeyResults(admin: ReturnType<typeof supabaseAdmin>, orgId: string, cycleId: string, okr: {id:string; objective_id:string; department_id?:string|null}, userId: string, rows: KeyResultInput[]) {
  const { error: deleteErr } = await admin.from("key_results").delete().eq("okr_id", okr.id).eq("org_id", orgId);
  if (deleteErr) throw new Error(deleteErr.message);
  const payload = rows.map((row, index) => ({
    org_id: orgId,
    cycle_id: cycleId,
    okr_id: okr.id,
    objective_id: okr.objective_id,
    department_id: okr.department_id ?? null,
    title: String(row.title ?? "").trim(),
    metric_name: String(row.metric_name ?? "").trim() || null,
    metric_type: String(row.metric_type ?? "number").trim() || "number",
    unit: String(row.unit ?? "").trim() || null,
    start_value: Number(row.start_value ?? 0),
    current_value: Number(row.current_value ?? 0),
    target_value: Number(row.target_value ?? 100),
    status: normalizeKrStatus(row.status),
    progress: pct(row.progress),
    owner_user_id: row.owner_user_id ? String(row.owner_user_id).trim() : null,
    kpi_id: row.kpi_id ? String(row.kpi_id).trim() : null,
    position: index,
    source: "manual",
    created_by: userId,
  })).filter((row) => row.title);
  if (!payload.length) return;
  const { error: insertErr } = await admin.from("key_results").insert(payload);
  if (insertErr) throw new Error(insertErr.message);
}

export async function GET(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();
    const cycle = await getActiveCycle(admin, scope.org.id);
    if (!cycle) return NextResponse.json({ ok: true, cycle: null, departments: [], objectives: [], members: [], kpis: [], okrs: [], visibility: scope.mode, role: scope.role, canManage: canManageWorkRole(scope.role) || scope.role === "dept_head" });
    const scopedDepartmentId = scope.mode === "org" ? null : scope.departmentId;
    const [departments, objectives, members, kpis, okrs] = await Promise.all([
      getDepartments(admin, scope.org.id),
      getObjectives(admin, scope.org.id, cycle.id, scopedDepartmentId),
      getMembers(admin, scope.org.id),
      getKpis(admin, scope.org.id, cycle.id, scopedDepartmentId),
      getOkrs(admin, { orgId: scope.org.id, cycleId: cycle.id, mode: scope.mode, departmentId: scope.departmentId, userId: scope.userId }),
    ]);
    const keyResults = await getKeyResults(admin, okrs.map((o) => o.id));
    const deptMap = new Map(departments.map((d) => [d.id, d.name]));
    const objMap = new Map(objectives.map((o) => [o.id, o.title]));
    const kpiMap = new Map(kpis.map((k) => [k.id, k.title]));
    const groupedKrs = new Map<string, KrRow[]>();
    for (const kr of keyResults) {
      const current = groupedKrs.get(kr.okr_id) ?? [];
      current.push(kr);
      groupedKrs.set(kr.okr_id, current);
    }
    return NextResponse.json({
      ok: true,
      cycle,
      departments,
      objectives,
      members,
      kpis,
      visibility: scope.mode,
      role: scope.role,
      canManage: canManageWorkRole(scope.role) || scope.role === "dept_head",
      okrs: okrs.map((row) => ({
        ...row,
        department_name: row.department_id ? deptMap.get(row.department_id) ?? null : null,
        objective_title: objMap.get(row.objective_id) ?? null,
        key_results: (groupedKrs.get(row.id) ?? []).map((kr) => ({ ...kr, kpi_title: kr.kpi_id ? kpiMap.get(kr.kpi_id) ?? null : null })),
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load OKRs";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();
    if (!(canManageWorkRole(scope.role) || scope.role === "dept_head")) return NextResponse.json({ ok: false, error: "You do not have permission to create OKRs" }, { status: 403 });
    const cycle = await getActiveCycle(admin, scope.org.id);
    if (!cycle) return NextResponse.json({ ok: false, error: "No active cycle found" }, { status: 400 });
    const body = (await req.json()) as CreateBody;
    const title = String(body.title ?? "").trim();
    const objectiveId = String(body.objective_id ?? "").trim();
    if (!title || !objectiveId) return NextResponse.json({ ok: false, error: "Objective and title are required" }, { status: 400 });
    const departmentId = body.department_id ? String(body.department_id).trim() : (scope.mode === "department" || scope.mode === "employee" ? scope.departmentId : null);
    const insertPayload = {
      org_id: scope.org.id,
      cycle_id: cycle.id,
      department_id: departmentId,
      objective_id: objectiveId,
      title,
      description: String(body.description ?? "").trim() || null,
      owner_user_id: body.owner_user_id ? String(body.owner_user_id).trim() : null,
      status: normalizeOkrStatus(body.status),
      progress: pct(body.progress),
      source: "manual",
      created_by: scope.userId,
    };
    const { data, error } = await admin.from("okrs").insert(insertPayload).select("id,objective_id,department_id").single<{id:string; objective_id:string; department_id?:string|null}>();
    if (error) throw new Error(error.message);
    await replaceKeyResults(admin, scope.org.id, cycle.id, { id: data.id, objective_id: data.objective_id, department_id: data.department_id }, scope.userId, Array.isArray(body.key_results) ? body.key_results : []);
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create OKR";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
