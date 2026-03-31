// app/api/o/[slug]/trends/route.ts
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

type KpiRow = {
  id: string;
  title: string;
  department_id: string | null;
  department_name?: string | null;
  current_value?: number | null;
  target_value?: number | null;
  owner_user_id?: string | null;
};

type HistoryRow = {
  recorded_at: string | null;
  current_value: number | null;
  target_value: number | null;
  source: string | null;
  notes: string | null;
};

async function getActiveCycle(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string
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
  departmentId?: string | null
): Promise<DepartmentRow[]> {
  let query = admin
    .from("departments")
    .select("id,name")
    .eq("org_id", orgId)
    .order("name");

  if (departmentId) query = query.eq("id", departmentId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []) as DepartmentRow[];
}

async function getKpisFromView(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  cycleId: string
) {
  const { data, error } = await admin
    .from("kpi_performance_full")
    .select("id,title,department_id,department_name,current_value,target_value,owner_user_id")
    .eq("org_id", orgId)
    .eq("cycle_id", cycleId);

  if (error) return null;
  return Array.isArray(data) ? (data as unknown as KpiRow[]) : [];
}

async function getRawKpis(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  cycleId: string
): Promise<KpiRow[]> {
  const { data, error } = await admin
    .from("kpis")
    .select("id,title,department_id,current_value,target_value,owner_user_id")
    .eq("org_id", orgId)
    .eq("cycle_id", cycleId)
    .order("title", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as KpiRow[];
}

async function getScopedKpis(
  admin: ReturnType<typeof supabaseAdmin>,
  params: {
    orgId: string;
    cycleId: string;
    mode: "org" | "department" | "employee";
    departmentId: string | null;
    userId: string;
  }
): Promise<KpiRow[]> {
  const viewRows = await getKpisFromView(admin, params.orgId, params.cycleId);
  const baseRows = viewRows ?? (await getRawKpis(admin, params.orgId, params.cycleId));

  if (params.mode === "org") return baseRows;

  if (params.mode === "department") {
    if (!params.departmentId) return [];
    return baseRows.filter((row) => row.department_id === params.departmentId);
  }

  const owned = baseRows.filter((row) => row.owner_user_id === params.userId);
  if (owned.length > 0) return owned;

  if (!params.departmentId) return [];
  return baseRows.filter((row) => row.department_id === params.departmentId);
}

async function getKpiHistory(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  kpiId: string
): Promise<HistoryRow[]> {
  const { data, error } = await admin
    .from("kpi_values_history")
    .select("*")
    .eq("org_id", orgId)
    .eq("kpi_id", kpiId)
    .order("recorded_at", { ascending: false });

  if (error) {
    const msg = error.message || "";
    const missingTable =
      msg.includes("Could not find the table") ||
      (msg.includes("relation") && msg.includes("does not exist"));

    if (missingTable) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    recorded_at: String(row.recorded_at ?? row.created_at ?? "") || null,
    current_value:
      typeof row.value === "number"
        ? row.value
        : typeof row.current_value === "number"
        ? row.current_value
        : Number(row.value ?? row.current_value ?? NaN),
    target_value:
      typeof row.target_value === "number"
        ? row.target_value
        : Number(row.target_value ?? NaN),
    source: typeof row.source === "string" ? row.source : "manual",
    notes: typeof row.notes === "string" ? row.notes : null,
  }));
}

export async function GET(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();
    const search = req.nextUrl.searchParams;
    const selectedKpiId = String(search.get("kpiId") ?? "").trim();

    const cycle = await getActiveCycle(admin, scope.org.id);
    const departments =
      scope.mode === "org"
        ? await getDepartments(admin, scope.org.id)
        : await getDepartments(admin, scope.org.id, scope.departmentId);

    if (!cycle) {
      return NextResponse.json({
        ok: true,
        cycle: null,
        departments,
        kpis: [],
        selectedKpi: null,
        history: [],
        visibility: scope.mode,
        role: scope.role,
      });
    }

    const kpis = await getScopedKpis(admin, {
      orgId: scope.org.id,
      cycleId: cycle.id,
      mode: scope.mode,
      departmentId: scope.departmentId,
      userId: scope.userId,
    });

    const selected =
      (selectedKpiId ? kpis.find((item) => item.id === selectedKpiId) : null) ??
      kpis[0] ??
      null;

    const history = selected ? await getKpiHistory(admin, scope.org.id, selected.id) : [];

    return NextResponse.json({
      ok: true,
      cycle,
      departments,
      kpis,
      selectedKpi: selected,
      history,
      visibility: scope.mode,
      role: scope.role,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load trends";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}