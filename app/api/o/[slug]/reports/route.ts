import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";
import { generateAndStoreReport, getActiveCycle, type ReportDefinitionRow, type ReportRunRow } from "@/lib/server/reporting";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };

type CreateBody = {
  title: string;
  description?: string;
  cadence?: ReportDefinitionRow["cadence"];
  custom_label?: string;
  custom_date_from?: string | null;
  custom_date_to?: string | null;
  cycle_id?: string | null;
  department_id?: string | null;
  recipients?: string[];
  export_formats?: string[];
  include_company_summary?: boolean;
  include_department_breakdown?: boolean;
  include_objectives?: boolean;
  include_okrs?: boolean;
  include_kpis?: boolean;
  include_tasks?: boolean;
  auto_generate?: boolean;
  auto_email?: boolean;
};

const CADENCES = new Set(["weekly", "bi_weekly", "monthly", "quarterly", "bi_annual", "annual", "custom"]);

function normalizeCadence(value?: string | null): ReportDefinitionRow["cadence"] {
  const clean = String(value ?? "monthly").trim().toLowerCase();
  return CADENCES.has(clean) ? (clean as ReportDefinitionRow["cadence"]) : "monthly";
}

function cleanEmailList(values?: string[]) {
  return Array.from(new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean)));
}

export async function GET(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();

    const [cycle, definitionsRes, runsRes, departmentsRes] = await Promise.all([
      getActiveCycle(admin, scope.org.id),
      admin
        .from("report_definitions")
        .select("*")
        .eq("org_id", scope.org.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      admin
        .from("report_runs")
        .select("*")
        .eq("org_id", scope.org.id)
        .order("generated_at", { ascending: false })
        .limit(40),
      admin
        .from("departments")
        .select("id,name")
        .eq("org_id", scope.org.id)
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

    if (definitionsRes.error) throw new Error(definitionsRes.error.message);
    if (runsRes.error) throw new Error(runsRes.error.message);
    if (departmentsRes.error) throw new Error(departmentsRes.error.message);

    return NextResponse.json({
      ok: true,
      cycle,
      definitions: (definitionsRes.data ?? []) as ReportDefinitionRow[],
      runs: (runsRes.data ?? []) as ReportRunRow[],
      departments: departmentsRes.data ?? [],
      role: scope.role,
      visibility: scope.mode,
      canManage: scope.role !== "employee",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load reports";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    if (scope.role === "employee") {
      return NextResponse.json({ ok: false, error: "You do not have permission to create reports" }, { status: 403 });
    }

    const admin = supabaseAdmin();
    const body = (await req.json()) as CreateBody;
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ ok: false, error: "Report title is required" }, { status: 400 });

    const cadence = normalizeCadence(body.cadence);
    const activeCycle = await getActiveCycle(admin, scope.org.id);

    const insertPayload = {
      org_id: scope.org.id,
      cycle_id: body.cycle_id ? String(body.cycle_id).trim() : activeCycle?.id ?? null,
      department_id: body.department_id ? String(body.department_id).trim() : null,
      title,
      description: String(body.description ?? "").trim() || null,
      cadence,
      custom_label: String(body.custom_label ?? "").trim() || null,
      custom_date_from: body.custom_date_from ? String(body.custom_date_from).trim() : null,
      custom_date_to: body.custom_date_to ? String(body.custom_date_to).trim() : null,
      recipients: cleanEmailList(body.recipients),
      export_formats: Array.isArray(body.export_formats) && body.export_formats.length ? body.export_formats : ["json", "csv"],
      include_company_summary: body.include_company_summary ?? true,
      include_department_breakdown: body.include_department_breakdown ?? true,
      include_objectives: body.include_objectives ?? true,
      include_okrs: body.include_okrs ?? true,
      include_kpis: body.include_kpis ?? true,
      include_tasks: body.include_tasks ?? true,
      auto_generate: body.auto_generate ?? true,
      auto_email: body.auto_email ?? true,
      filters: {},
      created_by: scope.userId,
      updated_at: new Date().toISOString(),
    };

    const createdRes = await admin.from("report_definitions").insert(insertPayload).select("*").single<ReportDefinitionRow>();
    if (createdRes.error || !createdRes.data) throw new Error(createdRes.error?.message || "Failed to create report definition");

    let run: ReportRunRow | null = null;
    if (createdRes.data.auto_generate) {
      run = await generateAndStoreReport({ definition: createdRes.data, scope, generatedBy: scope.userId });
    }

    return NextResponse.json({ ok: true, definition: createdRes.data, run });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create report";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
