"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";
import ProgressBar from "@/components/ui/ProgressBar";

type OkrStatus =
  | "draft"
  | "pending_approval"
  | "active"
  | "on_track"
  | "at_risk"
  | "off_track"
  | "completed"
  | "cancelled";

type KrStatus =
  | "not_started"
  | "in_progress"
  | "on_track"
  | "at_risk"
  | "off_track"
  | "completed"
  | "cancelled";

type Cycle = {
  id: string;
  year: number;
  quarter: number;
  status: string;
};

type Okr = {
  id: string;
  title: string;
  description: string | null;
  status: OkrStatus;
  progress: number;
  objective_id: string;
  objective_title?: string | null;
  owner_user_id?: string | null;
  owner_email?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  key_results_count?: number;
  linked_kpis_count?: number;
  average_kr_progress?: number | null;
};

type LinkedKpi = {
  id: string;
  title: string;
  current_value?: number | null;
  target_value?: number | null;
  unit?: string | null;
};

type KeyResult = {
  id: string;
  title: string;
  metric_name?: string | null;
  metric_type?: string | null;
  unit?: string | null;
  start_value?: number | null;
  current_value?: number | null;
  target_value?: number | null;
  progress?: number | null;
  status: KrStatus;
  owner_user_id?: string | null;
  owner_email?: string | null;
  kpi_id?: string | null;
  linked_kpi?: LinkedKpi | null;
};

type Objective = {
  id: string;
  title: string;
};

type Member = {
  userId: string;
  email: string | null;
  role?: string | null;
  departmentId?: string | null;
};

type LoadResponse = {
  ok: boolean;
  cycle?: Cycle | null;
  okr?: Okr | null;
  keyResults?: KeyResult[];
  objectives?: Objective[];
  assignableMembers?: Member[];
  canManage?: boolean;
  error?: string;
};

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

