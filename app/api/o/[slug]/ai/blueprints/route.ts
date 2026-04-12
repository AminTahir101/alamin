// app/api/o/[slug]/ai/blueprints/route.ts
//
// GET — List all blueprint drafts for the org's active cycle.
// Returns blueprints grouped by department, ready for the review UI.
//
// Used by: app/o/[slug]/ai-setup/page.tsx on mount.

import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

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

type BlueprintRow = {
  id: string;
  org_id: string;
  cycle_id: string | null;
  department_id: string | null;
  blueprint_type: string;
  variant_key: string;
  title: string;
  rationale: string | null;
  source_context: Record<string, unknown>;
  blueprint_payload: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);

    if (!["owner", "admin", "manager", "dept_head"].includes(scope.role)) {
      return NextResponse.json(
        { ok: false, error: "No permission" },
        { status: 403 },
      );
    }

    // Allow ?type=kpi or ?type=okr. Defaults to kpi for backward compat.
    const url = new URL(req.url);
    const requestedType = url.searchParams.get("type")?.trim().toLowerCase();
    const blueprintType =
      requestedType === "okr" || requestedType === "kpi"
        ? requestedType
        : "kpi";

    const admin = supabaseAdmin();

    // Resolve active cycle
    const { data: activeCycle, error: cycleErr } = await admin
      .from("quarterly_cycles")
      .select("id,year,quarter,status")
      .eq("org_id", scope.org.id)
      .eq("status", "active")
      .order("year", { ascending: false })
      .order("quarter", { ascending: false })
      .maybeSingle<CycleRow>();

    if (cycleErr) throw new Error(cycleErr.message);
    if (!activeCycle) {
      return NextResponse.json({
        ok: true,
        cycle: null,
        departments: [],
        blueprintsByDepartment: {},
      });
    }

    // Departments for this org
    const { data: departments, error: depErr } = await admin
      .from("departments")
      .select("id,name")
      .eq("org_id", scope.org.id)
      .order("name", { ascending: true })
      .returns<DepartmentRow[]>();

    if (depErr) throw new Error(depErr.message);

    // All blueprint drafts of the requested type for the active cycle
    const { data: blueprints, error: bpErr } = await admin
      .from("ai_blueprints")
      .select(
        "id,org_id,cycle_id,department_id,blueprint_type,variant_key,title,rationale,source_context,blueprint_payload,status,created_at,updated_at",
      )
      .eq("org_id", scope.org.id)
      .eq("blueprint_type", blueprintType)
      .eq("cycle_id", activeCycle.id)
      .order("department_id", { ascending: true })
      .order("created_at", { ascending: false })
      .returns<BlueprintRow[]>();

    if (bpErr) throw new Error(bpErr.message);

    // Group by department_id
    const blueprintsByDepartment: Record<string, BlueprintRow[]> = {};
    for (const dept of departments ?? []) {
      blueprintsByDepartment[dept.id] = [];
    }
    for (const bp of blueprints ?? []) {
      const key = bp.department_id ?? "unknown";
      if (!blueprintsByDepartment[key]) {
        blueprintsByDepartment[key] = [];
      }
      blueprintsByDepartment[key].push(bp);
    }

    return NextResponse.json({
      ok: true,
      cycle: activeCycle,
      departments: departments ?? [],
      blueprintsByDepartment,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load blueprints",
      },
      { status: 400 },
    );
  }
}
