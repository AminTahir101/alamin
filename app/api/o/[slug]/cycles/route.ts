// app/api/o/[slug]/cycles/route.ts
//
// GET — List all cycles for the org (active first)
// POST — Create a new cycle. Optionally activate it (deactivates others).

import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

type CycleRow = {
  id: string;
  org_id: string;
  year: number;
  quarter: number;
  starts_on: string | null;
  ends_on: string | null;
  status: string;
  name: string | null;
  created_at: string;
};

function quarterDates(year: number, quarter: number) {
  const q = Math.max(1, Math.min(4, quarter));
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0));
  const toDate = (d: Date) => d.toISOString().slice(0, 10);
  return {
    starts_on: toDate(start),
    ends_on: toDate(end),
    name: `Q${q} ${year}`,
  };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);

    if (!["owner", "admin", "manager"].includes(scope.role)) {
      return NextResponse.json(
        { ok: false, error: "No permission" },
        { status: 403 },
      );
    }

    const admin = supabaseAdmin();

    const { data, error } = await admin
      .from("quarterly_cycles")
      .select(
        "id,org_id,year,quarter,starts_on,ends_on,status,name,created_at",
      )
      .eq("org_id", scope.org.id)
      .order("year", { ascending: false })
      .order("quarter", { ascending: false })
      .returns<CycleRow[]>();

    if (error) throw new Error(error.message);

    const cycles = data ?? [];
    const activeCycle = cycles.find((c) => c.status === "active") ?? null;

    return NextResponse.json({
      ok: true,
      cycles,
      activeCycle,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to load cycles",
      },
      { status: 400 },
    );
  }
}

type CreateBody = {
  year?: number;
  quarter?: number;
  activate?: boolean;
  starts_on?: string;
  ends_on?: string;
};

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);

    if (!["owner", "admin"].includes(scope.role)) {
      return NextResponse.json(
        { ok: false, error: "Only owner or admin can create cycles" },
        { status: 403 },
      );
    }

    const body = (await req.json()) as CreateBody;
    const year = Number(body.year);
    const quarter = Number(body.quarter);
    const activate = body.activate !== false; // default true

    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { ok: false, error: "year is invalid" },
        { status: 400 },
      );
    }
    if (![1, 2, 3, 4].includes(quarter)) {
      return NextResponse.json(
        { ok: false, error: "quarter must be 1 to 4" },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();

    // Check if cycle for that year/quarter already exists
    const { data: existing, error: existingErr } = await admin
      .from("quarterly_cycles")
      .select("id,year,quarter,status")
      .eq("org_id", scope.org.id)
      .eq("year", year)
      .eq("quarter", quarter)
      .maybeSingle<{ id: string; year: number; quarter: number; status: string }>();

    if (existingErr) throw new Error(existingErr.message);

    if (existing) {
      return NextResponse.json(
        {
          ok: false,
          error: `Cycle Q${quarter} ${year} already exists`,
          cycle: existing,
        },
        { status: 409 },
      );
    }

    const dates = quarterDates(year, quarter);
    const startsOn = body.starts_on?.trim() || dates.starts_on;
    const endsOn = body.ends_on?.trim() || dates.ends_on;

    // If activating, set all other cycles to closed first
    if (activate) {
      const { error: closeErr } = await admin
        .from("quarterly_cycles")
        .update({ status: "closed", updated_at: new Date().toISOString() })
        .eq("org_id", scope.org.id)
        .eq("status", "active");

      if (closeErr) throw new Error(closeErr.message);
    }

    const { data: inserted, error: insertErr } = await admin
      .from("quarterly_cycles")
      .insert({
        org_id: scope.org.id,
        year,
        quarter,
        starts_on: startsOn,
        ends_on: endsOn,
        name: dates.name,
        status: activate ? "active" : "draft",
        created_by: scope.userId,
      })
      .select(
        "id,org_id,year,quarter,starts_on,ends_on,status,name,created_at",
      )
      .single<CycleRow>();

    if (insertErr || !inserted) {
      throw new Error(insertErr?.message || "Failed to create cycle");
    }

    return NextResponse.json({
      ok: true,
      cycle: inserted,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to create cycle",
      },
      { status: 400 },
    );
  }
}
