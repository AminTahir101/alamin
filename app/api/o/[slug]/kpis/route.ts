// app/api/o/[slug]/kpis/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };

type CycleRow = {
  id: string;
  year: number;
  quarter: number;
  status: string;
};

type DepartmentRow = {
  id: string;
  name: string;
};

type MemberRow = {
  user_id: string;
  role: string;
  department_id?: string | null;
};

type KpiRow = {
  id: string;
  title: string;
  description: string | null;
  department_id: string | null;
  owner_user_id: string | null;
  weight: number | null;
  measurement_type: string | null;
  target_value: number | null;
  current_value: number | null;
  is_active: boolean | null;
  direction: "increase" | "decrease" | null;
  unit: string | null;
  frequency: string | null;
  baseline_value: number | null;
  formula: string | null;
  cycle_id: string;
  created_at: string;
  updated_at: string;
};

type KpiValueHistoryRow = {
  id: string;
  kpi_id: string;
  current_value: number;
  target_value: number;
  recorded_at: string;
  source: string;
  notes: string | null;
};

type CreateBody = {
  title: string;
  department_id: string;
  current_value?: number;
  target_value: number;
  weight?: number;
  direction?: "increase" | "decrease";
  is_active?: boolean;
  notes?: string;
  owner_user_id?: string | null;
  description?: string | null;
  measurement_type?: string | null;
  unit?: string | null;
  frequency?: string | null;
  baseline_value?: number | null;
  formula?: string | null;
};

type UpdateBody = {
  id: string;
  title: string;
  department_id: string;
  current_value?: number;
  target_value: number;
  weight?: number;
  direction?: "increase" | "decrease";
  is_active?: boolean;
  owner_user_id?: string | null;
  notes?: string;
  description?: string | null;
  measurement_type?: string | null;
  unit?: string | null;
  frequency?: string | null;
  baseline_value?: number | null;
  formula?: string | null;
};

function canManageKPIs(role: string) {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "manager" ||
    role === "dept_head" ||
    role === "finance"
  );
}

function safeNumber(value: unknown, fallback = 0) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

async function getActiveCycle(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
): Promise<CycleRow | null> {
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

async function getDepartments(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  departmentId?: string | null,
): Promise<DepartmentRow[]> {
  let query = admin
    .from("departments")
    .select("id,name")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("name");

  if (departmentId) {
    query = query.eq("id", departmentId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []) as DepartmentRow[];
}

async function getAssignableMembers(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
) {
  const { data, error } = await admin
    .from("organization_members")
    .select("user_id,role,department_id")
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
        departmentId: row.department_id ?? null,
      };
    }),
  );

  return members.sort((a, b) =>
    String(a.email ?? a.userId).localeCompare(String(b.email ?? b.userId)),
  );
}

async function getRawKpisForCycle(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  cycleId: string,
): Promise<KpiRow[]> {
  const { data, error } = await admin
    .from("kpis")
    .select(
      "id,title,description,department_id,owner_user_id,weight,measurement_type,target_value,current_value,is_active,direction,unit,frequency,baseline_value,formula,cycle_id,created_at,updated_at",
    )
    .eq("org_id", orgId)
    .eq("cycle_id", cycleId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as KpiRow[];
}

async function getScopedKpisForCycle(
  admin: ReturnType<typeof supabaseAdmin>,
  params: {
    orgId: string;
    cycleId: string;
    mode: "org" | "department" | "employee";
    departmentId: string | null;
    userId: string;
  },
): Promise<KpiRow[]> {
  const baseRows = await getRawKpisForCycle(admin, params.orgId, params.cycleId);

  if (params.mode === "org") {
    return baseRows;
  }

  if (params.mode === "department") {
    if (!params.departmentId) return [];
    return baseRows.filter((row) => row.department_id === params.departmentId);
  }

  return baseRows.filter((row) => row.owner_user_id === params.userId);
}

async function ensureDepartmentBelongsToOrg(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  departmentId: string,
) {
  const { data, error } = await admin
    .from("departments")
    .select("id")
    .eq("id", departmentId)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string }>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invalid department_id for this org");
}

