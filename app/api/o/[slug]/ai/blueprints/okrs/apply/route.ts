// app/api/o/[slug]/ai/blueprints/okrs/apply/route.ts
//
// POST — Apply an approved OKR blueprint.
//
// Takes: blueprint_id + (optionally) user-edited structure
// Does: writes to objectives + okrs + key_results in the correct order,
//       resolves KPI links by title matching,
//       marks the blueprint as applied.

import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

type ApplyKeyResult = {
  title: string;
  why_recommended?: string;
  metric_name?: string;
  metric_type?: string;
  unit?: string | null;
  start_value?: number;
  current_value?: number;
  target_value: number;
  link_to_kpi_title?: string | null;
  include?: boolean;
};

type ApplyOkr = {
  title: string;
  rationale?: string;
  key_results: ApplyKeyResult[];
};

type ApplyObjective = {
  title: string;
  description?: string;
  rationale?: string;
  okrs: ApplyOkr[];
};

type ApplyBody = {
  blueprint_id?: string;
  objective?: ApplyObjective;
};

type BlueprintRow = {
  id: string;
  org_id: string;
  cycle_id: string | null;
  department_id: string | null;
  blueprint_type: string;
  status: string;
  blueprint_payload: ApplyObjective;
};

type KpiRow = {
  id: string;
  title: string;
};

