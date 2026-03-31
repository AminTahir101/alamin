import { NextRequest, NextResponse } from "next/server";
import { canManageWorkRole, requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };

type DepartmentRow = { id: string; name: string };
type CycleRow = { id: string; year: number; quarter: number; status: string };
type MemberRow = { user_id: string; role: string; department_id?: string | null };
type KpiRow = { id: string; title: string; department_id?: string | null };
type ObjectiveRow = {
  id: string;
  org_id: string;
  cycle_id: string;
  department_id?: string | null;
  title: string;
  description?: string | null;
  owner_user_id?: string | null;
  status: string;
  progress: number;
  parent_objective_id?: string | null;
  source?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
};

type CreateBody = {
  title: string;
  description?: string;
  department_id?: string | null;
  owner_user_id?: string | null;
  status?: string;
  progress?: number;
  parent_objective_id?: string | null;
  linked_kpi_ids?: string[];
};

const OBJECTIVE_STATUSES = new Set([
  "draft",
  "active",
  "on_track",
  "at_risk",
  "off_track",
  "completed",
  "cancelled",
]);

function normalizeStatus(value?: string | null) {
  const candidate = String(value ?? "draft").trim().toLowerCase();
  return OBJECTIVE_STATUSES.has(candidate) ? candidate : "draft";
}

function normalizeProgress(value?: number | null) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
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

async function getDepartments(admin: ReturnType<typeof supabaseAdmin>, orgId: string) {
  const { data, error } = await admin
    .from("departments")
    .select("id,name")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as DepartmentRow[];
}

async function getAssignableMembers(admin: ReturnType<typeof supabaseAdmin>, orgId: string) {
  const { data, error } = await admin
    .from("organization_members")
    .select("user_id,role,department_id")
    .eq("org_id", orgId)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as MemberRow[];
  const hydrated = await Promise.all(
    rows.map(async (row) => {
      const authUser = await admin.auth.admin.getUserById(row.user_id);
      return {
        userId: row.user_id,
        role: row.role,
        departmentId: row.department_id ?? null,
        email: authUser.data.user?.email ?? null,
      };
    })
  );

  return hydrated.sort((a, b) => String(a.email ?? a.userId).localeCompare(String(b.email ?? b.userId)));
}

