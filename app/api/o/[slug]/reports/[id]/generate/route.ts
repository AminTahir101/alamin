import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";
import { generateAndStoreReport, type ReportDefinitionRow } from "@/lib/server/reporting";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };

export async function POST(req: NextRequest, ctx: Ctx<{ slug: string; id: string }>) {
  try {
    const { slug, id } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    if (scope.role === "employee") {
      return NextResponse.json({ ok: false, error: "You do not have permission to generate reports" }, { status: 403 });
    }

    const admin = supabaseAdmin();
    const defRes = await admin
      .from("report_definitions")
      .select("*")
      .eq("id", id)
      .eq("org_id", scope.org.id)
      .eq("is_active", true)
      .single<ReportDefinitionRow>();

    if (defRes.error || !defRes.data) throw new Error(defRes.error?.message || "Report definition not found");
    const run = await generateAndStoreReport({ definition: defRes.data, scope, generatedBy: scope.userId });
    return NextResponse.json({ ok: true, run });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to generate report";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
