"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import SectionCard from "@/components/ui/SectionCard";
<div className="text-red-500 text-3xl font-bold">NEW ONBOARDING VERSION</div>

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
  personal?: {
    firstName: string;
    lastName: string;
    email: string;
  };
  company?: {
    registrationNumber: string;
    industry: string;
    country: string;
    employeeCount: number | null;
  };
  aiSetup?: {
    mainStrategy: string;
    departmentHeads: Array<{
      departmentName: string;
      headName: string;
      headEmail: string;
    }>;
  };
};

type ApiOk = { ok: true };
type ApiErr = { ok?: false; error?: string };
type ApiResponse = ApiOk | ApiErr;

type DraftDepartment = {
  name: string;
  headName: string;
  headEmail: string;
};

type OnboardingDraft = {
  personal: {
    firstName: string;
    lastName: string;
    email: string;
  };
  company: {
    companyName: string;
    registrationNumber: string;
    industry: string;
    country: string;
    employeeCount: string;
  };
  aiSetup: {
    mainStrategy: string;
    departments: DraftDepartment[];
  };
};

type KPIFormRow = {
  title: string;
  departmentName: string;
  unit: string;
  target: string;
  current: string;
};

const INDUSTRIES = [
  "Banking & Financial Services",
  "Insurance",
  "FinTech",
  "Government",
  "Telecommunications",
  "Technology",
  "Healthcare",
  "Pharmaceuticals",
  "Manufacturing",
  "Retail & E-commerce",
  "Logistics & Supply Chain",
  "Construction & Real Estate",
  "Energy & Utilities",
  "Oil & Gas",
  "Education",
  "Hospitality & Tourism",
  "Transportation",
  "Media & Entertainment",
  "Professional Services",
  "Human Resources",
  "Agriculture",
  "Food & Beverage",
  "Nonprofit",
  "Other",
];

const COUNTRIES = [
  "Saudi Arabia",
  "United Arab Emirates",
  "Qatar",
  "Kuwait",
  "Bahrain",
  "Oman",
  "Egypt",
  "Jordan",
  "Sudan",
  "United Kingdom",
  "United States",
  "India",
  "Brazil",
  "Other",
];

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

function normalizeDepartmentName(value: string) {
  return value.trim().toLowerCase();
}

function getQuarterLabel(q: number, year: number) {
  return `Q${q} ${year}`;
}

function readDraft(): OnboardingDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("alamin_onboarding_draft");
    if (!raw) return null;
    return JSON.parse(raw) as OnboardingDraft;
  } catch {
    return null;
  }
}

function saveDraft(draft: OnboardingDraft) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("alamin_onboarding_draft", JSON.stringify(draft));
  } catch {
    // ignore
  }
}

