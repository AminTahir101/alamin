"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import SectionCard from "@/components/ui/SectionCard";
import CycleManager, { type CycleSummary } from "@/components/cycles/CycleManager";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Department = { id: string; name: string };

type KpiPayload = {
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

type VariantPayload = {
  variant_key: "conservative" | "growth" | "efficiency";
  title: string;
  rationale: string;
  kpis: KpiPayload[];
};

type Blueprint = {
  id: string;
  org_id: string;
  cycle_id: string | null;
  department_id: string | null;
  blueprint_type: string;
  variant_key: string;
  title: string;
  rationale: string | null;
  status: string;
  blueprint_payload: VariantPayload;
  created_at: string;
};

type ListResponse = {
  ok: true;
  cycle: CycleSummary | null;
  departments: Department[];
  blueprintsByDepartment: Record<string, Blueprint[]>;
};

type EditableKpi = KpiPayload & {
  current_value: number;
  include: boolean;
};

type DeptStatus = "idle" | "generating" | "ready" | "applied" | "error";

// ─────────────────────────────────────────────────────────────────────────────
// Style helpers — canonical patterns from /okrs, /objectives, /kpis pages
// ─────────────────────────────────────────────────────────────────────────────

function itemCardClass() {
  return "rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-5 alamin-shadow";
}

function subCardClass() {
  return "rounded-2xl border border-[var(--border)] bg-[var(--card-soft)] p-4";
}

function inputClass() {
  return "w-full rounded-2xl border border-[var(--border)] bg-[var(--background-elevated)] px-4 py-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] focus:border-[var(--border-active)] disabled:opacity-60";
}

function primaryButtonClass() {
  return "inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
}

function secondaryButtonClass() {
  return "inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)] disabled:cursor-not-allowed disabled:opacity-50";
}

function pillClass(variant: string, isSelected: boolean) {
  const base =
    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition";
  if (!isSelected) {
    return `${base} border-[var(--border)] bg-[var(--button-secondary-bg)] text-[var(--foreground-muted)] hover:border-[var(--border-strong)] hover:text-[var(--foreground)]`;
  }
  switch (variant) {
    case "conservative":
      return `${base} border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-100`;
    case "growth":
      return `${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-100`;
    case "efficiency":
      return `${base} border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-100`;
    default:
      return `${base} border-[var(--border-strong)] bg-[var(--card)] text-[var(--foreground)]`;
  }
}

function metricCardToneClass(tone: "default" | "success" | "warning" | "danger") {
  switch (tone) {
    case "success":
      return "border-emerald-500/20 bg-emerald-500/10";
    case "warning":
      return "border-amber-500/20 bg-amber-500/10";
    case "danger":
      return "border-red-500/20 bg-red-500/10";
    default:
      return "border-[var(--border)] bg-[var(--card)]";
  }
}

function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <div className={`rounded-[24px] border p-5 alamin-shadow ${metricCardToneClass(tone)}`}>
      <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--foreground-faint)]">
        {label}
      </div>
      <div className="mt-3 text-3xl font-black tracking-[-0.03em] text-[var(--foreground)]">
        {value}
      </div>
      <div className="mt-2 text-sm text-[var(--foreground-muted)]">{hint}</div>
    </div>
  );
}

