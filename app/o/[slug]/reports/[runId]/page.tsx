"use client";

// app/o/[slug]/reports/[runId]/page.tsx
//
// Visual report detail view. Fetches a report_run by ID and renders
// the full report_payload JSON as a rich dashboard with charts, cards,
// ranked departments, KPI grids, and executive narratives.
//
// Pure SVG charts (no external libraries). Theme-aware via CSS variables.
// Works in both daylight and night modes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import SectionCard from "@/components/ui/SectionCard";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import RadialGaugeChart from "@/components/charts/RadialGaugeChart";
import HorizontalBarChart, {
  type HorizontalBarRow,
} from "@/components/charts/HorizontalBarChart";
import DonutChart, { type DonutSegment } from "@/components/charts/DonutChart";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type Org = { id: string; slug: string; name: string };

type RunRow = {
  id: string;
  report_definition_id: string;
  org_id: string;
  cycle_id: string | null;
  status: string;
  period_label: string;
  date_from: string | null;
  date_to: string | null;
  report_payload: Record<string, unknown>;
  report_text: string | null;
  exported_formats: string[] | null;
  emailed_to: string[] | null;
  email_status: string;
  email_error: string | null;
  generated_by: string | null;
  generated_at: string;
};

type Definition = {
  id: string;
  title: string;
  description: string | null;
  cadence: string;
  department_id: string | null;
};

type LoadResponse = {
  ok: boolean;
  run?: RunRow;
  definition?: Definition | null;
  org?: Org;
  role?: string;
  canManage?: boolean;
  error?: string;
};

type Summary = {
  score: number;
  label: string;
  evaluation_band: string;
  strategic_execution_score: number;
  kpi_health_score: number;
  objective_health_score: number;
  okr_health_score: number;
  task_execution_score: number;
  execution_consistency_score: number;
  objectives: number;
  okrs: number;
  kpis: number;
  open_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  task_completion_rate: number;
  critical_departments: number;
  at_risk_departments: number;
  strong_departments: number;
};

type DepartmentRow = {
  id: string;
  name: string;
  score: number;
  label: string;
  execution_score: number;
  kpi_score: number;
  objective_health: number;
  okr_health: number;
  task_completion_rate: number;
  objectives: number;
  okrs: number;
  kpis: number;
  open_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  risk_level: string;
  narrative: string;
};

type KpiItem = {
  id: string;
  title: string;
  description: string | null;
  department_id: string | null;
  department_name: string | null;
  current_value: number | null;
  target_value: number | null;
  direction: string | null;
  score: number;
  label: string;
  age_days: number | null;
};

type ObjectiveItem = {
  id: string;
  title: string;
  status: string;
  progress: number;
  department_id: string | null;
  department_name: string | null;
  health_score: number;
};

type OkrItem = {
  id: string;
  title: string;
  status: string;
  progress: number;
  objective_id: string | null;
  department_id: string | null;
  department_name: string | null;
  health_score: number;
};

type TaskItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  department_id: string | null;
  department_name: string | null;
  assigned_to_user_id: string | null;
  due_date: string | null;
  overdue: boolean;
};

type NarrativeBlock = {
  narrative?: string;
  enterprise_score?: number;
  evaluation_band?: string;
  top_strengths?: string[];
  top_risks?: string[];
  execution_score?: number;
  kpi_health_score?: number;
  task_execution_score?: number;
  focus_areas?: string[];
};

