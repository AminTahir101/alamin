import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/server/accessScope";
import {
  buildReferenceDataText,
  buildWorkspaceContextText,
  canManageKpis,
  canManageWork,
  env,
  json,
  loadAiWorkspaceContext,
  normalizeClusterStatus,
  normalizeKrStatus,
  normalizeOkrStatus,
  normalizeTaskPriority,
  normalizeTaskStatus,
  pct,
  safeNumber,
  safeString,
  type AiWorkspaceContext,
} from "@/lib/server/aiWorkspace";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };

type ActionType =
  | "create_okr"
  | "generate_jtbd"
  | "create_tasks"
  | "rewrite_kpi"
  | "diagnose_underperformance";

type ActionBody = {
  action?: ActionType;
  prompt?: string;
  preview?: Record<string, unknown> | null;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type ActionResult = {
  wrote: boolean;
  entity: string;
  summary: string;
  message: string;
  created: Record<string, unknown> | null;
};

type PreviewLabels = {
  departments: Array<{ id: string; label: string }>;
  members: Array<{ id: string; label: string }>;
  objectives: Array<{ id: string; label: string }>;
  okrs: Array<{ id: string; label: string }>;
  keyResults: Array<{ id: string; label: string }>;
  kpis: Array<{ id: string; label: string }>;
  jtbdClusters: Array<{ id: string; label: string }>;
};

function requireString(value: unknown, label: string) {
  const result = safeString(value);
  if (!result) throw new Error(`${label} is required`);
  return result;
}

function ensureScopeForWork(action: ActionType, role: string) {
  if (action === "diagnose_underperformance") return;

  if (action === "rewrite_kpi") {
    if (!canManageKpis(role)) {
      throw new Error("You do not have permission to rewrite KPIs");
    }
    return;
  }

  if (!canManageWork(role)) {
    throw new Error("You do not have permission to run this AI action");
  }
}

function getActionMeta(action: ActionType) {
  switch (action) {
    case "create_okr":
      return {
        label: "Create OKR",
        description: "Create one OKR with linked key results against an existing objective.",
      };
    case "generate_jtbd":
      return {
        label: "Generate JTBD",
        description: "Create one JTBD cluster and optional linked execution tasks.",
      };
    case "create_tasks":
      return {
        label: "Create tasks",
        description: "Create a task execution plan tied to the current strategy chain.",
      };
    case "rewrite_kpi":
      return {
        label: "Rewrite KPI",
        description: "Improve a KPI definition and update or create the KPI record.",
      };
    case "diagnose_underperformance":
      return {
        label: "Diagnose underperformance",
        description: "Analyze performance issues and return operational recommendations without changing records.",
      };
  }
}

function getJsonSchema(action: ActionType) {
  if (action === "create_okr") {
    return {
      name: "create_okr_action",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string" },
          okr: {
            type: "object",
            additionalProperties: false,
            properties: {
              objective_id: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
              department_id: { type: ["string", "null"] },
              owner_user_id: { type: ["string", "null"] },
              status: { type: "string" },
              progress: { type: "number" },
              key_results: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    metric_name: { type: ["string", "null"] },
                    metric_type: { type: ["string", "null"] },
                    unit: { type: ["string", "null"] },
                    start_value: { type: "number" },
                    current_value: { type: "number" },
                    target_value: { type: "number" },
                    status: { type: "string" },
                    progress: { type: "number" },
                    owner_user_id: { type: ["string", "null"] },
                    kpi_id: { type: ["string", "null"] },
                  },
                  required: [
                    "title",
                    "metric_name",
                    "metric_type",
                    "unit",
                    "start_value",
                    "current_value",
                    "target_value",
                    "status",
                    "progress",
                    "owner_user_id",
                    "kpi_id",
                  ],
                },
              },
            },
            required: [
              "objective_id",
              "title",
              "description",
              "department_id",
              "owner_user_id",
              "status",
              "progress",
              "key_results",
            ],
          },
        },
        required: ["summary", "okr"],
      },
    };
  }

  if (action === "generate_jtbd") {
    return {
      name: "generate_jtbd_action",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string" },
          cluster: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              department_id: { type: ["string", "null"] },
              objective_id: { type: ["string", "null"] },
              okr_id: { type: ["string", "null"] },
              key_result_id: { type: ["string", "null"] },
              owner_user_id: { type: ["string", "null"] },
              status: { type: "string" },
            },
            required: [
              "title",
              "description",
              "department_id",
              "objective_id",
              "okr_id",
              "key_result_id",
              "owner_user_id",
              "status",
            ],
          },
          tasks: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                department_id: { type: ["string", "null"] },
                objective_id: { type: ["string", "null"] },
                okr_id: { type: ["string", "null"] },
                key_result_id: { type: ["string", "null"] },
                kpi_id: { type: ["string", "null"] },
                assigned_to_user_id: { type: ["string", "null"] },
                status: { type: "string" },
                priority: { type: "string" },
                due_date: { type: ["string", "null"] },
              },
              required: [
                "title",
                "description",
                "department_id",
                "objective_id",
                "okr_id",
                "key_result_id",
                "kpi_id",
                "assigned_to_user_id",
                "status",
                "priority",
                "due_date",
              ],
            },
          },
        },
        required: ["summary", "cluster", "tasks"],
      },
    };
  }

  if (action === "create_tasks") {
    return {
      name: "create_tasks_action",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string" },
          cluster: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              department_id: { type: ["string", "null"] },
              objective_id: { type: ["string", "null"] },
              okr_id: { type: ["string", "null"] },
              key_result_id: { type: ["string", "null"] },
              owner_user_id: { type: ["string", "null"] },
              status: { type: "string" },
            },
            required: [
              "title",
              "description",
              "department_id",
              "objective_id",
              "okr_id",
              "key_result_id",
              "owner_user_id",
              "status",
            ],
          },
          tasks: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                department_id: { type: ["string", "null"] },
                objective_id: { type: ["string", "null"] },
                okr_id: { type: ["string", "null"] },
                key_result_id: { type: ["string", "null"] },
                kpi_id: { type: ["string", "null"] },
                assigned_to_user_id: { type: ["string", "null"] },
                status: { type: "string" },
                priority: { type: "string" },
                due_date: { type: ["string", "null"] },
              },
              required: [
                "title",
                "description",
                "department_id",
                "objective_id",
                "okr_id",
                "key_result_id",
                "kpi_id",
                "assigned_to_user_id",
                "status",
                "priority",
                "due_date",
              ],
            },
          },
        },
        required: ["summary", "cluster", "tasks"],
      },
    };
  }

  if (action === "rewrite_kpi") {
    return {
      name: "rewrite_kpi_action",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string" },
          mode: { type: "string" },
          existing_kpi_id: { type: ["string", "null"] },
          kpi: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              department_id: { type: ["string", "null"] },
              owner_user_id: { type: ["string", "null"] },
              current_value: { type: "number" },
              target_value: { type: "number" },
              weight: { type: "number" },
              direction: { type: "string" },
              unit: { type: ["string", "null"] },
              measurement_type: { type: ["string", "null"] },
              frequency: { type: ["string", "null"] },
              baseline_value: { type: ["number", "null"] },
              formula: { type: ["string", "null"] },
            },
            required: [
              "title",
              "description",
              "department_id",
              "owner_user_id",
              "current_value",
              "target_value",
              "weight",
              "direction",
              "unit",
              "measurement_type",
              "frequency",
              "baseline_value",
              "formula",
            ],
          },
          history_note: { type: "string" },
        },
        required: ["summary", "mode", "existing_kpi_id", "kpi", "history_note"],
      },
    };
  }

  return {
    name: "diagnose_underperformance_action",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        diagnosis: { type: "string" },
        causes: { type: "array", items: { type: "string" } },
        actions: { type: "array", items: { type: "string" } },
        suggested_updates: {
          type: "object",
          additionalProperties: false,
          properties: {
            kpis: { type: "array", items: { type: "string" } },
            okrs: { type: "array", items: { type: "string" } },
            tasks: { type: "array", items: { type: "string" } },
          },
          required: ["kpis", "okrs", "tasks"],
        },
      },
      required: ["summary", "diagnosis", "causes", "actions", "suggested_updates"],
    },
  };
}