async function getObjectives(admin: ReturnType<typeof supabaseAdmin>, params: {
  orgId: string;
  cycleId: string;
  mode: "org" | "department" | "employee";
  departmentId: string | null;
  userId: string;
}) {
  let query = admin
    .from("objectives")
    .select("id,org_id,cycle_id,department_id,title,description,owner_user_id,status,progress,parent_objective_id,source,approved_by,approved_at,created_at")
    .eq("org_id", params.orgId)
    .eq("cycle_id", params.cycleId)
    .order("created_at", { ascending: false });

  if (params.mode === "department") {
    if (!params.departmentId) return [] as ObjectiveRow[];
    query = query.eq("department_id", params.departmentId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as ObjectiveRow[];
  if (params.mode === "employee") {
    return rows.filter((row) => row.owner_user_id === params.userId);
  }
  return rows;
}

async function getObjectiveKpiLinks(admin: ReturnType<typeof supabaseAdmin>, objectiveIds: string[]) {
  if (!objectiveIds.length) return new Map<string, string[]>();

  const { data, error } = await admin
    .from("objective_kpis")
    .select("objective_id,kpi_id")
    .in("objective_id", objectiveIds);

  if (error) throw new Error(error.message);

  const map = new Map<string, string[]>();
  for (const row of data ?? []) {
    const current = map.get(row.objective_id) ?? [];
    current.push(row.kpi_id);
    map.set(row.objective_id, current);
  }
  return map;
}

async function getKpis(admin: ReturnType<typeof supabaseAdmin>, orgId: string, cycleId: string, departmentId?: string | null) {
  let query = admin
    .from("kpis")
    .select("id,title,department_id")
    .eq("org_id", orgId)
    .eq("cycle_id", cycleId)
    .eq("is_active", true)
    .order("title", { ascending: true });

  if (departmentId) query = query.eq("department_id", departmentId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as KpiRow[];
}

async function replaceObjectiveKpis(admin: ReturnType<typeof supabaseAdmin>, orgId: string, objectiveId: string, userId: string, linkedKpiIds: string[]) {
  const uniqueIds = Array.from(new Set(linkedKpiIds.filter(Boolean)));
  const { error: deleteErr } = await admin.from("objective_kpis").delete().eq("org_id", orgId).eq("objective_id", objectiveId);
  if (deleteErr) throw new Error(deleteErr.message);

  if (!uniqueIds.length) return;

  const rows = uniqueIds.map((kpiId) => ({
    org_id: orgId,
    objective_id: objectiveId,
    kpi_id: kpiId,
    created_by: userId,
  }));

  const { error: insertErr } = await admin.from("objective_kpis").insert(rows);
  if (insertErr) throw new Error(insertErr.message);
}

export async function GET(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();
    const cycle = await getActiveCycle(admin, scope.org.id);

    if (!cycle) {
      return NextResponse.json({
        ok: true,
        cycle: null,
        departments: [],
        assignableMembers: [],
        kpis: [],
        objectives: [],
        visibility: scope.mode,
        role: scope.role,
        canManage: canManageWorkRole(scope.role) || scope.role === "dept_head",
      });
    }

    const [departments, assignableMembers, objectives, kpis] = await Promise.all([
      getDepartments(admin, scope.org.id),
      getAssignableMembers(admin, scope.org.id),
      getObjectives(admin, {
        orgId: scope.org.id,
        cycleId: cycle.id,
        mode: scope.mode,
        departmentId: scope.departmentId,
        userId: scope.userId,
      }),
      getKpis(admin, scope.org.id, cycle.id, scope.mode === "org" ? null : scope.departmentId),
    ]);

    const deptMap = new Map(departments.map((d) => [d.id, d.name]));
    const links = await getObjectiveKpiLinks(admin, objectives.map((o) => o.id));

    return NextResponse.json({
      ok: true,
      cycle,
      departments,
      assignableMembers,
      kpis,
      visibility: scope.mode,
      role: scope.role,
      canManage: canManageWorkRole(scope.role) || scope.role === "dept_head",
      objectives: objectives.map((row) => ({
        ...row,
        department_name: row.department_id ? deptMap.get(row.department_id) ?? null : null,
        linked_kpi_ids: links.get(row.id) ?? [],
        is_assigned_to_me: row.owner_user_id === scope.userId,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load objectives";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();

    if (!(canManageWorkRole(scope.role) || scope.role === "dept_head")) {
      return NextResponse.json({ ok: false, error: "You do not have permission to create objectives" }, { status: 403 });
    }

    const cycle = await getActiveCycle(admin, scope.org.id);
    if (!cycle) return NextResponse.json({ ok: false, error: "No active cycle found" }, { status: 400 });

    const body = (await req.json()) as CreateBody;
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });

    const departmentId = body.department_id ? String(body.department_id).trim() : (scope.mode === "department" || scope.mode === "employee" ? scope.departmentId : null);

    const payload = {
      org_id: scope.org.id,
      cycle_id: cycle.id,
      department_id: departmentId,
      title,
      description: String(body.description ?? "").trim() || null,
      owner_user_id: body.owner_user_id ? String(body.owner_user_id).trim() : null,
      status: normalizeStatus(body.status),
      progress: normalizeProgress(body.progress),
      parent_objective_id: body.parent_objective_id ? String(body.parent_objective_id).trim() : null,
      source: "manual",
      created_by: scope.userId,
    };

    const { data, error } = await admin.from("objectives").insert(payload).select("id").single<{ id: string }>();
    if (error) throw new Error(error.message);

    await replaceObjectiveKpis(admin, scope.org.id, data.id, scope.userId, Array.isArray(body.linked_kpi_ids) ? body.linked_kpi_ids : []);

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create objective";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