async function ensureOwnerUserBelongsToOrg(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  ownerUserId: string,
) {
  const { data, error } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("user_id", ownerUserId)
    .eq("is_active", true)
    .maybeSingle<{ user_id: string }>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("owner_user_id is not a member of this org");
}

async function getLatestKpiHistoryMap(
  admin: ReturnType<typeof supabaseAdmin>,
  kpiIds: string[],
): Promise<Map<string, KpiValueHistoryRow>> {
  const map = new Map<string, KpiValueHistoryRow>();
  if (!kpiIds.length) return map;

  const { data, error } = await admin
    .from("kpi_values_history")
    .select("id,kpi_id,current_value,target_value,recorded_at,source,notes")
    .in("kpi_id", kpiIds)
    .order("recorded_at", { ascending: false });

  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as KpiValueHistoryRow[]) {
    if (!map.has(row.kpi_id)) {
      map.set(row.kpi_id, row);
    }
  }

  return map;
}

function computeProgress(
  direction: "increase" | "decrease" | null,
  currentValue: number | null | undefined,
  targetValue: number | null | undefined,
) {
  const current = typeof currentValue === "number" ? currentValue : Number(currentValue);
  const target = typeof targetValue === "number" ? targetValue : Number(targetValue);

  if (!Number.isFinite(current) || !Number.isFinite(target) || target === 0) {
    return null;
  }

  if (direction === "decrease") {
    const denominator = Math.max(current, 1);
    return Math.max(0, Math.min(100, (target / denominator) * 100));
  }

  return Math.max(0, Math.min(100, (current / target) * 100));
}

async function insertKpiHistory(
  admin: ReturnType<typeof supabaseAdmin>,
  payload: {
    org_id: string;
    cycle_id: string;
    kpi_id: string;
    current_value: number;
    target_value: number;
    source: string;
    notes: string | null;
    recorded_by: string;
  },
) {
  const { error } = await admin.from("kpi_values_history").insert(payload);
  if (error) throw new Error(error.message);
}

