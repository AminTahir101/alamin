import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, requireAdminUserFromBearer } from "@/lib/server/adminAccess";
import { ALL_FEATURE_KEYS, isFeatureKey } from "@/lib/billing/features";

export const runtime = "nodejs";

type OverrideBody = {
  featureCode: string;
  isEnabled: boolean;
  limitValue?: number | null;
  reason?: string | null;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function extractOrgId(req: NextRequest) {
  const parts = req.nextUrl.pathname.split("/").filter(Boolean);
  const orgIndex = parts.findIndex((part) => part === "organizations");

  if (orgIndex === -1) return "";
  return parts[orgIndex + 1] ?? "";
}

export async function GET(req: NextRequest) {
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

    const { data, error } = await admin
      .from("organization_feature_overrides")
      .select("id,feature_code,is_enabled,limit_value,reason,updated_at")
      .eq("org_id", orgId)
      .order("feature_code", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      ok: true,
      features: ALL_FEATURE_KEYS,
      overrides: data ?? [],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load overrides";
    const status = msg === "Forbidden" ? 403 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const adminUser = await requireAdminUserFromBearer(req.headers.get("authorization"));
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

    const body = (await req.json()) as OverrideBody;
    const featureCode = String(body.featureCode ?? "").trim();

    if (!isFeatureKey(featureCode)) {
      return NextResponse.json({ ok: false, error: "Invalid feature code" }, { status: 400 });
    }

    const limitValue =
      body.limitValue === null || body.limitValue === undefined ? null : Number(body.limitValue);

    if (limitValue !== null && (!Number.isFinite(limitValue) || limitValue < 0)) {
      return NextResponse.json({ ok: false, error: "Invalid limit value" }, { status: 400 });
    }

    const { error } = await admin.from("organization_feature_overrides").upsert(
      {
        org_id: orgId,
        feature_code: featureCode,
        is_enabled: body.isEnabled === true,
        limit_value: limitValue,
        reason: body.reason ?? null,
        created_by: adminUser.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,feature_code" }
    );

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true, message: "Feature override saved" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to save override";
    const status = msg === "Forbidden" ? 403 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function DELETE(req: NextRequest) {
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

    const url = new URL(req.url);
    const featureCode = String(url.searchParams.get("featureCode") ?? "").trim();

    if (!isFeatureKey(featureCode)) {
      return NextResponse.json({ ok: false, error: "Invalid feature code" }, { status: 400 });
    }

    const { error } = await admin
      .from("organization_feature_overrides")
      .delete()
      .eq("org_id", orgId)
      .eq("feature_code", featureCode);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true, message: "Feature override removed" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to remove override";
    const status = msg === "Forbidden" ? 403 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}