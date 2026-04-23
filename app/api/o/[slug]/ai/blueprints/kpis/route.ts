import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";
import {
  buildDepartmentAiContextText,
  buildOrgAiContextText,
  loadDepartmentAiProfile,
  loadOrgAiProfile,
  normalizeBlueprintResponse,
  saveBlueprintDrafts,
} from "@/lib/server/aiBlueprints";

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

    if (cycleRes.data?.id) {
      const { error: cleanupErr } = await admin.from("ai_blueprints").delete()
        .eq("org_id", scope.org.id).eq("cycle_id", cycleRes.data.id)
        .eq("department_id", departmentId).eq("blueprint_type", "kpi").eq("status", "draft");
      if (cleanupErr) throw new Error(`Failed to clear existing drafts: ${cleanupErr.message}`);
    }

    const orgContext = buildOrgAiContextText({ orgName: scope.org.name, profile: orgProfile });
    const departmentContext = buildDepartmentAiContextText(deptProfile);

    const industry = orgProfile?.industry || "unknown industry";
    const country = orgProfile?.country || "unknown country";
    const employeeCount = orgProfile?.employee_count ?? 0;
    const strategy = orgProfile?.strategy_summary || "";
    const deptName = department.name;
    const quarter = cycleRes.data ? `Q${cycleRes.data.quarter} ${cycleRes.data.year}` : "current quarter";

    const developerPrompt = `
You are ALAMIN Blueprint AI — a senior performance management consultant generating KPI blueprints for a real business.

TASK
Generate 3 KPI variants for the ${deptName} department:
1. conservative — stable execution, risk-averse targets
2. growth — ambitious stretch goals aligned with the company strategy
3. efficiency — cost reduction, productivity, and process improvement

MANDATORY RULES — violating any of these produces an invalid response:

1. SPECIFICITY: Every KPI title must name the exact metric, not a vague goal.
   BAD: "Drive strategic outcomes" / "Improve department performance"
   GOOD: "MQL to SQL Conversion Rate" / "Average Revenue Per Account (SAR)" / "First Response Time (minutes)"

2. REAL NUMBERS: All target_value and baseline_value must be realistic for this industry, country, and company size.
   - For ${country} ${industry} companies with ~${employeeCount} employees, use market-appropriate benchmarks.
   - Example: A Saudi fintech with 50 employees should not have a $100M revenue KPI.
   - Use SAR for monetary KPIs if the country is Saudi Arabia, AED if UAE, etc.
   - If company is in GCC, prefer SAR/AED/KWD over USD.

3. DEPARTMENT RELEVANCE: KPIs must match what the ${deptName} department actually owns and controls.
   - Sales: pipeline, conversion, revenue, deals closed
   - Marketing: leads, CAC, brand metrics, campaign ROI
   - Engineering/Product: deployment frequency, bug rate, uptime, sprint velocity
   - HR/People: attrition, time-to-hire, engagement score
   - Finance: burn rate, gross margin, EBITDA, cost per unit
   - Customer Success: NPS, churn rate, CSAT, time-to-value
   - Operations: SLA compliance, process cycle time, cost per transaction

4. STRATEGY ALIGNMENT: The company strategy is: "${strategy}"
   Every KPI must plausibly connect to this strategy. Do not generate KPIs that contradict or ignore it.

5. QUARTERLY RELEVANCE: This is ${quarter}. Targets should be achievable in one quarter, not one year.

6. CYCLE: 4 to 6 KPIs per variant. No generic filler KPIs.

7. why_recommended must be 1-2 sentences explaining why THIS specific KPI matters for THIS specific department at THIS company size, industry, and strategy stage. Not generic text.

COMPANY CONTEXT
${orgContext}

DEPARTMENT CONTEXT
${departmentContext}

OUTPUT: Strict JSON only. No explanations outside the JSON.
    `.trim();

    const schema = {
      name: "department_kpi_blueprints",
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
          variants: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                variant_key: { type: "string" },
                title: { type: "string" },
                rationale: { type: "string" },
                kpis: {
                  type: "array",
                  minItems: 4,
                  maxItems: 6,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      measurement_type: { type: "string" },
                      direction: { type: "string" },
                      unit: { type: ["string", "null"] },
                      baseline_value: { type: ["number", "null"] },
                      target_value: { type: "number" },
                      frequency: { type: "string" },
                      weight: { type: "number" },
                      why_recommended: { type: "string" },
                    },
                    required: ["title", "description", "measurement_type", "direction", "unit", "baseline_value", "target_value", "frequency", "weight", "why_recommended"],
                  },
                },
              },
              required: ["variant_key", "title", "rationale", "kpis"],
            },
          },
        },
        required: ["department", "variants"],
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
            content: `Generate KPI blueprints for the ${deptName} department (id: ${department.id}) at ${scope.org.name}. Industry: ${industry}. Country: ${country}. Employees: ${employeeCount}. Strategy: ${strategy}. Quarter: ${quarter}. Every KPI must have a specific name and real numeric targets — no vague goals.`,
          },
        ],
        response_format: { type: "json_schema", json_schema: schema },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(detail || "AI blueprint generation failed");
    }

    const completion = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = completion.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI returned no blueprint content");

    const parsed = normalizeBlueprintResponse(JSON.parse(content));

    const drafts = await saveBlueprintDrafts({
      orgId: scope.org.id,
      cycleId: cycleRes.data?.id ?? null,
      departmentId,
      titlePrefix: `${deptName} KPI Blueprint`,
      createdBy: scope.userId,
      response: parsed,
      sourceContext: { org_profile: orgProfile, department_profile: deptProfile, cycle: cycleRes.data ?? null },
    });

    return NextResponse.json({ ok: true, department, cycle: cycleRes.data ?? null, blueprint: parsed, drafts });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to generate KPI blueprints" },
      { status: 400 }
    );
  }
}
