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

export default function DepartmentsPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const orgSlug = String(params?.slug ?? "").trim();

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

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
          dashboardParsed?.error || dashboardRaw || `Failed dashboard load (HTTP ${dashboardRes.status})`
        );
      }

      if (!registryRes.ok || !registryParsed || registryParsed.ok !== true) {
        throw new Error(
          registryParsed?.error || registryRaw || `Failed departments load (HTTP ${registryRes.status})`
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

      if (maybeId) {
        metricById.set(maybeId, item);
      }

      if (maybeName) {
        metricByName.set(normalizeDepartmentName(maybeName), item);
      }
    }

    const cards: DepartmentCard[] = registry.map((dept) => {
      const matched =
        metricById.get(dept.id) ??
        metricByName.get(normalizeDepartmentName(dept.name));

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

  const handleCreateDepartment = useCallback(async () => {
    const name = newDepartmentName.trim();
    if (!name) {
      setMsg("Department name is required");
      return;
    }

    setMsg(null);
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
        `Delete department "${departmentName}"?\n\nThis will be blocked if the department is still linked to KPIs or objectives.`
      );
      if (!confirmed) return;

      setMsg(null);
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

        await load();
      } catch (e: unknown) {
        setMsg(getErrorMessage(e, "Failed to delete department"));
      } finally {
        setDeletingDepartmentId(null);
      }
    },
    [ensureAuth, load, orgSlug]
  );

  return (
    <AppShell slug={orgSlug} sessionEmail={sessionEmail}>
      <AppPageHeader
        eyebrow={cycleText}
        title="Departments"
        description="Department-level performance view showing score, KPI count, and concentration of risk across the active cycle."
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-2xl border border-white/12 bg-white/6 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Refresh
            </button>
          </div>
        }
      />

      {msg ? (
        <div className="mb-6 rounded-[20px] border border-red-400/20 bg-red-400/8 px-5 py-4 text-sm text-red-100">
          {msg}
        </div>
      ) : null}

      <SectionCard
        title="Department Management"
        subtitle={
          canManage
            ? "Create and delete departments for this organization."
            : "You can view departments, but only org admins can manage them."
        }
      >
        {loading ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
            <div className="h-48 animate-pulse rounded-[20px] border border-white/10 bg-white/5" />
            <div className="h-48 animate-pulse rounded-[20px] border border-white/10 bg-white/5" />
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
            <div className="rounded-[22px] border border-white/10 bg-white/5 p-5">
              <div className="text-base font-bold text-white">Create department</div>
              <div className="mt-1 text-sm text-white/50">
                Add a new department that can later own objectives and KPIs.
              </div>

              <div className="mt-5">
                <label className="mb-2 block text-sm font-medium text-white/80">Department name</label>
                <input
                  value={newDepartmentName}
                  onChange={(e) => setNewDepartmentName(e.target.value)}
                  placeholder="e.g. Finance"
                  disabled={!canManage || savingDepartment}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                />
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleCreateDepartment()}
                  disabled={!canManage || savingDepartment || !newDepartmentName.trim()}
                  className="rounded-2xl border border-white/12 bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingDepartment ? "Creating..." : "Create department"}
                </button>

                {!canManage ? (
                  <span className="text-xs text-white/40">Admin access required</span>
                ) : null}
              </div>
            </div>

            <div className="rounded-[22px] border border-white/10 bg-white/5 p-5">
              <div className="text-base font-bold text-white">Current departments</div>
              <div className="mt-1 text-sm text-white/50">
                Delete only departments that are no longer linked to active data.
              </div>

              {registry.length ? (
                <div className="mt-5 space-y-3">
                  {registry.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-black/15 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{item.name}</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleDeleteDepartment(item.id, item.name)}
                        disabled={!canManage || deletingDepartmentId === item.id}
                        className="rounded-2xl border border-red-400/20 bg-red-400/8 px-4 py-2 text-sm font-medium text-red-100 transition hover:bg-red-400/12 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingDepartmentId === item.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-white/8 bg-black/15 px-4 py-8 text-center text-sm text-white/45">
                  No departments created yet.
                </div>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Department Scorecards" subtitle="Ranked by current performance">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-52 animate-pulse rounded-[20px] border border-white/10 bg-white/5"
              />
            ))}
          </div>
        ) : ranked.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ranked.map((d) => {
              return (
                <div
                  key={d.id}
                  className="rounded-[22px] border border-white/10 bg-white/5 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold text-white">{d.name}</div>
                      <div className="mt-2">
                        <StatusBadge tone={toneFromLabel(d.label)}>{d.label}</StatusBadge>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-black text-white">{numberFmt(d.score)}</div>
                      <div className="text-xs text-white/35">Score</div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <ProgressBar value={d.score} />
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/38">
                        Total KPIs
                      </div>
                      <div className="mt-2 text-lg font-bold text-white">
                        {numberFmt(d.total_kpis)}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/38">
                        Healthy
                      </div>
                      <div className="mt-2 text-lg font-bold text-white">
                        {numberFmt(d.healthy_kpis)}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/38">
                        At Risk
                      </div>
                      <div className="mt-2 text-lg font-bold text-white">
                        {numberFmt(d.at_risk_kpis)}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/38">
                        Critical
                      </div>
                      <div className="mt-2 text-lg font-bold text-white">
                        {numberFmt(d.critical_kpis)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No departments available"
            description="Create departments to populate this view."
          />
        )}
      </SectionCard>
    </AppShell>
  );
}