async function callStructuredActionModel(action: ActionType, prompt: string, context: AiWorkspaceContext) {
  const actionMeta = getActionMeta(action);
  const schema = getJsonSchema(action);
  const companyContext = buildWorkspaceContextText(context);
  const referenceData = buildReferenceDataText(context);

  const developerPrompt = `
You are ALAMIN AI Actions.

Action: ${actionMeta.label}
Purpose: ${actionMeta.description}

You must return only JSON that matches the provided schema.

Rules:
- Use only IDs that exist in the reference data below.
- Do not invent record IDs.
- Choose the most relevant existing objective, OKR, KR, KPI, department, or member when needed.
- If a field should truly be empty, return null, not fake text.
- Prefer current active-cycle records.
- Keep titles concise and execution-ready.
- Keep descriptions practical and business-specific.
- For create_okr, always attach at least 2 and at most 5 key results.
- For generate_jtbd and create_tasks, always create 2 to 8 tasks.
- For rewrite_kpi, prefer updating an existing KPI when the prompt clearly refers to one.
- For diagnose_underperformance, do not propose database writes directly. Return analysis only.

COMPANY CONTEXT
${companyContext}

REFERENCE DATA
${referenceData}
  `.trim();

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL?.trim() || "gpt-4.1-mini",
      messages: [
        {
          role: "developer",
          content: developerPrompt,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: schema,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || "OpenAI structured action request failed");
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Structured AI action returned no content");
  }

  return JSON.parse(content) as Record<string, unknown>;
}

