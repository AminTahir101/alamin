// app/api/o/[slug]/ai/blueprints/okrs/route.ts
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
      return NextResponse.json({ ok: false, error: "No permission" }, { status: 403 });
    }

    const body = (await req.json()) as { department_id?: string };
    const departmentId = safeString(body.department_id);
    if (!departmentId) {
      return NextResponse.json({ ok: false, error: "department_id is required" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    const [{ data: department, error: depErr }, orgProfile, deptProfile, cycleRes] = await Promise.all([
      admin.from("departments").select("id,name").eq("org_id", scope.org.id).eq("id", departmentId).maybeSingle<{ id: string; name: string }>(),
      loadOrgAiProfile(scope.org.id),
      loadDepartmentAiProfile(scope.org.id, departmentId),
      admin.from("quarterly_cycles").select("id,year,quarter,status").eq("org_id", scope.org.id).eq("status", "active").order("year", { ascending: false }).order("quarter", { ascending: false }).maybeSingle<{ id: string; year: number; quarter: number; status: string }>(),
    ]);

    if (depErr) throw new Error(depErr.message);
    if (!department) throw new Error("Department not found");
    if (cycleRes.error) throw new Error(cycleRes.error.message);
    if (!cycleRes.data) return NextResponse.json({ ok: false, error: "No active cycle for this org" }, { status: 400 });

    const cycleId = cycleRes.data.id;

    const appliedKpis = await loadAppliedKpisForDepartment(scope.org.id, departmentId, cycleId);
    if (appliedKpis.length === 0) {
      return NextResponse.json({ ok: false, error: "Apply at least one KPI for this department before generating OKRs" }, { status: 400 });
    }

    const { error: cleanupErr } = await admin.from("ai_blueprints").delete()
      .eq("org_id", scope.org.id).eq("cycle_id", cycleId)
      .eq("department_id", departmentId).eq("blueprint_type", "okr").eq("status", "draft");
    if (cleanupErr) throw new Error(`Failed to clear existing drafts: ${cleanupErr.message}`);

    const orgContext = buildOrgAiContextText({ orgName: scope.org.name, profile: orgProfile });
    const departmentContext = buildDepartmentAiContextText(deptProfile);
    const kpisContext = buildAppliedKpisContextText(appliedKpis);

    const industry = orgProfile?.industry || "unknown industry";
    const country = orgProfile?.country || "unknown country";
    const employeeCount = orgProfile?.employee_count ?? 0;
    const strategy = orgProfile?.strategy_summary || "";
    const deptName = department.name;
    const quarter = `Q${cycleRes.data.quarter} ${cycleRes.data.year}`;

    const developerPrompt = `
You are ALAMIN Blueprint AI — a senior OKR strategist generating quarterly execution plans for a real business.

TASK
Generate exactly 2 objectives for the ${deptName} department for ${quarter}.
One objective must be ambitious/growth-oriented. One must be conservative/committed.

MANDATORY RULES — violating any of these produces invalid output:

1. OBJECTIVE QUALITY
   - An objective is a qualitative, inspiring directional statement — NOT a metric.
   - GOOD: "Establish ${deptName} as the most reliable function in the company"
   - GOOD: "Become the go-to ${deptName} partner for every product line"
   - BAD: "Increase revenue by 20%" (that's a key result)
   - BAD: "Drive strategic outcomes aligned with company goals" (this is generic filler — NEVER write this)
   - Each objective must be specific to ${deptName} at ${scope.org.name}, a ${industry} company in ${country} with ${employeeCount} employees.

2. OKR TITLE FORMAT
   - Each objective has exactly 1 OKR.
   - OKR title = the quarterly bet, e.g. "${quarter} — Capture first enterprise accounts" or "${quarter} — Reduce engineering lead time by half"
   - Must reflect the real department function and company strategy.

3. KEY RESULTS — MUST BE REAL NUMBERS
   - Each OKR has 3 to 5 key results.
   - Every KR must have a specific numeric target_value and start_value.
   - All targets must be realistic for ${industry} in ${country} at a company of ${employeeCount} employees in ${quarter}.
   - If the company is in GCC/Saudi Arabia, use SAR for revenue/cost KRs.
   - KR titles must name the exact metric being moved.
   - GOOD: "Increase MQL to SQL conversion from 18% to 28%"
   - GOOD: "Reduce average time-to-hire from 32 days to 21 days"
   - BAD: "Improve team performance" / "Achieve quarterly goals"
   - Where a KR maps to one of the applied KPIs, set link_to_kpi_title to the exact KPI title from the list.

4. STRATEGY ALIGNMENT
   Company strategy: "${strategy}"
   Every objective and KR must connect to this strategy. Show the connection explicitly in the rationale.

5. DEPARTMENT OWNERSHIP
   Only generate KRs that the ${deptName} department actually owns and can move.
   Don't generate KRs owned by other departments.

COMPANY CONTEXT
${orgContext}

DEPARTMENT CONTEXT
${departmentContext}

APPLIED KPIS FOR THIS DEPARTMENT
${kpisContext}

OUTPUT: Strict JSON only. No text outside the JSON.
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
            properties: { id: { type: "string" }, name: { type: "string" } },
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
                          required: ["title", "why_recommended", "metric_name", "metric_type", "unit", "start_value", "current_value", "target_value", "link_to_kpi_title"],
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

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.AI_MODEL?.trim() || "gpt-4.1-mini",
        messages: [
          { role: "developer", content: developerPrompt },
          {
            role: "user",
            content: `Generate OKRs for the ${deptName} department (id: ${department.id}) at ${scope.org.name}. Industry: ${industry}. Country: ${country}. Employees: ${employeeCount}. Strategy: "${strategy}". Quarter: ${quarter}. The objectives must NOT say "Drive strategic outcomes aligned with company goals" — they must be specific, named outcomes for a ${deptName} team in a ${industry} company. Key results must include real numeric targets appropriate for this company size and country.`,
          },
        ],
        response_format: { type: "json_schema", json_schema: schema },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(detail || "OKR blueprint generation failed");
    }

    const completion = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
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

    return NextResponse.json({ ok: true, department, cycle: cycleRes.data, blueprint: parsed, drafts });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to generate OKR blueprints" },
      { status: 400 }
    );
  }
}
