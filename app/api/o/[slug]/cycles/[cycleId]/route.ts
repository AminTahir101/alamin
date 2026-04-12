// app/api/o/[slug]/cycles/[cycleId]/route.ts
//
// PATCH — Update a cycle's start/end dates
// POST  — Activate this cycle (and close any other active cycles)

import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string; cycleId: string }> };

type CycleRow = {
  id: string;
  org_id: string;
  year: number;
  quarter: number;
  starts_on: string | null;
  ends_on: string | null;
  status: string;
  name: string | null;
};

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { slug, cycleId } = await ctx.params;
    const scope = await requireAccessScope(req, slug);

    if (!["owner", "admin"].includes(scope.role)) {
      return NextResponse.json(
        { ok: false, error: "Only owner or admin can edit cycles" },
        { status: 403 },
      );
    }

    const body = (await req.json()) as {
      starts_on?: string;
      ends_on?: string;
    };

    const startsOn = body.starts_on?.trim();
    const endsOn = body.ends_on?.trim();

    if (!startsOn && !endsOn) {
      return NextResponse.json(
        { ok: false, error: "Provide starts_on or ends_on" },
        { status: 400 },
      );
    }

    // Date validation
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (startsOn && !dateRe.test(startsOn)) {
      return NextResponse.json(
        { ok: false, error: "starts_on must be YYYY-MM-DD" },
        { status: 400 },
      );
    }
    if (endsOn && !dateRe.test(endsOn)) {
      return NextResponse.json(
        { ok: false, error: "ends_on must be YYYY-MM-DD" },
        { status: 400 },
      );
    }
    if (startsOn && endsOn && startsOn >= endsOn) {
      return NextResponse.json(
        { ok: false, error: "starts_on must be before ends_on" },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();

    // Verify cycle belongs to this org
    const { data: cycle, error: cycleErr } = await admin
      .from("quarterly_cycles")
      .select("id,org_id")
      .eq("id", cycleId)
      .eq("org_id", scope.org.id)
      .maybeSingle<{ id: string; org_id: string }>();

    if (cycleErr) throw new Error(cycleErr.message);
    if (!cycle) {
      return NextResponse.json(
        { ok: false, error: "Cycle not found" },
        { status: 404 },
      );
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (startsOn) updates.starts_on = startsOn;
    if (endsOn) updates.ends_on = endsOn;

    const { data: updated, error: updateErr } = await admin
      .from("quarterly_cycles")
      .update(updates)
      .eq("id", cycleId)
      .select(
        "id,org_id,year,quarter,starts_on,ends_on,status,name",
      )
      .single<CycleRow>();

    if (updateErr || !updated) {
      throw new Error(updateErr?.message || "Failed to update cycle");
    }

    return NextResponse.json({
      ok: true,
      cycle: updated,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to update cycle",
      },
      { status: 400 },
    );
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  // Activate this cycle
  try {
    const { slug, cycleId } = await ctx.params;
    const scope = await requireAccessScope(req, slug);

    if (!["owner", "admin"].includes(scope.role)) {
      return NextResponse.json(
        { ok: false, error: "Only owner or admin can activate cycles" },
        { status: 403 },
      );
    }

    const admin = supabaseAdmin();

    // Verify the cycle belongs to this org
    const { data: target, error: targetErr } = await admin
      .from("quarterly_cycles")
      .select("id,org_id,status")
      .eq("id", cycleId)
      .eq("org_id", scope.org.id)
      .maybeSingle<{ id: string; org_id: string; status: string }>();

    if (targetErr) throw new Error(targetErr.message);
    if (!target) {
      return NextResponse.json(
        { ok: false, error: "Cycle not found" },
        { status: 404 },
      );
    }

    if (target.status === "active") {
      return NextResponse.json(
        { ok: false, error: "This cycle is already active" },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();

    // Close all other active cycles for this org
    const { error: closeErr } = await admin
      .from("quarterly_cycles")
      .update({ status: "closed", updated_at: now })
      .eq("org_id", scope.org.id)
      .eq("status", "active");

    if (closeErr) throw new Error(closeErr.message);

    // Activate this cycle
    const { data: activated, error: activateErr } = await admin
      .from("quarterly_cycles")
      .update({ status: "active", updated_at: now })
      .eq("id", cycleId)
      .select(
        "id,org_id,year,quarter,starts_on,ends_on,status,name",
      )
      .single<CycleRow>();

    if (activateErr || !activated) {
      throw new Error(activateErr?.message || "Failed to activate cycle");
    }

    return NextResponse.json({
      ok: true,
      cycle: activated,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to activate cycle",
      },
      { status: 400 },
    );
  }
}
