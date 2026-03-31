import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";
import type { ReportDefinitionRow } from "@/lib/server/reporting";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };

type UpdateBody = Partial<{
  title: string;
  description: string;
  cadence: ReportDefinitionRow["cadence"];
  custom_label: string;
  custom_date_from: string | null;
  custom_date_to: string | null;
  cycle_id: string | null;
  department_id: string | null;
  recipients: string[];
  export_formats: string[];
  include_company_summary: boolean;
  include_department_breakdown: boolean;
  include_objectives: boolean;
  include_okrs: boolean;
  include_kpis: boolean;
  include_tasks: boolean;
  auto_generate: boolean;
  auto_email: boolean;
  is_active: boolean;
}>;

export async function PATCH(req: NextRequest, ctx: Ctx<{ slug: string; id: string }>) {
  try {
    const { slug, id } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    if (scope.role === "employee") {
      return NextResponse.json({ ok: false, error: "You do not have permission to update reports" }, { status: 403 });
    }

    const body = (await req.json()) as UpdateBody;
    const admin = supabaseAdmin();

    const payload = {
      ...(body.title !== undefined ? { title: String(body.title).trim() } : {}),
      ...(body.description !== undefined ? { description: String(body.description).trim() || null } : {}),
      ...(body.cadence !== undefined ? { cadence: body.cadence } : {}),
      ...(body.custom_label !== undefined ? { custom_label: String(body.custom_label).trim() || null } : {}),
      ...(body.custom_date_from !== undefined ? { custom_date_from: body.custom_date_from || null } : {}),
      ...(body.custom_date_to !== undefined ? { custom_date_to: body.custom_date_to || null } : {}),
      ...(body.cycle_id !== undefined ? { cycle_id: body.cycle_id || null } : {}),
      ...(body.department_id !== undefined ? { department_id: body.department_id || null } : {}),
      ...(body.recipients !== undefined ? { recipients: body.recipients.map((v) => String(v).trim()).filter(Boolean) } : {}),
      ...(body.export_formats !== undefined ? { export_formats: body.export_formats } : {}),
      ...(body.include_company_summary !== undefined ? { include_company_summary: body.include_company_summary } : {}),
      ...(body.include_department_breakdown !== undefined ? { include_department_breakdown: body.include_department_breakdown } : {}),
      ...(body.include_objectives !== undefined ? { include_objectives: body.include_objectives } : {}),
      ...(body.include_okrs !== undefined ? { include_okrs: body.include_okrs } : {}),
      ...(body.include_kpis !== undefined ? { include_kpis: body.include_kpis } : {}),
      ...(body.include_tasks !== undefined ? { include_tasks: body.include_tasks } : {}),
      ...(body.auto_generate !== undefined ? { auto_generate: body.auto_generate } : {}),
      ...(body.auto_email !== undefined ? { auto_email: body.auto_email } : {}),
      ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await admin
      .from("report_definitions")
      .update(payload)
      .eq("id", id)
      .eq("org_id", scope.org.id)
      .select("*")
      .single<ReportDefinitionRow>();

    if (error || !data) throw new Error(error?.message || "Failed to update report");
    return NextResponse.json({ ok: true, definition: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to update report";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx<{ slug: string; id: string }>) {
  try {
    const { slug, id } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    if (scope.role === "employee") {
      return NextResponse.json({ ok: false, error: "You do not have permission to delete reports" }, { status: 403 });
    }

    const admin = supabaseAdmin();
    const { error } = await admin.from("report_definitions").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id).eq("org_id", scope.org.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to delete report";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
