// app/api/o/[slug]/ai/blueprints/okrs/route.ts
//
// POST — Generate AI OKR blueprint for one department.
// Input: department_id
// Output: Generated objectives (with nested okrs and key_results) as drafts in ai_blueprints.
//
// Uses applied KPIs for the department as context so key results can reference them.

import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";
import {
  buildDepartmentAiContextText,
  buildOrgAiContextText,
  loadDepartmentAiProfile,
  loadOrgAiProfile,
} from "@/lib/server/aiBlueprints";
import {
  buildAppliedKpisContextText,
  loadAppliedKpisForDepartment,
  normalizeOkrBlueprintResponse,
  saveOkrBlueprintDrafts,
} from "@/lib/server/aiOkrBlueprints";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);

    if (!["owner", "admin", "manager", "dept_head"].includes(scope.role)) {
      return NextResponse.json(
        { ok: false, error: "No permission" },
        { status: 403 },
      );
    }

    const body = (await req.json()) as { department_id?: string };
    const departmentId = safeString(body.department_id);
    if (!departmentId) {
      return NextResponse.json(
        { ok: false, error: "department_id is required" },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();

    // Load department, profiles, and active cycle in parallel
    const [
      { data: department, error: depErr },
      orgProfile,
      deptProfile,
      cycleRes,
    ] = await Promise.all([
      admin
        .from("departments")
        .select("id,name")
        .eq("org_id", scope.org.id)
        .eq("id", departmentId)
        .maybeSingle<{ id: string; name: string }>(),
      loadOrgAiProfile(scope.org.id),
      loadDepartmentAiProfile(scope.org.id, departmentId),
      admin
        .from("quarterly_cycles")
        .select("id,year,quarter,status")
        .eq("org_id", scope.org.id)
        .eq("status", "active")
        .order("year", { ascending: false })
        .order("quarter", { ascending: false })
        .maybeSingle<{
          id: string;
          year: number;
          quarter: number;
          status: string;
        }>(),
    ]);

    if (depErr) throw new Error(depErr.message);
    if (!department) throw new Error("Department not found");
    if (cycleRes.error) throw new Error(cycleRes.error.message);
    if (!cycleRes.data) {
      return NextResponse.json(
        { ok: false, error: "No active cycle for this org" },
        { status: 400 },
      );
    }

    const cycleId = cycleRes.data.id;

    // Load applied KPIs for this department (to inform KR linking)
    const appliedKpis = await loadAppliedKpisForDepartment(
      scope.org.id,
      departmentId,
      cycleId,
    );

    if (appliedKpis.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Apply at least one KPI for this department before generating OKRs",
        },
        { status: 400 },
      );
    }

    // Safeguard: wipe any existing OKR drafts for this dept+cycle so we start fresh
    const { error: cleanupErr } = await admin
      .from("ai_blueprints")
      .delete()
      .eq("org_id", scope.org.id)
      .eq("cycle_id", cycleId)
      .eq("department_id", departmentId)
      .eq("blueprint_type", "okr")
      .eq("status", "draft");

    if (cleanupErr) {
      throw new Error(`Failed to clear existing drafts: ${cleanupErr.message}`);
    }

    // Build context for the AI
    const orgContext = buildOrgAiContextText({
      orgName: scope.org.name,
      profile: orgProfile,
    });
    const departmentContext = buildDepartmentAiContextText(deptProfile);
    const kpisContext = buildAppliedKpisContextText(appliedKpis);

    const developerPrompt = `
You are ALAMIN Blueprint AI.

Your task is to generate 2 objectives for this department for the current quarterly cycle.

Rules for objectives:
- Each objective is an aspirational qualitative statement (not a metric).
- Example good objective: "Become the most trusted payment platform for Saudi enterprises".
- Example bad objective: "Increase revenue by 20%" (that's a key result, not an objective).
- Mix 1 ambitious and 1 conservative/committed objective per department.
- Respect company strategy, industry, country, and department function.

Rules for OKRs:
- Each objective must have exactly 1 OKR wrapping its key results.
- The OKR title should be a concrete bet for this cycle, e.g. "Q1 2027 — Establish enterprise trust".

Rules for key results:
- Each OKR must have 3 to 5 key results.
- Each key result must be numeric and measurable.
- Each key result must have a target_value, a start_value, and a unit.
- Where possible, key results should reference an APPLIED KPI by exact title in the "link_to_kpi_title" field. If the KR is a new metric not in the KPIs list, set link_to_kpi_title to null.
- Each key result must have a why_recommended rationale.
- Use SMART-style phrasing.

Output strict JSON only. Every field required by the schema must be present.

COMPANY CONTEXT
${orgContext}

DEPARTMENT CONTEXT
${departmentContext}

${kpisContext}
`.trim();

    const schema = {
      name: "department_okr_blueprints",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          department: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              name: { type: "string" },
            },
            required: ["id", "name"],
          },
          objectives: {
            type: "array",
            minItems: 2,
            maxItems: 2,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                rationale: { type: "string" },
                okrs: {
                  type: "array",
                  minItems: 1,
                  maxItems: 1,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      title: { type: "string" },
                      rationale: { type: "string" },
                      key_results: {
                        type: "array",
                        minItems: 3,
                        maxItems: 5,
                        items: {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            title: { type: "string" },
                            why_recommended: { type: "string" },
                            metric_name: { type: "string" },
                            metric_type: { type: "string" },
                            unit: { type: ["string", "null"] },
                            start_value: { type: "number" },
                            current_value: { type: "number" },
                            target_value: { type: "number" },
                            link_to_kpi_title: { type: ["string", "null"] },
                          },
                          required: [
                            "title",
                            "why_recommended",
                            "metric_name",
                            "metric_type",
                            "unit",
                            "start_value",
                            "current_value",
                            "target_value",
                            "link_to_kpi_title",
                          ],
                        },
                      },
                    },
                    required: ["title", "rationale", "key_results"],
                  },
                },
              },
              required: ["title", "description", "rationale", "okrs"],
            },
          },
        },
        required: ["department", "objectives"],
      },
    };

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env("OPENAI_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL?.trim() || "gpt-4.1-mini",
          messages: [
            { role: "developer", content: developerPrompt },
            {
              role: "user",
              content: `Generate OKRs for department ${department.name} (${department.id}).`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: schema,
          },
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(detail || "OKR blueprint generation failed");
    }

    const completion = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = completion.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI returned no OKR blueprint content");

    const parsed = normalizeOkrBlueprintResponse(JSON.parse(content));

    const drafts = await saveOkrBlueprintDrafts({
      orgId: scope.org.id,
      cycleId,
      departmentId,
      createdBy: scope.userId,
      response: parsed,
      sourceContext: {
        org_profile: orgProfile,
        department_profile: deptProfile,
        cycle: cycleRes.data,
        applied_kpis: appliedKpis.map((k) => ({ id: k.id, title: k.title })),
      },
    });

    return NextResponse.json({
      ok: true,
      department,
      cycle: cycleRes.data,
      blueprint: parsed,
      drafts,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate OKR blueprints",
      },
      { status: 400 },
    );
  }
}