function normalizeLookup(value: unknown) {
  return safeString(value).trim().toLowerCase();
}

function resolveByIdOrLabel(
  candidates: Array<{ id: string; label: string }>,
  raw: unknown
) {
  const needle = normalizeLookup(raw);
  if (!needle) return null;

  const direct = candidates.find((item) => item.id === needle);
  if (direct) return direct.id;

  const exact = candidates.find((item) => normalizeLookup(item.label) === needle);
  if (exact) return exact.id;

  const contains = candidates.find((item) => normalizeLookup(item.label).includes(needle));
  if (contains) return contains.id;

  return null;
}

function getSafeDepartmentId(context: AiWorkspaceContext, raw: unknown) {
  const requested = safeString(raw) || null;

  if (context.scope.mode !== "org") {
    return context.scope.departmentId;
  }

  if (!requested) return null;

  const resolved = resolveByIdOrLabel(
    context.departments.map((row) => ({ id: row.id, label: row.name })),
    requested
  );

  return resolved ?? null;
}

function getSafeObjectiveId(context: AiWorkspaceContext, raw: unknown) {
  return resolveByIdOrLabel(
    context.objectives.map((row) => ({ id: row.id, label: row.title })),
    raw
  );
}

function getSafeOkrId(context: AiWorkspaceContext, raw: unknown) {
  return resolveByIdOrLabel(
    context.okrs.map((row) => ({ id: row.id, label: row.title })),
    raw
  );
}

function getSafeKrId(context: AiWorkspaceContext, raw: unknown) {
  return resolveByIdOrLabel(
    context.keyResults.map((row) => ({ id: row.id, label: row.title })),
    raw
  );
}

function getSafeKpiId(context: AiWorkspaceContext, raw: unknown) {
  return resolveByIdOrLabel(
    context.kpis.map((row) => ({ id: row.id, label: row.title })),
    raw
  );
}

function getSafeMemberId(context: AiWorkspaceContext, raw: unknown) {
  return resolveByIdOrLabel(
    context.members.map((row) => ({
      id: row.userId,
      label: context.memberLabelMap.get(row.userId) ?? row.userId,
    })),
    raw
  );
}

function buildPreviewLabels(context: AiWorkspaceContext): PreviewLabels {
  return {
    departments: context.departments.map((row) => ({
      id: row.id,
      label: row.name,
    })),
    members: context.members.map((row) => ({
      id: row.userId,
      label: context.memberLabelMap.get(row.userId) ?? row.userId,
    })),
    objectives: context.objectives.map((row) => ({
      id: row.id,
      label: row.title,
    })),
    okrs: context.okrs.map((row) => ({
      id: row.id,
      label: row.title,
    })),
    keyResults: context.keyResults.map((row) => ({
      id: row.id,
      label: row.title,
    })),
    kpis: context.kpis.map((row) => ({
      id: row.id,
      label: row.title,
    })),
    jtbdClusters: context.jtbdClusters.map((row) => ({
      id: row.id,
      label: row.title,
    })),
  };
}

