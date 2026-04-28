"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import SectionCard from "@/components/ui/SectionCard";
import CycleManager, { type CycleSummary } from "@/components/cycles/CycleManager";
import { useLanguage } from "@/lib/i18n/LanguageContext";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Department = { id: string; name: string };

type KeyResult = {
  title: string;
  why_recommended: string;
  metric_name: string;
  metric_type: string;
  unit: string | null;
  start_value: number;
  current_value: number;
  target_value: number;
  link_to_kpi_title: string | null;
};

type Okr = {
  title: string;
  rationale: string;
  key_results: KeyResult[];
};

type ObjectivePayload = {
  title: string;
  description: string;
  rationale: string;
  okrs: Okr[];
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
  blueprint_payload: ObjectivePayload;
  created_at: string;
};

type ListResponse = {
  ok: true;
  cycle: CycleSummary | null;
  departments: Department[];
  blueprintsByDepartment: Record<string, Blueprint[]>;
};

type EditableKr = KeyResult & { include: boolean };

type EditableObjective = {
  title: string;
  description: string;
  rationale: string;
  okrs: Array<{
    title: string;
    rationale: string;
    key_results: EditableKr[];
  }>;
};

type DeptStatus = "idle" | "generating" | "ready" | "partial" | "applied" | "error";

// ─────────────────────────────────────────────────────────────────────────────
// Style helpers (mirror KPI page)
// ─────────────────────────────────────────────────────────────────────────────

function softCardClass() {
  return "rounded-2xl border border-[var(--border)] bg-[var(--card-subtle)] p-4";
}

function inputClass() {
  return "w-full rounded-2xl border border-[var(--border)] bg-[var(--background-elevated)] px-4 py-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] focus:border-[var(--border-active)] disabled:opacity-60";
}

function actionPrimaryClass() {
  return "rounded-2xl border border-[var(--border)] bg-[var(--foreground)] px-5 py-2.5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
}

