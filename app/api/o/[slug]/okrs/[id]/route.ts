import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string; id: string }> };

type OkrRow = {
  id: string;
  org_id: string;
  cycle_id: string;
  department_id: string | null;
  objective_id: string;
  title: string;
  description: string | null;
  owner_user_id: string | null;
  status:
    | "draft"
    | "pending_approval"
    | "active"
    | "on_track"
    | "at_risk"
    | "off_track"
    | "completed"
    | "cancelled";
  progress: number | null;
  created_at: string;
  updated_at: string;
};

type KeyResultRow = {
  id: string;
  org_id: string;
  cycle_id: string;
  okr_id: string;
  objective_id: string;
  department_id: string | null;
  title: string;
  metric_name: string | null;
  metric_type: string | null;
  unit: string | null;
  start_value: number | null;
  current_value: number | null;
  target_value: number | null;
  status:
    | "not_started"
    | "in_progress"
    | "on_track"
    | "at_risk"
    | "off_track"
    | "completed"
    | "cancelled";
  progress: number | null;
  owner_user_id: string | null;
  kpi_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

type KpiRow = {
  id: string;
  title: string;
  current_value: number | null;
  target_value: number | null;
  unit: string | null;
};

type MemberRow = {
  user_id: string;
  role: string;
  department_id: string | null;
};

type ObjectiveRow = {
  id: string;
  title: string;
  department_id: string | null;
};

type DepartmentRow = {
  id: string;
  name: string;
};

function canManage(role: string) {
  return ["owner", "admin", "manager", "dept_head", "finance"].includes(role);
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function clampProgress(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function computeProgress(currentValue: number | null, targetValue: number | null) {
  const current = typeof currentValue === "number" ? currentValue : Number(currentValue);
  const target = typeof targetValue === "number" ? targetValue : Number(targetValue);

  if (!Number.isFinite(current) || !Number.isFinite(target) || target === 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

async function getAssignableMembers(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string
) {
  const { data, error } = await admin
    .from("organization_members")
    .select("user_id, role, department_id")
    .eq("org_id", orgId)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as MemberRow[];

  const members = await Promise.all(
    rows.map(async (row) => {
      const userResult = await admin.auth.admin.getUserById(row.user_id);
      return {
        userId: row.user_id,
        email: userResult.data.user?.email ?? null,
        role: row.role,
        departmentId: row.department_id,
      };
    })
  );

  return members.sort((a, b) =>
    String(a.email ?? a.userId).localeCompare(String(b.email ?? b.userId))
  );
}

async function getDepartments(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string
) {
  const { data, error } = await admin
    .from("departments")
    .select("id,name")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as DepartmentRow[];
}

async function getObjectives(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  cycleId: string
) {
  const { data, error } = await admin
    .from("objectives")
    .select("id,title,department_id")
    .eq("org_id", orgId)
    .eq("cycle_id", cycleId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as ObjectiveRow[];
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { slug, id } = await ctx.params;
    const admin = supabaseAdmin();
    const scope = await requireAccessScope(req, slug);

    const { data: okr, error: okrErr } = await admin
      .from("okrs")
      .select("*")
      .eq("id", id)
      .eq("org_id", scope.org.id)
      .maybeSingle<OkrRow>();

    if (okrErr) throw new Error(okrErr.message);
    if (!okr) throw new Error("OKR not found");

    if (scope.mode === "department" && scope.departmentId && okr.department_id !== scope.departmentId) {
      return json({ ok: false, error: "Not allowed" }, 403);
    }

    if (scope.mode === "employee" && okr.owner_user_id !== scope.userId) {
      const { data: ownedKrs, error: ownedKrErr } = await admin
        .from("key_results")
        .select("id")
        .eq("okr_id", okr.id)
        .eq("owner_user_id", scope.userId)
        .limit(1);

      if (ownedKrErr) throw new Error(ownedKrErr.message);
      if (!ownedKrs?.length) {
        return json({ ok: false, error: "Not allowed" }, 403);
      }
    }

    const [
      { data: keyResults, error: krErr },
      { data: kpis, error: kpiErr },
      { data: objective, error: objErr },
      departments,
      objectives,
      assignableMembers,
      cycleRes,
    ] = await Promise.all([
      admin
        .from("key_results")
        .select("*")
        .eq("okr_id", id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      admin
        .from("kpis")
        .select("id,title,current_value,target_value,unit")
        .eq("org_id", scope.org.id),
      admin
        .from("objectives")
        .select("id,title,department_id")
        .eq("id", okr.objective_id)
        .maybeSingle<ObjectiveRow>(),
      getDepartments(admin, scope.org.id),
      getObjectives(admin, scope.org.id, okr.cycle_id),
      canManage(scope.role) ? getAssignableMembers(admin, scope.org.id) : Promise.resolve([]),
      admin
        .from("quarterly_cycles")
        .select("id,year,quarter,status")
        .eq("id", okr.cycle_id)
        .maybeSingle<{ id: string; year: number; quarter: number; status: string }>(),
    ]);

    if (krErr) throw new Error(krErr.message);
    if (kpiErr) throw new Error(kpiErr.message);
    if (objErr) throw new Error(objErr.message);
    if (cycleRes.error) throw new Error(cycleRes.error.message);

    const departmentMap = new Map(departments.map((d) => [d.id, d.name]));
    const memberMap = new Map(assignableMembers.map((m) => [m.userId, m.email]));

    const kpiMap = new Map<string, KpiRow>((kpis ?? []).map((k) => [k.id, k as KpiRow]));

    const enrichedKeyResults = ((keyResults ?? []) as KeyResultRow[]).map((kr) => {
      const progress = computeProgress(kr.current_value, kr.target_value);
      return {
        ...kr,
        progress,
        owner_email: kr.owner_user_id ? memberMap.get(kr.owner_user_id) ?? null : null,
        linked_kpi: kr.kpi_id ? kpiMap.get(kr.kpi_id) ?? null : null,
        is_assigned_to_me: kr.owner_user_id === scope.userId,
      };
    });

    const averageKrProgress =
      enrichedKeyResults.length > 0
        ? Math.round(
            enrichedKeyResults.reduce(
              (sum, kr) => sum + (typeof kr.progress === "number" ? kr.progress : 0),
              0
            ) / enrichedKeyResults.length
          )
        : 0;

    const linkedKpisCount = new Set(
      enrichedKeyResults.map((kr) => kr.kpi_id).filter(Boolean)
    ).size;

    return json({
      ok: true,
      cycle: cycleRes.data ?? null,
      okr: {
        ...okr,
        progress:
          typeof okr.progress === "number" && Number.isFinite(okr.progress)
            ? clampProgress(okr.progress)
            : averageKrProgress,
        objective_title: objective?.title ?? null,
        department_name: okr.department_id ? departmentMap.get(okr.department_id) ?? null : null,
        owner_email: okr.owner_user_id ? memberMap.get(okr.owner_user_id) ?? null : null,
        key_results_count: enrichedKeyResults.length,
        linked_kpis_count: linkedKpisCount,
        average_kr_progress: averageKrProgress,
        is_assigned_to_me: okr.owner_user_id === scope.userId,
      },
      keyResults: enrichedKeyResults,
      departments,
      objectives,
      assignableMembers,
      canManage: canManage(scope.role),
      visibility: scope.mode,
      role: scope.role,
    });
  } catch (error: unknown) {
    return json({ ok: false, error: getErrorMessage(error, "Failed to load OKR") }, 400);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { slug, id } = await ctx.params;
    const admin = supabaseAdmin();
    const scope = await requireAccessScope(req, slug);

    if (!canManage(scope.role)) {
      return json({ ok: false, error: "No permission" }, 403);
    }

    const { data: okr, error: okrErr } = await admin
      .from("okrs")
      .select("id, org_id, cycle_id, department_id, objective_id")
      .eq("id", id)
      .eq("org_id", scope.org.id)
      .maybeSingle<{
        id: string;
        org_id: string;
        cycle_id: string;
        department_id: string | null;
        objective_id: string;
      }>();

    if (okrErr) throw new Error(okrErr.message);
    if (!okr) throw new Error("OKR not found");

    const body = (await req.json()) as {
      title?: string;
      metric_name?: string | null;
      metric_type?: string | null;
      unit?: string | null;
      start_value?: number | null;
      current_value?: number | null;
      target_value?: number | null;
      owner_user_id?: string | null;
      kpi_id?: string | null;
      position?: number | null;
    };

    const title = String(body.title ?? "").trim();
    if (!title) throw new Error("title is required");

    const targetValue = Number(body.target_value ?? 0);
    const currentValue = Number(body.current_value ?? 0);
    const startValue = Number(body.start_value ?? 0);

    if (!Number.isFinite(targetValue)) throw new Error("target_value is invalid");
    if (!Number.isFinite(currentValue)) throw new Error("current_value is invalid");
    if (!Number.isFinite(startValue)) throw new Error("start_value is invalid");

    const { error } = await admin.from("key_results").insert({
      org_id: scope.org.id,
      cycle_id: okr.cycle_id,
      okr_id: okr.id,
      objective_id: okr.objective_id,
      department_id: okr.department_id,
      title,
      metric_name: body.metric_name ? String(body.metric_name).trim() : null,
      metric_type: body.metric_type ? String(body.metric_type).trim() : "number",
      unit: body.unit ? String(body.unit).trim() : null,
      start_value: startValue,
      current_value: currentValue,
      target_value: targetValue,
      owner_user_id: body.owner_user_id ? String(body.owner_user_id).trim() : null,
      kpi_id: body.kpi_id ? String(body.kpi_id).trim() : null,
      position: Number(body.position ?? 0),
      created_by: scope.userId,
      source: "manual",
    });

    if (error) throw new Error(error.message);

    return json({ ok: true });
  } catch (error: unknown) {
    return json({ ok: false, error: getErrorMessage(error, "Failed to create key result") }, 400);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { slug, id } = await ctx.params;
    const admin = supabaseAdmin();
    const scope = await requireAccessScope(req, slug);

    if (!canManage(scope.role)) {
      return json({ ok: false, error: "No permission" }, 403);
    }

    const rawBody = (await req.json()) as Record<string, unknown>;

    const bodyType = String(rawBody.type ?? "").trim();
    const targetId =
      typeof rawBody.id === "string" && rawBody.id.trim()
        ? rawBody.id.trim()
        : id;

    if (bodyType === "kr") {
      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (typeof rawBody.title === "string") updatePayload.title = rawBody.title.trim();

      if ("metric_name" in rawBody) {
        updatePayload.metric_name =
          typeof rawBody.metric_name === "string" && rawBody.metric_name.trim()
            ? rawBody.metric_name.trim()
            : null;
      }

      if ("metric_type" in rawBody) {
        updatePayload.metric_type =
          typeof rawBody.metric_type === "string" && rawBody.metric_type.trim()
            ? rawBody.metric_type.trim()
            : "number";
      }

      if ("unit" in rawBody) {
        updatePayload.unit =
          typeof rawBody.unit === "string" && rawBody.unit.trim() ? rawBody.unit.trim() : null;
      }

      if ("start_value" in rawBody) updatePayload.start_value = Number(rawBody.start_value ?? 0);
      if ("current_value" in rawBody) updatePayload.current_value = Number(rawBody.current_value ?? 0);
      if ("target_value" in rawBody) updatePayload.target_value = Number(rawBody.target_value ?? 0);
      if ("kpi_id" in rawBody) updatePayload.kpi_id = rawBody.kpi_id ? String(rawBody.kpi_id).trim() : null;
      if ("owner_user_id" in rawBody) {
        updatePayload.owner_user_id = rawBody.owner_user_id ? String(rawBody.owner_user_id).trim() : null;
      }
      if ("position" in rawBody) updatePayload.position = Number(rawBody.position ?? 0);
      if ("status" in rawBody && rawBody.status) updatePayload.status = String(rawBody.status);

      const { error } = await admin
        .from("key_results")
        .update(updatePayload)
        .eq("id", targetId)
        .eq("org_id", scope.org.id);

      if (error) throw new Error(error.message);

      return json({ ok: true });
    }

    const { data: existingOkr, error: existingErr } = await admin
      .from("okrs")
      .select("id,org_id,cycle_id,department_id,objective_id")
      .eq("id", id)
      .eq("org_id", scope.org.id)
      .maybeSingle<{
        id: string;
        org_id: string;
        cycle_id: string;
        department_id: string | null;
        objective_id: string;
      }>();

    if (existingErr) throw new Error(existingErr.message);
    if (!existingOkr) throw new Error("OKR not found");

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof rawBody.title === "string") {
      const cleanTitle = rawBody.title.trim();
      if (!cleanTitle) throw new Error("title is required");
      updatePayload.title = cleanTitle;
    }

    if ("description" in rawBody) {
      updatePayload.description =
        typeof rawBody.description === "string" && rawBody.description.trim()
          ? rawBody.description.trim()
          : null;
    }

    if ("status" in rawBody && rawBody.status) {
      updatePayload.status = String(rawBody.status);
    }

    if ("owner_user_id" in rawBody) {
      updatePayload.owner_user_id = rawBody.owner_user_id
        ? String(rawBody.owner_user_id).trim()
        : null;
    }

    if ("progress" in rawBody) {
      updatePayload.progress = clampProgress(rawBody.progress);
    }

    if ("objective_id" in rawBody) {
      const nextObjectiveId =
        typeof rawBody.objective_id === "string" && rawBody.objective_id.trim()
          ? rawBody.objective_id.trim()
          : "";

      if (!nextObjectiveId) throw new Error("objective_id is required");

      const { data: objective, error: objectiveErr } = await admin
        .from("objectives")
        .select("id,department_id")
        .eq("id", nextObjectiveId)
        .eq("org_id", scope.org.id)
        .eq("cycle_id", existingOkr.cycle_id)
        .maybeSingle<{ id: string; department_id: string | null }>();

      if (objectiveErr) throw new Error(objectiveErr.message);
      if (!objective) throw new Error("Objective not found for this cycle");

      updatePayload.objective_id = objective.id;
      updatePayload.department_id = objective.department_id ?? null;
    }

    const { error } = await admin
      .from("okrs")
      .update(updatePayload)
      .eq("id", id)
      .eq("org_id", scope.org.id);

    if (error) throw new Error(error.message);

    return json({ ok: true });
  } catch (error: unknown) {
    return json({ ok: false, error: getErrorMessage(error, "Failed to update record") }, 400);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const admin = supabaseAdmin();
    const scope = await requireAccessScope(req, slug);

    if (!canManage(scope.role)) {
      return json({ ok: false, error: "No permission" }, 403);
    }

    const body = (await req.json()) as { id?: string };
    const targetId = String(body.id ?? "").trim();
    if (!targetId) throw new Error("id is required");

    const { error } = await admin
      .from("key_results")
      .delete()
      .eq("id", targetId)
      .eq("org_id", scope.org.id);

    if (error) throw new Error(error.message);

    return json({ ok: true });
  } catch (error: unknown) {
    return json({ ok: false, error: getErrorMessage(error, "Failed to delete key result") }, 400);
  }
}