async function logAiGeneration(params: {
  context: AiWorkspaceContext;
  action: ActionType;
  prompt: string;
  outputPayload: Record<string, unknown>;
  entityType: string;
  entityId?: string | null;
  departmentId?: string | null;
  confidenceScore?: number | null;
}) {
  const admin = supabaseAdmin();

  try {
    const { error } = await admin.from("ai_generations").insert({
      org_id: params.context.scope.org.id,
      cycle_id: params.context.cycle?.id ?? null,
      department_id: params.departmentId ?? params.context.scope.departmentId ?? null,
      layer: "mach3",
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      input_payload: {
        action: params.action,
        prompt: params.prompt,
      },
      output_payload: params.outputPayload,
      status: "generated",
      confidence_score: params.confidenceScore ?? null,
      created_by: params.context.scope.userId,
    });

    if (error) {
      console.error("Failed to log ai_generations:", error.message);
    }
  } catch (error) {
    console.error("Failed to log ai_generations:", error);
  }
}

async function insertKpiHistory(
  admin: ReturnType<typeof supabaseAdmin>,
  payload: {
    org_id: string;
    cycle_id: string;
    kpi_id: string;
    current_value: number;
    target_value: number;
    source: string;
    notes: string | null;
    recorded_by: string;
  }
) {
  const { error } = await admin.from("kpi_values_history").insert(payload);
  if (error) throw new Error(error.message);
}

async function handleCreateOkr(
  context: AiWorkspaceContext,
  actionJson: Record<string, unknown>
): Promise<ActionResult> {
  const admin = supabaseAdmin();

  if (!context.cycle) {
    throw new Error("No active cycle found");
  }

  const okrRoot = actionJson.okr as Record<string, unknown> | undefined;
  if (!okrRoot) throw new Error("AI action did not return an OKR payload");

  const objectiveId = getSafeObjectiveId(context, okrRoot.objective_id);
  if (!objectiveId) {
    throw new Error(
      `AI action could not resolve a valid objective_id. Received: ${safeString(okrRoot.objective_id) || "empty"}`
    );
  }

  const title = requireString(okrRoot.title, "OKR title");
  const description = safeString(okrRoot.description) || null;
  const departmentId =
    getSafeDepartmentId(context, okrRoot.department_id) ??
    context.objectives.find((row) => row.id === objectiveId)?.department_id ??
    null;
  const ownerUserId = getSafeMemberId(context, okrRoot.owner_user_id);
  const status = normalizeOkrStatus(safeString(okrRoot.status));
  const progress = pct(safeNumber(okrRoot.progress) ?? 0);

  const { data: insertedOkr, error: okrErr } = await admin
    .from("okrs")
    .insert({
      org_id: context.scope.org.id,
      cycle_id: context.cycle.id,
      department_id: departmentId,
      objective_id: objectiveId,
      title,
      description,
      owner_user_id: ownerUserId,
      status,
      progress,
      source: "ai",
      created_by: context.scope.userId,
    })
    .select("id")
    .single<{ id: string }>();

  if (okrErr) throw new Error(okrErr.message);

  const rawKrs = Array.isArray(okrRoot.key_results) ? okrRoot.key_results : [];
  const krRows = rawKrs
    .map((item, index) => {
      const row = item as Record<string, unknown>;
      const krTitle = safeString(row.title);
      if (!krTitle) return null;

      return {
        org_id: context.scope.org.id,
        cycle_id: context.cycle!.id,
        okr_id: insertedOkr.id,
        objective_id: objectiveId,
        department_id: departmentId,
        title: krTitle,
        metric_name: safeString(row.metric_name) || null,
        metric_type: safeString(row.metric_type) || "number",
        unit: safeString(row.unit) || null,
        start_value: safeNumber(row.start_value) ?? 0,
        current_value: safeNumber(row.current_value) ?? 0,
        target_value: safeNumber(row.target_value) ?? 100,
        status: normalizeKrStatus(safeString(row.status)),
        progress: pct(safeNumber(row.progress) ?? 0),
        owner_user_id: getSafeMemberId(context, row.owner_user_id),
        kpi_id: getSafeKpiId(context, row.kpi_id),
        position: index,
        source: "ai",
        created_by: context.scope.userId,
      };
    })
    .filter(Boolean);

  if (krRows.length) {
    const { error: krErr } = await admin.from("key_results").insert(krRows);
    if (krErr) throw new Error(krErr.message);
  }

  return {
    wrote: true,
    entity: "okr",
    summary: safeString(actionJson.summary) || "AI created a new OKR.",
    message: `Created OKR "${title}" with ${krRows.length} key result${krRows.length === 1 ? "" : "s"}.`,
    created: {
      okrId: insertedOkr.id,
      title,
      departmentId,
      objectiveId,
    },
  };
}

