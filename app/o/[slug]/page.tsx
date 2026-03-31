// app/o/[slug]/trends/page.tsx
"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

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
  detail?: unknown;
};

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

async function safeParseJson(text: string): Promise<unknown> {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
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

  async function ensureAuth(): Promise<Session | null> {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    setSessionEmail(session?.user?.email ?? null);

    if (!session) {
      router.replace("/auth");
      return null;
    }
    return session;
  }

  async function loadTrends(kpiId?: string) {
    setMsg(null);
    setLoading(true);

    try {
      if (!orgSlug) throw new Error("slug is required");
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
  }

  useEffect(() => {
    void loadTrends(requestedKpi);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, requestedKpi]);

  const selectedKpi = useMemo(() => kpis.find((k) => k.id === selectedKpiId) ?? null, [kpis, selectedKpiId]);

  if (loading) {
    return (
      <main style={styles.shell}>
        <div style={styles.container}>
          <div style={styles.skeleton} />
        </div>
      </main>
    );
  }

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.brand}>
            <span style={styles.brandDot} />
            <span style={styles.brandText}>ALAMIN</span>
          </div>

          <div style={styles.headerRight}>
            <div style={styles.headerMeta}>
              <div style={styles.metaTop}>/o/{orgSlug}/trends</div>
              {sessionEmail ? <div style={styles.metaBottom}>{sessionEmail}</div> : null}
            </div>

            <button type="button" onClick={() => router.push(`/o/${encodeURIComponent(orgSlug)}/dashboard`)} style={styles.secondaryBtn}>
              Dashboard
            </button>
            <button type="button" onClick={() => router.push(`/o/${encodeURIComponent(orgSlug)}/kpis`)} style={styles.secondaryBtn}>
              KPIs
            </button>
            <button type="button" onClick={() => router.push(`/o/${encodeURIComponent(orgSlug)}/onboarding`)} style={styles.secondaryBtn}>
              Onboarding
            </button>
          </div>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.hero}>
          <div>
            <h1 style={styles.h1}>Trends</h1>
            <p style={styles.p}>Historical KPI values from kpi_values_history.</p>
            {org ? <div style={{ ...styles.muted, marginTop: 8 }}>Org: {org.name}</div> : null}
            {cycle ? <div style={{ ...styles.muted, marginTop: 4 }}>Active: Q{cycle.quarter} {cycle.year}</div> : null}
          </div>
        </div>

        {msg ? (
          <div style={styles.alert}>
            <div style={styles.alertTitle}>Issue</div>
            <div style={styles.alertText}>{msg}</div>
          </div>
        ) : null}

        <section style={{ ...styles.card, marginTop: 16 }}>
          <div style={styles.cardTitle}>Select KPI</div>
          <select
            value={selectedKpiId}
            onChange={(e) => {
              const next = e.target.value;
              setSelectedKpiId(next);
              router.push(`/o/${encodeURIComponent(orgSlug)}/trends?kpi=${encodeURIComponent(next)}`);
            }}
            style={styles.select}
          >
            {kpis.map((k) => (
              <option key={k.id} value={k.id}>
                {k.title}{k.department_name ? ` · ${k.department_name}` : ""}
              </option>
            ))}
          </select>
        </section>

        <section style={{ ...styles.card, marginTop: 16 }}>
          <div style={styles.cardTitle}>{selectedKpi?.title ?? "History"}</div>

          {history.length ? (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Recorded at</th>
                    <th style={styles.th}>Current</th>
                    <th style={styles.th}>Target</th>
                    <th style={styles.th}>Source</th>
                    <th style={styles.th}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td style={styles.td}>{fmtDate(h.recorded_at)}</td>
                      <td style={styles.td}>{numberFmt(h.current_value)}</td>
                      <td style={styles.td}>{numberFmt(h.target_value)}</td>
                      <td style={styles.td}>{h.source ?? "—"}</td>
                      <td style={styles.td}>{h.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={styles.muted}>No history found.</div>
          )}
        </section>
      </main>
    </div>
  );
}

const styles = {
  shell: {
    minHeight: "100vh",
    background:
      "radial-gradient(1000px 600px at 20% 10%, rgba(255,255,255,0.10), transparent 60%), radial-gradient(1000px 600px at 80% 20%, rgba(255,255,255,0.08), transparent 55%), #000",
    color: "white",
  },
  container: { maxWidth: 1100, margin: "0 auto", padding: "40px 18px" },
  skeleton: {
    height: 220,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    backdropFilter: "blur(14px)",
    background: "rgba(0,0,0,0.65)",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  headerInner: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "14px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  brand: { display: "flex", alignItems: "center", gap: 10 },
  brandDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "rgba(255,255,255,0.85)",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.15) inset",
  },
  brandText: { fontWeight: 900, letterSpacing: 0.4 },
  headerRight: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const },
  headerMeta: { textAlign: "right" as const },
  metaTop: { fontSize: 12, color: "rgba(255,255,255,0.7)" },
  metaBottom: { fontSize: 12, color: "rgba(255,255,255,0.55)" },
  main: { maxWidth: 1100, margin: "0 auto", padding: "34px 18px 60px" },
  hero: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" },
  h1: { fontSize: 46, margin: 0, fontWeight: 900 },
  p: { margin: "8px 0 0", color: "rgba(255,255,255,0.65)" },
  alert: {
    marginTop: 16,
    borderRadius: 16,
    border: "1px solid rgba(255,80,80,0.25)",
    background: "rgba(255,80,80,0.10)",
    padding: 14,
  },
  alertTitle: { fontWeight: 900, marginBottom: 6 },
  alertText: { color: "rgba(255,220,220,0.9)", whiteSpace: "pre-wrap" as const },
  card: {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    padding: 16,
  },
  cardTitle: { fontWeight: 900, marginBottom: 10 },
  muted: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
  select: {
    width: "100%",
    height: 42,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.92)",
    padding: "0 12px",
    outline: "none",
  },
  secondaryBtn: {
    height: 36,
    padding: "0 12px",
    borderRadius: 999,
    cursor: "pointer",
    fontWeight: 800,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.25)",
    color: "rgba(255,255,255,0.9)",
  },
  tableWrap: { overflowX: "auto" as const, borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)" },
  table: { width: "100%", borderCollapse: "collapse" as const, minWidth: 860 },
  th: {
    textAlign: "left" as const,
    fontSize: 12,
    color: "rgba(255,255,255,0.65)",
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
  },
} satisfies Record<string, React.CSSProperties>;