export async function GET(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const admin = supabaseAdmin();
    const scope = await requireAccessScope(req, slug);

    const cycle = await getActiveCycle(admin, scope.org.id);

    const departments =
      scope.mode === "org"
        ? await getDepartments(admin, scope.org.id)
        : await getDepartments(admin, scope.org.id, scope.departmentId);

    const assignableMembers = canManageKPIs(scope.role)
      ? await getAssignableMembers(admin, scope.org.id)
      : [];

    if (!cycle) {
      return NextResponse.json({
        ok: true,
        cycle: null,
        departments,
        assignableMembers,
        kpis: [],
        visibility: scope.mode,
        role: scope.role,
        canManage: canManageKPIs(scope.role),
      });
    }

    const kpis = await getScopedKpisForCycle(admin, {
      orgId: scope.org.id,
      cycleId: cycle.id,
      mode: scope.mode,
      departmentId: scope.departmentId,
      userId: scope.userId,
    });

    const deptMap = new Map(departments.map((dept) => [dept.id, dept.name]));
    const latestHistoryMap = await getLatestKpiHistoryMap(
      admin,
      kpis.map((kpi) => kpi.id),
    );

    const payload = await Promise.all(
      kpis.map(async (kpi) => {
        const latest = latestHistoryMap.get(kpi.id);
        const ownerEmail = kpi.owner_user_id
          ? (await admin.auth.admin.getUserById(kpi.owner_user_id)).data.user?.email ?? null
          : null;

        const currentValue = latest?.current_value ?? kpi.current_value ?? 0;
        const targetValue = latest?.target_value ?? kpi.target_value ?? 0;

        return {
          id: kpi.id,
          title: kpi.title,
          description: kpi.description,
          department_id: kpi.department_id,
          department_name: kpi.department_id ? deptMap.get(kpi.department_id) ?? null : null,
          current_value: currentValue,
          target_value: targetValue,
          weight: kpi.weight,
          is_active: kpi.is_active,
          direction: kpi.direction,
          owner_user_id: kpi.owner_user_id,
          owner_email: ownerEmail,
          is_assigned_to_me: kpi.owner_user_id === scope.userId,
          measurement_type: kpi.measurement_type,
          unit: kpi.unit,
          frequency: kpi.frequency,
          baseline_value: kpi.baseline_value,
          formula: kpi.formula,
          progress: computeProgress(kpi.direction, currentValue, targetValue),
          latest_recorded_at: latest?.recorded_at ?? null,
          latest_source: latest?.source ?? null,
          latest_notes: latest?.notes ?? null,
        };
      }),
    );

    return NextResponse.json({
      ok: true,
      cycle,
      departments,
      assignableMembers,
      kpis: payload,
      visibility: scope.mode,
      role: scope.role,
      canManage: canManageKPIs(scope.role),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load KPIs";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const admin = supabaseAdmin();
    const scope = await requireAccessScope(req, slug);

    if (!canManageKPIs(scope.role)) {
      return NextResponse.json(
        { ok: false, error: "You do not have permission to create KPIs" },
        { status: 403 },
      );
    }

    const cycle = await getActiveCycle(admin, scope.org.id);
    if (!cycle) {
      throw new Error("No active cycle. Create or activate a quarterly cycle first.");
    }

    const body = (await req.json()) as CreateBody;

    const title = String(body.title ?? "").trim();
    const department_id = String(body.department_id ?? "").trim();
    const target_value = Number(body.target_value);
    const current_value = Number(body.current_value ?? 0);
    const weight = safeNumber(body.weight, 1);
    const direction = (body.direction ?? "increase") as "increase" | "decrease";
    const is_active = body.is_active !== false;
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const owner_user_id = String(body.owner_user_id ?? "").trim() || null;
    const description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;
    const measurement_type =
      typeof body.measurement_type === "string" && body.measurement_type.trim()
        ? body.measurement_type.trim()
        : "number";
    const unit =
      typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : null;
    const frequency =
      typeof body.frequency === "string" && body.frequency.trim()
        ? body.frequency.trim()
        : "monthly";
    const baseline_value =
      body.baseline_value === null || body.baseline_value === undefined
        ? null
        : Number(body.baseline_value);
    const formula =
      typeof body.formula === "string" && body.formula.trim()
        ? body.formula.trim()
        : null;

    if (!title) throw new Error("title is required");
    if (!department_id) throw new Error("department_id is required");
    if (!Number.isFinite(target_value)) throw new Error("target_value is invalid");
    if (!Number.isFinite(current_value)) throw new Error("current_value is invalid");
    if (!Number.isFinite(weight) || weight <= 0) throw new Error("weight is invalid");
    if (baseline_value !== null && !Number.isFinite(baseline_value)) {
      throw new Error("baseline_value is invalid");
    }

    await ensureDepartmentBelongsToOrg(admin, scope.org.id, department_id);

    if (owner_user_id) {
      await ensureOwnerUserBelongsToOrg(admin, scope.org.id, owner_user_id);
    }

    const { data: inserted, error: insErr } = await admin
      .from("kpis")
      .insert({
        org_id: scope.org.id,
        cycle_id: cycle.id,
        department_id,
        title,
        description,
        owner_user_id,
        weight,
        measurement_type,
        target_value,
        current_value,
        created_by: scope.user.id,
        is_active,
        direction,
        unit,
        frequency,
        baseline_value,
        formula,
        source: "manual",
      })
      .select("id")
      .single<{ id: string }>();

    if (insErr) throw new Error(insErr.message);

    if (notes) {
      await insertKpiHistory(admin, {
        org_id: scope.org.id,
        cycle_id: cycle.id,
        kpi_id: inserted.id,
        current_value,
        target_value,
        source: "manual",
        notes,
        recorded_by: scope.user.id,
      });
    }

    return NextResponse.json({ ok: true, id: inserted.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create KPI";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const admin = supabaseAdmin();
    const scope = await requireAccessScope(req, slug);

    if (!canManageKPIs(scope.role)) {
      return NextResponse.json(
        { ok: false, error: "You do not have permission to edit KPIs" },
        { status: 403 },
      );
    }

    const body = (await req.json()) as UpdateBody;

    const id = String(body.id ?? "").trim();
    const title = String(body.title ?? "").trim();
    const department_id = String(body.department_id ?? "").trim();
    const target_value = Number(body.target_value);
    const current_value = Number(body.current_value ?? 0);
    const weight = safeNumber(body.weight, 1);
    const direction = (body.direction ?? "increase") as "increase" | "decrease";
    const is_active = body.is_active !== false;
    const owner_user_id = String(body.owner_user_id ?? "").trim() || null;
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;
    const measurement_type =
      typeof body.measurement_type === "string" && body.measurement_type.trim()
        ? body.measurement_type.trim()
        : "number";
    const unit =
      typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : null;
    const frequency =
      typeof body.frequency === "string" && body.frequency.trim()
        ? body.frequency.trim()
        : "monthly";
    const baseline_value =
      body.baseline_value === null || body.baseline_value === undefined
        ? null
        : Number(body.baseline_value);
    const formula =
      typeof body.formula === "string" && body.formula.trim()
        ? body.formula.trim()
        : null;

    if (!id) throw new Error("id is required");
    if (!title) throw new Error("title is required");
    if (!department_id) throw new Error("department_id is required");
    if (!Number.isFinite(target_value)) throw new Error("target_value is invalid");
    if (!Number.isFinite(current_value)) throw new Error("current_value is invalid");
    if (!Number.isFinite(weight) || weight <= 0) throw new Error("weight is invalid");
    if (baseline_value !== null && !Number.isFinite(baseline_value)) {
      throw new Error("baseline_value is invalid");
    }

    const { data: existing, error: existingErr } = await admin
      .from("kpis")
      .select("id,org_id,cycle_id,current_value,target_value")
      .eq("id", id)
      .eq("org_id", scope.org.id)
      .maybeSingle<{
        id: string;
        org_id: string;
        cycle_id: string;
        current_value: number | null;
        target_value: number | null;
      }>();

    if (existingErr) throw new Error(existingErr.message);
    if (!existing) throw new Error("KPI not found");

    await ensureDepartmentBelongsToOrg(admin, scope.org.id, department_id);

    if (owner_user_id) {
      await ensureOwnerUserBelongsToOrg(admin, scope.org.id, owner_user_id);
    }

    const { error: updErr } = await admin
      .from("kpis")
      .update({
        title,
        description,
        department_id,
        target_value,
        current_value,
        weight,
        direction,
        is_active,
        owner_user_id,
        measurement_type,
        unit,
        frequency,
        baseline_value,
        formula,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("org_id", scope.org.id);

    if (updErr) throw new Error(updErr.message);

    const previousCurrent = safeNumber(existing.current_value, 0);
    const previousTarget = safeNumber(existing.target_value, 0);
    const valueChanged = current_value !== previousCurrent || target_value !== previousTarget;

    if (valueChanged || notes) {
      await insertKpiHistory(admin, {
        org_id: scope.org.id,
        cycle_id: existing.cycle_id,
        kpi_id: id,
        current_value,
        target_value,
        source: "manual",
        notes: notes || null,
        recorded_by: scope.user.id,
      });
    }

    return NextResponse.json({ ok: true, id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to update KPI";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}