async function createClusterAndTasks(
  context: AiWorkspaceContext,
  actionJson: Record<string, unknown>,
  actionName: "generate_jtbd" | "create_tasks"
): Promise<ActionResult> {
  const admin = supabaseAdmin();

  if (!context.cycle) {
    throw new Error("No active cycle found");
  }

  const cluster = actionJson.cluster as Record<string, unknown> | undefined;
  if (!cluster) throw new Error("AI action did not return a cluster payload");

  const clusterTitle = requireString(cluster.title, "Cluster title");
  const clusterDescription = safeString(cluster.description) || null;
  const departmentId = getSafeDepartmentId(context, cluster.department_id);
  const objectiveId = getSafeObjectiveId(context, cluster.objective_id);
  const okrId = getSafeOkrId(context, cluster.okr_id);
  const keyResultId = getSafeKrId(context, cluster.key_result_id);
  const ownerUserId = getSafeMemberId(context, cluster.owner_user_id);
  const status =
    actionName === "generate_jtbd"
      ? normalizeClusterStatus(safeString(cluster.status) || "active")
      : "active";

  const { data: insertedCluster, error: clusterErr } = await admin
    .from("jtbd_clusters")
    .insert({
      org_id: context.scope.org.id,
      cycle_id: context.cycle.id,
      department_id: departmentId,
      objective_id: objectiveId,
      okr_id: okrId,
      key_result_id: keyResultId,
      title: clusterTitle,
      description: clusterDescription,
      status,
      owner_user_id: ownerUserId,
      created_by: context.scope.userId,
      assigned_by_user_id: context.scope.userId,
      ai_generated: true,
    })
    .select("id")
    .single<{ id: string }>();

  if (clusterErr) throw new Error(clusterErr.message);

  const taskRows = Array.isArray(actionJson.tasks) ? actionJson.tasks : [];
  const insertTasks = taskRows
    .map((item) => {
      const row = item as Record<string, unknown>;
      const title = safeString(row.title);
      if (!title) return null;

      return {
        org_id: context.scope.org.id,
        cycle_id: context.cycle!.id,
        department_id: getSafeDepartmentId(context, row.department_id) ?? departmentId,
        jtbd_cluster_id: insertedCluster.id,
        objective_id: getSafeObjectiveId(context, row.objective_id) ?? objectiveId,
        okr_id: getSafeOkrId(context, row.okr_id) ?? okrId,
        key_result_id: getSafeKrId(context, row.key_result_id) ?? keyResultId,
        kpi_id: getSafeKpiId(context, row.kpi_id),
        title,
        description: safeString(row.description) || null,
        status: normalizeTaskStatus(safeString(row.status)),
        priority: normalizeTaskPriority(safeString(row.priority)),
        assigned_to_user_id: getSafeMemberId(context, row.assigned_to_user_id),
        assigned_by_user_id: context.scope.userId,
        created_by: context.scope.userId,
        visible_to_department: true,
        due_date: safeString(row.due_date) || null,
        ai_generated: true,
      };
    })
    .filter(Boolean);

  if (insertTasks.length) {
    const { error: taskErr } = await admin.from("tasks").insert(insertTasks);
    if (taskErr) throw new Error(taskErr.message);
  }

  return {
    wrote: true,
    entity: actionName === "generate_jtbd" ? "jtbd" : "tasks",
    summary:
      safeString(actionJson.summary) ||
      (actionName === "generate_jtbd"
        ? "AI generated a JTBD cluster."
        : "AI created execution tasks."),
    message: `Created cluster "${clusterTitle}" and ${insertTasks.length} task${insertTasks.length === 1 ? "" : "s"}.`,
    created: {
      clusterId: insertedCluster.id,
      title: clusterTitle,
      taskCount: insertTasks.length,
      departmentId,
      objectiveId,
      okrId,
      keyResultId,
    },
  };
}

