// app/api/o/[slug]/ai/blueprints/apply/route.ts
//
// POST — Apply an approved KPI blueprint variant.
//
// Takes a blueprint_id + array of user-edited KPIs (with include flag),
// writes the included KPIs into `kpis`, seeds `kpi_values_history`,
// then marks the blueprint as `applied` with approver attribution.
//
// Body shape:
// {
//   blueprint_id: string,
//   kpis: [{
//     title, description, measurement_type, direction, unit,
//     baseline_value, target_value, current_value, frequency, weight, include
//   }, ...]
// }
//
// Used by: app/o/[slug]/ai-setup/page.tsx when user clicks "Apply selected".

import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

type ApplyKpiInput = {
  title: string;
  description?: string | null;
  measurement_type?: string;
  direction?: "increase" | "decrease";
  unit?: string | null;
  baseline_value?: number | null;
  target_value: number;
  current_value?: number;
  frequency?: string;
  weight?: number;
  include?: boolean;
};

type ApplyBody = {
  blueprint_id?: string;
  kpis?: ApplyKpiInput[];
};

type BlueprintRow = {
  id: string;
  org_id: string;
  cycle_id: string | null;
  department_id: string | null;
  blueprint_type: string;
  variant_key: string;
  status: string;
  blueprint_payload: Record<string, unknown>;
};

type DepartmentRow = { id: string; name: string };

function safeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDirection(value: unknown): "increase" | "decrease" {
  return safeText(value) === "decrease" ? "decrease" : "increase";
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);

    if (!["owner", "admin", "manager", "dept_head"].includes(scope.role)) {
      return NextResponse.json(
        { ok: false, error: "No permission to apply blueprints" },
        { status: 403 },
      );
    }

    const body = (await req.json()) as ApplyBody;
    const blueprintId = safeText(body.blueprint_id);
    const incomingKpis = Array.isArray(body.kpis) ? body.kpis : [];

    if (!blueprintId) {
      return NextResponse.json(
        { ok: false, error: "blueprint_id is required" },
        { status: 400 },
      );
    }

    // Filter only included KPIs
    const kpisToApply = incomingKpis.filter((k) => k.include !== false);

    if (kpisToApply.length === 0) {
      return NextResponse.json(
        { ok: false, error: "At least one KPI must be selected to apply" },
        { status: 400 },
      );
    }

    // Validate each KPI minimally
    for (const kpi of kpisToApply) {
      const title = safeText(kpi.title);
      if (!title) {
        return NextResponse.json(
          { ok: false, error: "Every applied KPI must have a title" },
          { status: 400 },
        );
      }
      if (!Number.isFinite(Number(kpi.target_value))) {
        return NextResponse.json(
          {
            ok: false,
            error: `KPI "${title}" has an invalid target_value`,
          },
          { status: 400 },
        );
      }
    }

    const admin = supabaseAdmin();

    // Load the blueprint
    const { data: blueprint, error: bpErr } = await admin
      .from("ai_blueprints")
      .select(
        "id,org_id,cycle_id,department_id,blueprint_type,variant_key,status,blueprint_payload",
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

    if (blueprint.blueprint_type !== "kpi") {
      return NextResponse.json(
        { ok: false, error: "Only KPI blueprints can be applied here" },
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
        {
          ok: false,
          error: "Blueprint has no cycle attached — cannot apply",
        },
        { status: 400 },
      );
    }

    if (!blueprint.department_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Blueprint has no department attached — cannot apply",
        },
        { status: 400 },
      );
    }

    // Verify department still exists in this org
    const { data: department, error: depErr } = await admin
      .from("departments")
      .select("id,name")
      .eq("id", blueprint.department_id)
      .eq("org_id", scope.org.id)
      .maybeSingle<DepartmentRow>();

    if (depErr) throw new Error(depErr.message);
    if (!department) {
      return NextResponse.json(
        { ok: false, error: "Department for this blueprint no longer exists" },
        { status: 400 },
      );
    }

    // Build KPI rows
    const now = new Date().toISOString();
    const kpiRows = kpisToApply.map((kpi) => {
      const title = safeText(kpi.title);
      const targetValue = safeNumber(kpi.target_value, 0);
      const currentValue = safeNumber(kpi.current_value, 0);
      const baselineValue =
        kpi.baseline_value === null || kpi.baseline_value === undefined
          ? currentValue
          : safeNumber(kpi.baseline_value, currentValue);

      return {
        org_id: scope.org.id,
        cycle_id: blueprint.cycle_id,
        department_id: blueprint.department_id,
        title,
        description: safeText(kpi.description) || null,
        measurement_type: safeText(kpi.measurement_type) || "number",
        direction: normalizeDirection(kpi.direction),
        unit: safeText(kpi.unit) || null,
        baseline_value: baselineValue,
        target_value: targetValue,
        current_value: currentValue,
        frequency: safeText(kpi.frequency) || "monthly",
        weight: safeNumber(kpi.weight, 10),
        source: "ai",
        is_active: true,
        created_by: scope.userId,
        owner_user_id: null, // Owner reassignment is a separate flow
      };
    });

    // Avoid duplicates: skip any KPI whose (title, department, cycle) already exists
    const { data: existingKpis, error: existingErr } = await admin
      .from("kpis")
      .select("title")
      .eq("org_id", scope.org.id)
      .eq("cycle_id", blueprint.cycle_id)
      .eq("department_id", blueprint.department_id)
      .returns<{ title: string }[]>();

    if (existingErr) throw new Error(existingErr.message);

    const existingTitles = new Set(
      (existingKpis ?? []).map((row) => row.title.trim().toLowerCase()),
    );

    const dedupedRows = kpiRows.filter(
      (row) => !existingTitles.has(row.title.toLowerCase()),
    );

    let insertedKpis: Array<{ id: string; title: string }> = [];

    if (dedupedRows.length > 0) {
      const { data: inserted, error: insertErr } = await admin
        .from("kpis")
        .insert(dedupedRows)
        .select("id,title")
        .returns<{ id: string; title: string }[]>();

      if (insertErr) throw new Error(insertErr.message);
      insertedKpis = inserted ?? [];
    }

    // Seed kpi_values_history for the inserted KPIs
    if (insertedKpis.length > 0) {
      const insertedTitleMap = new Map(
        insertedKpis.map((row) => [row.title.toLowerCase(), row.id]),
      );

      const historyRows = dedupedRows
        .map((row) => {
          const kpiId = insertedTitleMap.get(row.title.toLowerCase());
          if (!kpiId) return null;
          return {
            org_id: scope.org.id,
            kpi_id: kpiId,
            cycle_id: blueprint.cycle_id,
            current_value: row.current_value,
            target_value: row.target_value,
            source: "ai",
            notes: "Seeded from approved AI blueprint",
            recorded_by: scope.userId,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (historyRows.length > 0) {
        const { error: histErr } = await admin
          .from("kpi_values_history")
          .insert(historyRows);
        if (histErr) {
          // Non-fatal — log but don't roll back the KPI inserts
          console.error("kpi_values_history seed failed:", histErr.message);
        }
      }
    }

    // Mark blueprint as applied
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
      department: department,
      applied_count: insertedKpis.length,
      skipped_duplicate_count: kpiRows.length - dedupedRows.length,
      kpis: insertedKpis,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to apply blueprint",
      },
      { status: 400 },
    );
  }
}