function variantLabel(key: string): string {
  switch (key) {
    case "conservative":
      return "Conservative";
    case "growth":
      return "Growth";
    case "efficiency":
      return "Efficiency";
    default:
      return key;
  }
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AiSetupPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const orgSlug = String(params?.slug ?? "").trim();

  const [session, setSession] = useState<Session | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cycle, setCycle] = useState<CycleSummary | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [blueprintsByDept, setBlueprintsByDept] = useState<
    Record<string, Blueprint[]>
  >({});
  const [deptStatus, setDeptStatus] = useState<Record<string, DeptStatus>>({});
  const [deptError, setDeptError] = useState<Record<string, string | null>>({});
  const [editable, setEditable] = useState<Record<string, EditableKpi[]>>({});
  const [selectedVariant, setSelectedVariant] = useState<Record<string, string>>(
    {},
  );
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const ensureAuth = useCallback(async (): Promise<Session | null> => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      router.replace("/auth");
      return null;
    }
    setSession(data.session);
    setSessionEmail(data.session.user.email ?? null);
    return data.session;
  }, [router]);

  const initializeEditableForBlueprint = useCallback((bp: Blueprint) => {
    const variant = bp.blueprint_payload;
    if (!variant || !Array.isArray(variant.kpis)) return;

    setEditable((prev) => {
      if (prev[bp.id]) return prev;
      const editableKpis: EditableKpi[] = variant.kpis.map((kpi) => ({
        ...kpi,
        current_value: 0,
        include: true,
      }));
      return { ...prev, [bp.id]: editableKpis };
    });
  }, []);

  const generateForDepartment = useCallback(
    async (departmentId: string, sessionToken: string) => {
      setDeptStatus((prev) => ({ ...prev, [departmentId]: "generating" }));
      setDeptError((prev) => ({ ...prev, [departmentId]: null }));

      try {
        const url = `/api/o/${encodeURIComponent(orgSlug)}/ai/blueprints/kpis`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ department_id: departmentId }),
          cache: "no-store",
        });

        const data = await safeJson<{
          ok: boolean;
          error?: string;
          drafts?: Blueprint[];
        }>(res);

        if (!res.ok || !data || !data.ok) {
          throw new Error(
            data?.error || `Generation failed (HTTP ${res.status})`,
          );
        }

        const drafts = data.drafts ?? [];
        setBlueprintsByDept((prev) => ({ ...prev, [departmentId]: drafts }));
        for (const bp of drafts) {
          initializeEditableForBlueprint(bp);
        }
        if (drafts.length > 0) {
          setSelectedVariant((prev) => ({
            ...prev,
            [departmentId]: prev[departmentId] ?? drafts[0].id,
          }));
        }
        setDeptStatus((prev) => ({ ...prev, [departmentId]: "ready" }));
      } catch (err: unknown) {
        setDeptStatus((prev) => ({ ...prev, [departmentId]: "error" }));
        setDeptError((prev) => ({
          ...prev,
          [departmentId]: getErrorMessage(err, "Failed to generate"),
        }));
      }
    },
    [orgSlug, initializeEditableForBlueprint],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    const s = await ensureAuth();
    if (!s) return;

    try {
      const url = `/api/o/${encodeURIComponent(orgSlug)}/ai/blueprints`;
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${s.access_token}` },
        cache: "no-store",
      });

      const data = await safeJson<ListResponse>(res);
      if (!res.ok || !data || !data.ok) {
        throw new Error(`Failed to load blueprints (HTTP ${res.status})`);
      }

      setCycle(data.cycle);
      setDepartments(data.departments ?? []);
      setBlueprintsByDept(data.blueprintsByDepartment ?? {});

      for (const dept of data.departments ?? []) {
        const drafts = data.blueprintsByDepartment?.[dept.id] ?? [];
        for (const bp of drafts) {
          initializeEditableForBlueprint(bp);
        }
        if (drafts.length > 0) {
          const draftFirst = drafts.find((b) => b.status === "draft") ?? drafts[0];
          setSelectedVariant((prev) => ({
            ...prev,
            [dept.id]: prev[dept.id] ?? draftFirst.id,
          }));
          const allApplied = drafts.every((b) => b.status === "applied");
          setDeptStatus((prev) => ({
            ...prev,
            [dept.id]: allApplied ? "applied" : "ready",
          }));
        } else {
          setDeptStatus((prev) => ({ ...prev, [dept.id]: "idle" }));
        }
      }

      const deptsToGenerate = (data.departments ?? []).filter(
        (d) => (data.blueprintsByDepartment?.[d.id] ?? []).length === 0,
      );

      await Promise.all(
        deptsToGenerate.map((d) =>
          generateForDepartment(d.id, s.access_token),
        ),
      );
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, "Failed to load AI setup"));
    } finally {
      setLoading(false);
    }
  }, [orgSlug, ensureAuth, generateForDepartment, initializeEditableForBlueprint]);

  useEffect(() => {
    void loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateKpiField = useCallback(
    <K extends keyof EditableKpi>(
      blueprintId: string,
      kpiIndex: number,
      field: K,
      value: EditableKpi[K],
    ) => {
      setEditable((prev) => {
        const list = prev[blueprintId];
        if (!list) return prev;
        const next = [...list];
        next[kpiIndex] = { ...next[kpiIndex], [field]: value };
        return { ...prev, [blueprintId]: next };
      });
    },
    [],
  );

  const toggleKpiInclude = useCallback(
    (blueprintId: string, kpiIndex: number) => {
      setEditable((prev) => {
        const list = prev[blueprintId];
        if (!list) return prev;
        const next = [...list];
        next[kpiIndex] = {
          ...next[kpiIndex],
          include: !next[kpiIndex].include,
        };
        return { ...prev, [blueprintId]: next };
      });
    },
    [],
  );

  const applyVariant = useCallback(
    async (departmentId: string, blueprintId: string) => {
      if (!session) return;
      const kpis = editable[blueprintId];
      if (!kpis || kpis.length === 0) return;

      const selected = kpis.filter((k) => k.include);
      if (selected.length === 0) {
        setDeptError((prev) => ({
          ...prev,
          [departmentId]: "Select at least one KPI before applying",
        }));
        return;
      }

      setApplyingId(blueprintId);
      setDeptError((prev) => ({ ...prev, [departmentId]: null }));

      try {
        const url = `/api/o/${encodeURIComponent(orgSlug)}/ai/blueprints/apply`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            blueprint_id: blueprintId,
            kpis: selected.map((k) => ({
              title: k.title,
              description: k.description,
              measurement_type: k.measurement_type,
              direction: k.direction,
              unit: k.unit,
              baseline_value: k.baseline_value,
              target_value: k.target_value,
              current_value: k.current_value,
              frequency: k.frequency,
              weight: k.weight,
              include: true,
            })),
          }),
        });

        const data = await safeJson<{
          ok: boolean;
          error?: string;
          applied_count?: number;
        }>(res);

        if (!res.ok || !data || !data.ok) {
          throw new Error(data?.error || `Apply failed (HTTP ${res.status})`);
        }

        setBlueprintsByDept((prev) => {
          const list = prev[departmentId] ?? [];
          const next = list.map((bp) =>
            bp.id === blueprintId ? { ...bp, status: "applied" } : bp,
          );
          return { ...prev, [departmentId]: next };
        });
        setDeptStatus((prev) => ({ ...prev, [departmentId]: "applied" }));
      } catch (err: unknown) {
        setDeptError((prev) => ({
          ...prev,
          [departmentId]: getErrorMessage(err, "Failed to apply"),
        }));
      } finally {
        setApplyingId(null);
      }
    },
    [session, editable, orgSlug],
  );

  const allDeptsApplied = useMemo(() => {
    if (departments.length === 0) return false;
    return departments.every((d) => deptStatus[d.id] === "applied");
  }, [departments, deptStatus]);

  const appliedCount = useMemo(
    () => departments.filter((d) => deptStatus[d.id] === "applied").length,
    [departments, deptStatus],
  );

  return (
    <AppShell slug={orgSlug} sessionEmail={sessionEmail}>
      <AppPageHeader
        eyebrow={cycle ? `Q${cycle.quarter} ${cycle.year} · AI Setup` : "AI Setup Center"}
        title="Review your AI-generated KPIs"
        description="ALAMIN has drafted three KPI variants for each department, based on your strategy and company context. Pick the variant that fits, edit anything you want, then apply them to your workspace."
      />

      <section className="mb-6 overflow-hidden rounded-[30px] border border-[var(--border)] bg-[var(--background-panel)] p-6 alamin-shadow">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground-faint)]">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />
              AI Setup · Step 1 of 2
            </div>

            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-[var(--foreground)]">
              The permanent vital signs of your business.
            </h2>

            <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--foreground-muted)]">
              KPIs are the continuous measurements you track across every cycle — your revenue, retention, quality, velocity. ALAMIN generated three variants per department so you can pick the emphasis that fits your strategy.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <div className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)]">
                Conservative · Growth · Efficiency
              </div>
              <div className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)]">
                Editable before apply
              </div>
              <CycleManager
                slug={orgSlug}
                currentCycle={cycle}
                onCycleChanged={(newCycle) => {
                  setCycle(newCycle);
                  void loadInitial();
                }}
              />
            </div>
          </div>

          <div className="grid gap-3">
            <MetricCard
              label="Current cycle"
              value={cycle ? `Q${cycle.quarter} ${cycle.year}` : "—"}
              hint={cycle ? "All KPIs tie to this cycle" : "No active cycle"}
              tone="default"
            />
            <MetricCard
              label="Departments"
              value={String(departments.length)}
              hint="Each generates 3 variants"
              tone="default"
            />
            <MetricCard
              label="Progress"
              value={`${appliedCount} / ${departments.length}`}
              hint="Departments with KPIs applied"
              tone={
                departments.length > 0 && appliedCount === departments.length
                  ? "success"
                  : appliedCount > 0
                    ? "warning"
                    : "default"
              }
            />
          </div>
        </div>
      </section>

      {errorMsg && (
        <div className="mb-6 rounded-[20px] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-700 dark:text-red-100">
          {errorMsg}
        </div>
      )}

      {loading && (
        <SectionCard className="bg-[var(--background-panel)]">
          <div className="flex items-center justify-center gap-3 py-10 text-sm text-[var(--foreground-muted)]">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--foreground)]" />
            Loading your AI setup…
          </div>
        </SectionCard>
      )}

      {!loading && departments.length === 0 && (
        <SectionCard
          title="No departments found"
          subtitle="You need to add at least one department before AI can generate KPIs"
          className="bg-[var(--background-panel)]"
        >
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() =>
                router.push(`/o/${encodeURIComponent(orgSlug)}/onboarding`)
              }
              className={primaryButtonClass()}
            >
              Back to onboarding
            </button>
            <button
              type="button"
              onClick={() =>
                router.push(`/o/${encodeURIComponent(orgSlug)}/departments`)
              }
              className={secondaryButtonClass()}
            >
              Manage departments
            </button>
          </div>
        </SectionCard>
      )}

      {!loading && departments.length > 0 && (
        <div className="space-y-6">
          {departments.map((dept) => {
            const drafts = blueprintsByDept[dept.id] ?? [];
            const status = deptStatus[dept.id] ?? "idle";
            const error = deptError[dept.id];
            const selectedBpId = selectedVariant[dept.id];
            const selectedBp = drafts.find((b) => b.id === selectedBpId);

            return (
              <SectionCard
                key={dept.id}
                title={dept.name}
                subtitle={
                  status === "applied"
                    ? "KPIs applied to your workspace"
                    : "Choose a variant, edit, then apply"
                }
                className="bg-[var(--background-panel)]"
                actions={
                  status === "applied" ? (
                    <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-100">
                      Applied
                    </span>
                  ) : null
                }
              >
                {status === "generating" && (
                  <div className="flex items-center gap-3 py-6 text-sm text-[var(--foreground-muted)]">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--foreground)]" />
                    Generating KPI variants for {dept.name}…
                  </div>
                )}

                {status === "error" && (
                  <div className="space-y-3">
                    <div className="rounded-[20px] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-700 dark:text-red-100">
                      {error || "Generation failed"}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        session &&
                        generateForDepartment(dept.id, session.access_token)
                      }
                      className={secondaryButtonClass()}
                    >
                      Retry generation
                    </button>
                  </div>
                )}

                {status === "applied" && (
                  <div className="rounded-[20px] border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-700 dark:text-emerald-100">
                    KPIs for {dept.name} are now live in your workspace.
                  </div>
                )}

                {status === "ready" && drafts.length > 0 && (
                  <div className="space-y-5">
                    <div className="flex flex-wrap gap-2">
                      {drafts.map((bp) => {
                        const isSelected = bp.id === selectedBpId;
                        const isApplied = bp.status === "applied";
                        return (
                          <button
                            key={bp.id}
                            type="button"
                            onClick={() =>
                              setSelectedVariant((prev) => ({
                                ...prev,
                                [dept.id]: bp.id,
                              }))
                            }
                            className={pillClass(bp.variant_key, isSelected)}
                          >
                            {variantLabel(bp.variant_key)}
                            {isApplied && <span>✓</span>}
                          </button>
                        );
                      })}
                    </div>

                    {selectedBp && (
                      <div className="space-y-4">
                        <div className={subCardClass()}>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                            Why this variant
                          </div>
                          <div className="mt-2 text-sm leading-6 text-[var(--foreground-muted)]">
                            {selectedBp.rationale ||
                              selectedBp.blueprint_payload?.rationale ||
                              "—"}
                          </div>
                        </div>

                        <div className="space-y-3">
                          {(editable[selectedBp.id] ?? []).map((kpi, idx) => (
                            <KpiEditorCard
                              key={`${selectedBp.id}-${idx}`}
                              kpi={kpi}
                              onChange={(field, value) =>
                                updateKpiField(selectedBp.id, idx, field, value)
                              }
                              onToggleInclude={() =>
                                toggleKpiInclude(selectedBp.id, idx)
                              }
                            />
                          ))}
                        </div>

                        {error && (
                          <div className="rounded-[20px] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-700 dark:text-red-100">
                            {error}
                          </div>
                        )}

                        <div className="flex justify-end">
                          <button
                            type="button"
                            disabled={applyingId === selectedBp.id}
                            onClick={() => applyVariant(dept.id, selectedBp.id)}
                            className={primaryButtonClass()}
                          >
                            {applyingId === selectedBp.id
                              ? "Applying…"
                              : "Apply this variant"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </SectionCard>
            );
          })}
        </div>
      )}

      {!loading && departments.length > 0 && (
        <SectionCard className="mt-6 bg-[var(--background-panel)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm text-[var(--foreground-muted)]">
              {allDeptsApplied
                ? "All KPIs applied. Next, set the objectives you're pushing on this cycle."
                : `Apply ${departments.length - appliedCount} more department${
                    departments.length - appliedCount === 1 ? "" : "s"
                  } to finish KPI setup, or skip and configure later.`}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  router.push(`/o/${encodeURIComponent(orgSlug)}/dashboard`)
                }
                className={secondaryButtonClass()}
              >
                Skip to dashboard
              </button>
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/o/${encodeURIComponent(orgSlug)}/ai-setup/okrs`,
                  )
                }
                disabled={!allDeptsApplied}
                className={primaryButtonClass()}
              >
                Continue to OKR setup
              </button>
            </div>
          </div>
        </SectionCard>
      )}
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Editor Card
// ─────────────────────────────────────────────────────────────────────────────