async function handleRewriteKpi(
  context: AiWorkspaceContext,
  actionJson: Record<string, unknown>
): Promise<ActionResult> {
  const admin = supabaseAdmin();

  if (!context.cycle) {
    throw new Error("No active cycle found");
  }

  const kpiRoot = actionJson.kpi as Record<string, unknown> | undefined;
  if (!kpiRoot) throw new Error("AI action did not return a KPI payload");

  const mode = safeString(actionJson.mode).toLowerCase();
  const requestedExistingId = getSafeKpiId(context, actionJson.existing_kpi_id);

  const title = requireString(kpiRoot.title, "KPI title");
  const description = safeString(kpiRoot.description) || null;
  const departmentId = getSafeDepartmentId(context, kpiRoot.department_id);
  if (!departmentId) {
    throw new Error("AI action could not resolve a valid department_id for the KPI");
  }

  const ownerUserId = getSafeMemberId(context, kpiRoot.owner_user_id);
  const currentValue = safeNumber(kpiRoot.current_value) ?? 0;
  const targetValue = safeNumber(kpiRoot.target_value) ?? 100;
  const weight = Math.max(1, safeNumber(kpiRoot.weight) ?? 1);
  const direction = safeString(kpiRoot.direction) === "decrease" ? "decrease" : "increase";
  const unit = safeString(kpiRoot.unit) || null;
  const measurementType = safeString(kpiRoot.measurement_type) || "number";
  const frequency = safeString(kpiRoot.frequency) || "monthly";
  const baselineValue =
    kpiRoot.baseline_value === null || kpiRoot.baseline_value === undefined
      ? null
      : safeNumber(kpiRoot.baseline_value);
  const formula = safeString(kpiRoot.formula) || null;
  const historyNote = safeString(actionJson.history_note) || "AI rewrite";

  if (mode === "update_existing" && requestedExistingId) {
    const { error: updateErr } = await admin
      .from("kpis")
      .update({
        title,
        description,
        department_id: departmentId,
        owner_user_id: ownerUserId,
        current_value: currentValue,
        target_value: targetValue,
        weight,
        direction,
        unit,
        measurement_type: measurementType,
        frequency,
        baseline_value: baselineValue,
        formula,
        source: "ai",
      })
      .eq("id", requestedExistingId)
      .eq("org_id", context.scope.org.id);

    if (updateErr) throw new Error(updateErr.message);

    await insertKpiHistory(admin, {
      org_id: context.scope.org.id,
      cycle_id: context.cycle.id,
      kpi_id: requestedExistingId,
      current_value: currentValue,
      target_value: targetValue,
      source: "ai",
      notes: historyNote,
      recorded_by: context.scope.userId,
    });

    return {
      wrote: true,
      entity: "kpi",
      summary: safeString(actionJson.summary) || "AI rewrote an existing KPI.",
      message: `Updated KPI "${title}".`,
      created: {
        kpiId: requestedExistingId,
        title,
        mode: "updated",
        departmentId,
      },
    };
  }

  const { data: inserted, error: insertErr } = await admin
    .from("kpis")
    .insert({
      org_id: context.scope.org.id,
      cycle_id: context.cycle.id,
      department_id: departmentId,
      title,
      description,
      owner_user_id: ownerUserId,
      weight,
      measurement_type: measurementType,
      target_value: targetValue,
      current_value: currentValue,
      created_by: context.scope.userId,
      is_active: true,
      direction,
      unit,
      frequency,
      baseline_value: baselineValue,
      formula,
      source: "ai",
    })
    .select("id")
    .single<{ id: string }>();

  if (insertErr) throw new Error(insertErr.message);

  await insertKpiHistory(admin, {
    org_id: context.scope.org.id,
    cycle_id: context.cycle.id,
    kpi_id: inserted.id,
    current_value: currentValue,
    target_value: targetValue,
    source: "ai",
    notes: historyNote,
    recorded_by: context.scope.userId,
  });

  return {
    wrote: true,
    entity: "kpi",
    summary: safeString(actionJson.summary) || "AI created a rewritten KPI.",
    message: `Created KPI "${title}".`,
    created: {
      kpiId: inserted.id,
      title,
      mode: "created",
      departmentId,
    },
  };
}