function safeText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);

    if (!["owner", "admin", "manager", "dept_head"].includes(scope.role)) {
      return NextResponse.json(
        { ok: false, error: "No permission to apply OKR blueprints" },
        { status: 403 },
      );
    }

    const body = (await req.json()) as ApplyBody;
    const blueprintId = safeText(body.blueprint_id);
    if (!blueprintId) {
      return NextResponse.json(
        { ok: false, error: "blueprint_id is required" },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();

    // Load blueprint
    const { data: blueprint, error: bpErr } = await admin
      .from("ai_blueprints")
      .select(
        "id,org_id,cycle_id,department_id,blueprint_type,status,blueprint_payload",
      )
      .eq("id", blueprintId)
      .eq("org_id", scope.org.id)
      .maybeSingle<BlueprintRow>();

    if (bpErr) throw new Error(bpErr.message);
    if (!blueprint) {
      return NextResponse.json(
        { ok: false, error: "Blueprint not found" },
        { status: 404 },
      );
    }
    if (blueprint.blueprint_type !== "okr") {
      return NextResponse.json(
        { ok: false, error: "Not an OKR blueprint" },
        { status: 400 },
      );
    }
    if (blueprint.status === "applied") {
      return NextResponse.json(
        { ok: false, error: "This blueprint has already been applied" },
        { status: 409 },
      );
    }
    if (!blueprint.cycle_id) {
      return NextResponse.json(
        { ok: false, error: "Blueprint has no cycle attached" },
        { status: 400 },
      );
    }
    if (!blueprint.department_id) {
      return NextResponse.json(
        { ok: false, error: "Blueprint has no department attached" },
        { status: 400 },
      );
    }

    // Use user-edited objective if provided, otherwise the stored payload
    const objective: ApplyObjective = body.objective ?? blueprint.blueprint_payload;

    const objectiveTitle = safeText(objective.title);
    if (!objectiveTitle) {
      return NextResponse.json(
        { ok: false, error: "Objective title is required" },
        { status: 400 },
      );
    }

    if (!Array.isArray(objective.okrs) || objective.okrs.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Objective must have at least one OKR" },
        { status: 400 },
      );
    }

    // Load applied KPIs to resolve link_to_kpi_title → kpi_id
    const { data: allKpis, error: kpisErr } = await admin
      .from("kpis")
      .select("id,title")
      .eq("org_id", scope.org.id)
      .eq("department_id", blueprint.department_id)
      .eq("cycle_id", blueprint.cycle_id)
      .eq("is_active", true)
      .returns<KpiRow[]>();

    if (kpisErr) throw new Error(kpisErr.message);

    const kpiTitleMap = new Map<string, string>(
      (allKpis ?? []).map((k) => [k.title.trim().toLowerCase(), k.id]),
    );

    const now = new Date().toISOString();
    const createdIds: {
      objectiveId?: string;
      okrIds: string[];
      keyResultCount: number;
    } = { okrIds: [], keyResultCount: 0 };

    // ─── 1. Insert the objective ───────────────────────────────────────────
    const { data: insertedObjective, error: insertObjErr } = await admin
      .from("objectives")
      .insert({
        org_id: scope.org.id,
        cycle_id: blueprint.cycle_id,
        department_id: blueprint.department_id,
        title: objectiveTitle,
        description: safeText(objective.description) || null,
        status: "active",
        progress: 0,
        source: "ai",
        created_by: scope.userId,
      })
      .select("id")
      .single<{ id: string }>();

    if (insertObjErr || !insertedObjective) {
      throw new Error(insertObjErr?.message || "Failed to insert objective");
    }
    createdIds.objectiveId = insertedObjective.id;

    // ─── 2. For each OKR, insert the OKR then its Key Results ──────────────
    for (const okr of objective.okrs) {
      const okrTitle = safeText(okr.title);
      if (!okrTitle) continue;

      const { data: insertedOkr, error: insertOkrErr } = await admin
        .from("okrs")
        .insert({
          org_id: scope.org.id,
          cycle_id: blueprint.cycle_id,
          department_id: blueprint.department_id,
          objective_id: insertedObjective.id,
          title: okrTitle,
          description: safeText(okr.rationale) || null,
          status: "active",
          progress: 0,
          source: "ai",
          created_by: scope.userId,
        })
        .select("id")
        .single<{ id: string }>();

      if (insertOkrErr || !insertedOkr) {
        throw new Error(
          insertOkrErr?.message || "Failed to insert OKR",
        );
      }
      createdIds.okrIds.push(insertedOkr.id);

      // Filter KRs by include flag (default to include)
      const kpisToApply = (okr.key_results ?? []).filter(
        (kr) => kr.include !== false,
      );

      if (kpisToApply.length === 0) continue;

      const krRows = kpisToApply
        .map((kr, index) => {
          const title = safeText(kr.title);
          if (!title) return null;

          // Resolve KPI link by title matching
          const linkTitle = safeText(kr.link_to_kpi_title);
          const linkedKpiId = linkTitle
            ? kpiTitleMap.get(linkTitle.toLowerCase()) ?? null
            : null;

          return {
            org_id: scope.org.id,
            cycle_id: blueprint.cycle_id,
            okr_id: insertedOkr.id,
            objective_id: insertedObjective.id,
            department_id: blueprint.department_id,
            title,
            metric_name: safeText(kr.metric_name) || title,
            metric_type: safeText(kr.metric_type) || "number",
            unit: safeText(kr.unit) || null,
            start_value: safeNumber(kr.start_value, 0),
            current_value: safeNumber(kr.current_value, 0),
            target_value: safeNumber(kr.target_value, 100),
            status: "not_started",
            progress: 0,
            owner_user_id: null,
            kpi_id: linkedKpiId,
            position: index,
            source: "ai",
            created_by: scope.userId,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (krRows.length > 0) {
        const { error: krErr } = await admin
          .from("key_results")
          .insert(krRows);

        if (krErr) {
          throw new Error(`Failed to insert key results: ${krErr.message}`);
        }
        createdIds.keyResultCount += krRows.length;
      }
    }

    // ─── 3. Mark blueprint as applied ──────────────────────────────────────
    const { error: updateErr } = await admin
      .from("ai_blueprints")
      .update({
        status: "applied",
        approved_by: scope.userId,
        approved_at: now,
        updated_at: now,
      })
      .eq("id", blueprint.id);

    if (updateErr) throw new Error(updateErr.message);

    return NextResponse.json({
      ok: true,
      blueprint_id: blueprint.id,
      objective_id: createdIds.objectiveId,
      okr_count: createdIds.okrIds.length,
      key_result_count: createdIds.keyResultCount,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to apply OKR blueprint",
      },
      { status: 400 },
    );
  }
}
