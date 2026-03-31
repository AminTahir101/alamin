"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import SectionCard from "@/components/ui/SectionCard";

type OnboardingBody = {
  companyName: string;
  orgSlug: string;
  year: number;
  quarter: number;
  departments: Array<{ name: string }>;
  kpis: Array<{
    title: string;
    departmentName: string;
    unit: string;
    target: number;
    current: number;
  }>;
};

type ApiOk = { ok: true };
type ApiErr = { ok?: false; error?: string };
type ApiResponse = ApiOk | ApiErr;

type DepartmentRow = { name: string };
type KPIFormRow = {
  title: string;
  departmentName: string;
  unit: string;
  target: string;
  current: string;
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

function toNumber(x: string, fallback: number) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function slugFromPathname(pathname: string | null): string {
  const p = String(pathname ?? "").trim();
  const parts = p.split("/").filter(Boolean);
  const oIdx = parts.indexOf("o");
  if (oIdx === -1) return "";
  return String(parts[oIdx + 1] ?? "").trim();
}

function getQuarterLabel(q: number) {
  return `Q${q} ${new Date().getFullYear()}`;
}

function normalizeDepartmentName(value: string) {
  return value.trim().toLowerCase();
}

export default function OnboardingPage() {
  const params = useParams<{ slug?: string }>();
  const pathname = usePathname();
  const router = useRouter();

  const derivedSlug = slugFromPathname(pathname);
  const orgSlug = String(params?.slug ?? derivedSlug ?? "").trim();

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const now = new Date();
  const defaultQuarter = Math.max(1, Math.min(4, Math.floor(now.getMonth() / 3) + 1));

  const [companyName, setCompanyName] = useState("Jahzeen");
  const [year, setYear] = useState<number>(now.getFullYear());
  const [quarter, setQuarter] = useState<number>(defaultQuarter);

  const [departments, setDepartments] = useState<DepartmentRow[]>([
    { name: "Operations" },
    { name: "Sales" },
    { name: "Delivery" },
  ]);

  const [kpis, setKpis] = useState<KPIFormRow[]>([
    {
      title: "Bookings per week",
      departmentName: "Sales",
      unit: "count",
      target: "40",
      current: "10",
    },
    {
      title: "On-time delivery rate",
      departmentName: "Delivery",
      unit: "%",
      target: "95",
      current: "82",
    },
    {
      title: "Customer NPS",
      departmentName: "Operations",
      unit: "score",
      target: "60",
      current: "40",
    },
  ]);

  const cleanDepartments = useMemo(
    () => departments.map((d) => d.name.trim()).filter(Boolean),
    [departments]
  );

  const departmentOptions = useMemo(() => {
    return Array.from(new Set(cleanDepartments));
  }, [cleanDepartments]);

  const deptSet = useMemo(() => {
    return new Set(cleanDepartments.map(normalizeDepartmentName));
  }, [cleanDepartments]);

  const invalidKpis = useMemo(() => {
    return kpis
      .map((kpi, index) => {
        const issues: string[] = [];

        if (!kpi.title.trim()) issues.push("Missing title");
        if (!kpi.departmentName.trim()) issues.push("Missing department");
        if (!kpi.unit.trim()) issues.push("Missing unit");
        if (!Number.isFinite(Number(kpi.target))) issues.push("Invalid target");
        if (!Number.isFinite(Number(kpi.current))) issues.push("Invalid current");

        if (
          kpi.departmentName.trim() &&
          !deptSet.has(normalizeDepartmentName(kpi.departmentName))
        ) {
          issues.push("Department not found");
        }

        return issues.length ? { index, issues } : null;
      })
      .filter(Boolean) as Array<{ index: number; issues: string[] }>;
  }, [deptSet, kpis]);

  const stats = useMemo(() => {
    const totalKpis = kpis.length;
    const totalDepartments = departmentOptions.length;
    const avgCompletion =
      totalKpis > 0
        ? Math.round(
            kpis.reduce((sum, kpi) => {
              const target = Number(kpi.target);
              const current = Number(kpi.current);

              if (!Number.isFinite(target) || target === 0) return sum;
              if (!Number.isFinite(current)) return sum;

              return sum + Math.max(0, Math.min(100, (current / target) * 100));
            }, 0) / totalKpis
          )
        : 0;

    return {
      totalDepartments,
      totalKpis,
      avgCompletion,
    };
  }, [departmentOptions.length, kpis]);

  const canSubmit = useMemo(() => {
    if (!orgSlug) return false;
    if (!companyName.trim()) return false;
    if (!(year >= 2000 && year <= 2100)) return false;
    if (!(quarter >= 1 && quarter <= 4)) return false;
    if (!departmentOptions.length || !kpis.length) return false;
    if (invalidKpis.length > 0) return false;
    return true;
  }, [companyName, departmentOptions.length, invalidKpis.length, kpis.length, orgSlug, quarter, year]);

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

  useEffect(() => {
    async function boot() {
      setMsg(null);
      setOkMsg(null);

      try {
        setLoading(true);

        if (!orgSlug) {
          setMsg("slug is required");
          return;
        }

        const session = await ensureAuth();
        if (!session) return;
      } catch (e: unknown) {
        setMsg(getErrorMessage(e, "Failed to load onboarding"));
      } finally {
        setLoading(false);
      }
    }

    void boot();
  }, [ensureAuth, orgSlug]);

  function addDepartment() {
    setDepartments((prev) => [...prev, { name: "" }]);
  }

  function removeDepartment(index: number) {
    setDepartments((prev) => prev.filter((_, i) => i !== index));
  }

  function updateDepartment(index: number, value: string) {
    setDepartments((prev) => prev.map((item, i) => (i === index ? { ...item, name: value } : item)));
  }

  function addKpi() {
    setKpis((prev) => [
      ...prev,
      {
        title: "",
        departmentName: departmentOptions[0] ?? "",
        unit: "count",
        target: "0",
        current: "0",
      },
    ]);
  }

  function removeKpi(index: number) {
    setKpis((prev) => prev.filter((_, i) => i !== index));
  }

  function updateKpi(index: number, patch: Partial<KPIFormRow>) {
    setKpis((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function submit() {
    setMsg(null);
    setOkMsg(null);
    setSaving(true);

    try {
      const session = await ensureAuth();
      if (!session) return;

      const body: OnboardingBody = {
        companyName: companyName.trim(),
        orgSlug,
        year,
        quarter,
        departments: departments
          .map((d) => ({ name: d.name.trim() }))
          .filter((d) => d.name),
        kpis: kpis.map((k) => ({
          title: k.title.trim(),
          departmentName: k.departmentName.trim(),
          unit: k.unit.trim(),
          target: Number(k.target),
          current: Number(k.current),
        })),
      };

      const apiUrl = new URL(
        `/api/o/${encodeURIComponent(orgSlug)}/onboarding`,
        window.location.origin
      ).toString();

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });

      const raw = await res.text();
      const parsed = (await safeParseJson(raw)) as ApiResponse | null;

      if (!res.ok || !parsed || parsed.ok !== true) {
        throw new Error((parsed as ApiErr | null)?.error || raw || `Failed (HTTP ${res.status})`);
      }

      setOkMsg("Onboarding saved. Redirecting to dashboard...");
      setTimeout(() => {
        router.push(`/o/${encodeURIComponent(orgSlug)}/dashboard`);
      }, 350);
    } catch (e: unknown) {
      setMsg(getErrorMessage(e, "Failed to submit onboarding"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      slug={orgSlug}
      sessionEmail={sessionEmail}
      topActions={
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/o/${encodeURIComponent(orgSlug)}/dashboard`)}
            className="inline-flex h-11 items-center justify-center rounded-full border border-white/12 bg-white/5 px-5 text-sm font-medium text-white/90 transition hover:border-white/20 hover:bg-white/8"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit || saving || loading}
            className="inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-[#07090D] transition hover:bg-white/92 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save workspace"}
          </button>
        </div>
      }
    >
      <AppPageHeader
        eyebrow="Workspace setup"
        title="Onboarding"
        description="Set the first cycle, define your initial departments, and seed the KPI layer that powers the rest of the product. This should feel like setup, not admin pain."
      />

      {(msg || okMsg) && (
        <div className="mb-6 grid gap-4">
          {msg ? (
            <div className="rounded-[22px] border border-red-400/20 bg-red-400/8 px-5 py-4 text-sm text-red-100">
              {msg}
            </div>
          ) : null}

          {okMsg ? (
            <div className="rounded-[22px] border border-emerald-400/20 bg-emerald-400/8 px-5 py-4 text-sm text-emerald-100">
              {okMsg}
            </div>
          ) : null}
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <SummaryStat
          label="Departments"
          value={String(stats.totalDepartments)}
          hint="Initial org structure"
        />
        <SummaryStat
          label="KPIs"
          value={String(stats.totalKpis)}
          hint="Seed metrics for this cycle"
        />
        <SummaryStat
          label="Average progress"
          value={`${stats.avgCompletion}%`}
          hint="Based on current vs target"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <SectionCard
          title="Cycle setup"
          subtitle="Foundational company and period settings"
          className="bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))]"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Company name" hint="This appears across the workspace">
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                placeholder="Company name"
              />
            </Field>

            <Field label="Workspace slug" hint="Fixed from the route">
              <input
                value={orgSlug}
                readOnly
                className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white/60 outline-none"
              />
            </Field>

            <Field label="Year" hint="Execution period year">
              <input
                value={String(year)}
                onChange={(e) => setYear(toNumber(e.target.value, year))}
                className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                inputMode="numeric"
                placeholder="2026"
              />
            </Field>

            <Field label="Quarter" hint="Current planning cycle">
              <select
                value={String(quarter)}
                onChange={(e) => setQuarter(toNumber(e.target.value, quarter))}
                className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition focus:border-white/20"
              >
                <option value="1">Q1</option>
                <option value="2">Q2</option>
                <option value="3">Q3</option>
                <option value="4">Q4</option>
              </select>
            </Field>
          </div>

          <div className="mt-5 rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              Cycle preview
            </div>
            <div className="mt-2 text-lg font-semibold text-white">{companyName || "Company"} · {getQuarterLabel(quarter)}</div>
            <div className="mt-1 text-sm text-white/55">
              This cycle will be used as the starting layer for KPI capture and downstream OKR generation.
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Departments"
          subtitle="Create the initial org structure"
          actions={
            <button
              type="button"
              onClick={addDepartment}
              className="inline-flex h-10 items-center justify-center rounded-full border border-white/12 bg-white/5 px-4 text-sm font-semibold text-white/85 transition hover:border-white/20 hover:bg-white/8"
            >
              Add department
            </button>
          }
          className="bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))]"
        >
          <div className="grid gap-3">
            {departments.map((department, index) => (
              <div
                key={`department-${index}`}
                className="grid gap-3 rounded-[20px] border border-white/10 bg-white/[0.03] p-3 md:grid-cols-[1fr_auto]"
              >
                <input
                  value={department.name}
                  onChange={(e) => updateDepartment(index, e.target.value)}
                  className="h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                  placeholder="Department name"
                />
                <button
                  type="button"
                  onClick={() => removeDepartment(index)}
                  disabled={departments.length <= 1}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-red-400/20 bg-red-400/8 px-4 text-sm font-semibold text-red-100 transition hover:bg-red-400/12 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-[18px] border border-white/8 bg-black/20 px-4 py-3 text-sm text-white/50">
            KPI department names must match one of the departments above.
          </div>
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <SectionCard
          title="Initial KPIs"
          subtitle="Seed the first KPI set for this cycle"
          actions={
            <button
              type="button"
              onClick={addKpi}
              className="inline-flex h-10 items-center justify-center rounded-full border border-white/12 bg-white/5 px-4 text-sm font-semibold text-white/85 transition hover:border-white/20 hover:bg-white/8"
            >
              Add KPI
            </button>
          }
          className="bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))]"
        >
          <div className="grid gap-4">
            {kpis.map((kpi, index) => {
              const issues = invalidKpis.find((item) => item.index === index)?.issues ?? [];

              return (
                <div
                  key={`kpi-${index}`}
                  className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                        KPI {index + 1}
                      </div>
                      <div className="mt-1 text-sm text-white/55">
                        Define one measurable signal to seed the workspace.
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeKpi(index)}
                      disabled={kpis.length <= 1}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-red-400/20 bg-red-400/8 px-4 text-sm font-semibold text-red-100 transition hover:bg-red-400/12 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Title">
                      <input
                        value={kpi.title}
                        onChange={(e) => updateKpi(index, { title: e.target.value })}
                        className="h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                        placeholder="Bookings per week"
                      />
                    </Field>

                    <Field label="Department">
                      {departmentOptions.length > 0 ? (
                        <select
                          value={kpi.departmentName}
                          onChange={(e) => updateKpi(index, { departmentName: e.target.value })}
                          className="h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition focus:border-white/20"
                        >
                          <option value="">Select department</option>
                          {departmentOptions.map((department) => (
                            <option key={department} value={department}>
                              {department}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={kpi.departmentName}
                          onChange={(e) => updateKpi(index, { departmentName: e.target.value })}
                          className="h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                          placeholder="Department name"
                        />
                      )}
                    </Field>

                    <Field label="Unit">
                      <input
                        value={kpi.unit}
                        onChange={(e) => updateKpi(index, { unit: e.target.value })}
                        className="h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                        placeholder="count, %, SAR, score"
                      />
                    </Field>

                    <Field label="Target">
                      <input
                        value={kpi.target}
                        onChange={(e) => updateKpi(index, { target: e.target.value })}
                        className="h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                        inputMode="decimal"
                        placeholder="100"
                      />
                    </Field>

                    <Field label="Current">
                      <input
                        value={kpi.current}
                        onChange={(e) => updateKpi(index, { current: e.target.value })}
                        className="h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                        inputMode="decimal"
                        placeholder="0"
                      />
                    </Field>

                    <div className="rounded-[18px] border border-white/8 bg-black/20 px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                        Progress preview
                      </div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {getCompletionLabel(kpi.current, kpi.target)}
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#7C3AED_0%,#22D3EE_100%)]"
                          style={{ width: `${getCompletionPercent(kpi.current, kpi.target)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {issues.length > 0 ? (
                    <div className="mt-4 rounded-[18px] border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                      {issues.join(" · ")}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard
          title="Setup summary"
          subtitle="What this onboarding will create"
          className="bg-[linear-gradient(180deg,rgba(124,58,237,0.12),rgba(255,255,255,0.03))]"
        >
          <div className="grid gap-4">
            <SummaryRow
              label="Workspace"
              value={companyName.trim() || "Not set"}
            />
            <SummaryRow
              label="Cycle"
              value={`${year} · Q${quarter}`}
            />
            <SummaryRow
              label="Departments"
              value={departmentOptions.length ? departmentOptions.join(", ") : "None yet"}
            />
            <SummaryRow
              label="KPI count"
              value={String(kpis.length)}
            />
          </div>

          <div className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              What happens next
            </div>
            <div className="mt-3 grid gap-3">
              <MiniStep
                step="1"
                title="Seed the company and cycle"
                desc="Create the starting period that the rest of the product depends on."
              />
              <MiniStep
                step="2"
                title="Create the department structure"
                desc="Define the initial ownership model across the company."
              />
              <MiniStep
                step="3"
                title="Register KPIs"
                desc="Add the first measurable signals so strategy and AI layers have real input."
              />
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit || saving || loading}
              className="inline-flex h-12 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-[#07090D] transition hover:bg-white/92 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save onboarding"}
            </button>

            <button
              type="button"
              onClick={() => router.push(`/o/${encodeURIComponent(orgSlug)}/dashboard`)}
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/12 bg-white/5 px-5 text-sm font-medium text-white/90 transition hover:border-white/20 hover:bg-white/8"
            >
              Skip for now
            </button>
          </div>

          {!canSubmit ? (
            <div className="mt-4 rounded-[18px] border border-white/8 bg-black/20 px-4 py-3 text-sm text-white/50">
              Fill the required fields and make sure all KPI department names match the department list.
            </div>
          ) : null}
        </SectionCard>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm text-white/68">
      <div className="flex items-center justify-between gap-3">
        <span>{label}</span>
        {hint ? <span className="text-xs text-white/35">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

function SummaryStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_16px_36px_rgba(0,0,0,0.22)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-2 text-sm text-white/55">{hint}</div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[18px] border border-white/8 bg-black/20 px-4 py-3">
      <div className="text-sm text-white/50">{label}</div>
      <div className="max-w-[60%] text-right text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function MiniStep({
  step,
  title,
  desc,
}: {
  step: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex gap-3 rounded-[18px] border border-white/8 bg-black/20 p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-xs font-semibold text-white">
        {step}
      </div>
      <div>
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="mt-1 text-sm leading-6 text-white/55">{desc}</div>
      </div>
    </div>
  );
}

function getCompletionPercent(current: string, target: string) {
  const currentValue = Number(current);
  const targetValue = Number(target);

  if (!Number.isFinite(currentValue) || !Number.isFinite(targetValue) || targetValue <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((currentValue / targetValue) * 100)));
}

function getCompletionLabel(current: string, target: string) {
  return `${getCompletionPercent(current, target)}% of target`;
}