"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import ProgressBar from "@/components/ui/ProgressBar";
import SectionCard from "@/components/ui/SectionCard";
import StatusBadge from "@/components/ui/StatusBadge";
import StatCard from "@/components/ui/StatCard";

type DashboardDepartment = {
  department_id?: string;
  id?: string;
  department_name?: string;
  name?: string;
  department_score?: number | null;
  score?: number | null;
  total_kpis?: number | null;
  critical_kpis?: number | null;
  at_risk_kpis?: number | null;
  healthy_kpis?: number | null;
  label?: string | null;
};

type DashboardResponse = {
  ok: boolean;
  cycle?: { id: string; year: number; quarter: number; status: string } | null;
  departments?: DashboardDepartment[];
  error?: string;
};

type DepartmentRegistryResponse = {
  ok: boolean;
  departments?: Array<{ id: string; name: string }>;
  canManage?: boolean;
  error?: string;
};

type DepartmentCard = {
  id: string;
  name: string;
  score: number;
  total_kpis: number;
  healthy_kpis: number;
  at_risk_kpis: number;
  critical_kpis: number;
  label: string;
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

function numberFmt(n: unknown) {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString();
}

function scoreValue(score?: number | null) {
  const value = Number(score ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function intValue(n?: number | null) {
  const value = Number(n ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function healthFromPerformance(value: number) {
  if (value >= 85) return "On Track";
  if (value >= 60) return "At Risk";
  return "Off Track";
}

function toneFromLabel(label?: string | null) {
  const x = String(label ?? "").toLowerCase();
  if (x.includes("on track") || x.includes("healthy")) return "success" as const;
  if (x.includes("risk")) return "warning" as const;
  if (x.includes("off") || x.includes("critical")) return "danger" as const;
  return "neutral" as const;
}

function normalizeDepartmentName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function cardTone(score: number) {
  if (score >= 85) return "success" as const;
  if (score >= 60) return "warning" as const;
  return "danger" as const;
}

function buttonClass(kind: "primary" | "secondary" | "danger") {
  switch (kind) {
    case "primary":
      return "inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
    case "danger":
      return "inline-flex h-10 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-100";
    default:
      return "inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)] disabled:cursor-not-allowed disabled:opacity-50";
  }
}

export default function DepartmentsPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const orgSlug = String(params?.slug ?? "").trim();

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [cycle, setCycle] = useState<DashboardResponse["cycle"]>(null);
  const [dashboardDepartments, setDashboardDepartments] = useState<DashboardDepartment[]>([]);
  const [registry, setRegistry] = useState<Array<{ id: string; name: string }>>([]);
  const [canManage, setCanManage] = useState(false);

  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [savingDepartment, setSavingDepartment] = useState(false);
  const [deletingDepartmentId, setDeletingDepartmentId] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    setMsg(null);
    setOkMsg(null);
    setLoading(true);

    try {
      const session = await ensureAuth();
      if (!session) return;

      const [dashboardRes, registryRes] = await Promise.all([
        fetch(`/api/o/${encodeURIComponent(orgSlug)}/dashboard`, {
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        }),
        fetch(`/api/o/${encodeURIComponent(orgSlug)}/departments`, {
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        }),
      ]);

      const dashboardRaw = await dashboardRes.text();
      const registryRaw = await registryRes.text();

      const dashboardParsed = (await safeParseJson(dashboardRaw)) as DashboardResponse | null;
      const registryParsed = (await safeParseJson(registryRaw)) as DepartmentRegistryResponse | null;

      if (!dashboardRes.ok || !dashboardParsed || dashboardParsed.ok !== true) {
        throw new Error(
          dashboardParsed?.error || dashboardRaw || `Failed dashboard load (HTTP ${dashboardRes.status})`,
        );
      }

      if (!registryRes.ok || !registryParsed || registryParsed.ok !== true) {
        throw new Error(
          registryParsed?.error || registryRaw || `Failed departments load (HTTP ${registryRes.status})`,
        );
      }

      setCycle(dashboardParsed.cycle ?? null);
      setDashboardDepartments(Array.isArray(dashboardParsed.departments) ? dashboardParsed.departments : []);
      setRegistry(Array.isArray(registryParsed.departments) ? registryParsed.departments : []);
      setCanManage(Boolean(registryParsed.canManage));
    } catch (e: unknown) {
      setMsg(getErrorMessage(e, "Failed to load departments"));
    } finally {
      setLoading(false);
    }
  }, [ensureAuth, orgSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const ranked = useMemo<DepartmentCard[]>(() => {
    const metricById = new Map<string, DashboardDepartment>();
    const metricByName = new Map<string, DashboardDepartment>();

    for (const item of dashboardDepartments) {
      const maybeId = String(item.department_id ?? item.id ?? "").trim();
      const maybeName = String(item.department_name ?? item.name ?? "").trim();

      if (maybeId) metricById.set(maybeId, item);
      if (maybeName) metricByName.set(normalizeDepartmentName(maybeName), item);
    }

    const cards: DepartmentCard[] = registry.map((dept) => {
      const matched = metricById.get(dept.id) ?? metricByName.get(normalizeDepartmentName(dept.name));
      const score = scoreValue(matched?.department_score ?? matched?.score);
      const label = matched?.label ?? healthFromPerformance(score);

      return {
        id: dept.id,
        name: dept.name,
        score,
        total_kpis: intValue(matched?.total_kpis),
        healthy_kpis: intValue(matched?.healthy_kpis),
        at_risk_kpis: intValue(matched?.at_risk_kpis),
        critical_kpis: intValue(matched?.critical_kpis),
        label,
      };
    });

    return cards.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }, [dashboardDepartments, registry]);

  const cycleText = cycle ? `Q${cycle.quarter} ${cycle.year} · ${cycle.status}` : "No active cycle";

  const stats = useMemo(() => {
    const total = ranked.length;
    const avgScore = total
      ? Math.round(ranked.reduce((sum, item) => sum + item.score, 0) / total)
      : 0;

    const healthy = ranked.filter((item) => item.score >= 85).length;
    const atRisk = ranked.filter((item) => item.score >= 60 && item.score < 85).length;
    const critical = ranked.filter((item) => item.score < 60).length;

    return { total, avgScore, healthy, atRisk, critical };
  }, [ranked]);

  const handleCreateDepartment = useCallback(async () => {
    const name = newDepartmentName.trim();
    if (!name) {
      setMsg("Department name is required");
      return;
    }

    setMsg(null);
    setOkMsg(null);
    setSavingDepartment(true);

    try {
      const session = await ensureAuth();
      if (!session) return;

      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/departments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name }),
      });

      const raw = await res.text();
      const parsed = (await safeParseJson(raw)) as { ok?: boolean; error?: string } | null;

      if (!res.ok || !parsed?.ok) {
        throw new Error(parsed?.error || raw || `Failed to create department (HTTP ${res.status})`);
      }

      setNewDepartmentName("");
      setOkMsg(`Department "${name}" created.`);
      await load();
    } catch (e: unknown) {
      setMsg(getErrorMessage(e, "Failed to create department"));
    } finally {
      setSavingDepartment(false);
    }
  }, [ensureAuth, load, newDepartmentName, orgSlug]);

  const handleDeleteDepartment = useCallback(
    async (departmentId: string, departmentName: string) => {
      const confirmed = window.confirm(
        `Delete department "${departmentName}"?\n\nThis will be blocked if the department is still linked to KPIs, objectives, or other data.`,
      );
      if (!confirmed) return;

      setMsg(null);
      setOkMsg(null);
      setDeletingDepartmentId(departmentId);

      try {
        const session = await ensureAuth();
        if (!session) return;

        const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/departments`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ departmentId }),
        });

        const raw = await res.text();
        const parsed = (await safeParseJson(raw)) as { ok?: boolean; error?: string } | null;

        if (!res.ok || !parsed?.ok) {
          throw new Error(parsed?.error || raw || `Failed to delete department (HTTP ${res.status})`);
        }

        setOkMsg(`Department "${departmentName}" deleted.`);
        await load();
      } catch (e: unknown) {
        setMsg(getErrorMessage(e, "Failed to delete department"));
      } finally {
        setDeletingDepartmentId(null);
      }
    },
    [ensureAuth, load, orgSlug],
  );

  return (
    <AppShell
      slug={orgSlug}
      sessionEmail={sessionEmail}
      topActions={
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void load()} className={buttonClass("secondary")}>
            Refresh
          </button>
          {canManage ? (
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById("department-create-input");
                el?.focus();
              }}
              className={buttonClass("primary")}
            >
              New department
            </button>
          ) : null}
        </div>
      }
    >
      <AppPageHeader
        eyebrow={cycleText}
        title="Departments"
        description="Manage the organization structure and track department-level performance, KPI concentration, and execution risk across the active cycle."
      />

      {(msg || okMsg) && (
        <div className="mb-6 grid gap-3">
          {msg ? (
            <div className="rounded-[20px] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-700 dark:text-red-100">
              {msg}
            </div>
          ) : null}
          {okMsg ? (
            <div className="rounded-[20px] border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-700 dark:text-emerald-100">
              {okMsg}
            </div>
          ) : null}
        </div>
      )}

      <section className="mb-6 overflow-hidden rounded-[30px] border border-[var(--border)] bg-[var(--background-panel)] p-6 alamin-shadow">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground-faint)]">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />
              Department performance layer
            </div>

            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-[var(--foreground)]">
              See which departments are healthy, slipping, or overloaded.
            </h2>

            <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--foreground-muted)]">
              This page combines department setup with live scorecards so leadership can manage the
              structure and immediately see where KPI risk is concentrated.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <StatCard
              title="Departments"
              value={stats.total}
              hint="Registered in the organization"
            />
            <StatCard
              title="Average score"
              value={numberFmt(stats.avgScore)}
              hint="Across all departments"
              tone={cardTone(stats.avgScore)}
            />
            <StatCard
              title="Healthy"
              value={stats.healthy}
              hint="Departments on track"
              tone="success"
            />
            <StatCard
              title="Needs attention"
              value={stats.atRisk + stats.critical}
              hint={`${stats.atRisk} at risk · ${stats.critical} critical`}
              tone="warning"
            />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <SectionCard
          title="Department management"
          subtitle={
            canManage
              ? "Create and delete departments for this organization."
              : "You can view departments, but only organization admins can manage them."
          }
          className="bg-[var(--background-panel)]"
        >
          {loading ? (
            <div className="space-y-4">
              <div className="h-36 animate-pulse rounded-[22px] border border-[var(--border)] bg-[var(--card)]" />
              <div className="h-16 animate-pulse rounded-[18px] border border-[var(--border)] bg-[var(--card)]" />
              <div className="h-16 animate-pulse rounded-[18px] border border-[var(--border)] bg-[var(--card)]" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-5">
                <div className="text-base font-bold text-[var(--foreground)]">Create department</div>
                <div className="mt-1 text-sm text-[var(--foreground-muted)]">
                  Add a department that can later own KPIs, objectives, OKRs, and tasks.
                </div>

                <div className="mt-5 grid gap-3">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-[var(--foreground-soft)]">
                      Department name
                    </span>
                    <input
                      id="department-create-input"
                      value={newDepartmentName}
                      onChange={(e) => setNewDepartmentName(e.target.value)}
                      placeholder="e.g. Finance"
                      disabled={!canManage || savingDepartment}
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--background-elevated)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleCreateDepartment()}
                      disabled={!canManage || savingDepartment || !newDepartmentName.trim()}
                      className={buttonClass("primary")}
                    >
                      {savingDepartment ? "Creating..." : "Create department"}
                    </button>

                    {!canManage ? (
                      <span className="text-xs text-[var(--foreground-faint)]">
                        Admin access required
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-5">
                <div className="text-base font-bold text-[var(--foreground)]">Current departments</div>
                <div className="mt-1 text-sm text-[var(--foreground-muted)]">
                  Delete only departments that are no longer connected to active data.
                </div>

                {registry.length ? (
                  <div className="mt-5 space-y-3">
                    {registry.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-4 rounded-[18px] border border-[var(--border)] bg-[var(--card-subtle)] px-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-[var(--foreground)]">
                            {item.name}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleDeleteDepartment(item.id, item.name)}
                          disabled={!canManage || deletingDepartmentId === item.id}
                          className={buttonClass("danger")}
                        >
                          {deletingDepartmentId === item.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-[18px] border border-[var(--border)] bg-[var(--card-subtle)] px-4 py-8 text-center text-sm text-[var(--foreground-faint)]">
                    No departments created yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Department scorecards"
          subtitle="Ranked by current performance and KPI distribution"
          className="bg-[var(--background-panel)]"
        >
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-64 animate-pulse rounded-[22px] border border-[var(--border)] bg-[var(--card)]"
                />
              ))}
            </div>
          ) : ranked.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {ranked.map((d) => (
                <div
                  key={d.id}
                  className="rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-5 alamin-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold text-[var(--foreground)]">{d.name}</div>
                      <div className="mt-2">
                        <StatusBadge tone={toneFromLabel(d.label)}>{d.label}</StatusBadge>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-3xl font-black text-[var(--foreground)]">
                        {numberFmt(d.score)}
                      </div>
                      <div className="text-xs text-[var(--foreground-faint)]">Score</div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <ProgressBar value={d.score} />
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <MetricTile label="Total KPIs" value={numberFmt(d.total_kpis)} />
                    <MetricTile label="Healthy" value={numberFmt(d.healthy_kpis)} />
                    <MetricTile label="At Risk" value={numberFmt(d.at_risk_kpis)} />
                    <MetricTile label="Critical" value={numberFmt(d.critical_kpis)} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No departments available"
              description="Create departments to populate this view."
            />
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card-subtle)] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--foreground-faint)]">
        {label}
      </div>
      <div className="mt-2 text-lg font-bold text-[var(--foreground)]">{value}</div>
    </div>
  );
}