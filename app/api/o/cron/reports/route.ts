import { NextRequest, NextResponse } from "next/server";
import { generateAndStoreReport, isDue, type ReportDefinitionRow } from "@/lib/server/reporting";
import { supabaseAdmin } from "@/lib/server/accessScope";

export const runtime = "nodejs";

function env(name: string) {
  return process.env[name]?.trim() || "";
}

export async function GET(req: NextRequest) {
  try {
    const secret = env("CRON_SECRET");
    const provided = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret") || "";
    if (secret && provided !== secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const admin = supabaseAdmin();
    const defsRes = await admin
      .from("report_definitions")
      .select("*")
      .eq("is_active", true)
      .eq("auto_generate", true)
      .order("created_at", { ascending: true });

    if (defsRes.error) throw new Error(defsRes.error.message);

    const definitions = (defsRes.data ?? []) as ReportDefinitionRow[];
    let processed = 0;
    let generated = 0;
    const errors: string[] = [];

    for (const definition of definitions) {
      processed += 1;
      if (!isDue(definition, definition.last_generated_at)) continue;

      try {
        const orgRes = await admin.from("organizations").select("id,slug,name").eq("id", definition.org_id).single<{ id: string; slug: string; name: string }>();
        if (orgRes.error || !orgRes.data) throw new Error(orgRes.error?.message || `Organization missing for ${definition.id}`);

        await generateAndStoreReport({
          definition,
          scope: {
            org: orgRes.data,
            mode: definition.department_id ? "department" : "org",
            departmentId: definition.department_id,
            userId: definition.created_by ?? "",
          },
          generatedBy: definition.created_by,
        });
        generated += 1;
      } catch (err: unknown) {
        errors.push(err instanceof Error ? err.message : `Failed for ${definition.id}`);
      }
    }

    return NextResponse.json({ ok: true, processed, generated, errors });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to run report cron";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
