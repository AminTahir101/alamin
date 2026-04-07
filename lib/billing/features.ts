export type PlanCode = "core" | "growth" | "enterprise";

export type FeatureKey =
  | "dashboard"
  | "your_ai_basic"
  | "your_ai_advanced"
  | "objectives"
  | "okrs"
  | "kpis"
  | "tasks"
  | "reports"
  | "jtbd"
  | "my_work"
  | "departments"
  | "settings"
  | "onboarding"
  | "cross_department_visibility"
  | "advanced_exports"
  | "custom_features"
  | "custom_workflows"
  | "custom_integrations"
  | "advanced_reporting_customization"
  | "enterprise_governance";

export const ALL_FEATURE_KEYS: FeatureKey[] = [
  "dashboard",
  "your_ai_basic",
  "your_ai_advanced",
  "objectives",
  "okrs",
  "kpis",
  "tasks",
  "reports",
  "jtbd",
  "my_work",
  "departments",
  "settings",
  "onboarding",
  "cross_department_visibility",
  "advanced_exports",
  "custom_features",
  "custom_workflows",
  "custom_integrations",
  "advanced_reporting_customization",
  "enterprise_governance",
];

export function isFeatureKey(value: string): value is FeatureKey {
  return ALL_FEATURE_KEYS.includes(value as FeatureKey);
}