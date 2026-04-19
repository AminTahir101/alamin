"use client";

// app/o/[slug]/ai-setup/generate/page.tsx
//
// AI generation page. Users land here after "Save and generate" in
// revisit/new-cycle onboarding mode. The page auto-generates per department:
//   1 Objective → 3 OKRs (linked to that objective) → 3 KPIs
//
// Uses existing API routes:
//   POST /api/o/[slug]/objectives          → creates objective
//   POST /api/o/[slug]/ai/actions          → create_okr (with execute=true)
//   POST /api/o/[slug]/ai/blueprints/kpis  → generates KPI blueprints

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import SectionCard from "@/components/ui/SectionCard";
import StatusBadge from "@/components/ui/StatusBadge";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type Department = { id: string; name: string };

type GenerationStep = {
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
};

type DepartmentGeneration = {
  department: Department;
  steps: GenerationStep[];
  objectiveId?: string;
  error?: string;
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export default function AiGeneratePage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = String(params?.slug ?? "").trim();

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [generations, setGenerations] = useState<DepartmentGeneration[]>([]);
  const [strategy, setStrategy] = useState<string>("");

  const startedRef = useRef(false);

  const ensureAuth = useCallback(async (): Promise<Session | null> => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    setSessionEmail(session?.user?.email ?? null);
    if (!session) {
      router.replace("/auth");
      return null;
    }
    return session;
  }, [router]);

  // ──── Boot: fetch departments and org strategy ────
  useEffect(() => {
    async function boot() {
      try {
        const session = await ensureAuth();
        if (!session) return;

        // Fetch departments
        const deptRes = await fetch(
          `/api/o/${encodeURIComponent(slug)}/departments`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
          },
        );
        const deptData = (await deptRes.json()) as {
          ok: boolean;
          departments?: Department[];
          error?: string;
        };

        if (!deptRes.ok || !deptData.ok) {
          throw new Error(deptData.error || "Failed to load departments");
        }

        const depts = deptData.departments ?? [];
        setDepartments(depts);

        // Fetch org AI profile for strategy context
        const settingsRes = await fetch(
          `/api/o/${encodeURIComponent(slug)}/settings`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
          },
        );
        const settingsData = (await settingsRes.json()) as {
          ok: boolean;
          org?: { name?: string; description?: string };
        };

        if (settingsData.ok && settingsData.org?.description) {
          setStrategy(settingsData.org.description);
        }

        // Initialize generation state
        setGenerations(
          depts.map((dept) => ({
            department: dept,
            steps: [
              { label: "Create objective", status: "pending" },
              { label: "Generate OKRs", status: "pending" },
              { label: "Generate KPIs", status: "pending" },
            ],
          })),
        );
      } catch (e) {
        setMsg(getErrorMessage(e, "Failed to load workspace data."));
      } finally {
        setLoading(false);
      }
    }

    void boot();
  }, [slug, ensureAuth]);

  // ──── Update a specific step in a specific department ────
  const updateStep = useCallback(
    (deptIndex: number, stepIndex: number, patch: Partial<GenerationStep>) => {
      setGenerations((prev) =>
        prev.map((gen, gi) =>
          gi !== deptIndex
            ? gen
            : {
                ...gen,
                steps: gen.steps.map((s, si) =>
                  si !== stepIndex ? s : { ...s, ...patch },
                ),
              },
        ),
      );
    },
    [],
  );

  // ──── Main generation loop ────
  const runGeneration = useCallback(async () => {
    if (departments.length === 0) return;
    setRunning(true);
    setMsg(null);

    const session = await ensureAuth();
    if (!session) return;

    const headers = {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    };

    for (let di = 0; di < departments.length; di++) {
      const dept = departments[di];

      // ──── Step 1: Create objective ────
      updateStep(di, 0, { status: "running" });

      try {
        // Build a strategy-specific objective title using AI
        // First, ask the AI to generate an objective title + description
        const objGenPrompt = `You are a performance management AI. Given the company strategy and department, generate ONE strategic objective.

Company strategy: "${strategy || "Improve execution and operational performance across all departments."}"
Department: ${dept.name}

Generate a specific, measurable objective that this department should pursue this quarter to support the company strategy. The objective must be:
- Directly tied to the strategy (not generic like "improve performance")
- Specific to what the ${dept.name} department does
- Achievable within a quarter
- Written as an outcome, not an activity

Respond ONLY with a JSON object:
{"title": "...", "description": "..."}`;

        let objTitle = `${dept.name}: Drive strategic outcomes aligned with company goals`;
        let objDescription = `Support the company strategy through measurable ${dept.name} department outcomes this quarter.`;

        try {
          const aiRes = await fetch(
            `/api/o/${encodeURIComponent(slug)}/ai/actions`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                action: "diagnose_underperformance",
                prompt: objGenPrompt,
              }),
            },
          );
          const aiData = (await aiRes.json()) as {
            ok: boolean;
            preview?: { title?: string; description?: string };
          };
          if (aiData.ok && aiData.preview?.title) {
            objTitle = aiData.preview.title;
            if (aiData.preview.description) {
              objDescription = aiData.preview.description;
            }
          }
        } catch {
          // Fall back to the constructed title — non-fatal
        }

        const objRes = await fetch(
          `/api/o/${encodeURIComponent(slug)}/objectives`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              title: objTitle,
              description: objDescription,
              department_id: dept.id,
              status: "on_track",
              progress: 0,
              source: "ai",
            }),
          },
        );

        const objData = (await objRes.json()) as {
          ok: boolean;
          id?: string;
          error?: string;
        };

        if (!objRes.ok || !objData.ok || !objData.id) {
          throw new Error(objData.error || "Failed to create objective");
        }

        const objectiveId = objData.id;

        setGenerations((prev) =>
          prev.map((gen, gi) =>
            gi !== di ? gen : { ...gen, objectiveId },
          ),
        );

        updateStep(di, 0, {
          status: "done",
          detail: objTitle,
        });

        // ──── Step 2: Generate OKRs (3x) ────
        updateStep(di, 1, { status: "running" });

        let okrCount = 0;
        for (let okrIdx = 0; okrIdx < 3; okrIdx++) {
          try {
            const okrPrompt = `Generate OKR #${okrIdx + 1} for the ${dept.name} department.

Company strategy: "${strategy || "Improve execution and operational performance."}"
Department objective: "${objTitle}" (objective_id: ${objectiveId})
Department: ${dept.name}

IMPORTANT: You MUST set objective_id to exactly "${objectiveId}" in your response.

This is OKR ${okrIdx + 1} of 3. Each OKR must be distinct and non-overlapping.
Focus on measurable, actionable key results tied to the department objective.
Include 2-3 key results per OKR with concrete numeric targets.`;

            const okrRes = await fetch(
              `/api/o/${encodeURIComponent(slug)}/ai/actions?execute=true`,
              {
                method: "POST",
                headers,
                body: JSON.stringify({
                  action: "create_okr",
                  prompt: okrPrompt,
                }),
              },
            );

            const okrData = (await okrRes.json()) as {
              ok: boolean;
              error?: string;
            };

            if (okrRes.ok && okrData.ok) {
              okrCount++;
            }
          } catch {
            // Continue to next OKR even if one fails
          }
        }

        updateStep(di, 1, {
          status: okrCount > 0 ? "done" : "error",
          detail: `${okrCount} of 3 OKRs generated`,
        });

        // ──── Step 3: Create KPIs (3x) ────
        updateStep(di, 2, { status: "running" });

        // Generate KPI suggestions using AI, then create them directly
        const kpiPrompt = `Generate exactly 3 KPIs for the ${dept.name} department.

Company strategy: "${strategy || "Improve execution and operational performance."}"
Department objective: "${objTitle}"

Each KPI must be:
- Specific and measurable
- Relevant to what ${dept.name} does
- Have a realistic target value and current baseline
- Include a unit of measurement

Respond ONLY with a JSON object:
{
  "kpis": [
    {"title": "...", "description": "...", "unit": "...", "target_value": 100, "current_value": 0, "direction": "increase"},
    {"title": "...", "description": "...", "unit": "...", "target_value": 100, "current_value": 0, "direction": "increase"},
    {"title": "...", "description": "...", "unit": "...", "target_value": 100, "current_value": 0, "direction": "increase"}
  ]
}`;

        let kpiCount = 0;
        try {
          // Use the AI action to generate KPI suggestions
          const kpiAiRes = await fetch(
            `/api/o/${encodeURIComponent(slug)}/ai/actions`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                action: "diagnose_underperformance",
                prompt: kpiPrompt,
              }),
            },
          );

          const kpiAiData = (await kpiAiRes.json()) as {
            ok: boolean;
            preview?: { kpis?: Array<{
              title?: string;
              description?: string;
              unit?: string;
              target_value?: number;
              current_value?: number;
              direction?: string;
            }> };
          };

          const kpiSuggestions = kpiAiData.ok && Array.isArray(kpiAiData.preview?.kpis)
            ? kpiAiData.preview.kpis
            : [
                { title: `${dept.name} output rate`, unit: "count", target_value: 100, current_value: 0, direction: "increase" },
                { title: `${dept.name} quality score`, unit: "%", target_value: 95, current_value: 70, direction: "increase" },
                { title: `${dept.name} cycle time`, unit: "days", target_value: 5, current_value: 14, direction: "decrease" },
              ];

          // Create each KPI via the KPIs API
          for (const kpiSuggestion of kpiSuggestions.slice(0, 3)) {
            try {
              const createRes = await fetch(
                `/api/o/${encodeURIComponent(slug)}/kpis`,
                {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    title: kpiSuggestion.title || `${dept.name} KPI`,
                    description: kpiSuggestion.description || null,
                    department_id: dept.id,
                    unit: kpiSuggestion.unit || "count",
                    target_value: kpiSuggestion.target_value ?? 100,
                    current_value: kpiSuggestion.current_value ?? 0,
                    direction: kpiSuggestion.direction || "increase",
                    measurement_type: "number",
                    frequency: "monthly",
                    weight: 1,
                    source: "ai",
                  }),
                },
              );

              const createData = (await createRes.json()) as { ok: boolean };
              if (createRes.ok && createData.ok) {
                kpiCount++;
              }
            } catch {
              // Continue to next KPI
            }
          }
        } catch {
          // If AI suggestion fails entirely, create 3 fallback KPIs
          const fallbacks = [
            { title: `${dept.name} output volume`, unit: "count", target: 100, current: 0 },
            { title: `${dept.name} quality rate`, unit: "%", target: 95, current: 70 },
            { title: `${dept.name} efficiency score`, unit: "score", target: 90, current: 50 },
          ];

          for (const fb of fallbacks) {
            try {
              const fbRes = await fetch(
                `/api/o/${encodeURIComponent(slug)}/kpis`,
                {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    title: fb.title,
                    department_id: dept.id,
                    unit: fb.unit,
                    target_value: fb.target,
                    current_value: fb.current,
                    direction: "increase",
                    measurement_type: "number",
                    frequency: "monthly",
                    weight: 1,
                  }),
                },
              );
              const fbData = (await fbRes.json()) as { ok: boolean };
              if (fbRes.ok && fbData.ok) kpiCount++;
            } catch {
              // Continue
            }
          }
        }

        updateStep(di, 2, {
          status: kpiCount > 0 ? "done" : "error",
          detail: `${kpiCount} KPI${kpiCount === 1 ? "" : "s"} created`,
        });
      } catch (e) {
        // Objective creation failed — mark all remaining steps as error
        updateStep(di, 0, {
          status: "error",
          detail: getErrorMessage(e, "Failed"),
        });
        updateStep(di, 1, { status: "error", detail: "Skipped" });
        updateStep(di, 2, { status: "error", detail: "Skipped" });

        setGenerations((prev) =>
          prev.map((gen, gi) =>
            gi !== di
              ? gen
              : { ...gen, error: getErrorMessage(e, "Failed to create objective") },
          ),
        );
      }

      // Small delay between departments to avoid rate limiting
      if (di < departments.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    setRunning(false);
    setDone(true);
  }, [departments, slug, strategy, ensureAuth, updateStep]);

  // Auto-start generation when departments are loaded
  useEffect(() => {
    if (!loading && departments.length > 0 && !running && !done && !startedRef.current) {
      startedRef.current = true;
      void runGeneration();
    }
  }, [loading, departments, running, done, runGeneration]);

  // ──── Computed stats ────
  const totalSteps = generations.reduce((sum, g) => sum + g.steps.length, 0);
  const completedSteps = generations.reduce(
    (sum, g) => sum + g.steps.filter((s) => s.status === "done").length,
    0,
  );
  const errorSteps = generations.reduce(
    (sum, g) => sum + g.steps.filter((s) => s.status === "error").length,
    0,
  );
  const progress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppShell slug={slug} sessionEmail={sessionEmail}>
        <AppPageHeader
          title="Preparing AI generation"
          description="Loading your departments and strategy context."
        />
        <div className="mt-6 grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-[24px] border border-[var(--border)] bg-[var(--card)]"
            />
          ))}
        </div>
      </AppShell>
    );
  }

  if (departments.length === 0) {
    return (
      <AppShell slug={slug} sessionEmail={sessionEmail}>
        <AppPageHeader
          title="No departments found"
          description="Add departments in the full onboarding flow before generating AI content."
        />
        <div className="mt-6">
          <SectionCard title="Nothing to generate">
            <p className="text-sm text-[var(--foreground-muted)]">
              AI generation needs at least one department to work with. Go back to onboarding and add departments first.
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => router.push(`/o/${slug}/onboarding`)}
                className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90"
              >
                Go to onboarding
              </button>
            </div>
          </SectionCard>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell slug={slug} sessionEmail={sessionEmail}>
      <AppPageHeader
        title={done ? "AI generation complete" : "Generating your performance framework"}
        description={
          done
            ? `Generated objectives, OKRs, and KPIs across ${departments.length} department${departments.length === 1 ? "" : "s"}.`
            : "The AI is creating objectives, OKRs, and KPIs for each department."
        }
        actions={
          done ? (
            <button
              type="button"
              onClick={() => router.push(`/o/${slug}/dashboard`)}
              className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90"
            >
              Go to dashboard
            </button>
          ) : undefined
        }
      />

      {msg ? (
        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-[#ef4444]">
          {msg}
        </div>
      ) : null}

      {/* ── Progress bar ── */}
      <div className="mt-6">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-[var(--foreground)]">
            {done ? "Done" : running ? "Generating…" : "Ready"}
          </span>
          <span className="font-bold tabular-nums text-[var(--foreground)]">
            {progress}%
          </span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-[var(--border)]">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progress}%`,
              backgroundColor: done
                ? errorSteps > 0
                  ? "#f59e0b"
                  : "#10b981"
                : "#6366f1",
            }}
          />
        </div>
        <div className="mt-2 flex gap-4 text-xs text-[var(--foreground-muted)]">
          <span>{completedSteps} completed</span>
          {errorSteps > 0 ? (
            <span className="text-[#ef4444]">{errorSteps} failed</span>
          ) : null}
          <span>
            {totalSteps - completedSteps - errorSteps} remaining
          </span>
        </div>
      </div>

      {/* ── Department cards ── */}
      <div className="mt-8 grid gap-4">
        {generations.map((gen, di) => {
          const allDone = gen.steps.every(
            (s) => s.status === "done" || s.status === "error",
          );
          const hasError = gen.steps.some((s) => s.status === "error");
          const isRunning = gen.steps.some((s) => s.status === "running");

          return (
            <SectionCard
              key={gen.department.id}
              title={gen.department.name}
              subtitle={
                allDone
                  ? hasError
                    ? "Completed with errors"
                    : "All steps complete"
                  : isRunning
                  ? "Generating…"
                  : "Waiting"
              }
              className="bg-[var(--background-panel)]"
            >
              <div className="grid gap-3">
                {gen.steps.map((step, si) => (
                  <div
                    key={si}
                    className="flex items-center gap-4 rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-4"
                  >
                    <StepIcon status={step.status} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[var(--foreground)]">
                        {step.label}
                      </div>
                      {step.detail ? (
                        <div className="mt-1 text-xs text-[var(--foreground-muted)]">
                          {step.detail}
                        </div>
                      ) : null}
                    </div>
                    <StatusBadge
                      tone={
                        step.status === "done"
                          ? "success"
                          : step.status === "error"
                          ? "danger"
                          : step.status === "running"
                          ? "info"
                          : "neutral"
                      }
                    >
                      {step.status === "done"
                        ? "Done"
                        : step.status === "error"
                        ? "Error"
                        : step.status === "running"
                        ? "Running"
                        : "Pending"}
                    </StatusBadge>
                  </div>
                ))}
              </div>

              {gen.error ? (
                <div className="mt-3 rounded-[14px] border border-red-500/20 bg-red-500/10 p-3 text-xs text-[#ef4444]">
                  {gen.error}
                </div>
              ) : null}
            </SectionCard>
          );
        })}
      </div>

      {/* ── Completion actions ── */}
      {done ? (
        <div className="mt-8 rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-6 text-center">
          <div className="text-lg font-bold text-[var(--foreground)]">
            {errorSteps > 0
              ? "Generation completed with some issues"
              : "Everything is set up"}
          </div>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">
            {errorSteps > 0
              ? "Some items failed to generate. You can manually create the missing ones from the dashboard."
              : "Your objectives, OKRs, and KPIs have been created. Head to the dashboard to start tracking performance."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => router.push(`/o/${slug}/dashboard`)}
              className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90"
            >
              Go to dashboard
            </button>
            <button
              type="button"
              onClick={() => router.push(`/o/${slug}/objectives`)}
              className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
            >
              View objectives
            </button>
            <button
              type="button"
              onClick={() => router.push(`/o/${slug}/okrs`)}
              className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
            >
              View OKRs
            </button>
            <button
              type="button"
              onClick={() => router.push(`/o/${slug}/kpis`)}
              className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
            >
              View KPIs
            </button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Step icon — animated spinner for running, check for done, x for error
// ────────────────────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: GenerationStep["status"] }) {
  if (status === "running") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[#6366f1]" />
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#10b981]">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M3 7.5L5.5 10L11 4"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ef4444]">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M4 4L10 10M10 4L4 10"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  // Pending
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--border)] bg-[var(--card-subtle)]">
      <div className="h-2 w-2 rounded-full bg-[var(--foreground-muted)]" />
    </div>
  );
}