function handleDiagnose(actionJson: Record<string, unknown>): ActionResult {
  const summary = safeString(actionJson.summary) || "Diagnosis complete.";
  const diagnosis = safeString(actionJson.diagnosis) || "No diagnosis returned.";
  const causes = Array.isArray(actionJson.causes)
    ? actionJson.causes.map((row) => safeString(row)).filter(Boolean)
    : [];
  const actions = Array.isArray(actionJson.actions)
    ? actionJson.actions.map((row) => safeString(row)).filter(Boolean)
    : [];

  const updatesRoot =
    (actionJson.suggested_updates as Record<string, unknown> | undefined) ?? {};

  const kpis = Array.isArray(updatesRoot.kpis)
    ? updatesRoot.kpis.map((row) => safeString(row)).filter(Boolean)
    : [];
  const okrs = Array.isArray(updatesRoot.okrs)
    ? updatesRoot.okrs.map((row) => safeString(row)).filter(Boolean)
    : [];
  const tasks = Array.isArray(updatesRoot.tasks)
    ? updatesRoot.tasks.map((row) => safeString(row)).filter(Boolean)
    : [];

  const message = [
    summary,
    "",
    "Diagnosis",
    diagnosis,
    "",
    causes.length ? `Likely causes:\n- ${causes.join("\n- ")}` : "",
    actions.length ? `Recommended actions:\n- ${actions.join("\n- ")}` : "",
    kpis.length ? `Suggested KPI updates:\n- ${kpis.join("\n- ")}` : "",
    okrs.length ? `Suggested OKR updates:\n- ${okrs.join("\n- ")}` : "",
    tasks.length ? `Suggested task updates:\n- ${tasks.join("\n- ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    wrote: false,
    entity: "diagnosis",
    summary,
    message,
    created: null,
  };
}

function shouldExecute(req: NextRequest) {
  return req.headers.get("x-ai-mode") === "execute";
}

export async function POST(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const body = (await req.json().catch(() => null)) as ActionBody | null;

    const action = body?.action;
    const prompt = safeString(body?.prompt);
    const preview = body?.preview && typeof body.preview === "object" ? body.preview : null;

    if (!slug) {
      return json({ ok: false, error: "Slug is required" }, 400);
    }

    if (!action) {
      return json({ ok: false, error: "Action is required" }, 400);
    }

    if (!prompt) {
      return json({ ok: false, error: "Prompt is required" }, 400);
    }

    const context = await loadAiWorkspaceContext(req, slug);
    ensureScopeForWork(action, context.scope.role);

    const actionJson = preview ?? (await callStructuredActionModel(action, prompt, context));
    const previewLabels = buildPreviewLabels(context);

    if (!shouldExecute(req)) {
      await logAiGeneration({
        context,
        action,
        prompt,
        outputPayload: actionJson,
        entityType: `${action}_preview`,
        departmentId: context.scope.departmentId ?? null,
      });

      return json({
        ok: true,
        action,
        mode: "preview",
        preview: actionJson,
        labels: previewLabels,
      });
    }

    let result: ActionResult;

    if (action === "create_okr") {
      result = await handleCreateOkr(context, actionJson);
    } else if (action === "generate_jtbd") {
      result = await createClusterAndTasks(context, actionJson, "generate_jtbd");
    } else if (action === "create_tasks") {
      result = await createClusterAndTasks(context, actionJson, "create_tasks");
    } else if (action === "rewrite_kpi") {
      result = await handleRewriteKpi(context, actionJson);
    } else {
      result = handleDiagnose(actionJson);
    }

    await logAiGeneration({
      context,
      action,
      prompt,
      outputPayload: actionJson,
      entityType: result.entity,
      entityId:
        typeof result.created?.okrId === "string"
          ? result.created.okrId
          : typeof result.created?.clusterId === "string"
          ? result.created.clusterId
          : typeof result.created?.kpiId === "string"
          ? result.created.kpiId
          : null,
      departmentId:
        typeof result.created?.departmentId === "string"
          ? result.created.departmentId
          : context.scope.departmentId ?? null,
    });

    return json({
      ok: true,
      action,
      mode: "executed",
      ...result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to run AI action";
    return json({ ok: false, error: message }, 400);
  }
}