type KpiEditorCardProps = {
  kpi: EditableKpi;
  onChange: <K extends keyof EditableKpi>(
    field: K,
    value: EditableKpi[K],
  ) => void;
  onToggleInclude: () => void;
};

function KpiEditorCard({ kpi, onChange, onToggleInclude }: KpiEditorCardProps) {
  return (
    <div
      className={`rounded-2xl border border-[var(--border)] bg-[var(--card-soft)] p-4 transition ${
        kpi.include ? "" : "opacity-50"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={kpi.include}
          onChange={onToggleInclude}
          className="mt-1 h-4 w-4 cursor-pointer rounded border-[var(--border)]"
        />
        <div className="flex-1 space-y-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
              KPI title
            </label>
            <input
              type="text"
              value={kpi.title}
              onChange={(e) => onChange("title", e.target.value)}
              disabled={!kpi.include}
              className={`mt-1 ${inputClass()}`}
            />
          </div>

          {kpi.why_recommended && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                Why this KPI
              </div>
              <div className="mt-1 text-xs leading-5 text-[var(--foreground-muted)]">
                {kpi.why_recommended}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                Unit
              </label>
              <input
                type="text"
                value={kpi.unit ?? ""}
                onChange={(e) => onChange("unit", e.target.value || null)}
                disabled={!kpi.include}
                className={`mt-1 ${inputClass()}`}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                Target
              </label>
              <input
                type="number"
                value={kpi.target_value}
                onChange={(e) =>
                  onChange("target_value", Number(e.target.value))
                }
                disabled={!kpi.include}
                className={`mt-1 ${inputClass()}`}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                Current
              </label>
              <input
                type="number"
                value={kpi.current_value}
                onChange={(e) =>
                  onChange("current_value", Number(e.target.value))
                }
                disabled={!kpi.include}
                className={`mt-1 ${inputClass()}`}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                Direction
              </label>
              <select
                value={kpi.direction}
                onChange={(e) =>
                  onChange(
                    "direction",
                    e.target.value as "increase" | "decrease",
                  )
                }
                disabled={!kpi.include}
                className={`mt-1 ${inputClass()}`}
              >
                <option value="increase">Increase</option>
                <option value="decrease">Decrease</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                Frequency
              </label>
              <select
                value={kpi.frequency}
                onChange={(e) => onChange("frequency", e.target.value)}
                disabled={!kpi.include}
                className={`mt-1 ${inputClass()}`}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                Weight
              </label>
              <input
                type="number"
                value={kpi.weight}
                onChange={(e) => onChange("weight", Number(e.target.value))}
                disabled={!kpi.include}
                className={`mt-1 ${inputClass()}`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