function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("alamin_onboarding_draft");
  } catch {
    // ignore
  }
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

  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [orgEmail, setOrgEmail] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [industry, setIndustry] = useState("Technology");
  const [country, setCountry] = useState("Saudi Arabia");
  const [employeeCount, setEmployeeCount] = useState("");

  const [year, setYear] = useState<number>(now.getFullYear());
  const [quarter, setQuarter] = useState<number>(defaultQuarter);

  const [mainStrategy, setMainStrategy] = useState("");
  const [departments, setDepartments] = useState<DraftDepartment[]>([
    { name: "Operations", headName: "", headEmail: "" },
    { name: "Sales", headName: "", headEmail: "" },
    { name: "Delivery", headName: "", headEmail: "" },
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

  const departmentOptions = useMemo(() => Array.from(new Set(cleanDepartments)), [cleanDepartments]);

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
              if (!Number.isFinite(target) || target <= 0) return sum;
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

  const canContinueStep1 = useMemo(() => {
    return (
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      orgEmail.trim().length > 0
    );
  }, [firstName, lastName, orgEmail]);

  const canContinueStep2 = useMemo(() => {
    if (!companyName.trim()) return false;
    if (!industry.trim()) return false;
    if (!country.trim()) return false;
    if (!employeeCount.trim()) return false;
    if (country === "Saudi Arabia" && !registrationNumber.trim()) return false;
    return true;
  }, [companyName, industry, country, employeeCount, registrationNumber]);

  const canSubmit = useMemo(() => {
    if (!orgSlug) return false;
    if (!canContinueStep1) return false;
    if (!canContinueStep2) return false;
    if (!mainStrategy.trim()) return false;
    if (!departmentOptions.length) return false;
    if (invalidKpis.length > 0) return false;
    return true;
  }, [orgSlug, canContinueStep1, canContinueStep2, mainStrategy, departmentOptions.length, invalidKpis.length]);

  const persistDraft = useCallback(() => {
    const draft: OnboardingDraft = {
      personal: {
        firstName,
        lastName,
        email: orgEmail,
      },
      company: {
        companyName,
        registrationNumber,
        industry,
        country,
        employeeCount,
      },
      aiSetup: {
        mainStrategy,
        departments,
      },
    };
    saveDraft(draft);
  }, [
    firstName,
    lastName,
    orgEmail,
    companyName,
    registrationNumber,
    industry,
    country,
    employeeCount,
    mainStrategy,
    departments,
  ]);

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

        const draft = readDraft();
        if (draft) {
          setFirstName(draft.personal.firstName ?? "");
          setLastName(draft.personal.lastName ?? "");
          setOrgEmail(draft.personal.email ?? "");

          setCompanyName(draft.company.companyName ?? "");
          setRegistrationNumber(draft.company.registrationNumber ?? "");
          setIndustry(draft.company.industry || "Technology");
          setCountry(draft.company.country || "Saudi Arabia");
          setEmployeeCount(draft.company.employeeCount ?? "");

          setMainStrategy(draft.aiSetup.mainStrategy ?? "");

          if (Array.isArray(draft.aiSetup.departments) && draft.aiSetup.departments.length > 0) {
            setDepartments(
              draft.aiSetup.departments.map((item) => ({
                name: item.name ?? "",
                headName: item.headName ?? "",
                headEmail: item.headEmail ?? "",
              }))
            );
          }
        } else if (session.user?.email) {
          setOrgEmail(session.user.email);
        }
      } catch (e: unknown) {
        setMsg(getErrorMessage(e, "Failed to load onboarding"));
      } finally {
        setLoading(false);
      }
    }

    void boot();
  }, [ensureAuth, orgSlug]);

  useEffect(() => {
    if (!loading) {
      persistDraft();
    }
  }, [persistDraft, loading]);

  function addDepartment() {
    setDepartments((prev) => [...prev, { name: "", headName: "", headEmail: "" }]);
  }

  function removeDepartment(index: number) {
    setDepartments((prev) => prev.filter((_, i) => i !== index));
  }

  function updateDepartment(index: number, patch: Partial<DraftDepartment>) {
    setDepartments((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
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
        personal: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: orgEmail.trim().toLowerCase(),
        },
        company: {
          registrationNumber: registrationNumber.trim(),
          industry: industry.trim(),
          country: country.trim(),
          employeeCount: employeeCount.trim() ? Number(employeeCount) : null,
        },
        aiSetup: {
          mainStrategy: mainStrategy.trim(),
          departmentHeads: departments
            .map((d) => ({
              departmentName: d.name.trim(),
              headName: d.headName.trim(),
              headEmail: d.headEmail.trim().toLowerCase(),
            }))
            .filter((d) => d.departmentName),
        },
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

      clearDraft();
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
            {saving ? "Saving..." : "Complete onboarding"}
          </button>
        </div>
      }
    >
      <AppPageHeader
        eyebrow="Workspace setup"
        title="Onboarding"
        description="Set up the company, define strategy, assign departments and heads, and seed the KPI foundation that powers the rest of the product."
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

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <SummaryStat label="Step 1" value="Personal" hint="Who is setting up the workspace" active={step === 1} />
        <SummaryStat label="Step 2" value="Company" hint="Business context and org identity" active={step === 2} />
        <SummaryStat label="Step 3" value="AI Setup" hint="Strategy, departments, and ownership" active={step === 3} />
        <SummaryStat label="Cycle" value={getQuarterLabel(quarter, year)} hint="Initial reporting period" active={false} />
      </div>

      {step === 1 ? (
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <SectionCard
            title="A. Personal Info"
            subtitle="Start with the person responsible for setting up the workspace"
            className="bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))]"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="First name">
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                  placeholder="First name"
                />
              </Field>

              <Field label="Last name">
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                  placeholder="Last name"
                />
              </Field>

              <div className="md:col-span-2">
                <Field label="Email address" hint="Organization email only">
                  <input
                    value={orgEmail}
                    onChange={(e) => setOrgEmail(e.target.value)}
                    className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                    placeholder="name@company.com"
                    type="email"
                  />
                </Field>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!canContinueStep1}
                className="inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-[#07090D] transition hover:bg-white/92 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Continue to company info
              </button>
            </div>
          </SectionCard>

          <SectionCard
            title="Why this matters"
            subtitle="Get the workspace owner and initial context right"
            className="bg-[linear-gradient(180deg,rgba(124,58,237,0.12),rgba(255,255,255,0.03))]"
          >
            <div className="grid gap-3">
              <MiniStep
                step="1"
                title="Establish ownership"
                desc="The onboarding owner is the first accountable person in the workspace."
              />
              <MiniStep
                step="2"
                title="Use organization email"
                desc="This reduces junk signups and keeps the workspace tied to a real business domain."
              />
              <MiniStep
                step="3"
                title="Set up for team onboarding"
                desc="This becomes the starting point for departments, heads, and future invitations."
              />
            </div>
          </SectionCard>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <SectionCard
            title="B. Company Info"
            subtitle="Define the company identity and business context"
            className="bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))]"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Company name">
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                  placeholder="Company name"
                />
              </Field>

              <Field
                label="Company registration number"
                hint={country === "Saudi Arabia" ? "Saudi companies only" : "Optional outside Saudi Arabia"}
              >
                <input
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                  placeholder="CR Number"
                />
              </Field>

              <Field label="Industry">
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition focus:border-white/20"
                >
                  {INDUSTRIES.map((item) => (
                    <option key={item} value={item} className="bg-[#0D1118] text-white">
                      {item}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Country">
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition focus:border-white/20"
                >
                  {COUNTRIES.map((item) => (
                    <option key={item} value={item} className="bg-[#0D1118] text-white">
                      {item}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Number of employees">
                <input
                  value={employeeCount}
                  onChange={(e) => setEmployeeCount(e.target.value)}
                  className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                  placeholder="e.g. 500"
                  type="number"
                  inputMode="numeric"
                />
              </Field>

              <Field label="Year / Quarter" hint="Initial performance cycle">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={String(year)}
                    onChange={(e) => setYear(toNumber(e.target.value, year))}
                    className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                    inputMode="numeric"
                    placeholder="2026"
                  />
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
                </div>
              </Field>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex h-11 items-center justify-center rounded-full border border-white/12 bg-white/5 px-5 text-sm font-medium text-white/90 transition hover:border-white/20 hover:bg-white/8"
              >
                Back
              </button>

              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!canContinueStep2}
                className="inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-[#07090D] transition hover:bg-white/92 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Continue to AI setup
              </button>
            </div>
          </SectionCard>

          <SectionCard
            title="Company summary"
            subtitle="How the workspace will be initialized"
            className="bg-[linear-gradient(180deg,rgba(124,58,237,0.12),rgba(255,255,255,0.03))]"
          >
            <div className="grid gap-3">
              <SummaryRow label="Company" value={companyName || "Not set"} />
              <SummaryRow label="Country" value={country || "Not set"} />
              <SummaryRow label="Industry" value={industry || "Not set"} />
              <SummaryRow label="Employees" value={employeeCount || "Not set"} />
              <SummaryRow label="Cycle" value={getQuarterLabel(quarter, year)} />
            </div>
          </SectionCard>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="grid gap-6">
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <SectionCard
              title="C. Setup your AI"
              subtitle="Give the product the right strategic and organizational foundation"
              className="bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))]"
            >
              <Field label="Main Company Strategy" hint="This becomes the starting context for AI generation">
                <textarea
                  value={mainStrategy}
                  onChange={(e) => setMainStrategy(e.target.value)}
                  className="min-h-[180px] rounded-[22px] border border-white/10 bg-black/20 px-4 py-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                  placeholder="Example: Grow enterprise revenue by improving sales efficiency, onboarding conversion, and cross-department execution discipline across the next two quarters."
                />
              </Field>
            </SectionCard>

            <SectionCard
              title="Setup summary"
              subtitle="What this onboarding will create"
              className="bg-[linear-gradient(180deg,rgba(124,58,237,0.12),rgba(255,255,255,0.03))]"
            >
              <div className="grid gap-3">
                <SummaryRow label="Owner" value={`${firstName} ${lastName}`.trim() || "Not set"} />
                <SummaryRow label="Organization email" value={orgEmail || "Not set"} />
                <SummaryRow label="Company" value={companyName || "Not set"} />
                <SummaryRow label="Departments" value={String(departmentOptions.length)} />
                <SummaryRow label="KPIs" value={String(kpis.length)} />
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-white/12 bg-white/5 px-5 text-sm font-medium text-white/90 transition hover:border-white/20 hover:bg-white/8"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={!canSubmit || saving || loading}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-[#07090D] transition hover:bg-white/92 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Complete onboarding"}
                </button>
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Departments and Head of Departments"
            subtitle="Define the first organizational structure and accountable owners"
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
            <div className="grid gap-4">
              {departments.map((department, index) => (
                <div
                  key={`department-${index}`}
                  className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                        Department {index + 1}
                      </div>
                      <div className="mt-1 text-sm text-white/55">
                        Department name and accountable head
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeDepartment(index)}
                      disabled={departments.length <= 1}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-red-400/20 bg-red-400/8 px-4 text-sm font-semibold text-red-100 transition hover:bg-red-400/12 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="Department">
                      <input
                        value={department.name}
                        onChange={(e) => updateDepartment(index, { name: e.target.value })}
                        className="h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                        placeholder="Sales"
                      />
                    </Field>

                    <Field label="Head of Department">
                      <input
                        value={department.headName}
                        onChange={(e) => updateDepartment(index, { headName: e.target.value })}
                        className="h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                        placeholder="Head name"
                      />
                    </Field>

                    <Field label="Head email">
                      <input
                        value={department.headEmail}
                        onChange={(e) => updateDepartment(index, { headEmail: e.target.value })}
                        className="h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                        placeholder="head@company.com"
                        type="email"
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Initial KPI Layer"
            subtitle="Seed the KPI layer that the rest of the product will build on"
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
                          Define one measurable business signal
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
                            {departmentOptions.map((departmentName) => (
                              <option key={departmentName} value={departmentName} className="bg-[#0D1118] text-white">
                                {departmentName}
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

            <div className="mt-5 rounded-[18px] border border-white/8 bg-black/20 px-4 py-3 text-sm text-white/50">
              KPI department names must match one of the departments above.
            </div>
          </SectionCard>
        </div>
      ) : null}
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
  active,
}: {
  label: string;
  value: string;
  hint: string;
  active: boolean;
}) {
  return (
    <div
      className={[
        "rounded-[24px] border p-5 shadow-[0_16px_36px_rgba(0,0,0,0.22)]",
        active
          ? "border-[#A78BFA]/35 bg-[linear-gradient(180deg,rgba(124,58,237,0.2),rgba(255,255,255,0.06))]"
          : "border-white/10 bg-white/[0.04]",
      ].join(" ")}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</div>
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