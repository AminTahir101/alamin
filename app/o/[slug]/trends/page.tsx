"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import ProgressBar from "@/components/ui/ProgressBar";
import SectionCard from "@/components/ui/SectionCard";

type Org = { id: string; slug: string; name: string };
type Cycle = { id: string; year: number; quarter: number; status: string };
type KpiItem = { id: string; title: string; department_name?: string | null };
type TrendPoint = {
  id: string;
  kpi_id: string;
  kpi_title: string;
  recorded_at: string;
  current_value: number | null;
  target_value: number | null;
  source: string | null;
  notes: string | null;
};

type TrendsResponse = {
  ok: boolean;
  org?: Org;
  cycle?: Cycle | null;
  kpis?: KpiItem[];
  selectedKpiId?: string | null;
  history?: TrendPoint[];
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

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function numberFmt(n: unknown) {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString();
}

export default function TrendsPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const orgSlug = String(params?.slug ?? "").trim();
  const requestedKpi = String(searchParams.get("kpi") ?? "").trim();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [org, setOrg] = useState<Org | null>(null);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [kpis, setKpis] = useState<KpiItem[]>([]);
  const [selectedKpiId, setSelectedKpiId] = useState<string>("");
  const [history, setHistory] = useState<TrendPoint[]>([]);

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

  const loadTrends = useCallback(async (kpiId?: string) => {
    setMsg(null);
    setLoading(true);

    try {
      const session = await ensureAuth();
      if (!session) return;

      const qs = new URLSearchParams();
      if (kpiId) qs.set("kpi", kpiId);

      const apiUrl = new URL(
        `/api/o/${encodeURIComponent(orgSlug)}/trends${qs.toString() ? `?${qs.toString()}` : ""}`,
        window.location.origin
      ).toString();

      const res = await fetch(apiUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });

      const raw = await res.text();
      const parsed = (await safeParseJson(raw)) as TrendsResponse | null;

      if (!res.ok || !parsed || parsed.ok !== true) {
        throw new Error(parsed?.error || raw || `Failed (HTTP ${res.status})`);
      }

      setOrg(parsed.org ?? null);
      setCycle(parsed.cycle ?? null);
      setKpis(Array.isArray(parsed.kpis) ? parsed.kpis : []);
      setSelectedKpiId(parsed.selectedKpiId ?? "");
      setHistory(Array.isArray(parsed.history) ? parsed.history : []);
    } catch (e: unknown) {
      setMsg(getErrorMessage(e, "Failed to load trends"));
    } finally {
      setLoading(false);
    }
  }, [ensureAuth, orgSlug]);

  useEffect(() => {
    void loadTrends(requestedKpi);
  }, [loadTrends, requestedKpi]);

  const selectedKpi = useMemo(
    () => kpis.find((k) => k.id === selectedKpiId) ?? null,
    [kpis, selectedKpiId]
  );

  const latestPoint = history[history.length - 1] ?? null;
  const latestProgress =
    latestPoint && Number.isFinite(Number(latestPoint.target_value)) && Number(latestPoint.target_value) !== 0
      ? (Number(latestPoint.current_value ?? 0) / Number(latestPoint.target_value ?? 1)) * 100
      : 0;

  const cycleText = cycle ? `Q${cycle.quarter} ${cycle.year} · ${cycle.status}` : "No active cycle";

  return (
    <AppShell slug={orgSlug} sessionEmail={sessionEmail}>
      <AppPageHeader
        eyebrow={cycleText}
        title="Trends"
        description="Review KPI history over time and inspect updates captured in the KPI value history table."
      />

      {msg ? (
        <div className="mb-6 rounded-[20px] border border-red-400/20 bg-red-400/8 px-5 py-4 text-sm text-red-100">
          {msg}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard title="KPI Selector" subtitle={org ? `${org.name} (${org.slug})` : "Organization"}>
          <select
            value={selectedKpiId}
            onChange={(e) => {
              const next = e.target.value;
              setSelectedKpiId(next);
              router.push(`/o/${encodeURIComponent(orgSlug)}/trends?kpi=${encodeURIComponent(next)}`);
            }}
            className="h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none"
          >
            {kpis.map((k) => (
              <option key={k.id} value={k.id}>
                {k.title}
                {k.department_name ? ` · ${k.department_name}` : ""}
              </option>
            ))}
          </select>

          {selectedKpi ? (
            <div className="mt-5 rounded-[20px] border border-white/10 bg-white/5 p-5">
              <div className="text-sm font-semibold text-white/72">{selectedKpi.title}</div>
              <div className="mt-1 text-sm text-white/48">{selectedKpi.department_name ?? "No department"}</div>

              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between text-sm text-white/58">
                  <span>Latest progress</span>
                  <span className="font-semibold text-white">{latestProgress.toFixed(0)}%</span>
                </div>
                <ProgressBar value={latestProgress} />
              </div>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Latest Snapshot" subtitle="Most recent recorded KPI value">
          {latestPoint ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[20px] border border-white/10 bg-white/5 p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
                  Current value
                </div>
                <div className="mt-3 text-3xl font-black text-white">
                  {numberFmt(latestPoint.current_value)}
                </div>
              </div>

              <div className="rounded-[20px] border border-white/10 bg-white/5 p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
                  Target value
                </div>
                <div className="mt-3 text-3xl font-black text-white">
                  {numberFmt(latestPoint.target_value)}
                </div>
              </div>

              <div className="rounded-[20px] border border-white/10 bg-white/5 p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
                  Recorded at
                </div>
                <div className="mt-3 text-sm font-semibold text-white/85">
                  {fmtDate(latestPoint.recorded_at)}
                </div>
              </div>

              <div className="rounded-[20px] border border-white/10 bg-white/5 p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
                  Source
                </div>
                <div className="mt-3 text-sm font-semibold text-white/85">
                  {latestPoint.source ?? "—"}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No KPI history found"
              description="Once KPI values are captured, historical records will appear here."
            />
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="History Log" subtitle="Chronological KPI value changes">
          {loading ? (
            <div className="h-48 animate-pulse rounded-[20px] border border-white/10 bg-white/5" />
          ) : history.length ? (
            <div className="overflow-hidden rounded-[20px] border border-white/10">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/40">
                        Recorded at
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/40">
                        Current
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/40">
                        Target
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/40">
                        Source
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/40">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-t border-white/8 transition hover:bg-white/5">
                        <td className="px-4 py-4 text-sm text-white/75">{fmtDate(h.recorded_at)}</td>
                        <td className="px-4 py-4 text-sm text-white/75">{numberFmt(h.current_value)}</td>
                        <td className="px-4 py-4 text-sm text-white/75">{numberFmt(h.target_value)}</td>
                        <td className="px-4 py-4 text-sm text-white/60">{h.source ?? "—"}</td>
                        <td className="px-4 py-4 text-sm text-white/50">{h.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No trend data yet"
              description="Update a KPI value or complete onboarding to generate history records."
            />
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}