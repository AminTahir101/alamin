// app/api/o/[slug]/reports/runs/[runId]/route.ts
//
// Fetches a single report_run by ID, returning the full report_payload JSON
// for the in-app report detail view.

import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";
import type { ReportRunRow } from "@/lib/server/reporting";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };

type ReportDefinitionSlim = {
  id: string;
  title: string;
  description: string | null;
  cadence: string;
  department_id: string | null;
};

export async function GET(
  req: NextRequest,
  ctx: Ctx<{ slug: string; runId: string }>,
) {
  try {
    const { slug, runId } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();

    const runRes = await admin
      .from("report_runs")
      .select("*")
      .eq("id", runId)
      .eq("org_id", scope.org.id)
      .maybeSingle<ReportRunRow>();

    if (runRes.error) throw new Error(runRes.error.message);
    if (!runRes.data) {
      return NextResponse.json(
        { ok: false, error: "Report run not found" },
        { status: 404 },
      );
    }

    const run = runRes.data;

    // Also pull the definition so the detail page can show title, cadence, etc.
    const defRes = await admin
      .from("report_definitions")
      .select("id,title,description,cadence,department_id")
      .eq("id", run.report_definition_id)
      .eq("org_id", scope.org.id)
      .maybeSingle<ReportDefinitionSlim>();

    if (defRes.error) throw new Error(defRes.error.message);

    return NextResponse.json({
      ok: true,
      run,
      definition: defRes.data ?? null,
      org: scope.org,
      role: scope.role,
      canManage: scope.role === "owner" || scope.role === "admin",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load report run";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
