import { NextRequest, NextResponse } from "next/server";
import {
  getEntitlementsForOrg,
  orgHasFeature,
  requireOrgMembership,
  requireUserFromBearer,
  supabaseAdmin,
} from "@/lib/server/entitlements";
import { isFeatureKey, type FeatureKey } from "@/lib/billing/features";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };

export async function GET(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const user = await requireUserFromBearer(req.headers.get("authorization"));
    const admin = supabaseAdmin();
    const org = await requireOrgMembership(admin, user.id, slug);

    const rawFeature = String(req.nextUrl.searchParams.get("feature") ?? "").trim();
    const requestedFeature: FeatureKey | "" = isFeatureKey(rawFeature) ? rawFeature : "";

    const entitlements = await getEntitlementsForOrg(admin, org.id);

    return NextResponse.json({
      ok: true,
      org: {
        id: org.id,
        slug: org.slug,
        name: org.name,
      },
      plan: entitlements.plan,
      features: entitlements.features,
      featureMap: entitlements.featureMap,
      allowed: requestedFeature
        ? await orgHasFeature(admin, org.id, requestedFeature)
        : undefined,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load entitlements";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}