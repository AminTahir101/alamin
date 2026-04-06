"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";
import StatCard from "@/components/ui/StatCard";

type Cycle = { id: string; year: number; quarter: number; status: string };
type Department = { id: string; name: string };
type ReportDefinition = {
  id: string;
  org_id: string;
  cycle_id: string | null;
  department_id: string | null;
  title: string;
  description: string | null;
  cadence: string;
  custom_label: string | null;
  custom_date_from: string | null;
  custom_date_to: string | null;
  recipients: string[] | null;
  export_formats: string[] | null;
  include_company_summary: boolean;
  include_department_breakdown: boolean;
  include_objectives: boolean;
  include_okrs: boolean;
  include_kpis: boolean;
  include_tasks: boolean;
  auto_generate: boolean;
  auto_email: boolean;
  is_active: boolean;
  last_generated_at: string | null;
  created_at: string;
};
type ReportRun = {
  id: string;
  report_definition_id: string;
  status: string;
  period_label: string;
  email_status: string;
  email_error: string | null;
  emailed_to: string[] | null;
  exported_formats: string[] | null;
  generated_at: string;
};
type LoadResponse = {
  ok: boolean;
  cycle?: Cycle | null;
  definitions?: ReportDefinition[];
  runs?: ReportRun[];
  departments?: Department[];
  role?: string;
  visibility?: string;
  canManage?: boolean;
  error?: string;
};
type FormState = {
  title: string;
  description: string;
  cadence: string;
  custom_label: string;
  custom_date_from: string;
  custom_date_to: string;
  department_id: string;
  recipients: string;
  include_company_summary: boolean;
  include_department_breakdown: boolean;
  include_objectives: boolean;
  include_okrs: boolean;
  include_kpis: boolean;
  include_tasks: boolean;
  auto_generate: boolean;
  auto_email: boolean;
};

