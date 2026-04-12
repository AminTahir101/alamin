// lib/server/aiOkrBlueprints.ts
//
// Helpers for the OKR AI blueprint generation flow.
// Mirrors the pattern in aiBlueprints.ts but for OKRs.

import { supabaseAdmin } from "@/lib/server/accessScope";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AppliedKpiRow = {
  id: string;
  title: string;
  unit: string | null;
  direction: "increase" | "decrease" | null;
  target_value: number | null;
  current_value: number | null;
};

export type KeyResultBlueprint = {
  title: string;
  why_recommended: string;
  metric_name: string;
  metric_type: string; // "number" | "percentage" | "currency" | "count"
  unit: string | null;
  start_value: number;
  current_value: number;
  target_value: number;
  link_to_kpi_title: string | null; // AI returns this, we resolve to kpi_id at apply time
};

export type OkrBlueprint = {
  title: string;
  rationale: string;
  key_results: KeyResultBlueprint[];
};

export type ObjectiveBlueprint = {
  title: string;
  description: string;
  rationale: string;
  okrs: OkrBlueprint[];
};

export type DepartmentOkrBlueprintResponse = {
  department: {
    id: string;
    name: string;
  };
  objectives: ObjectiveBlueprint[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Context builders
// ─────────────────────────────────────────────────────────────────────────────

export function buildAppliedKpisContextText(kpis: AppliedKpiRow[]): string {
  if (!kpis.length) {
    return "No KPIs have been applied yet for this department.";
  }
  const lines = kpis.map((k, i) => {
    const parts = [
      `${i + 1}. ${k.title}`,
      k.unit ? `(${k.unit})` : "",
      `target=${k.target_value ?? "?"}`,
      `current=${k.current_value ?? "?"}`,
      `direction=${k.direction ?? "?"}`,
    ].filter(Boolean);
    return parts.join(" ");
  });
  return ["Applied KPIs for this department:", ...lines].join("\n");
}

export async function loadAppliedKpisForDepartment(
  orgId: string,
  departmentId: string,
  cycleId: string,
): Promise<AppliedKpiRow[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("kpis")
    .select("id,title,unit,direction,target_value,current_value")
    .eq("org_id", orgId)
    .eq("department_id", departmentId)
    .eq("cycle_id", cycleId)
    .eq("is_active", true)
    .returns<AppliedKpiRow[]>();

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization — turn raw AI JSON into typed structure
// ─────────────────────────────────────────────────────────────────────────────

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeOkrBlueprintResponse(
  raw: Record<string, unknown>,
): DepartmentOkrBlueprintResponse {
  const department = (raw.department ?? {}) as Record<string, unknown>;
  const objectives = Array.isArray(raw.objectives) ? raw.objectives : [];

  return {
    department: {
      id: safeString(department.id),
      name: safeString(department.name),
    },
    objectives: objectives.map((obj) => {
      const o = obj as Record<string, unknown>;
      const okrs = Array.isArray(o.okrs) ? o.okrs : [];
      return {
        title: safeString(o.title),
        description: safeString(o.description),
        rationale: safeString(o.rationale),
        okrs: okrs.map((okr) => {
          const r = okr as Record<string, unknown>;
          const keyResults = Array.isArray(r.key_results) ? r.key_results : [];
          return {
            title: safeString(r.title),
            rationale: safeString(r.rationale),
            key_results: keyResults.map((kr) => {
              const k = kr as Record<string, unknown>;
              return {
                title: safeString(k.title),
                why_recommended: safeString(k.why_recommended),
                metric_name: safeString(k.metric_name) || safeString(k.title),
                metric_type: safeString(k.metric_type) || "number",
                unit: safeString(k.unit) || null,
                start_value: asNumber(k.start_value, 0),
                current_value: asNumber(k.current_value, 0),
                target_value: asNumber(k.target_value, 100),
                link_to_kpi_title: safeString(k.link_to_kpi_title) || null,
              };
            }),
          };
        }),
      };
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Save the generated blueprint as drafts in ai_blueprints
// ─────────────────────────────────────────────────────────────────────────────

export async function saveOkrBlueprintDrafts(args: {
  orgId: string;
  cycleId: string;
  departmentId: string;
  createdBy: string;
  response: DepartmentOkrBlueprintResponse;
  sourceContext: Record<string, unknown>;
}) {
  const admin = supabaseAdmin();

  // One row per objective (simpler than one per okr).
  // The full objective with its okrs + key_results lives in blueprint_payload.
  const rows = args.response.objectives.map((objective, idx) => ({
    org_id: args.orgId,
    cycle_id: args.cycleId,
    department_id: args.departmentId,
    blueprint_type: "okr",
    variant_key: `objective_${idx + 1}`,
    title: objective.title || `Objective ${idx + 1}`,
    rationale: objective.rationale || null,
    source_context: args.sourceContext,
    blueprint_payload: objective,
    status: "draft",
    created_by: args.createdBy,
  }));

  if (rows.length === 0) return [];

  const { data, error } = await admin
    .from("ai_blueprints")
    .insert(rows)
    .select("*");

  if (error) throw new Error(error.message);
  return data ?? [];
}