function actionGhostClass() {
  return "rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)] disabled:cursor-not-allowed disabled:opacity-50";
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

function blueprintToEditable(bp: Blueprint): EditableObjective {
  const o = bp.blueprint_payload;
  return {
    title: o?.title ?? "",
    description: o?.description ?? "",
    rationale: o?.rationale ?? "",
    okrs: (o?.okrs ?? []).map((okr) => ({
      title: okr.title ?? "",
      rationale: okr.rationale ?? "",
      key_results: (okr.key_results ?? []).map((kr) => ({
        ...kr,
        include: true,
      })),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AiSetupOkrsPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const orgSlug = String(params?.slug ?? "").trim();
  const { t } = useLanguage();
  const pg = t.pages.okrs;

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
  // editable[blueprint_id] = EditableObjective
  const [editable, setEditable] = useState<Record<string, EditableObjective>>({});
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

  const initializeEditable = useCallback((bp: Blueprint) => {
    setEditable((prev) => {
      if (prev[bp.id]) return prev;
      return { ...prev, [bp.id]: blueprintToEditable(bp) };
    });
  }, []);

  const generateForDepartment = useCallback(
    async (departmentId: string, token: string) => {
      setDeptStatus((prev) => ({ ...prev, [departmentId]: "generating" }));
      setDeptError((prev) => ({ ...prev, [departmentId]: null }));

      try {
        const url = `/api/o/${encodeURIComponent(orgSlug)}/ai/blueprints/okrs`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
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
        for (const bp of drafts) initializeEditable(bp);
        setDeptStatus((prev) => ({ ...prev, [departmentId]: "ready" }));
      } catch (err: unknown) {
        setDeptStatus((prev) => ({ ...prev, [departmentId]: "error" }));
        setDeptError((prev) => ({
          ...prev,
          [departmentId]: getErrorMessage(err, "Failed to generate"),
        }));
      }
    },
    [orgSlug, initializeEditable],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    const s = await ensureAuth();
    if (!s) return;

    try {
      const url = `/api/o/${encodeURIComponent(orgSlug)}/ai/blueprints?type=okr`;
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${s.access_token}` },
        cache: "no-store",
      });

      const data = await safeJson<ListResponse>(res);
      if (!res.ok || !data || !data.ok) {
        throw new Error(`Failed to load OKR blueprints (HTTP ${res.status})`);
      }

      setCycle(data.cycle);
      setDepartments(data.departments ?? []);
      setBlueprintsByDept(data.blueprintsByDepartment ?? {});

      for (const dept of data.departments ?? []) {
        const drafts = data.blueprintsByDepartment?.[dept.id] ?? [];
        for (const bp of drafts) initializeEditable(bp);

        if (drafts.length > 0) {
          const allApplied = drafts.every((b) => b.status === "applied");
          const someApplied = drafts.some((b) => b.status === "applied");
          setDeptStatus((prev) => ({
            ...prev,
            [dept.id]: allApplied
              ? "applied"
              : someApplied
                ? "partial"
                : "ready",
          }));
        } else {
          setDeptStatus((prev) => ({ ...prev, [dept.id]: "idle" }));
        }
      }

      // Auto-generate for departments with no drafts yet
      const toGenerate = (data.departments ?? []).filter(
        (d) => (data.blueprintsByDepartment?.[d.id] ?? []).length === 0,
      );
      await Promise.all(
        toGenerate.map((d) =>
          generateForDepartment(d.id, s.access_token),
        ),
      );
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, "Failed to load OKR setup"));
    } finally {
      setLoading(false);
    }
  }, [orgSlug, ensureAuth, generateForDepartment, initializeEditable]);

  useEffect(() => {
    void loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Edit handlers ─────────────────────────────────────────────────────────

  const updateObjectiveField = useCallback(
    (
      blueprintId: string,
      field: "title" | "description",
      value: string,
    ) => {
      setEditable((prev) => {
        const current = prev[blueprintId];
        if (!current) return prev;
        return { ...prev, [blueprintId]: { ...current, [field]: value } };
      });
    },
    [],
  );

  const updateOkrField = useCallback(
    (blueprintId: string, okrIdx: number, field: "title", value: string) => {
      setEditable((prev) => {
        const current = prev[blueprintId];
        if (!current) return prev;
        const okrs = current.okrs.map((okr, i) =>
          i === okrIdx ? { ...okr, [field]: value } : okr,
        );
        return { ...prev, [blueprintId]: { ...current, okrs } };
      });
    },
    [],
  );

  const updateKrField = useCallback(
    <K extends keyof EditableKr>(
      blueprintId: string,
      okrIdx: number,
      krIdx: number,
      field: K,
      value: EditableKr[K],
    ) => {
      setEditable((prev) => {
        const current = prev[blueprintId];
        if (!current) return prev;
        const okrs = current.okrs.map((okr, i) => {
          if (i !== okrIdx) return okr;
          const key_results = okr.key_results.map((kr, j) =>
            j === krIdx ? { ...kr, [field]: value } : kr,
          );
          return { ...okr, key_results };
        });
        return { ...prev, [blueprintId]: { ...current, okrs } };
      });
    },
    [],
  );

  const toggleKrInclude = useCallback(
    (blueprintId: string, okrIdx: number, krIdx: number) => {
      setEditable((prev) => {
        const current = prev[blueprintId];
        if (!current) return prev;
        const okrs = current.okrs.map((okr, i) => {
          if (i !== okrIdx) return okr;
          const key_results = okr.key_results.map((kr, j) =>
            j === krIdx ? { ...kr, include: !kr.include } : kr,
          );
          return { ...okr, key_results };
        });
        return { ...prev, [blueprintId]: { ...current, okrs } };
      });
    },
    [],
  );

  // ─── Apply ─────────────────────────────────────────────────────────────────

  const applyObjective = useCallback(
    async (departmentId: string, blueprintId: string) => {
      if (!session) return;
      const editableObj = editable[blueprintId];
      if (!editableObj) return;

      // Validate: at least one OKR with at least one included KR
      const hasAny = editableObj.okrs.some(
        (o) => o.key_results.some((k) => k.include),
      );
      if (!hasAny) {
        setDeptError((prev) => ({
          ...prev,
          [departmentId]: "Each objective needs at least one included key result",
        }));
        return;
      }

      setApplyingId(blueprintId);
      setDeptError((prev) => ({ ...prev, [departmentId]: null }));

      try {
        const url = `/api/o/${encodeURIComponent(orgSlug)}/ai/blueprints/okrs/apply`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            blueprint_id: blueprintId,
            objective: editableObj,
          }),
        });

        const data = await safeJson<{
          ok: boolean;
          error?: string;
        }>(res);

        if (!res.ok || !data || !data.ok) {
          throw new Error(data?.error || `Apply failed (HTTP ${res.status})`);
        }

        // Mark this blueprint as applied in local state
        setBlueprintsByDept((prev) => {
          const list = prev[departmentId] ?? [];
          const next = list.map((bp) =>
            bp.id === blueprintId ? { ...bp, status: "applied" } : bp,
          );
          return { ...prev, [departmentId]: next };
        });
        // Recompute dept status
        setBlueprintsByDept((prev) => {
          const list = prev[departmentId] ?? [];
          const allApplied = list.every((b) => b.status === "applied");
          const someApplied = list.some((b) => b.status === "applied");
          setDeptStatus((ps) => ({
            ...ps,
            [departmentId]: allApplied
              ? "applied"
              : someApplied
                ? "partial"
                : "ready",
          }));
          return prev;
        });
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

  // ─── Derived ───────────────────────────────────────────────────────────────

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
        eyebrow={pg.eyebrow}
        title={pg.title}
        description={pg.descriptionFull}
      />

      <SectionCard
        title={pg.activeCycle}
        subtitle={pg.activeCycleSubtitle}
        actions={
          <CycleManager
            slug={orgSlug}
            currentCycle={cycle}
            onCycleChanged={(c) => {
              setCycle(c);
              void loadInitial();
            }}
          />
        }
        className="mb-6"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className={softCardClass()}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
              {pg.currentCycle}
            </div>
            <div className="mt-2 text-base font-semibold text-[var(--foreground)]">
              {cycle ? `Q${cycle.quarter} ${cycle.year}` : t.pages.common.noActiveCycle}
            </div>
          </div>
          <div className={softCardClass()}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
              {pg.departments}
            </div>
            <div className="mt-2 text-base font-semibold text-[var(--foreground)]">
              {departments.length}
            </div>
          </div>
          <div className={softCardClass()}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
              {pg.progress}
            </div>
            <div className="mt-2 text-base font-semibold text-[var(--foreground)]">
              {appliedCount} / {departments.length} {pg.completeSuffix}
            </div>
          </div>
        </div>
      </SectionCard>

      {errorMsg && (
        <SectionCard className="mb-6 border-red-400/30 bg-red-400/5">
          <div className="text-sm text-red-300">{errorMsg}</div>
        </SectionCard>
      )}

      {loading && (
        <SectionCard>
          <div className="flex items-center justify-center gap-3 py-10 text-sm text-[var(--foreground-muted)]">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--foreground)]" />
            {pg.loadingOKRs}
          </div>
        </SectionCard>
      )}

      {!loading && departments.length === 0 && (
        <SectionCard
          title={pg.noDepartments}
          subtitle={pg.noDepartmentsDesc}
        >
          <button
            type="button"
            onClick={() =>
              router.push(`/o/${encodeURIComponent(orgSlug)}/ai-setup`)
            }
            className={actionPrimaryClass()}
          >
            {pg.backToKPIs}
          </button>
        </SectionCard>
      )}

      {!loading && departments.length > 0 && (
        <div className="space-y-6">
          {departments.map((dept) => {
            const drafts = blueprintsByDept[dept.id] ?? [];
            const status = deptStatus[dept.id] ?? "idle";
            const error = deptError[dept.id];

            return (
              <SectionCard
                key={dept.id}
                title={dept.name}
                subtitle={
                  status === "applied"
                    ? pg.deptStatusApplied
                    : status === "partial"
                      ? pg.deptStatusPartial
                      : pg.deptStatusReview
                }
                actions={
                  status === "applied" ? (
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
                      {pg.applied}
                    </span>
                  ) : null
                }
              >
                {status === "generating" && (
                  <div className="flex items-center gap-3 py-6 text-sm text-[var(--foreground-muted)]">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--foreground)]" />
                    {pg.generatingFor} {dept.name}…
                  </div>
                )}

                {status === "error" && (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
                      {error || "Generation failed"}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        session &&
                        generateForDepartment(dept.id, session.access_token)
                      }
                      className={actionGhostClass()}
                    >
                      {pg.retryGeneration}
                    </button>
                  </div>
                )}

                {(status === "ready" || status === "partial" || status === "applied") &&
                  drafts.length > 0 && (
                    <div className="space-y-5">
                      {error && (
                        <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
                          {error}
                        </div>
                      )}
                      {drafts.map((bp) => {
                        const editableObj = editable[bp.id];
                        if (!editableObj) return null;
                        const isApplied = bp.status === "applied";

                        return (
                          <ObjectiveCard
                            key={bp.id}
                            blueprint={bp}
                            editable={editableObj}
                            isApplied={isApplied}
                            isApplying={applyingId === bp.id}
                            onObjectiveField={(f, v) =>
                              updateObjectiveField(bp.id, f, v)
                            }
                            onOkrField={(oi, f, v) =>
                              updateOkrField(bp.id, oi, f, v)
                            }
                            onKrField={(oi, ki, f, v) =>
                              updateKrField(bp.id, oi, ki, f, v)
                            }
                            onKrToggle={(oi, ki) =>
                              toggleKrInclude(bp.id, oi, ki)
                            }
                            onApply={() => applyObjective(dept.id, bp.id)}
                          />
                        );
                      })}
                    </div>
                  )}
              </SectionCard>
            );
          })}
        </div>
      )}

      {!loading && departments.length > 0 && (
        <SectionCard className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm text-[var(--foreground-muted)]">
              {allDeptsApplied
                ? pg.allApplied
                : departments.length - appliedCount === 1
                  ? pg.applyMoreSingle
                  : pg.applyMorePlural.replace("{count}", String(departments.length - appliedCount))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  router.push(`/o/${encodeURIComponent(orgSlug)}/ai-setup`)
                }
                className={actionGhostClass()}
              >
                {pg.backToKPIs}
              </button>
              <button
                type="button"
                onClick={() =>
                  router.push(`/o/${encodeURIComponent(orgSlug)}/dashboard`)
                }
                className={actionPrimaryClass()}
              >
                {allDeptsApplied ? pg.continueBtn : pg.skipBtn}
              </button>
            </div>
          </div>
        </SectionCard>
      )}
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Objective Card — renders one objective with nested OKRs and KRs
// ─────────────────────────────────────────────────────────────────────────────

type ObjectiveCardProps = {
  blueprint: Blueprint;
  editable: EditableObjective;
  isApplied: boolean;
  isApplying: boolean;
  onObjectiveField: (field: "title" | "description", value: string) => void;
  onOkrField: (okrIdx: number, field: "title", value: string) => void;
  onKrField: <K extends keyof EditableKr>(
    okrIdx: number,
    krIdx: number,
    field: K,
    value: EditableKr[K],
  ) => void;
  onKrToggle: (okrIdx: number, krIdx: number) => void;
  onApply: () => void;
};

function ObjectiveCard({
  blueprint,
  editable,
  isApplied,
  isApplying,
  onObjectiveField,
  onOkrField,
  onKrField,
  onKrToggle,
  onApply,
}: ObjectiveCardProps) {
  const { t } = useLanguage();
  const pg = t.pages.okrs;
  return (
    <div className={`${softCardClass()} ${isApplied ? "opacity-70" : ""}`}>
      {/* Objective rationale */}
      {editable.rationale && (
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
            {pg.whyObjective}
          </div>
          <div className="mt-1 text-xs leading-5 text-[var(--foreground-muted)]">
            {editable.rationale}
          </div>
        </div>
      )}

      {/* Objective title */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
          {t.pages.common.objective}
        </label>
        <input
          type="text"
          value={editable.title}
          onChange={(e) => onObjectiveField("title", e.target.value)}
          disabled={isApplied}
          className={inputClass()}
        />
        <textarea
          value={editable.description}
          onChange={(e) => onObjectiveField("description", e.target.value)}
          disabled={isApplied}
          rows={2}
          placeholder="Optional description…"
          className={inputClass()}
        />
      </div>

      {/* OKRs */}
      <div className="mt-5 space-y-4">
        {editable.okrs.map((okr, okrIdx) => (
          <div
            key={okrIdx}
            className="rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-3"
          >
            <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
              OKR
            </label>
            <input
              type="text"
              value={okr.title}
              onChange={(e) => onOkrField(okrIdx, "title", e.target.value)}
              disabled={isApplied}
              className={`mt-1 ${inputClass()}`}
            />

            {/* Key results */}
            <div className="mt-4 space-y-3">
              {okr.key_results.map((kr, krIdx) => (
                <div
                  key={krIdx}
                  className={`rounded-xl border border-[var(--border)] bg-[var(--card-subtle)] p-3 transition ${
                    kr.include ? "" : "opacity-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={kr.include}
                      onChange={() => onKrToggle(okrIdx, krIdx)}
                      disabled={isApplied}
                      className="mt-1 h-4 w-4 cursor-pointer rounded border-[var(--border)]"
                    />
                    <div className="flex-1 space-y-3">
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                          {pg.keyResultLabel}
                        </label>
                        <input
                          type="text"
                          value={kr.title}
                          onChange={(e) =>
                            onKrField(okrIdx, krIdx, "title", e.target.value)
                          }
                          disabled={isApplied || !kr.include}
                          className={`mt-1 ${inputClass()}`}
                        />
                      </div>

                      {kr.why_recommended && (
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--background-elevated)] px-3 py-2">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                            {pg.whyKR}
                          </div>
                          <div className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                            {kr.why_recommended}
                          </div>
                        </div>
                      )}

                      {kr.link_to_kpi_title && (
                        <div className="rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-2">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-300">
                            {pg.linkedKPI}
                          </div>
                          <div className="mt-0.5 text-xs text-blue-200">
                            {kr.link_to_kpi_title}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                            {pg.unitLabel}
                          </label>
                          <input
                            type="text"
                            value={kr.unit ?? ""}
                            onChange={(e) =>
                              onKrField(
                                okrIdx,
                                krIdx,
                                "unit",
                                e.target.value || null,
                              )
                            }
                            disabled={isApplied || !kr.include}
                            className={`mt-1 ${inputClass()}`}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                            {pg.startLabel}
                          </label>
                          <input
                            type="number"
                            value={kr.start_value}
                            onChange={(e) =>
                              onKrField(
                                okrIdx,
                                krIdx,
                                "start_value",
                                Number(e.target.value),
                              )
                            }
                            disabled={isApplied || !kr.include}
                            className={`mt-1 ${inputClass()}`}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                            {t.pages.common.current}
                          </label>
                          <input
                            type="number"
                            value={kr.current_value}
                            onChange={(e) =>
                              onKrField(
                                okrIdx,
                                krIdx,
                                "current_value",
                                Number(e.target.value),
                              )
                            }
                            disabled={isApplied || !kr.include}
                            className={`mt-1 ${inputClass()}`}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                            {t.pages.common.target}
                          </label>
                          <input
                            type="number"
                            value={kr.target_value}
                            onChange={(e) =>
                              onKrField(
                                okrIdx,
                                krIdx,
                                "target_value",
                                Number(e.target.value),
                              )
                            }
                            disabled={isApplied || !kr.include}
                            className={`mt-1 ${inputClass()}`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Apply button */}
      {!isApplied && (
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            disabled={isApplying}
            onClick={onApply}
            className={actionPrimaryClass()}
          >
            {isApplying ? pg.applying : pg.applyBtn}
          </button>
        </div>
      )}
      {isApplied && (
        <div className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {pg.objectiveApplied}
        </div>
      )}
    </div>
  );
}
