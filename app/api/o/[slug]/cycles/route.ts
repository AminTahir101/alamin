// app/api/o/[slug]/cycles/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };

type CycleRow = {
  id: string;
  org_id: string;
  year: number;
  quarter: number;
  status: string;
  name: string | null;
  starts_on: string | null;
  ends_on: string | null;
  created_by: string | null;
  created_at: string;
};

export async function GET(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();

    const { data, error } = await admin
      .from("quarterly_cycles")
      .select("*")
      .eq("org_id", scope.org.id)
      .order("year", { ascending: false })
      .order("quarter", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      cycles: (data ?? []) as CycleRow[],
      org: scope.org,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load cycles";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);

    if (scope.role !== "owner" && scope.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Only owners and admins can create cycles" }, { status: 403 });
    }

    const admin = supabaseAdmin();
    const body = (await req.json()) as { year?: number; quarter?: number };
    const year = Number(body.year);
    const quarter = Number(body.quarter);

    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ ok: false, error: "Invalid year" }, { status: 400 });
    }
    if (![1, 2, 3, 4].includes(quarter)) {
      return NextResponse.json({ ok: false, error: "Quarter must be 1-4" }, { status: 400 });
    }

    await admin
      .from("quarterly_cycles")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("org_id", scope.org.id)
      .eq("status", "active");

    const startMonth = (quarter - 1) * 3;
    const startsOn = new Date(year, startMonth, 1).toISOString().slice(0, 10);
    const endsOn = new Date(year, startMonth + 3, 0).toISOString().slice(0, 10);

    const { data: newCycle, error: insertErr } = await admin
      .from("quarterly_cycles")
      .insert({
        org_id: scope.org.id,
        year,
        quarter,
        status: "active",
        name: `Q${quarter} ${year}`,
        starts_on: startsOn,
        ends_on: endsOn,
        created_by: scope.userId,
      })
      .select("*")
      .single<CycleRow>();

    if (insertErr) throw new Error(insertErr.message);
    return NextResponse.json({ ok: true, cycle: newCycle });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create cycle";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);

    if (scope.role !== "owner" && scope.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Only owners and admins can update cycles" }, { status: 403 });
    }

    const admin = supabaseAdmin();
    const body = (await req.json()) as { cycleId?: string; status?: string };
    const cycleId = String(body.cycleId ?? "").trim();
    const newStatus = String(body.status ?? "").trim();

    if (!cycleId) return NextResponse.json({ ok: false, error: "cycleId is required" }, { status: 400 });
    if (!["active", "completed", "closed"].includes(newStatus)) {
      return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
    }

    if (newStatus === "active") {
      await admin
        .from("quarterly_cycles")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("org_id", scope.org.id)
        .eq("status", "active");
    }

    const { error } = await admin
      .from("quarterly_cycles")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", cycleId)
      .eq("org_id", scope.org.id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, status: newStatus });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to update cycle";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
