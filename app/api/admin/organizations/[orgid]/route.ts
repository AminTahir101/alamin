import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, requireAdminUserFromBearer } from "@/lib/server/adminAccess";
import type { PlanCode } from "@/lib/billing/features";

export const runtime = "nodejs";

type UpdateBody = {
  planCode?: PlanCode;
  status?: "active" | "trialing" | "inactive" | "cancelled" | "past_due";
  seats?: number;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function extractOrgId(req: NextRequest) {
  const parts = req.nextUrl.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminUserFromBearer(req.headers.get("authorization"));
    const admin = supabaseAdmin();

    const orgId = extractOrgId(req);

    if (!orgId || orgId === "undefined" || !isUuid(orgId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid organization id",
          debug: {
            pathname: req.nextUrl.pathname,
            extractedOrgId: orgId,
          },
        },
        { status: 400 }
      );
    }

    const body = (await req.json()) as UpdateBody;

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.planCode !== undefined) {
      if (!["core", "growth", "enterprise"].includes(body.planCode)) {
        return NextResponse.json({ ok: false, error: "Invalid plan code" }, { status: 400 });
      }
      patch.plan_code = body.planCode;
    }

    if (body.status !== undefined) {
      if (!["active", "trialing", "inactive", "cancelled", "past_due"].includes(body.status)) {
        return NextResponse.json({ ok: false, error: "Invalid subscription status" }, { status: 400 });
      }
      patch.status = body.status;
    }

    if (body.seats !== undefined) {
      const seats = Number(body.seats);
      if (!Number.isFinite(seats) || seats <= 0) {
        return NextResponse.json({ ok: false, error: "Seats must be greater than 0" }, { status: 400 });
      }
      patch.seats = seats;
    }

    const { data: existingSub, error: existingSubError } = await admin
      .from("organization_subscriptions")
      .select("id")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (existingSubError) {
      throw new Error(existingSubError.message);
    }

    if (!existingSub) {
      const { error: insertError } = await admin.from("organization_subscriptions").insert({
        org_id: orgId,
        plan_code: (body.planCode ?? "core") as PlanCode,
        status: body.status ?? "active",
        seats: Number(body.seats ?? 25),
        starts_at: new Date().toISOString(),
      });

      if (insertError) {
        throw new Error(insertError.message);
      }

      return NextResponse.json({ ok: true, message: "Subscription created" });
    }

    const { error: updateError } = await admin
      .from("organization_subscriptions")
      .update(patch)
      .eq("id", existingSub.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({ ok: true, message: "Subscription updated" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to update organization";
    const status = msg === "Forbidden" ? 403 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}