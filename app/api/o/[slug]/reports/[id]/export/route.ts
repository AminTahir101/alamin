import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";
import { reportPayloadToCsv } from "@/lib/server/reporting";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };

type RunRow = {
  id: string;
  report_payload: Record<string, unknown>;
  period_label: string;
  exported_formats: string[] | null;
};

export async function GET(req: NextRequest, ctx: Ctx<{ slug: string; id: string }>) {
  try {
    const { slug, id } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const format = String(req.nextUrl.searchParams.get("format") ?? "json").toLowerCase();
    const runId = String(req.nextUrl.searchParams.get("runId") ?? "").trim();
    const admin = supabaseAdmin();

    let query = admin
      .from("report_runs")
      .select("id,report_payload,period_label,exported_formats")
      .eq("org_id", scope.org.id)
      .eq("report_definition_id", id)
      .order("generated_at", { ascending: false })
      .limit(1);

    if (runId) query = query.eq("id", runId);

    const { data, error } = await query.maybeSingle<RunRow>();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("No report run found to export");

    const exportedFormats = Array.from(new Set([...(data.exported_formats ?? []), format]));
    await admin.from("report_runs").update({ exported_formats: exportedFormats }).eq("id", data.id);

    if (format === "csv") {
      const csv = reportPayloadToCsv(data.report_payload);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="report-${id}-${data.id}.csv"`,
        },
      });
    }

    return new NextResponse(JSON.stringify(data.report_payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="report-${id}-${data.id}.json"`,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to export report";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