type Recommendations = {
  immediate?: string[];
  thirty_day?: string[];
  ninety_day?: string[];
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

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

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function fmtNumber(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return String(Math.round(n));
}

function scoreToBandColor(value: number) {
  if (value < 45) return "#ef4444";
  if (value < 70) return "#f59e0b";
  if (value < 85) return "#10b981";
  return "#14b8a6";
}

function riskTone(level: string): "danger" | "warning" | "success" | "info" | "neutral" {
  const clean = level.toLowerCase();
  if (clean === "high" || clean === "critical") return "danger";
  if (clean === "medium" || clean === "moderate") return "warning";
  if (clean === "low") return "success";
  return "neutral";
}

function cadenceLabel(cadence: string) {
  if (!cadence) return "";
  if (cadence === "bi_weekly") return "Bi-weekly";
  if (cadence === "bi_annual") return "Bi-annual";
  return cadence.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export default function ReportDetailPage() {
  const params = useParams<{ slug: string; runId: string }>();
  const router = useRouter();
  const slug = String(params?.slug ?? "").trim();
  const runId = String(params?.runId ?? "").trim();

  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [run, setRun] = useState<RunRow | null>(null);
  const [definition, setDefinition] = useState<Definition | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const reportRef = useRef<HTMLDivElement | null>(null);

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

  const loadRun = useCallback(async () => {
    if (!slug || !runId) return;
    setLoading(true);
    setMsg(null);
    try {
      const session = await ensureAuth();
      if (!session) return;

      const res = await fetch(
        `/api/o/${encodeURIComponent(slug)}/reports/runs/${encodeURIComponent(runId)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        },
      );
      const raw = await res.text();
      const parsed = (await safeParseJson(raw)) as LoadResponse | null;

      if (!res.ok || !parsed?.ok) {
        throw new Error(
          parsed?.error || raw || `Couldn't load the report (HTTP ${res.status})`,
        );
      }

      setRun(parsed.run ?? null);
      setDefinition(parsed.definition ?? null);
      setOrg(parsed.org ?? null);
    } catch (e: unknown) {
      setMsg(getErrorMessage(e, "Couldn't load the report."));
    } finally {
      setLoading(false);
    }
  }, [slug, runId, ensureAuth]);

  useEffect(() => {
    void loadRun();
  }, [loadRun]);

  // ──── Payload parsing (memoized) ────
  const parsed = useMemo(() => {
    const payload = (run?.report_payload ?? {}) as Record<string, unknown>;
    const summary = (payload.summary ?? {}) as Summary;
    const executiveViews = (payload.executive_views ?? {}) as Record<string, unknown>;
    const board = (executiveViews.board ?? {}) as NarrativeBlock;
    const ceo = (executiveViews.ceo ?? {}) as NarrativeBlock;
    const departments = Array.isArray(payload.departments)
      ? (payload.departments as DepartmentRow[])
      : [];
    const kpis = Array.isArray(payload.kpis) ? (payload.kpis as KpiItem[]) : [];
    const objectives = Array.isArray(payload.objectives)
      ? (payload.objectives as ObjectiveItem[])
      : [];
    const okrs = Array.isArray(payload.okrs) ? (payload.okrs as OkrItem[]) : [];
    const tasks = Array.isArray(payload.tasks) ? (payload.tasks as TaskItem[]) : [];
    const recommendations = (payload.recommendations ?? {}) as Recommendations;
    return {
      summary,
      board,
      ceo,
      departments,
      kpis,
      objectives,
      okrs,
      tasks,
      recommendations,
    };
  }, [run]);

  // ──── CSV Export ────
  const handleExportCsv = useCallback(async () => {
    if (!run || !definition) return;
    setExporting(true);
    setMsg(null);
    try {
      const session = await ensureAuth();
      if (!session) return;

      const res = await fetch(
        `/api/o/${encodeURIComponent(slug)}/reports/${encodeURIComponent(definition.id)}/export?format=csv&runId=${encodeURIComponent(run.id)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      if (!res.ok) {
        const raw = await res.text();
        const err = (await safeParseJson(raw)) as { error?: string } | null;
        throw new Error(err?.error || `Export failed (HTTP ${res.status})`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${definition.title.replace(/\s+/g, "-")}-${run.id.slice(0, 8)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setMsg(getErrorMessage(e, "Couldn't export the CSV."));
    } finally {
      setExporting(false);
    }
  }, [run, definition, slug, ensureAuth]);

  // ──── PDF Export ────
  //
  // Tailwind v4 compiles color utilities like `bg-emerald-500`, `text-red-700`,
  // etc. to oklch() color functions. html2canvas cannot parse oklch and
  // crashes with "unsupported color function oklab". Our own CSS variables
  // are all rgb/hex, so the issue is confined to Tailwind palette classes
  // used by UI primitives (StatusBadge, StatCard) and a few danger states.
  //
  // The approach: clone the report DOM into an off-screen container, inject
  // a <style> tag that scopes high-specificity overrides to that container,
  // wait one frame, capture with html2canvas, then clean up. This leaves
  // the live page untouched while making the captured DOM safe to serialize.
  const handleExportPdf = useCallback(async () => {
    if (!run || !reportRef.current) return;
    setPdfBusy(true);
    setMsg(null);

    let clone: HTMLElement | null = null;
    let styleTag: HTMLStyleElement | null = null;

    try {
      // Dynamically import so PDF libs don't bloat the main bundle
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      const element = reportRef.current;

      // A unique id we'll apply to the clone root and use for CSS scoping
      const scopeId = `pdf-capture-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      // Build the clone
      clone = element.cloneNode(true) as HTMLElement;
      clone.id = scopeId;
      clone.style.position = "absolute";
      clone.style.left = "-99999px";
      clone.style.top = "0";
      clone.style.width = "1100px";
      clone.style.padding = "32px";
      // Force light backgrounds and colors for print
      clone.style.background = "#ffffff";
      clone.style.color = "#0b1220";

      // Inject override stylesheet. High specificity via the scope id.
      // This replaces every Tailwind palette color and every CSS variable
      // that might reference oklab with explicit rgb/hex values.
      styleTag = document.createElement("style");
      styleTag.textContent = `
/* ============================================
   PDF CAPTURE OVERRIDES — applies only to #${scopeId}
   Forces light theme + rgb colors to bypass oklch()
   that html2canvas cannot parse.
============================================ */
#${scopeId} {
  /* Override the CSS custom properties to hardcoded rgb values */
  --background: #ffffff !important;
  --foreground: #0b1220 !important;
  --foreground-soft: #0f172a !important;
  --foreground-muted: #475569 !important;
  --foreground-faint: #94a3b8 !important;
  --card: #ffffff !important;
  --card-soft: #f8fafc !important;
  --card-strong: #ffffff !important;
  --card-subtle: #f1f5f9 !important;
  --border: #e2e8f0 !important;
  --border-strong: #cbd5e1 !important;
  --border-active: #c7d2fe !important;
  --muted: rgb(71, 85, 105) !important;
  --muted-2: rgb(100, 116, 139) !important;
  --button-secondary-bg: #f1f5f9 !important;
  --button-secondary-hover: #e2e8f0 !important;
  --background-panel: #ffffff !important;
  --background-elevated: #ffffff !important;
  --background-sidebar: #ffffff !important;
}
#${scopeId} * {
  /* Neutralize any backdrop filters (they also cause issues) */
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

/* === Tailwind palette overrides (emerald) === */
#${scopeId} .text-emerald-700 { color: rgb(4, 120, 87) !important; }
#${scopeId} .text-emerald-200 { color: rgb(167, 243, 208) !important; }
#${scopeId} .text-emerald-300 { color: rgb(110, 231, 183) !important; }
#${scopeId} .text-emerald-500 { color: rgb(16, 185, 129) !important; }
#${scopeId} .bg-emerald-500\\/10 { background-color: rgba(16, 185, 129, 0.1) !important; }
#${scopeId} .bg-emerald-500\\/15 { background-color: rgba(16, 185, 129, 0.15) !important; }
#${scopeId} .border-emerald-500\\/20 { border-color: rgba(16, 185, 129, 0.2) !important; }

/* === amber === */
#${scopeId} .text-amber-700 { color: rgb(180, 83, 9) !important; }
#${scopeId} .text-amber-200 { color: rgb(253, 230, 138) !important; }
#${scopeId} .text-amber-300 { color: rgb(252, 211, 77) !important; }
#${scopeId} .text-amber-500 { color: rgb(245, 158, 11) !important; }
#${scopeId} .bg-amber-500\\/10 { background-color: rgba(245, 158, 11, 0.1) !important; }
#${scopeId} .bg-amber-500\\/15 { background-color: rgba(245, 158, 11, 0.15) !important; }
#${scopeId} .border-amber-500\\/20 { border-color: rgba(245, 158, 11, 0.2) !important; }

/* === red === */
#${scopeId} .text-red-700 { color: rgb(185, 28, 28) !important; }
#${scopeId} .text-red-500 { color: rgb(239, 68, 68) !important; }
#${scopeId} .text-red-400 { color: rgb(248, 113, 113) !important; }
#${scopeId} .text-red-300 { color: rgb(252, 165, 165) !important; }
#${scopeId} .text-red-200 { color: rgb(254, 202, 202) !important; }
#${scopeId} .text-red-100 { color: rgb(254, 226, 226) !important; }
#${scopeId} .bg-red-500\\/10 { background-color: rgba(239, 68, 68, 0.1) !important; }
#${scopeId} .bg-red-500\\/15 { background-color: rgba(239, 68, 68, 0.15) !important; }
#${scopeId} .bg-red-400\\/10 { background-color: rgba(248, 113, 113, 0.1) !important; }
#${scopeId} .bg-red-400\\/15 { background-color: rgba(248, 113, 113, 0.15) !important; }
#${scopeId} .border-red-500\\/20 { border-color: rgba(239, 68, 68, 0.2) !important; }
#${scopeId} .border-red-400\\/20 { border-color: rgba(248, 113, 113, 0.2) !important; }

/* === sky === */
#${scopeId} .text-sky-700 { color: rgb(3, 105, 161) !important; }
#${scopeId} .text-sky-200 { color: rgb(186, 230, 253) !important; }
#${scopeId} .text-sky-500 { color: rgb(14, 165, 233) !important; }
#${scopeId} .bg-sky-500\\/10 { background-color: rgba(14, 165, 233, 0.1) !important; }
#${scopeId} .border-sky-500\\/20 { border-color: rgba(14, 165, 233, 0.2) !important; }

/* === Force any remaining oklab-bearing utility to a neutral gray === */
#${scopeId} [class*="slate-"],
#${scopeId} [class*="zinc-"],
#${scopeId} [class*="gray-"] {
  color: inherit;
}

/* Fallback: ensure no element has transparent background that would
   reveal the body's gradients underneath during capture */
#${scopeId} section,
#${scopeId} article {
  background-color: transparent;
}
`;
      document.head.appendChild(styleTag);
      document.body.appendChild(clone);

      // Wait for styles to apply
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      await new Promise((resolve) => setTimeout(resolve, 50));

      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        windowWidth: 1100,
        logging: false,
        // Tell html2canvas to ignore elements that might still cause issues
        ignoreElements: (node) => {
          // Skip script/style/link tags in the capture
          const tag = node.tagName?.toLowerCase();
          return tag === "script" || tag === "noscript";
        },
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = 210;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      // Paginate if taller than one page
      let heightLeft = pdfHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
      heightLeft -= 297; // A4 height in mm

      while (heightLeft > 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
        heightLeft -= 297;
      }

      const title = definition?.title ?? "report";
      pdf.save(
        `ALAMIN-${title.replace(/\s+/g, "-")}-${run.id.slice(0, 8)}.pdf`,
      );
    } catch (e: unknown) {
      setMsg(getErrorMessage(e, "Couldn't generate the PDF."));
    } finally {
      // Clean up no matter what
      if (clone && clone.parentNode) {
        clone.parentNode.removeChild(clone);
      }
      if (styleTag && styleTag.parentNode) {
        styleTag.parentNode.removeChild(styleTag);
      }
      setPdfBusy(false);
    }
  }, [run, definition]);

  // ──── Loading state ────
  if (loading) {
    return (
      <AppShell slug={slug} sessionEmail={sessionEmail}>
        <AppPageHeader
          title="Loading report"
          description="Reading the report payload and preparing your dashboard."
        />
        <div className="mt-6 grid gap-4">
          <div className="h-[420px] animate-pulse rounded-[28px] border border-[var(--border)] bg-[var(--card)]" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-56 animate-pulse rounded-[24px] border border-[var(--border)] bg-[var(--card)]" />
            <div className="h-56 animate-pulse rounded-[24px] border border-[var(--border)] bg-[var(--card)]" />
          </div>
          <div className="h-80 animate-pulse rounded-[24px] border border-[var(--border)] bg-[var(--card)]" />
        </div>
      </AppShell>
    );
  }

  // ──── Error state ────
  if (!run) {
    return (
      <AppShell slug={slug} sessionEmail={sessionEmail}>
        <AppPageHeader
          title="Report not available"
          description="We couldn't load this report."
        />
        <div className="mt-6">
          <SectionCard title="Something went wrong">
            <EmptyState
              title="Report not found"
              description={
                msg ?? "This report run may have been deleted or you don't have access."
              }
            />
            <div className="mt-4">
              <button
                type="button"
                onClick={() => router.push(`/o/${slug}/reports`)}
                className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90"
              >
                Back to reports
              </button>
            </div>
          </SectionCard>
        </div>
      </AppShell>
    );
  }

  const { summary, board, ceo, departments, kpis, objectives, okrs, recommendations } = parsed;
  const rankedDepartments = [...departments].sort((a, b) => b.score - a.score);

  // KPIs at risk — sort by score ascending, take up to 6
  const kpisAtRisk = [...kpis].sort((a, b) => a.score - b.score).slice(0, 6);

  // Objectives with their linked OKRs rolled up
  const objectivesWithRollup = objectives.map((obj) => {
    const linkedOkrs = okrs.filter((okr) => okr.objective_id === obj.id);
    const avgOkrProgress =
      linkedOkrs.length > 0
        ? linkedOkrs.reduce((sum, o) => sum + (o.progress ?? 0), 0) /
          linkedOkrs.length
        : null;
    return {
      ...obj,
      linked_okrs_count: linkedOkrs.length,
      avg_okr_progress: avgOkrProgress,
    };
  });

  // Sort objectives: at-risk first (low health), then by progress ascending
  const rankedObjectives = [...objectivesWithRollup].sort((a, b) => {
    if (a.health_score !== b.health_score) return a.health_score - b.health_score;
    return (a.progress ?? 0) - (b.progress ?? 0);
  });

  // OKRs ranked by progress ascending (worst first)
  const rankedOkrs = [...okrs].sort((a, b) => (a.progress ?? 0) - (b.progress ?? 0));

  // Task breakdown donut data
  const taskDonut: DonutSegment[] = [
    { label: "Completed", value: summary.completed_tasks ?? 0, color: "#10b981" },
    {
      label: "Open",
      value: Math.max(
        0,
        (summary.open_tasks ?? 0) - (summary.overdue_tasks ?? 0),
      ),
      color: "#3b82f6",
    },
    { label: "Overdue", value: summary.overdue_tasks ?? 0, color: "#ef4444" },
  ];

  // Department ranking rows
  const departmentBarRows: HorizontalBarRow[] = rankedDepartments.map((dept) => ({
    label: dept.name,
    value: dept.score,
    subtext: `${dept.kpis} KPIs • ${dept.objectives} objectives • ${dept.overdue_tasks} overdue`,
  }));

  const immediateActions = recommendations.immediate ?? [];

  return (
    <AppShell slug={slug} sessionEmail={sessionEmail}>
      <AppPageHeader
        title={definition?.title ?? "Report"}
        description={
          definition?.description ||
          `${cadenceLabel(definition?.cadence ?? "")} report · ${run.period_label}`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push(`/o/${slug}/reports`)}
              className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void handleExportCsv()}
              disabled={exporting || !definition}
              className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)] disabled:opacity-60"
            >
              {exporting ? "Exporting…" : "Download CSV"}
            </button>
            <button
              type="button"
              onClick={() => void handleExportPdf()}
              disabled={pdfBusy}
              className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:opacity-60"
            >
              {pdfBusy ? "Preparing PDF…" : "Download PDF"}
            </button>
          </div>
        }
      />

      {msg ? (
        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
          {msg}
        </div>
      ) : null}

      <div ref={reportRef} className="mt-6 grid gap-6">
        {/* ───────────────────────────────────────────────────────────── */}
        {/* HERO — Enterprise score with radial gauge                     */}
        {/* ───────────────────────────────────────────────────────────── */}
        <SectionCard
          title="Enterprise performance"
          subtitle="Overall health across strategy, KPIs, and execution"
          className="bg-[var(--background-panel)]"
        >
          <div className="grid gap-8 lg:grid-cols-[auto_1fr] lg:items-center">
            <div className="flex justify-center">
              <RadialGaugeChart
                value={summary.score ?? 0}
                sublabel={summary.evaluation_band ?? ""}
                size={300}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <ScoreCard
                label="Strategic execution"
                value={summary.strategic_execution_score}
                hint="Strategy aligned with delivery"
              />
              <ScoreCard
                label="KPI health"
                value={summary.kpi_health_score}
                hint="Against targets"
              />
              <ScoreCard
                label="Task execution"
                value={summary.task_execution_score}
                hint="Completion velocity"
              />
              <ScoreCard
                label="Overdue tasks"
                value={summary.overdue_tasks ?? 0}
                hint="Immediate intervention"
                raw
                inverseBand
              />
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <MiniStat
              label="Objectives"
              value={summary.objectives ?? 0}
              tone="neutral"
            />
            <MiniStat label="OKRs" value={summary.okrs ?? 0} tone="neutral" />
            <MiniStat label="KPIs" value={summary.kpis ?? 0} tone="neutral" />
            <MiniStat
              label="Departments"
              value={departments.length}
              tone="neutral"
            />
          </div>
        </SectionCard>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* EXECUTIVE NARRATIVES — Board + CEO side-by-side               */}
        {/* ───────────────────────────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-2">
          <NarrativeCard
            label="Board view"
            title="What the board sees"
            body={board.narrative ?? "No board-level narrative generated yet."}
            tags={board.top_risks?.slice(0, 3)}
            tagsLabel="Top risks"
          />
          <NarrativeCard
            label="CEO view"
            title="Where the CEO focuses"
            body={ceo.narrative ?? "No CEO-level narrative generated yet."}
            tags={ceo.focus_areas?.slice(0, 3)}
            tagsLabel="Focus areas"
          />
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* DEPARTMENT PERFORMANCE — Horizontal bar ranking + detail grid */}
        {/* ───────────────────────────────────────────────────────────── */}
        <SectionCard
          title="Department performance"
          subtitle="Ranked by overall score"
          className="bg-[var(--background-panel)]"
        >
          {rankedDepartments.length === 0 ? (
            <EmptyState
              title="No department data"
              description="Add departments and assign KPIs, OKRs, or tasks to see breakdown."
            />
          ) : (
            <>
              <HorizontalBarChart rows={departmentBarRows} max={100} />

              <div className="mt-8 grid gap-4 md:grid-cols-2">
                {rankedDepartments.map((dept) => (
                  <DepartmentCard key={dept.id} dept={dept} />
                ))}
              </div>
            </>
          )}
        </SectionCard>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* KPIs AT RISK                                                   */}
        {/* ───────────────────────────────────────────────────────────── */}
        <SectionCard
          title="KPIs at risk"
          subtitle="Lowest-scoring metrics that need attention"
          className="bg-[var(--background-panel)]"
        >
          {kpisAtRisk.length === 0 ? (
            <EmptyState
              title="No KPIs tracked"
              description="Add KPIs and start recording values to see performance data."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {kpisAtRisk.map((kpi) => (
                <KpiCard key={kpi.id} kpi={kpi} />
              ))}
            </div>
          )}
        </SectionCard>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* STRATEGY OVERVIEW — Objectives + OKRs progress                 */}
        {/* ───────────────────────────────────────────────────────────── */}
        <SectionCard
          title="Strategy overview"
          subtitle="Objectives and their key results in progress"
          className="bg-[var(--background-panel)]"
        >
          {rankedObjectives.length === 0 && rankedOkrs.length === 0 ? (
            <EmptyState
              title="No objectives or OKRs tracked"
              description="Add objectives and OKRs to see strategy execution progress."
            />
          ) : (
            <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
              {/* Left: Objectives with linked OKR counts */}
              <div>
                <div className="mb-4 flex items-baseline justify-between">
                  <div className="text-sm font-bold text-[var(--foreground)]">
                    Objectives
                  </div>
                  <div className="text-xs text-[var(--foreground-muted)]">
                    {rankedObjectives.length} total
                  </div>
                </div>

                {rankedObjectives.length === 0 ? (
                  <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm text-[var(--foreground-muted)]">
                    No objectives tracked in this period.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {rankedObjectives.slice(0, 8).map((obj) => (
                      <ObjectiveRow key={obj.id} obj={obj} />
                    ))}
                    {rankedObjectives.length > 8 ? (
                      <div className="mt-1 text-center text-xs text-[var(--foreground-muted)]">
                        + {rankedObjectives.length - 8} more objectives
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Right: OKRs with worst-first ranking */}
              <div>
                <div className="mb-4 flex items-baseline justify-between">
                  <div className="text-sm font-bold text-[var(--foreground)]">
                    Key results
                  </div>
                  <div className="text-xs text-[var(--foreground-muted)]">
                    {rankedOkrs.length} total
                  </div>
                </div>

                {rankedOkrs.length === 0 ? (
                  <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm text-[var(--foreground-muted)]">
                    No key results tracked in this period.
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {rankedOkrs.slice(0, 8).map((okr) => (
                      <OkrRow key={okr.id} okr={okr} />
                    ))}
                    {rankedOkrs.length > 8 ? (
                      <div className="mt-1 text-center text-xs text-[var(--foreground-muted)]">
                        + {rankedOkrs.length - 8} more key results
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Strategy health summary row at the bottom */}
          {(rankedObjectives.length > 0 || rankedOkrs.length > 0) ? (
            <div className="mt-8 grid gap-3 border-t border-[var(--border)] pt-6 sm:grid-cols-3">
              <StrategyHealthStat
                label="Objective health"
                value={summary.objective_health_score ?? 0}
              />
              <StrategyHealthStat
                label="OKR health"
                value={summary.okr_health_score ?? 0}
              />
              <StrategyHealthStat
                label="Strategic execution"
                value={summary.strategic_execution_score ?? 0}
              />
            </div>
          ) : null}
        </SectionCard>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* TASK BREAKDOWN — Donut chart                                   */}
        {/* ───────────────────────────────────────────────────────────── */}
        <SectionCard
          title="Task execution breakdown"
          subtitle="Completion vs open vs overdue across the workspace"
          className="bg-[var(--background-panel)]"
        >
          <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
            <div className="flex justify-center">
              <DonutChart
                segments={taskDonut}
                size={260}
                centerLabel={String(
                  (summary.completed_tasks ?? 0) +
                    (summary.open_tasks ?? 0) +
                    (summary.overdue_tasks ?? 0),
                )}
                centerSublabel="Total tasks"
              />
            </div>
            <div className="grid gap-3">
              <TaskStatRow
                label="Completion rate"
                value={`${Math.round(summary.task_completion_rate ?? 0)}%`}
                description="Of all tasks in the period, how many were completed."
              />
              <TaskStatRow
                label="Completed"
                value={String(summary.completed_tasks ?? 0)}
                description="Closed out successfully."
              />
              <TaskStatRow
                label="Open"
                value={String(
                  Math.max(
                    0,
                    (summary.open_tasks ?? 0) - (summary.overdue_tasks ?? 0),
                  ),
                )}
                description="In progress, not yet late."
              />
              <TaskStatRow
                label="Overdue"
                value={String(summary.overdue_tasks ?? 0)}
                description="Past due date and not done."
                warn
              />
            </div>
          </div>
        </SectionCard>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* IMMEDIATE ACTIONS                                              */}
        {/* ───────────────────────────────────────────────────────────── */}
        <SectionCard
          title="Immediate executive actions"
          subtitle="AI-generated recommendations based on this period's performance"
          className="bg-[var(--background-panel)]"
        >
          {immediateActions.length === 0 ? (
            <EmptyState
              title="No immediate actions"
              description="Nothing urgent flagged for this period."
            />
          ) : (
            <ul className="grid gap-3">
              {immediateActions.map((action, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-4"
                >
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--foreground)] text-xs font-bold text-[var(--background)]">
                    {idx + 1}
                  </span>
                  <span className="text-sm leading-6 text-[var(--foreground-soft)]">
                    {action}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {(recommendations.thirty_day ?? []).length > 0 ||
          (recommendations.ninety_day ?? []).length > 0 ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {(recommendations.thirty_day ?? []).length > 0 ? (
                <RecommendationGroup
                  title="30-day plan"
                  items={recommendations.thirty_day ?? []}
                />
              ) : null}
              {(recommendations.ninety_day ?? []).length > 0 ? (
                <RecommendationGroup
                  title="90-day plan"
                  items={recommendations.ninety_day ?? []}
                />
              ) : null}
            </div>
          ) : null}
        </SectionCard>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* FOOTER METADATA                                                */}
        {/* ───────────────────────────────────────────────────────────── */}
        <div className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--foreground-muted)]">
            <div>
              Generated {fmtDate(run.generated_at)}
              {org ? ` · ${org.name}` : ""}
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="info">{run.status}</StatusBadge>
              <StatusBadge tone="neutral">
                {cadenceLabel(definition?.cadence ?? "")}
              </StatusBadge>
              {run.email_status && run.email_status !== "pending" ? (
                <StatusBadge tone="success">Emailed</StatusBadge>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function ScoreCard({
  label,
  value,
  hint,
  raw,
  inverseBand,
}: {
  label: string;
  value: number;
  hint?: string;
  raw?: boolean; // don't treat as 0-100 score
  inverseBand?: boolean; // higher = worse (e.g. overdue count)
}) {
  const numeric = Number.isFinite(value) ? value : 0;
  const bandValue = raw ? (inverseBand ? 100 - Math.min(numeric * 10, 100) : numeric) : numeric;
  const color = scoreToBandColor(bandValue);
  return (
    <div className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
        {label}
      </div>
      <div
        className="mt-3 text-4xl font-black tabular-nums"
        style={{ color }}
      >
        {raw ? fmtNumber(value) : `${fmtNumber(value)}`}
        {raw ? "" : <span className="text-lg font-bold opacity-60">/100</span>}
      </div>
      {hint ? (
        <div className="mt-2 text-xs text-[var(--foreground-muted)]">{hint}</div>
      ) : null}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "warn";
}) {
  return (
    <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card-subtle)] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
        {label}
      </div>
      <div
        className={
          "mt-1 text-2xl font-black tabular-nums " +
          (tone === "warn"
            ? "text-red-500 dark:text-red-300"
            : "text-[var(--foreground)]")
        }
      >
        {value}
      </div>
    </div>
  );
}

function NarrativeCard({
  label,
  title,
  body,
  tags,
  tagsLabel,
}: {
  label: string;
  title: string;
  body: string;
  tags?: string[];
  tagsLabel?: string;
}) {
  return (
    <SectionCard
      title={title}
      subtitle={label}
      className="bg-[var(--background-panel)]"
    >
      <p className="text-sm leading-7 text-[var(--foreground-soft)]">{body}</p>
      {tags && tags.length > 0 ? (
        <div className="mt-4">
          {tagsLabel ? (
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
              {tagsLabel}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, i) => (
              <span
                key={`${tag}-${i}`}
                className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs font-semibold text-[var(--foreground-soft)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}

function DepartmentCard({ dept }: { dept: DepartmentRow }) {
  const color = scoreToBandColor(dept.score);
  return (
    <div
      className="relative overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-5"
      style={{
        borderLeftWidth: 4,
        borderLeftColor: color,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold text-[var(--foreground)]">
            {dept.name}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge tone={riskTone(dept.risk_level)}>
              {dept.label}
            </StatusBadge>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
              Risk: {dept.risk_level}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-3xl font-black tabular-nums" style={{ color }}>
            {Math.round(dept.score)}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
            Score
          </div>
        </div>
      </div>

      {dept.narrative ? (
        <p className="mt-3 text-xs leading-6 text-[var(--foreground-muted)]">
          {dept.narrative}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-4 gap-2 border-t border-[var(--border)] pt-4">
        <SubMetric label="KPIs" value={Math.round(dept.kpi_score)} suffix="/100" />
        <SubMetric
          label="OKRs"
          value={Math.round(dept.okr_health)}
          suffix="/100"
        />
        <SubMetric
          label="Exec"
          value={Math.round(dept.execution_score)}
          suffix="/100"
        />
        <SubMetric label="Overdue" value={dept.overdue_tasks} warn={dept.overdue_tasks > 0} />
      </div>
    </div>
  );
}

function SubMetric({
  label,
  value,
  suffix,
  warn,
}: {
  label: string;
  value: number;
  suffix?: string;
  warn?: boolean;
}) {
  return (
    <div className="text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
        {label}
      </div>
      <div
        className={
          "mt-1 text-sm font-bold tabular-nums " +
          (warn
            ? "text-red-500 dark:text-red-300"
            : "text-[var(--foreground)]")
        }
      >
        {value}
        {suffix ? (
          <span className="text-[10px] font-semibold opacity-60">{suffix}</span>
        ) : null}
      </div>
    </div>
  );
}

function KpiCard({ kpi }: { kpi: KpiItem }) {
  const color = scoreToBandColor(kpi.score);
  const current = kpi.current_value ?? null;
  const target = kpi.target_value ?? null;
  const ratio =
    current !== null && target !== null && target !== 0
      ? Math.max(0, Math.min(100, (current / target) * 100))
      : null;

  return (
    <div
      className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-4"
      style={{ borderTopWidth: 3, borderTopColor: color }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-bold text-[var(--foreground)]">
            {kpi.title}
          </div>
          {kpi.department_name ? (
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
              {kpi.department_name}
            </div>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-black tabular-nums" style={{ color }}>
            {Math.round(kpi.score)}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
            Current
          </span>
          <span className="text-sm font-bold text-[var(--foreground)]">
            {current !== null ? current : "—"}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
            Target
          </span>
          <span className="text-sm font-bold text-[var(--foreground)]">
            {target !== null ? target : "—"}
          </span>
        </div>

        {ratio !== null ? (
          <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-[var(--border)]">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
              style={{
                width: `${ratio}%`,
                backgroundColor: color,
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TaskStatRow({
  label,
  value,
  description,
  warn,
}: {
  label: string;
  value: string;
  description: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-[var(--foreground)]">
          {label}
        </div>
        <div className="mt-1 text-xs text-[var(--foreground-muted)]">
          {description}
        </div>
      </div>
      <div
        className={
          "shrink-0 text-2xl font-black tabular-nums " +
          (warn
            ? "text-red-500 dark:text-red-300"
            : "text-[var(--foreground)]")
        }
      >
        {value}
      </div>
    </div>
  );
}

function RecommendationGroup({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="text-sm font-bold text-[var(--foreground)]">{title}</div>
      <ul className="mt-3 space-y-2">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-xs leading-6 text-[var(--foreground-soft)]"
          >
            <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--foreground-muted)]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Objective row — shows title, department, status, progress bar, linked OKRs
// ────────────────────────────────────────────────────────────────────────────

function ObjectiveRow({
  obj,
}: {
  obj: ObjectiveItem & {
    linked_okrs_count: number;
    avg_okr_progress: number | null;
  };
}) {
  const progress = Math.max(0, Math.min(100, Math.round(obj.progress ?? 0)));
  const healthColor = scoreToBandColor(obj.health_score ?? 0);

  return (
    <div
      className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--border-strong)]"
      style={{ borderLeftWidth: 3, borderLeftColor: healthColor }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-semibold text-[var(--foreground)]">
            {obj.title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {obj.department_name ? (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
                {obj.department_name}
              </span>
            ) : null}
            <StatusBadge tone={objectiveStatusTone(obj.status)}>
              {formatStatus(obj.status)}
            </StatusBadge>
            {obj.linked_okrs_count > 0 ? (
              <span className="rounded-full border border-[var(--border)] bg-[var(--card-subtle)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-soft)]">
                {obj.linked_okrs_count} KR{obj.linked_okrs_count === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xl font-black tabular-nums text-[var(--foreground)]">
            {progress}
            <span className="text-xs font-bold opacity-60">%</span>
          </div>
        </div>
      </div>

      <div className="mt-3 relative h-2 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-[900ms] ease-out"
          style={{
            width: `${progress}%`,
            backgroundColor: healthColor,
          }}
        />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// OKR row — compact, shows title, department, progress bar
// ────────────────────────────────────────────────────────────────────────────

function OkrRow({ okr }: { okr: OkrItem }) {
  const progress = Math.max(0, Math.min(100, Math.round(okr.progress ?? 0)));
  const healthColor = scoreToBandColor(okr.health_score ?? 0);

  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-[var(--foreground)]">
            {okr.title}
          </div>
          {okr.department_name ? (
            <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
              {okr.department_name}
            </div>
          ) : null}
        </div>
        <div
          className="shrink-0 text-sm font-bold tabular-nums"
          style={{ color: healthColor }}
        >
          {progress}%
        </div>
      </div>

      <div className="mt-2 relative h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-[900ms] ease-out"
          style={{
            width: `${progress}%`,
            backgroundColor: healthColor,
          }}
        />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Strategy health stat — compact stat card used at the bottom of the
// strategy section to show aggregate health scores
// ────────────────────────────────────────────────────────────────────────────

function StrategyHealthStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const color = scoreToBandColor(value);
  return (
    <div className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div
          className="text-2xl font-black tabular-nums"
          style={{ color }}
        >
          {Math.round(value)}
        </div>
        <div className="text-xs font-semibold text-[var(--foreground-muted)]">
          / 100
        </div>
      </div>
      <div className="mt-3 relative h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Status helpers for objectives and OKRs
// ────────────────────────────────────────────────────────────────────────────

function objectiveStatusTone(
  status: string,
): "success" | "warning" | "danger" | "info" | "neutral" {
  const clean = String(status ?? "").toLowerCase();
  if (["done", "completed", "achieved"].includes(clean)) return "success";
  if (["on_track", "on-track", "in_progress", "in-progress", "active"].includes(clean))
    return "info";
  if (["at_risk", "at-risk", "behind"].includes(clean)) return "warning";
  if (["blocked", "off_track", "off-track", "cancelled"].includes(clean))
    return "danger";
  return "neutral";
}

function formatStatus(status: string): string {
  if (!status) return "—";
  return String(status)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
