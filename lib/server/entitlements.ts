import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { isFeatureKey, type FeatureKey, type PlanCode } from "@/lib/billing/features";

type OrganizationRow = {
  id: string;
  slug: string;
  name: string;
};

type SubscriptionRow = {
  org_id: string;
  plan_code: PlanCode | null;
  status: "active" | "trialing" | "inactive" | "cancelled" | "past_due" | string | null;
};

type PlanFeatureRow = {
  feature_code: string;
  is_enabled: boolean | null;
  limit_value: number | null;
};

type OrgFeatureOverrideRow = {
  feature_code: string;
  is_enabled: boolean;
  limit_value: number | null;
};

export type OrgEntitlement = {
  plan: PlanCode;
  features: FeatureKey[];
  featureMap: Record<
    string,
    {
      enabled: boolean;
      limitValue: number | null;
      source: "plan" | "override";
    }
  >;
};

function env(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

export function supabaseAdmin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

export async function requireUserFromBearer(authHeader: string | null): Promise<User> {
  const auth = authHeader ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!token) {
    throw new Error("Missing Authorization Bearer token");
  }

  const client = createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );

  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    throw new Error("Unauthorized");
  }

  return data.user;
}

export async function requireOrgMembership(
  admin: SupabaseClient,
  userId: string,
  slug: string
): Promise<OrganizationRow> {
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .select("id,slug,name")
    .eq("slug", slug)
    .maybeSingle<OrganizationRow>();

  if (orgErr) {
    throw new Error(orgErr.message);
  }

  if (!org) {
    throw new Error(`Organization not found for slug: ${slug}`);
  }

  const { data: membership, error: membershipErr } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("org_id", org.id)
    .eq("user_id", userId)
    .maybeSingle<{ user_id: string }>();

  if (membershipErr) {
    throw new Error(membershipErr.message);
  }

  if (!membership) {
    throw new Error("Forbidden: not a member of this organization");
  }

  return org;
}

export async function getOrgPlan(admin: SupabaseClient, orgId: string): Promise<PlanCode> {
  const { data, error } = await admin
    .from("organization_subscriptions")
    .select("org_id,plan_code,status")
    .eq("org_id", orgId)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<SubscriptionRow>();

  if (error) {
    const message = error.message || "";
    const missingTable =
      message.includes("Could not find the table") ||
      (message.includes("relation") && message.includes("does not exist"));

    if (missingTable) {
      return "core";
    }

    throw new Error(error.message);
  }

  return (data?.plan_code ?? "core") as PlanCode;
}

export async function getPlanFeatures(
  admin: SupabaseClient,
  plan: PlanCode
): Promise<PlanFeatureRow[]> {
  const { data, error } = await admin
    .from("billing_plan_features")
    .select("feature_code,is_enabled,limit_value")
    .eq("plan_code", plan);

  if (error) {
    const message = error.message || "";
    const missingTable =
      message.includes("Could not find the table") ||
      (message.includes("relation") && message.includes("does not exist"));

    if (missingTable) {
      return [];
    }

    throw new Error(error.message);
  }

  return (data ?? []) as PlanFeatureRow[];
}

export async function getOrgFeatureOverrides(
  admin: SupabaseClient,
  orgId: string
): Promise<OrgFeatureOverrideRow[]> {
  const { data, error } = await admin
    .from("organization_feature_overrides")
    .select("feature_code,is_enabled,limit_value")
    .eq("org_id", orgId);

  if (error) {
    const message = error.message || "";
    const missingTable =
      message.includes("Could not find the table") ||
      (message.includes("relation") && message.includes("does not exist"));

    if (missingTable) {
      return [];
    }

    throw new Error(error.message);
  }

  return (data ?? []) as OrgFeatureOverrideRow[];
}

export async function getEntitlementsForOrg(
  admin: SupabaseClient,
  orgId: string
): Promise<OrgEntitlement> {
  const plan = await getOrgPlan(admin, orgId);
  const [planFeatures, overrides] = await Promise.all([
    getPlanFeatures(admin, plan),
    getOrgFeatureOverrides(admin, orgId),
  ]);

  const featureMap: OrgEntitlement["featureMap"] = {};

  for (const row of planFeatures) {
    const code = String(row.feature_code || "").trim();
    if (!isFeatureKey(code)) continue;

    featureMap[code] = {
      enabled: row.is_enabled !== false,
      limitValue: row.limit_value ?? null,
      source: "plan",
    };
  }

  for (const row of overrides) {
    const code = String(row.feature_code || "").trim();
    if (!isFeatureKey(code)) continue;

    featureMap[code] = {
      enabled: row.is_enabled === true,
      limitValue: row.limit_value ?? null,
      source: "override",
    };
  }

  const features = Object.entries(featureMap)
    .filter(([, value]) => value.enabled)
    .map(([key]) => key as FeatureKey)
    .sort();

  return {
    plan,
    features,
    featureMap,
  };
}

export async function orgHasFeature(
  admin: SupabaseClient,
  orgId: string,
  feature: FeatureKey
): Promise<boolean> {
  const entitlements = await getEntitlementsForOrg(admin, orgId);
  return entitlements.features.includes(feature);
}

export async function requireFeatureAccess(
  admin: SupabaseClient,
  orgId: string,
  feature: FeatureKey
): Promise<void> {
  const allowed = await orgHasFeature(admin, orgId, feature);

  if (!allowed) {
    throw new Error(`Feature not allowed: ${feature}`);
  }
}