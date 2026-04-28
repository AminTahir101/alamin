"use client";

// app/o/[slug]/cycles/page.tsx
//
// Performance cycle management page. Uses API routes (admin client)
// instead of direct Supabase queries to bypass RLS.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import SectionCard from "@/components/ui/SectionCard";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";

type Cycle = {
  id: string;
  org_id: string;
  year: number;
  quarter: number;
  status: string;
  name: string | null;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
};

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  return fallback;
}

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "active") return "success";
  if (status === "completed" || status === "closed") return "neutral";
  return "info";
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function quarterLabel(year: number, quarter: number) {
  return `Q${quarter} ${year}`;
}

export default function CyclesPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = String(params?.slug ?? "").trim();
  const { t } = useLanguage();
  const pg = t.pages.cycles;

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const now = new Date();
  const [newYear, setNewYear] = useState(now.getFullYear());
  const [newQuarter, setNewQuarter] = useState(
    Math.max(1, Math.min(4, Math.floor(now.getMonth() / 3) + 1)),
  );

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

  const loadCycles = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const session = await ensureAuth();
      if (!session) return;

      const res = await fetch(`/api/o/${encodeURIComponent(slug)}/cycles`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });

      const data = (await res.json()) as {
        ok: boolean;
        cycles?: Cycle[];
        error?: string;
      };

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to load cycles");
      }

      setCycles(data.cycles ?? []);
    } catch (e) {
      setMsg(getErrorMessage(e, "Couldn't load cycles."));
    } finally {
      setLoading(false);
    }
  }, [slug, ensureAuth]);

  useEffect(() => {
    void loadCycles();
  }, [loadCycles]);

  async function handleCreate() {
    setCreating(true);
    setMsg(null);
    setOkMsg(null);

    try {
      const session = await ensureAuth();
      if (!session) return;

      const res = await fetch(`/api/o/${encodeURIComponent(slug)}/cycles`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ year: newYear, quarter: newQuarter }),
      });

      const data = (await res.json()) as { ok: boolean; error?: string };

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to create cycle");
      }

      setOkMsg(`Q${newQuarter} ${newYear} created. Redirecting to strategy setup…`);
      setShowForm(false);

      setTimeout(() => {
        router.push(`/o/${encodeURIComponent(slug)}/onboarding?mode=new-cycle&year=${newYear}&quarter=${newQuarter}`);
      }, 800);
    } catch (e) {
      setMsg(getErrorMessage(e, "Couldn't create cycle."));
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(cycleId: string, newStatus: string) {
    setUpdating(cycleId);
    setMsg(null);
    setOkMsg(null);

    try {
      const session = await ensureAuth();
      if (!session) return;

      const res = await fetch(`/api/o/${encodeURIComponent(slug)}/cycles`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cycleId, status: newStatus }),
      });

      const data = (await res.json()) as { ok: boolean; error?: string };

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to update cycle");
      }

      setOkMsg(`Cycle updated to ${newStatus}.`);
      await loadCycles();
    } catch (e) {
      setMsg(getErrorMessage(e, "Couldn't update cycle."));
    } finally {
      setUpdating(null);
    }
  }

  const activeCycle = cycles.find((c) => c.status === "active");

  return (
    <AppShell slug={slug} sessionEmail={sessionEmail}>
      <AppPageHeader
        title={pg.title}
        description={pg.description}
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push(`/o/${slug}/settings`)}
              className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
            >
              {pg.backToSettings}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              disabled={showForm}
              className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:opacity-60"
            >
              {pg.createNew}
            </button>
          </div>
        }
      />

      {msg ? (
        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
          {msg}
        </div>
      ) : null}

      {okMsg ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-200">
          {okMsg}
        </div>
      ) : null}

      {showForm ? (
        <div className="mt-6">
          <SectionCard
            title={pg.createNew}
            subtitle="The previous active cycle will be marked as completed"
            className="bg-[var(--background-panel)]"
          >
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--foreground-soft)]">Year</label>
                <input
                  type="number"
                  value={newYear}
                  onChange={(e) => setNewYear(Number(e.target.value))}
                  className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-[var(--foreground)] outline-none transition focus:border-[var(--border-strong)]"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--foreground-soft)]">Quarter</label>
                <select
                  value={newQuarter}
                  onChange={(e) => setNewQuarter(Number(e.target.value))}
                  className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-[var(--foreground)] outline-none transition focus:border-[var(--border-strong)]"
                >
                  <option value={1}>Q1 (Jan–Mar)</option>
                  <option value={2}>Q2 (Apr–Jun)</option>
                  <option value={3}>Q3 (Jul–Sep)</option>
                  <option value={4}>Q4 (Oct–Dec)</option>
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={creating}
                  className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:opacity-60"
                >
                  {creating ? "Creating…" : "Create and set up"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--border-strong)]"
                >
                  Cancel
                </button>
              </div>
            </div>

            {activeCycle ? (
              <div className="mt-4 rounded-[18px] border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-200">
                The currently active cycle ({quarterLabel(activeCycle.year, activeCycle.quarter)}) will be marked as completed when you create a new one.
              </div>
            ) : null}
          </SectionCard>
        </div>
      ) : null}

      <div className="mt-6">
        <SectionCard
          title={pg.allCycles}
          subtitle={`${cycles.length} cycle${cycles.length === 1 ? "" : "s"} for this workspace`}
          className="bg-[var(--background-panel)]"
        >
          {loading ? (
            <div className="grid gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-[20px] border border-[var(--border)] bg-[var(--card)]" />
              ))}
            </div>
          ) : cycles.length === 0 ? (
            <EmptyState
              title={pg.noCyclesTitle}
              description={pg.noCyclesDesc}
            />
          ) : (
            <div className="grid gap-3">
              {cycles.map((cycle) => {
                const isActive = cycle.status === "active";
                return (
                  <div
                    key={cycle.id}
                    className={`rounded-[20px] border p-5 transition ${
                      isActive
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-[var(--border)] bg-[var(--card)]"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-[var(--foreground)]">
                            {quarterLabel(cycle.year, cycle.quarter)}
                          </span>
                          <StatusBadge tone={statusTone(cycle.status)}>
                            {cycle.status}
                          </StatusBadge>
                        </div>
                        {cycle.name ? (
                          <div className="mt-1 text-sm text-[var(--foreground-muted)]">{cycle.name}</div>
                        ) : null}
                        <div className="mt-2 text-xs text-[var(--foreground-faint)]">
                          {fmtDate(cycle.starts_on)} → {fmtDate(cycle.ends_on)} · Created {fmtDate(cycle.created_at)}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {!isActive ? (
                          <button
                            type="button"
                            onClick={() => void handleStatusChange(cycle.id, "active")}
                            disabled={updating === cycle.id}
                            className="inline-flex h-9 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/15 disabled:opacity-60 dark:text-emerald-200"
                          >
                            {updating === cycle.id ? t.pages.common.loading : pg.setActive}
                          </button>
                        ) : null}
                        {isActive ? (
                          <button
                            type="button"
                            onClick={() => void handleStatusChange(cycle.id, "completed")}
                            disabled={updating === cycle.id}
                            className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] disabled:opacity-60"
                          >
                            {updating === cycle.id ? t.pages.common.loading : pg.markCompleted}
                          </button>
                        ) : null}
                        {cycle.status === "completed" ? (
                          <button
                            type="button"
                            onClick={() => void handleStatusChange(cycle.id, "closed")}
                            disabled={updating === cycle.id}
                            className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-xs font-semibold text-[var(--foreground-muted)] transition hover:border-[var(--border-strong)] disabled:opacity-60"
                          >
                            {updating === cycle.id ? "Updating…" : "Close"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
