import { supabaseAdmin } from "@/lib/server/accessScope";

export type OrgAiProfileRow = {
  id: string;
  org_id: string;
  industry: string | null;
  sub_industry: string | null;
  country: string | null;
  employee_count: number | null;
  company_size: string | null;
  business_model: string | null;
  maturity_stage: string | null;
  strategy_summary: string | null;
  strategic_priorities: unknown;
  profile_payload: Record<string, unknown>;
  ai_context_text: string | null;
};

export type DepartmentAiProfileRow = {
  id: string;
  org_id: string;
  department_id: string;
  department_name: string;
  department_head_user_id: string | null;
  department_head_name: string | null;
  department_head_email: string | null;
  department_purpose: string | null;
  strategic_role: string | null;
  profile_payload: Record<string, unknown>;
  ai_context_text: string | null;
};

export type KpiBlueprintItem = {
  title: string;
  description: string;
  measurement_type: string;
  direction: "increase" | "decrease";
  unit: string | null;
  baseline_value: number | null;
  target_value: number;
  frequency: string;
  weight: number;
  why_recommended: string;
};

export type BlueprintVariant = {
  variant_key: "conservative" | "growth" | "efficiency";
  title: string;
  rationale: string;
  kpis: KpiBlueprintItem[];
};

export type DepartmentKpiBlueprintResponse = {
  department: {
    id: string;
    name: string;
  };
  variants: BlueprintVariant[];
};

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export async function loadOrgAiProfile(orgId: string) {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("org_ai_profiles")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle<OrgAiProfileRow>();

  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function loadDepartmentAiProfile(orgId: string, departmentId: string) {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("department_ai_profiles")
    .select("*")
    .eq("org_id", orgId)
    .eq("department_id", departmentId)
    .maybeSingle<DepartmentAiProfileRow>();

  if (error) throw new Error(error.message);
  return data ?? null;
}

export function buildOrgAiContextText(args: {
  orgName: string;
  profile: OrgAiProfileRow | null;
}) {
  const profile = args.profile;

  return [
    `Company: ${args.orgName}`,
    `Industry: ${profile?.industry || "Unknown"}`,
    `Sub-industry: ${profile?.sub_industry || "Unknown"}`,
    `Country: ${profile?.country || "Unknown"}`,
    `Employees: ${profile?.employee_count ?? 0}`,
    `Company size: ${profile?.company_size || "Unknown"}`,
    `Business model: ${profile?.business_model || "Unknown"}`,
    `Maturity stage: ${profile?.maturity_stage || "Unknown"}`,
    `Strategy summary: ${profile?.strategy_summary || "None provided"}`,
    `Strategic priorities: ${JSON.stringify(profile?.strategic_priorities ?? [])}`,
  ].join("\n");
}

export function buildDepartmentAiContextText(profile: DepartmentAiProfileRow | null) {
  if (!profile) return "Department profile not found.";

  return [
    `Department: ${profile.department_name}`,
    `Department purpose: ${profile.department_purpose || "Not specified"}`,
    `Strategic role: ${profile.strategic_role || "Not specified"}`,
    `Department head: ${profile.department_head_name || profile.department_head_email || "Unknown"}`,
    `Department profile payload: ${JSON.stringify(profile.profile_payload ?? {})}`,
  ].join("\n");
}

export async function saveBlueprintDrafts(args: {
  orgId: string;
  cycleId: string | null;
  departmentId: string;
  titlePrefix: string;
  createdBy: string;
  response: DepartmentKpiBlueprintResponse;
  sourceContext: Record<string, unknown>;
}) {
  const admin = supabaseAdmin();

  const rows = args.response.variants.map((variant) => ({
    org_id: args.orgId,
    cycle_id: args.cycleId,
    department_id: args.departmentId,
    blueprint_type: "kpi",
    variant_key: variant.variant_key,
    title: `${args.titlePrefix} · ${variant.title}`,
    rationale: variant.rationale,
    source_context: args.sourceContext,
    blueprint_payload: variant,
    status: "draft",
    created_by: args.createdBy,
  }));

  const { data, error } = await admin
    .from("ai_blueprints")
    .insert(rows)
    .select("*");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export function normalizeBlueprintResponse(raw: Record<string, unknown>): DepartmentKpiBlueprintResponse {
  const department = (raw.department ?? {}) as Record<string, unknown>;
  const variants = Array.isArray(raw.variants) ? raw.variants : [];

  return {
    department: {
      id: safeString(department.id),
      name: safeString(department.name),
    },
    variants: variants.map((item) => {
      const row = item as Record<string, unknown>;
      const kpis = Array.isArray(row.kpis) ? row.kpis : [];

      return {
        variant_key: (safeString(row.variant_key) as BlueprintVariant["variant_key"]) || "conservative",
        title: safeString(row.title),
        rationale: safeString(row.rationale),
        kpis: kpis.map((kpi) => {
          const r = kpi as Record<string, unknown>;
          return {
            title: safeString(r.title),
            description: safeString(r.description),
            measurement_type: safeString(r.measurement_type) || "number",
            direction: safeString(r.direction) === "decrease" ? "decrease" : "increase",
            unit: safeString(r.unit) || null,
            baseline_value: r.baseline_value == null ? null : asNumber(r.baseline_value, 0),
            target_value: asNumber(r.target_value, 0),
            frequency: safeString(r.frequency) || "monthly",
            weight: asNumber(r.weight, 10),
            why_recommended: safeString(r.why_recommended),
          };
        }),
      };
    }),
  };
}