const defaultForm: FormState = {
  title: "",
  description: "",
  cadence: "weekly",
  custom_label: "",
  custom_date_from: "",
  custom_date_to: "",
  department_id: "",
  recipients: "",
  include_company_summary: true,
  include_department_breakdown: true,
  include_objectives: true,
  include_okrs: true,
  include_kpis: true,
  include_tasks: true,
  auto_generate: true,
  auto_email: true,
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

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function toneForStatus(value?: string | null) {
  const clean = String(value ?? "").toLowerCase();
  if (["sent", "emailed", "generated", "active", "success", "completed"].includes(clean)) {
    return "success" as const;
  }
  if (["pending", "queued", "running", "warning"].includes(clean)) {
    return "warning" as const;
  }
  if (["failed", "error"].includes(clean)) {
    return "danger" as const;
  }
  if (["processing", "building"].includes(clean)) {
    return "info" as const;
  }
  return "neutral" as const;
}

function cadenceLabel(cadence: string) {
  switch (cadence) {
    case "bi_weekly":
      return "Bi-weekly";
    case "bi_annual":
      return "Bi-annual";
    default:
      return cadence.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function inputClass() {
  return "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-[var(--foreground)] outline-none transition placeholder:text-[var(--foreground-faint)] focus:border-[var(--border-strong)]";
}

function textareaClass() {
  return "min-h-[96px] w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[var(--foreground)] outline-none transition placeholder:text-[var(--foreground-faint)] focus:border-[var(--border-strong)]";
}

function selectClass() {
  return "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-[var(--foreground)] outline-none transition focus:border-[var(--border-strong)]";
}

function primaryButtonClass() {
  return "inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:opacity-60";
}

function secondaryButtonClass() {
  return "inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)] disabled:opacity-60";
}

function chipClass() {
  return "rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3 py-1 text-xs font-semibold text-[var(--foreground-soft)]";
}

export default function ReportsPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const orgSlug = String(params?.slug ?? "").trim();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [definitions, setDefinitions] = useState<ReportDefinition[]>([]);
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);

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

  const loadReports = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const session = await ensureAuth();
      if (!session) return;

      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/reports`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });

      const raw = await res.text();
      const parsed = (await safeParseJson(raw)) as LoadResponse | null;
      if (!res.ok || !parsed || parsed.ok !== true) {
        throw new Error(parsed?.error || raw || "Failed to load reports");
      }

      setCycle(parsed.cycle ?? null);
      setDefinitions(Array.isArray(parsed.definitions) ? parsed.definitions : []);
      setRuns(Array.isArray(parsed.runs) ? parsed.runs : []);
      setDepartments(Array.isArray(parsed.departments) ? parsed.departments : []);
      setCanManage(Boolean(parsed.canManage));

      if (!form.recipients && session.user.email) {
        setForm((prev) => ({ ...prev, recipients: session.user.email ?? "" }));
      }
    } catch (err: unknown) {
      setMsg(getErrorMessage(err, "Failed to load reports"));
    } finally {
      setLoading(false);
    }
  }, [ensureAuth, form.recipients, orgSlug]);

  useEffect(() => {
    if (!orgSlug) return;
    void loadReports();
  }, [loadReports, orgSlug]);

  const stats = useMemo(() => {
    const autoEmails = definitions.filter((row) => row.auto_email).length;
    const generated = runs.length;
    const emailed = runs.filter((row) => row.email_status === "sent").length;
    return {
      definitions: definitions.length,
      generated,
      emailed,
      autoEmails,
    };
  }, [definitions, runs]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function createReport() {
    setSaving(true);
    setMsg(null);
    setOkMsg(null);

    try {
      const session = await ensureAuth();
      if (!session) return;

      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        cadence: form.cadence,
        custom_label: form.custom_label.trim(),
        custom_date_from: form.custom_date_from || null,
        custom_date_to: form.custom_date_to || null,
        department_id: form.department_id || null,
        recipients: form.recipients
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        include_company_summary: form.include_company_summary,
        include_department_breakdown: form.include_department_breakdown,
        include_objectives: form.include_objectives,
        include_okrs: form.include_okrs,
        include_kpis: form.include_kpis,
        include_tasks: form.include_tasks,
        auto_generate: form.auto_generate,
        auto_email: form.auto_email,
        export_formats: ["json", "csv"],
      };

      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const raw = await res.text();
      const parsed = (await safeParseJson(raw)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !parsed?.ok) {
        throw new Error(parsed?.error || raw || "Failed to create report");
      }

      setOkMsg("Report created. If auto-generate is enabled, the first run was generated immediately.");
      setForm((prev) => ({ ...defaultForm, recipients: prev.recipients }));
      await loadReports();
    } catch (err: unknown) {
      setMsg(getErrorMessage(err, "Failed to create report"));
    } finally {
      setSaving(false);
    }
  }

  async function generateNow(id: string) {
    setRunningId(id);
    setMsg(null);
    setOkMsg(null);
    try {
      const session = await ensureAuth();
      if (!session) return;
      const res = await fetch(
        `/api/o/${encodeURIComponent(orgSlug)}/reports/${encodeURIComponent(id)}/generate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      const raw = await res.text();
      const parsed = (await safeParseJson(raw)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !parsed?.ok) {
        throw new Error(parsed?.error || raw || "Failed to generate report");
      }
      setOkMsg("Report generated.");
      await loadReports();
    } catch (err: unknown) {
      setMsg(getErrorMessage(err, "Failed to generate report"));
    } finally {
      setRunningId(null);
    }
  }

  async function deactivateReport(id: string) {
    setRunningId(id);
    setMsg(null);
    setOkMsg(null);
    try {
      const session = await ensureAuth();
      if (!session) return;
      const res = await fetch(
        `/api/o/${encodeURIComponent(orgSlug)}/reports/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      const raw = await res.text();
      const parsed = (await safeParseJson(raw)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !parsed?.ok) {
        throw new Error(parsed?.error || raw || "Failed to delete report");
      }
      setOkMsg("Report deactivated.");
      await loadReports();
    } catch (err: unknown) {
      setMsg(getErrorMessage(err, "Failed to delete report"));
    } finally {
      setRunningId(null);
    }
  }

  async function exportReport(id: string, format: "json" | "csv") {
    setRunningId(id);
    setMsg(null);
    setOkMsg(null);
    try {
      const session = await ensureAuth();
      if (!session) return;
      const res = await fetch(
        `/api/o/${encodeURIComponent(orgSlug)}/reports/${encodeURIComponent(id)}/export?format=${format}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      if (!res.ok) {
        const raw = await res.text();
        const parsed = (await safeParseJson(raw)) as { error?: string } | null;
        throw new Error(parsed?.error || raw || "Failed to export report");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${id}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setOkMsg(`Report exported as ${format.toUpperCase()}.`);
    } catch (err: unknown) {
      setMsg(getErrorMessage(err, "Failed to export report"));
    } finally {
      setRunningId(null);
    }
  }

  const runsByDefinition = useMemo(() => {
    const map = new Map<string, ReportRun[]>();
    for (const run of runs) {
      if (!map.has(run.report_definition_id)) map.set(run.report_definition_id, []);
      map.get(run.report_definition_id)!.push(run);
    }
    return map;
  }, [runs]);

  return (
    <AppShell
      slug={orgSlug}
      sessionEmail={sessionEmail}
      topActions={
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void loadReports()} className={secondaryButtonClass()}>
            Refresh
          </button>
          <button
            type="button"
            onClick={() => router.push(`/o/${encodeURIComponent(orgSlug)}/dashboard`)}
            className={primaryButtonClass()}
          >
            Back to dashboard
          </button>
        </div>
      }
    >
      <AppPageHeader
        eyebrow={cycle ? `Q${cycle.quarter} ${cycle.year} · ${cycle.status}` : "No active cycle"}
        title="Reports"
        description="Create default or custom reports, export them, auto-generate them, and email them straight from the workspace."
      />

      {(msg || okMsg) && (
        <div className="mb-6 grid gap-3">
          {msg ? (
            <div className="rounded-[20px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-100">
              {msg}
            </div>
          ) : null}
          {okMsg ? (
            <div className="rounded-[20px] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">
              {okMsg}
            </div>
          ) : null}
        </div>
      )}

      <section className="mb-6 overflow-hidden rounded-[30px] border border-[var(--border)] bg-[var(--background-panel)] p-6 alamin-shadow">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground-faint)]">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />
              Reporting engine
            </div>

            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-[var(--foreground)]">
              Automate reporting without turning it into spreadsheet theater.
            </h2>

            <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--foreground-muted)]">
              Create reusable report definitions, choose what goes inside, auto-generate on cadence,
              export to JSON or CSV, and email leadership directly from the product.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <span className={chipClass()}>Weekly to annual cadence</span>
              <span className={chipClass()}>Custom report windows</span>
              <span className={chipClass()}>Export + email delivery</span>
              <span className={chipClass()}>Department-scoped reporting</span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
            <StatCard title="Report definitions" value={stats.definitions} hint="Reusable saved reports" />
            <StatCard title="Generated runs" value={stats.generated} hint="Stored report outputs" tone="info" />
            <StatCard title="Email deliveries" value={stats.emailed} hint="Runs emailed successfully" tone="success" />
            <StatCard title="Auto-email enabled" value={stats.autoEmails} hint="Definitions that send automatically" tone="warning" />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <SectionCard
          title="Create report"
          subtitle="Default cadences or a custom report window"
          className="bg-[var(--background-panel)]"
          actions={
            canManage ? (
              <button
                type="button"
                onClick={() => void createReport()}
                disabled={saving}
                className={primaryButtonClass()}
              >
                {saving ? "Saving..." : "Create report"}
              </button>
            ) : null
          }
        >
          {!canManage ? (
            <EmptyState
              title="Report creation disabled"
              description="Employees can view report runs, but only managers and above can create or manage report definitions."
            />
          ) : (
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Report title">
                  <input
                    value={form.title}
                    onChange={(e) => updateForm("title", e.target.value)}
                    className={inputClass()}
                    placeholder="Weekly executive report"
                  />
                </Field>

                <Field label="Cadence">
                  <select
                    value={form.cadence}
                    onChange={(e) => updateForm("cadence", e.target.value)}
                    className={selectClass()}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="bi_weekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="bi_annual">Bi-annual</option>
                    <option value="annual">Annual</option>
                    <option value="custom">Custom</option>
                  </select>
                </Field>
              </div>

              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) => updateForm("description", e.target.value)}
                  className={textareaClass()}
                  placeholder="What this report is supposed to summarize."
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Department scope">
                  <select
                    value={form.department_id}
                    onChange={(e) => updateForm("department_id", e.target.value)}
                    className={selectClass()}
                  >
                    <option value="">All departments</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Recipients">
                  <input
                    value={form.recipients}
                    onChange={(e) => updateForm("recipients", e.target.value)}
                    className={inputClass()}
                    placeholder="ceo@company.com, ops@company.com"
                  />
                </Field>
              </div>

              {form.cadence === "custom" ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Custom label">
                    <input
                      value={form.custom_label}
                      onChange={(e) => updateForm("custom_label", e.target.value)}
                      className={inputClass()}
                      placeholder="Board review"
                    />
                  </Field>

                  <Field label="From date">
                    <input
                      type="date"
                      value={form.custom_date_from}
                      onChange={(e) => updateForm("custom_date_from", e.target.value)}
                      className={inputClass()}
                    />
                  </Field>

                  <Field label="To date">
                    <input
                      type="date"
                      value={form.custom_date_to}
                      onChange={(e) => updateForm("custom_date_to", e.target.value)}
                      className={inputClass()}
                    />
                  </Field>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <Toggle label="Company summary" checked={form.include_company_summary} onChange={(value) => updateForm("include_company_summary", value)} />
                <Toggle label="Department breakdown" checked={form.include_department_breakdown} onChange={(value) => updateForm("include_department_breakdown", value)} />
                <Toggle label="Objectives" checked={form.include_objectives} onChange={(value) => updateForm("include_objectives", value)} />
                <Toggle label="OKRs" checked={form.include_okrs} onChange={(value) => updateForm("include_okrs", value)} />
                <Toggle label="KPIs" checked={form.include_kpis} onChange={(value) => updateForm("include_kpis", value)} />
                <Toggle label="Tasks" checked={form.include_tasks} onChange={(value) => updateForm("include_tasks", value)} />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Toggle label="Auto-generate immediately" checked={form.auto_generate} onChange={(value) => updateForm("auto_generate", value)} />
                <Toggle label="Email report after generation" checked={form.auto_email} onChange={(value) => updateForm("auto_email", value)} />
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Saved reports"
          subtitle="Definitions with default or custom generation windows"
          className="bg-[var(--background-panel)]"
        >
          {loading ? (
            <div className="grid gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-44 animate-pulse rounded-[24px] border border-[var(--border)] bg-[var(--card)]"
                />
              ))}
            </div>
          ) : definitions.length === 0 ? (
            <EmptyState
              title="No reports yet"
              description="Create a report definition to start generating, exporting, and emailing reports."
            />
          ) : (
            <div className="grid gap-4">
              {definitions.map((definition) => {
                const latestRun = runsByDefinition.get(definition.id)?.[0] ?? null;
                return (
                  <div
                    key={definition.id}
                    className="rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-5 alamin-shadow"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-lg font-bold text-[var(--foreground)]">{definition.title}</div>
                          <StatusBadge tone="info">{cadenceLabel(definition.cadence)}</StatusBadge>
                          {definition.auto_email ? <StatusBadge tone="success">Auto email</StatusBadge> : null}
                          {definition.auto_generate ? <StatusBadge>Auto generate</StatusBadge> : null}
                          {definition.department_id ? <StatusBadge tone="warning">Scoped</StatusBadge> : null}
                        </div>

                        {definition.description ? (
                          <div className="mt-2 text-sm leading-6 text-[var(--foreground-muted)]">
                            {definition.description}
                          </div>
                        ) : null}

                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--foreground-faint)]">
                          <span>Recipients: {(definition.recipients ?? []).join(", ") || "—"}</span>
                          <span>•</span>
                          <span>Last generated: {fmtDate(definition.last_generated_at)}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void generateNow(definition.id)}
                          disabled={runningId === definition.id}
                          className={secondaryButtonClass()}
                        >
                          {runningId === definition.id ? "Running..." : "Generate now"}
                        </button>

                        <button
                          type="button"
                          onClick={() => void exportReport(definition.id, "json")}
                          disabled={runningId === definition.id}
                          className={secondaryButtonClass()}
                        >
                          Export JSON
                        </button>

                        <button
                          type="button"
                          onClick={() => void exportReport(definition.id, "csv")}
                          disabled={runningId === definition.id}
                          className={secondaryButtonClass()}
                        >
                          Export CSV
                        </button>

                        {canManage ? (
                          <button
                            type="button"
                            onClick={() => void deactivateReport(definition.id)}
                            disabled={runningId === definition.id}
                            className="inline-flex h-11 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 px-5 text-sm font-semibold text-red-700 transition hover:bg-red-500/15 disabled:opacity-60 dark:text-red-100"
                          >
                            Deactivate
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {latestRun ? (
                      <div className="mt-4 rounded-[18px] border border-[var(--border)] bg-[var(--card-subtle)] p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={toneForStatus(latestRun.status)}>{latestRun.status}</StatusBadge>
                          <StatusBadge tone={toneForStatus(latestRun.email_status)}>{latestRun.email_status}</StatusBadge>
                        </div>

                        <div className="mt-3 text-sm text-[var(--foreground-soft)]">{latestRun.period_label}</div>
                        <div className="mt-2 text-xs text-[var(--foreground-faint)]">
                          Generated {fmtDate(latestRun.generated_at)}
                        </div>

                        {latestRun.email_error ? (
                          <div className="mt-2 text-xs text-red-700 dark:text-red-200">
                            Email error: {latestRun.email_error}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title="Recent runs"
          subtitle="Generated outputs, export history, and email delivery state"
          className="bg-[var(--background-panel)]"
        >
          {loading ? (
            <div className="grid gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-[20px] border border-[var(--border)] bg-[var(--card)]"
                />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <EmptyState
              title="No runs generated yet"
              description="As soon as a report generates, the latest output will appear here."
            />
          ) : (
            <div className="grid gap-3">
              {runs.map((run) => {
                const definition = definitions.find((row) => row.id === run.report_definition_id);
                return (
                  <div
                    key={run.id}
                    className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="font-semibold text-[var(--foreground)]">
                          {definition?.title ?? run.report_definition_id}
                        </div>
                        <div className="mt-1 text-sm text-[var(--foreground-muted)]">
                          {run.period_label}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <StatusBadge tone={toneForStatus(run.status)}>{run.status}</StatusBadge>
                          <StatusBadge tone={toneForStatus(run.email_status)}>{run.email_status}</StatusBadge>
                          {(run.exported_formats ?? []).map((format) => (
                            <StatusBadge key={format}>{format}</StatusBadge>
                          ))}
                        </div>
                      </div>

                      <div className="text-sm text-[var(--foreground-faint)]">
                        {fmtDate(run.generated_at)}
                      </div>
                    </div>

                    {(run.emailed_to ?? []).length ? (
                      <div className="mt-3 text-sm text-[var(--foreground-muted)]">
                        Sent to: {(run.emailed_to ?? []).join(", ")}
                      </div>
                    ) : null}

                    {run.email_error ? (
                      <div className="mt-2 text-sm text-red-700 dark:text-red-200">
                        Email error: {run.email_error}
                      </div>
                    ) : null}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-[var(--foreground-soft)]">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between rounded-[18px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
    >
      <span className="text-sm font-medium text-[var(--foreground)]">{label}</span>
      <span
        className={
          checked
            ? "rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-200"
            : "rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--foreground-soft)]"
        }
      >
        {checked ? "On" : "Off"}
      </span>
    </button>
  );
}