async function safeParseJson(text: string): Promise<unknown> {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function formatPercent(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

function formatMetric(value?: number | null, unit?: string | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value}${unit ? ` ${unit}` : ""}`;
}

function formatStatusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function statusTone(
  status: string
): "success" | "warning" | "danger" | "neutral" | "info" {
  const clean = status.trim().toLowerCase();
  if (["completed", "active", "on_track"].includes(clean)) return "success";
  if (["pending_approval", "at_risk", "in_progress"].includes(clean)) return "warning";
  if (["off_track", "cancelled", "blocked"].includes(clean)) return "danger";
  if (["draft", "not_started"].includes(clean)) return "neutral";
  return "info";
}

function inputClass() {
  return "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--background-elevated)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]";
}

function textareaClass() {
  return "min-h-[128px] w-full rounded-2xl border border-[var(--border)] bg-[var(--background-elevated)] px-4 py-3 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]";
}

function selectClass() {
  return "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--background-elevated)] px-4 text-[var(--foreground)] outline-none transition focus:border-[var(--border-strong)]";
}

function primaryButtonClass() {
  return "inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
}

function secondaryButtonClass() {
  return "inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)] disabled:cursor-not-allowed disabled:opacity-50";
}

function statToneClass(tone: "default" | "success" | "warning" | "danger") {
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

export default function OkrDetailPage() {
  const params = useParams<{ slug: string; id: string }>();
  const router = useRouter();

  const slug = String(params?.slug ?? "");
  const id = String(params?.id ?? "");

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [okr, setOkr] = useState<Okr | null>(null);
  const [krs, setKrs] = useState<KeyResult[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [canManage, setCanManage] = useState(false);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const ensureAuth = useCallback(async (): Promise<Session | null> => {
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      router.push("/auth");
      return null;
    }

    setSessionEmail(data.session.user.email ?? null);
    return data.session;
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);

    try {
      const session = await ensureAuth();
      if (!session) return;

      const res = await fetch(`/api/o/${slug}/okrs/${id}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const raw = await res.text();
      const json = (await safeParseJson(raw)) as LoadResponse | null;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || raw || "Failed to load OKR");
      }

      setOkr(json.okr ?? null);
      setKrs(Array.isArray(json.keyResults) ? json.keyResults : []);
      setObjectives(Array.isArray(json.objectives) ? json.objectives : []);
      setMembers(Array.isArray(json.assignableMembers) ? json.assignableMembers : []);
      setCycle(json.cycle ?? null);
      setCanManage(Boolean(json.canManage));
    } catch (err) {
      setMsg(getErrorMessage(err, "Failed to load OKR"));
    } finally {
      setLoading(false);
    }
  }, [slug, id, ensureAuth]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveOkr() {
    if (!okr) return;

    setSaving(true);
    setMsg(null);
    setSuccess(null);

    try {
      const session = await ensureAuth();
      if (!session) return;

      const res = await fetch(`/api/o/${slug}/okrs/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: okr.title,
          description: okr.description,
          status: okr.status,
          progress: okr.progress,
          owner_user_id: okr.owner_user_id,
          objective_id: okr.objective_id,
        }),
      });

      const raw = await res.text();
      const json = (await safeParseJson(raw)) as { ok?: boolean; error?: string } | null;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || raw || "Save failed");
      }

      setSuccess("OKR updated successfully.");
      await load();
    } catch (err) {
      setMsg(getErrorMessage(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  const healthTone = useMemo<"default" | "success" | "warning" | "danger">(() => {
    const progress = okr?.progress ?? 0;
    if (progress >= 80) return "success";
    if (progress >= 50) return "warning";
    return "danger";
  }, [okr?.progress]);

  const avgKrTone = useMemo<"default" | "success" | "warning" | "danger">(() => {
    const progress = okr?.average_kr_progress ?? 0;
    if (progress >= 80) return "success";
    if (progress >= 50) return "warning";
    return "danger";
  }, [okr?.average_kr_progress]);

  if (loading) {
    return (
      <AppShell slug={slug} sessionEmail={sessionEmail}>
        <AppPageHeader
          eyebrow="OKR detail"
          title="Loading OKR..."
          description="Loading objective, execution, and key result details."
        />
        <div className="grid gap-6">
          <div className="h-56 animate-pulse rounded-[28px] border border-[var(--border)] bg-[var(--card)] alamin-shadow" />
          <div className="h-96 animate-pulse rounded-[28px] border border-[var(--border)] bg-[var(--card)] alamin-shadow" />
        </div>
      </AppShell>
    );
  }

  if (!okr) {
    return (
      <AppShell slug={slug} sessionEmail={sessionEmail}>
        <AppPageHeader
          eyebrow="OKR detail"
          title="OKR not found"
          description="This OKR could not be loaded."
        />
        <EmptyState
          title="OKR not found"
          description="The OKR may have been deleted or the URL is invalid."
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      slug={slug}
      sessionEmail={sessionEmail}
      topActions={
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/o/${slug}/okrs`} className={secondaryButtonClass()}>
            Back to OKRs
          </Link>

          {canManage ? (
            <button
              type="button"
              onClick={() => void saveOkr()}
              disabled={saving}
              className={primaryButtonClass()}
            >
              {saving ? "Saving..." : "Save OKR"}
            </button>
          ) : null}
        </div>
      }
    >
      <AppPageHeader
        eyebrow={cycle ? `Q${cycle.quarter} ${cycle.year} · ${cycle.status}` : "OKR detail"}
        title={okr.title}
        description="Manage strategic intent, ownership, status, and measurable execution from one executive-grade view."
      />

      {msg ? (
        <div className="mb-6 rounded-[20px] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-700 dark:text-red-100">
          {msg}
        </div>
      ) : null}

      {success ? (
        <div className="mb-6 rounded-[20px] border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-700 dark:text-emerald-100">
          {success}
        </div>
      ) : null}

      <section className="mb-6 overflow-hidden rounded-[30px] border border-[var(--border)] bg-[var(--background-panel)] p-6 alamin-shadow">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground-faint)]">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />
              OKR detail workspace
            </div>

            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-[var(--foreground)]">
              Strategy should translate into measurable movement.
            </h2>

            <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--foreground-muted)]">
              Update the OKR, adjust ownership, track progress, and inspect the key results that prove whether this objective is moving or stalled.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <div className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)]">
                Objective-linked
              </div>
              <div className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)]">
                Progress-controlled
              </div>
              <div className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)]">
                Executive visibility
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <MetricCard
              label="OKR Progress"
              value={formatPercent(okr.progress)}
              hint="Current OKR completion"
              tone={healthTone}
            />
            <MetricCard
              label="Average KR Progress"
              value={formatPercent(okr.average_kr_progress)}
              hint="Health across key results"
              tone={avgKrTone}
            />
            <MetricCard
              label="Key Results"
              value={String(okr.key_results_count ?? krs.length)}
              hint="Execution outcomes attached"
              tone="default"
            />
            <MetricCard
              label="Linked KPIs"
              value={String(okr.linked_kpis_count ?? 0)}
              hint="Metrics feeding this OKR"
              tone="default"
            />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard
          title="OKR Profile"
          subtitle="Update the core OKR fields without breaking the product styling."
          className="bg-[var(--background-panel)]"
        >
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge tone={statusTone(okr.status)}>
                {formatStatusLabel(okr.status)}
              </StatusBadge>

              <div className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground-soft)]">
                Objective: {okr.objective_title || "—"}
              </div>

              <div className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground-soft)]">
                Department: {okr.department_name || "—"}
              </div>
            </div>

            <FieldShell label="Title">
              <input
                value={okr.title}
                onChange={(e) => setOkr({ ...okr, title: e.target.value })}
                className={inputClass()}
                disabled={!canManage}
                placeholder="OKR title"
              />
            </FieldShell>

            <FieldShell label="Description">
              <textarea
                value={okr.description ?? ""}
                onChange={(e) => setOkr({ ...okr, description: e.target.value })}
                className={textareaClass()}
                disabled={!canManage}
                placeholder="Describe the strategic intent and expected business outcome"
              />
            </FieldShell>

            <div className="grid gap-4 md:grid-cols-2">
              <FieldShell label="Objective">
                <select
                  value={okr.objective_id}
                  onChange={(e) => {
                    const selected = objectives.find((o) => o.id === e.target.value);
                    setOkr({
                      ...okr,
                      objective_id: e.target.value,
                      objective_title: selected?.title ?? null,
                    });
                  }}
                  className={selectClass()}
                  disabled={!canManage}
                >
                  <option value="">Select objective</option>
                  {objectives.map((objective) => (
                    <option key={objective.id} value={objective.id}>
                      {objective.title}
                    </option>
                  ))}
                </select>
              </FieldShell>

              <FieldShell label="Owner">
                <select
                  value={okr.owner_user_id ?? ""}
                  onChange={(e) => {
                    const value = e.target.value || null;
                    const selected = members.find((m) => m.userId === value);
                    setOkr({
                      ...okr,
                      owner_user_id: value,
                      owner_email: selected?.email ?? null,
                    });
                  }}
                  className={selectClass()}
                  disabled={!canManage}
                >
                  <option value="">No owner</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.email ?? member.userId}
                    </option>
                  ))}
                </select>
              </FieldShell>
            </div>

            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <FieldShell label="Status">
                <select
                  value={okr.status}
                  onChange={(e) =>
                    setOkr({
                      ...okr,
                      status: e.target.value as OkrStatus,
                    })
                  }
                  className={selectClass()}
                  disabled={!canManage}
                >
                  <option value="draft">Draft</option>
                  <option value="pending_approval">Pending approval</option>
                  <option value="active">Active</option>
                  <option value="on_track">On track</option>
                  <option value="at_risk">At risk</option>
                  <option value="off_track">Off track</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </FieldShell>

              <div className="rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[var(--foreground)]">
                      Progress
                    </div>
                    <div className="text-sm text-[var(--foreground-muted)]">
                      Adjust OKR completion directly.
                    </div>
                  </div>
                  <div className="text-xl font-black tracking-[-0.03em] text-[var(--foreground)]">
                    {formatPercent(okr.progress)}
                  </div>
                </div>

                <div className="mb-3">
                  <ProgressBar value={okr.progress ?? 0} />
                </div>

                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={okr.progress ?? 0}
                  onChange={(e) =>
                    setOkr({
                      ...okr,
                      progress: Number(e.target.value),
                    })
                  }
                  className="w-full accent-[var(--accent-2)]"
                  disabled={!canManage}
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  {[0, 25, 50, 75, 100].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setOkr({ ...okr, progress: value })}
                      disabled={!canManage}
                      className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3 text-xs font-semibold text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)] disabled:opacity-50"
                    >
                      {value}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Key Results"
          subtitle="The measurable outcomes proving whether this OKR is truly moving."
          className="bg-[var(--background-panel)]"
        >
          {!krs.length ? (
            <EmptyState
              title="No key results yet"
              description="This OKR does not yet have any key results attached."
            />
          ) : (
            <div className="space-y-4">
              {krs.map((kr) => (
                <div
                  key={kr.id}
                  className="rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-5 alamin-shadow"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-lg font-bold text-[var(--foreground)]">
                          {kr.title}
                        </div>
                        <StatusBadge tone={statusTone(kr.status)}>
                          {formatStatusLabel(kr.status)}
                        </StatusBadge>
                      </div>

                      {kr.metric_name ? (
                        <div className="mt-2 text-sm text-[var(--foreground-muted)]">
                          {kr.metric_name}
                        </div>
                      ) : null}

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <DetailTile
                          label="Start"
                          value={formatMetric(kr.start_value, kr.unit)}
                        />
                        <DetailTile
                          label="Current"
                          value={formatMetric(kr.current_value, kr.unit)}
                        />
                        <DetailTile
                          label="Target"
                          value={formatMetric(kr.target_value, kr.unit)}
                        />
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <DetailTile
                          label="Owner"
                          value={kr.owner_email || kr.owner_user_id || "Unassigned"}
                        />
                        <DetailTile
                          label="Linked KPI"
                          value={kr.linked_kpi?.title || kr.kpi_id || "—"}
                        />
                      </div>
                    </div>

                    <div className="w-full max-w-[260px] rounded-[22px] border border-[var(--border)] bg-[var(--card-soft)] p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground-faint)]">
                        KR Progress
                      </div>

                      <div className="mt-3 text-3xl font-black tracking-[-0.03em] text-[var(--foreground)]">
                        {formatPercent(kr.progress)}
                      </div>

                      <div className="mt-3">
                        <ProgressBar value={typeof kr.progress === "number" ? kr.progress : 0} />
                      </div>

                      <div className="mt-4 text-sm leading-6 text-[var(--foreground-muted)]">
                        Metric type: {kr.metric_type || "number"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
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
    <div className={`rounded-[24px] border p-5 alamin-shadow ${statToneClass(tone)}`}>
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

function DetailTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-soft)] p-3">
      <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--foreground-faint)]">
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-[var(--foreground)]">
        {value}
      </div>
    </div>
  );
}

function FieldShell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 block text-sm font-medium text-[var(--foreground-soft)]">
        {label}
      </div>
      {children}
    </label>
  );
}