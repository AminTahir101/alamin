import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, requireAdminUserFromBearer, normalizeSlug } from "@/lib/server/adminAccess";
import { inviteOrAddMember } from "@/lib/server/invites";
import type { PlanCode } from "@/lib/billing/features";

export const runtime = "nodejs";

type OrganizationListRow = {
  id: string;
  slug: string;
  name: string;
  created_at?: string | null;
};

type SubscriptionRow = {
  org_id: string;
  plan_code: PlanCode | null;
  status: string | null;
  seats: number | null;
  starts_at?: string | null;
  updated_at?: string | null;
};

type CreateBody = {
  name: string;
  slug?: string;
  ownerEmail?: string;
  planCode?: PlanCode;
  seats?: number;
  country?: string;
};

export async function GET(req: NextRequest) {
  try {
    await requireAdminUserFromBearer(req.headers.get("authorization"));
    const admin = supabaseAdmin();

    const { data: orgs, error: orgsError } = await admin
      .from("organizations")
      .select("id,slug,name,created_at")
      .order("created_at", { ascending: false });

    if (orgsError) {
      throw new Error(orgsError.message);
    }

    const { data: subs, error: subsError } = await admin
      .from("organization_subscriptions")
      .select("org_id,plan_code,status,seats,starts_at,updated_at")
      .order("created_at", { ascending: false });

    if (subsError) {
      throw new Error(subsError.message);
    }

    const latestByOrg = new Map<string, SubscriptionRow>();

    for (const sub of (subs ?? []) as SubscriptionRow[]) {
      if (!latestByOrg.has(sub.org_id)) {
        latestByOrg.set(sub.org_id, sub);
      }
    }

    const rows = ((orgs ?? []) as OrganizationListRow[]).map((org) => {
      const sub = latestByOrg.get(org.id);

      return {
        id: org.id,
        slug: org.slug,
        name: org.name,
        createdAt: org.created_at ?? null,
        planCode: sub?.plan_code ?? "core",
        status: sub?.status ?? "inactive",
        seats: sub?.seats ?? 0,
        startsAt: sub?.starts_at ?? null,
        updatedAt: sub?.updated_at ?? null,
      };
    });

    return NextResponse.json({
      ok: true,
      organizations: rows,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load organizations";
    const status = msg === "Forbidden" ? 403 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminUser = await requireAdminUserFromBearer(req.headers.get("authorization"));
    const admin = supabaseAdmin();
    const body = (await req.json()) as CreateBody;

    const name = String(body.name ?? "").trim();
    const slug = normalizeSlug(String(body.slug ?? name));
    const ownerEmail = String(body.ownerEmail ?? "").trim().toLowerCase();
    const planCode = (body.planCode ?? "core") as PlanCode;
    const seats = Number(body.seats ?? 25);
    const country = String(body.country ?? "Saudi Arabia").trim() || "Saudi Arabia";

    if (!name) {
      return NextResponse.json({ ok: false, error: "Organization name is required" }, { status: 400 });
    }

    if (!slug) {
      return NextResponse.json({ ok: false, error: "Valid organization slug is required" }, { status: 400 });
    }

    if (!["core", "growth", "enterprise"].includes(planCode)) {
      return NextResponse.json({ ok: false, error: "Invalid plan code" }, { status: 400 });
    }

    if (!Number.isFinite(seats) || seats <= 0) {
      return NextResponse.json({ ok: false, error: "Seats must be greater than 0" }, { status: 400 });
    }

    const { data: existingOrg, error: existingOrgError } = await admin
      .from("organizations")
      .select("id,slug")
      .eq("slug", slug)
      .maybeSingle<{ id: string; slug: string }>();

    if (existingOrgError) {
      throw new Error(existingOrgError.message);
    }

    if (existingOrg) {
      return NextResponse.json({ ok: false, error: "Organization slug already exists" }, { status: 409 });
    }

    // Step 1: Create the organization.
    const { data: createdOrg, error: createOrgError } = await admin
      .from("organizations")
      .insert({
        name,
        slug,
        created_by: adminUser.id,
        settings: {},
        country,
      })
      .select("id,name,slug")
      .single<{ id: string; name: string; slug: string }>();

    if (createOrgError || !createdOrg) {
      throw new Error(createOrgError?.message || "Failed to create organization");
    }

    // Step 2: If an owner email was provided, invite them OR add an existing
    // user as the owner. Uses the canonical shared helper so metadata +
    // redirectTo are consistent with settings and onboarding invite flows.
    let ownerUserId: string | null = null;

    if (ownerEmail) {
      const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
      const outcome = await inviteOrAddMember(
        admin,
        {
          email: ownerEmail,
          role: "owner",
          departmentId: null,
        },
        {
          orgId: createdOrg.id,
          orgSlug: createdOrg.slug,
          orgName: createdOrg.name,
          invitedBy: adminUser.id,
          redirectTo: `${appBaseUrl}/accept-invite`,
        },
      );

      if (outcome.status === "failed") {
        // Roll back the org so we don't leave orphan rows around.
        await admin.from("organizations").delete().eq("id", createdOrg.id);
        throw new Error(outcome.error);
      }

      ownerUserId = outcome.user_id;
    }

    const { error: subError } = await admin
      .from("organization_subscriptions")
      .insert({
        org_id: createdOrg.id,
        plan_code: planCode,
        status: "active",
        seats,
        starts_at: new Date().toISOString(),
      });

    if (subError) {
      throw new Error(subError.message);
    }

    return NextResponse.json({
      ok: true,
      organization: createdOrg,
      invitedOwnerEmail: ownerEmail || null,
      ownerUserId,
      message: ownerEmail
        ? "Organization created and owner invite processed"
        : "Organization created successfully",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create organization";
    const status = msg === "Forbidden" ? 403 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}