"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

type Org = {
  id: string;
  slug: string;
  name: string;
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
    departments: Array<{
      name: string;
      headName: string;
      headEmail: string;
    }>;
  };
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

  if (err && typeof err === "object") {
    const maybe = err as { message?: unknown; error_description?: unknown; error?: unknown };
    if (typeof maybe.message === "string" && maybe.message.trim()) return maybe.message;
    if (typeof maybe.error_description === "string" && maybe.error_description.trim()) {
      return maybe.error_description;
    }
    if (typeof maybe.error === "string" && maybe.error.trim()) return maybe.error;
  }

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

async function waitForSession(timeoutMs = 4000): Promise<Session | null> {
  const first = await supabase.auth.getSession();
  if (first.data.session) return first.data.session;

  return await new Promise<Session | null>((resolve) => {
    let unsub: (() => void) | null = null;

    const timer = setTimeout(() => {
      if (unsub) unsub();
      resolve(null);
    }, timeoutMs);

    const { data } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session) {
          clearTimeout(timer);
          if (unsub) unsub();
          resolve(session);
        }
      }
    );

    unsub = () => data.subscription.unsubscribe();
  });
}

function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-+/g, "-");
}

function rememberOrgSlug(slug: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("last_org_slug", slug);
  } catch {
    // ignore
  }
}

function readLastOrgSlug() {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem("last_org_slug")?.trim() ?? "";
  } catch {
    return "";
  }
}

function saveOnboardingDraft(draft: OnboardingDraft) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("alamin_onboarding_draft", JSON.stringify(draft));
  } catch {
    // ignore
  }
}

function isOrganizationEmail(email: string) {
  const value = email.trim().toLowerCase();
  if (!value.includes("@")) return false;

  const blockedDomains = [
    "gmail.com",
    "googlemail.com",
    "hotmail.com",
    "outlook.com",
    "live.com",
    "yahoo.com",
    "icloud.com",
    "me.com",
    "msn.com",
    "aol.com",
    "proton.me",
    "protonmail.com",
  ];

  const domain = value.split("@")[1] ?? "";
  return domain.length > 0 && !blockedDomains.includes(domain);
}

async function fetchUserOrgs(accessToken: string): Promise<Org[]> {
  const res = await fetch("/api/auth/orgs", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const raw = await res.text();
  const parsed = (await safeParseJson(raw)) as
    | { ok?: boolean; orgs?: Org[]; error?: string }
    | null;

  if (!res.ok || !parsed || parsed.ok !== true) {
    throw new Error(parsed?.error || raw || "Failed to load organizations");
  }

  return Array.isArray(parsed.orgs) ? parsed.orgs : [];
}

function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<"night" | "daylight">("night");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stored = window.localStorage.getItem("alamin-theme");
      setTheme(stored === "daylight" ? "daylight" : "night");
      setMounted(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.classList.toggle("dark", theme === "night");
    window.localStorage.setItem("alamin-theme", theme);
  }, [theme, mounted]);

  if (!mounted) {
    return (
      <div className="alamin-theme-toggle">
        <button type="button" data-active={false}>
          Daylight
        </button>
        <button type="button" data-active={true}>
          Night
        </button>
      </div>
    );
  }

  return (
    <div className="alamin-theme-toggle">
      <button
        type="button"
        data-active={theme === "daylight"}
        onClick={() => setTheme("daylight")}
      >
        Daylight
      </button>
      <button
        type="button"
        data-active={theme === "night"}
        onClick={() => setTheme("night")}
      >
        Night
      </button>
    </div>
  );
}

export default function AuthPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "signup">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyRegistrationNumber, setCompanyRegistrationNumber] = useState("");
  const [industry, setIndustry] = useState("Technology");
  const [country, setCountry] = useState("Saudi Arabia");
  const [employeeCount, setEmployeeCount] = useState("");

  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [resolvingTenant, setResolvingTenant] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [showOrgPicker, setShowOrgPicker] = useState(false);

  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [newOrgName, setNewOrgName] = useState("");

  const envHint = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    return {
      url,
      key,
      looksLikeJwt: key.startsWith("eyJ"),
      looksLikePublishable: key.startsWith("sb_publishable_"),
    };
  }, []);

  const resolveTenantAndRoute = useCallback(
    async (session: Session) => {
      setResolvingTenant(true);
      setMsg(null);

      try {
        const availableOrgs = await fetchUserOrgs(session.access_token);
        setOrgs(availableOrgs);

        const lastSlug = readLastOrgSlug();
        const remembered = availableOrgs.find((o) => o.slug === lastSlug);

        if (remembered) {
          router.replace(`/o/${encodeURIComponent(remembered.slug)}/dashboard`);
          return;
        }

        if (availableOrgs.length === 1) {
          rememberOrgSlug(availableOrgs[0].slug);
          router.replace(`/o/${encodeURIComponent(availableOrgs[0].slug)}/dashboard`);
          return;
        }

        if (availableOrgs.length > 1) {
          setShowOrgPicker(true);
          return;
        }

        setShowOrgPicker(false);
        setMsg(
          "No organization membership was found for this account yet. Create a workspace and continue into onboarding."
        );
      } catch (err: unknown) {
        setMsg(getErrorMessage(err, "Failed to resolve workspace"));
      } finally {
        setResolvingTenant(false);
      }
    },
    [router]
  );

  useEffect(() => {
    async function boot() {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          await resolveTenantAndRoute(data.session);
        }
      } finally {
        setBooting(false);
      }
    }

    void boot();
  }, [resolveTenantAndRoute]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) return setMsg("Email is required.");
    if (!password) return setMsg("Password is required.");

    if (mode === "signup") {
      if (!firstName.trim()) return setMsg("First name is required.");
      if (!lastName.trim()) return setMsg("Last name is required.");
      if (!isOrganizationEmail(cleanEmail)) {
        return setMsg("Use an organization email only. Personal email domains are not allowed.");
      }
      if (!companyName.trim()) return setMsg("Company name is required.");
      if (country === "Saudi Arabia" && !companyRegistrationNumber.trim()) {
        return setMsg("Company registration number is required for Saudi companies.");
      }
      if (!industry.trim()) return setMsg("Industry is required.");
      if (!country.trim()) return setMsg("Country is required.");
      if (!employeeCount.trim()) return setMsg("Number of employees is required.");
    }

    if (!envHint.url || !envHint.key) {
      setMsg("Supabase env is missing. Check .env.local and restart npm run dev.");
      return;
    }

    if (envHint.looksLikePublishable) {
      setMsg(
        "Your NEXT_PUBLIC_SUPABASE_ANON_KEY is wrong. Use the public ANON JWT key that starts with eyJ, then restart the dev server."
      );
      return;
    }

    setLoading(true);

    try {
      if (mode === "signup") {
        const signupDraft: OnboardingDraft = {
          personal: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: cleanEmail,
          },
          company: {
            companyName: companyName.trim(),
            registrationNumber: companyRegistrationNumber.trim(),
            industry: industry.trim(),
            country: country.trim(),
            employeeCount: employeeCount.trim(),
          },
          aiSetup: {
            mainStrategy: "",
            departments: [{ name: "", headName: "", headEmail: "" }],
          },
        };

        saveOnboardingDraft(signupDraft);

        const { error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              company_name: companyName.trim(),
              company_registration_number: companyRegistrationNumber.trim(),
              industry: industry.trim(),
              country: country.trim(),
              employee_count: employeeCount.trim(),
            },
          },
        });

        if (error) throw error;

        const session = await waitForSession(3500);
        if (session) {
          const slug = normalizeSlug(companyName || `${firstName}-${lastName}-workspace`);
          rememberOrgSlug(slug);
          router.replace(`/o/${encodeURIComponent(slug)}/onboarding`);
        } else {
          setMsg("Account created. If email confirmation is enabled, confirm your email and then log in.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) throw error;

        const session = await waitForSession(3500);
        if (session) {
          await resolveTenantAndRoute(session);
        } else {
          setMsg("Login succeeded but the session was not established. Try again.");
        }
      }
    } catch (err: unknown) {
      const m = getErrorMessage(err, "Something went wrong");

      if (m.toLowerCase().includes("failed to fetch")) {
        setMsg(
          "Failed to reach Supabase.\n\n1) Use the ANON JWT key that starts with eyJ.\n2) Restart dev server after editing .env.local.\n3) Disable privacy extensions on localhost.\n4) Ensure NEXT_PUBLIC_SUPABASE_URL is exactly https://<project>.supabase.co"
        );
      } else {
        setMsg(m);
      }
    } finally {
      setLoading(false);
    }
  }

  function selectOrg(slug: string) {
    rememberOrgSlug(slug);
    router.replace(`/o/${encodeURIComponent(slug)}/dashboard`);
  }

  function goToCreateWorkspace() {
    const slug = normalizeSlug(newOrgSlug || newOrgName || companyName);
    if (!slug) {
      setMsg("Enter a valid workspace slug or company name.");
      return;
    }

    const draft: OnboardingDraft = {
      personal: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
      },
      company: {
        companyName: (newOrgName || companyName).trim(),
        registrationNumber: companyRegistrationNumber.trim(),
        industry: industry.trim(),
        country: country.trim() || "Saudi Arabia",
        employeeCount: employeeCount.trim(),
      },
      aiSetup: {
        mainStrategy: "",
        departments: [{ name: "", headName: "", headEmail: "" }],
      },
    };

    saveOnboardingDraft(draft);
    rememberOrgSlug(slug);
    router.replace(`/o/${encodeURIComponent(slug)}/onboarding`);
  }

  async function logout() {
    await supabase.auth.signOut();
    setShowOrgPicker(false);
    setOrgs([]);
    setMsg(null);
    setEmail("");
    setPassword("");
  }

  const showWorkspaceCreate =
    !resolvingTenant &&
    !loading &&
    msg?.toLowerCase().includes("no organization membership");

  if (booting) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.22),transparent_32%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_24%)]" />
        <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6">
          <div className="w-full max-w-xl rounded-[32px] border border-[var(--border-strong)] bg-[var(--background-panel)] p-6 alamin-glow">
            <div className="h-5 w-32 animate-pulse rounded-full bg-white/10" />
            <div className="mt-5 h-12 w-64 animate-pulse rounded-2xl bg-white/10" />
            <div className="mt-3 h-5 w-80 animate-pulse rounded-xl bg-white/10" />
            <div className="mt-8 grid gap-4">
              <div className="h-14 animate-pulse rounded-2xl bg-white/10" />
              <div className="h-14 animate-pulse rounded-2xl bg-white/10" />
              <div className="h-14 animate-pulse rounded-2xl bg-white/10" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.22),transparent_32%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_24%)]" />

      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[color:var(--background)]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--card)] alamin-glow">
              <div className="h-5 w-5 rounded-full bg-[linear-gradient(135deg,#6d5efc_0%,#37cfff_100%)]" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-[0.22em] text-[var(--foreground-soft)]">
                ALAMIN
              </div>
              <div className="text-sm text-[var(--foreground-muted)]">
                AI Performance Intelligence
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-[var(--foreground-muted)] md:flex">
            <Link href="/#features" className="transition hover:text-[var(--foreground)]">
              Features
            </Link>
            <Link href="/#security" className="transition hover:text-[var(--foreground)]">
              Security
            </Link>
            <Link href="/#pricing" className="transition hover:text-[var(--foreground)]">
              Pricing
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden md:block">
              <ThemeToggle />
            </div>
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-medium text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
            >
              Back to site
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-76px)] max-w-7xl gap-12 px-6 py-10 lg:grid-cols-[minmax(0,1.04fr)_minmax(520px,0.96fr)] lg:px-8 lg:py-14">
        <section className="flex flex-col justify-center">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-xs font-medium text-[var(--foreground-muted)]">
            <span className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />
            Secure workspace access for strategy, execution, and AI
          </div>

          <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[1.02] tracking-tight text-[var(--foreground)] md:text-6xl">
            Build your company execution
            <span className="block bg-[linear-gradient(135deg,var(--foreground)_0%,#9b8cff_38%,#64dcff_100%)] bg-clip-text text-transparent">
              system the right way.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--foreground-muted)]">
            Sign in to your workspace or start a structured onboarding that captures the company,
            strategy, departments, and execution layer from the beginning.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <InfoPill value="1" label="workspace per organization" />
            <InfoPill value="AI" label="strategy to execution setup" />
            <InfoPill value="Secure" label="organization email access" />
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <SignalCard
              eyebrow="What changes now"
              title="Better onboarding handoff"
              desc="Sign up collects the right company context first, then continues into a proper onboarding flow."
            />
            <SignalCard
              eyebrow="Built for real companies"
              title="No weak first-run experience"
              desc="Personal info, company info, and AI setup are treated like a real SaaS onboarding flow, not an afterthought."
            />
          </div>
        </section>

        <section className="relative">
          <div className="absolute inset-0 rounded-[32px] bg-[linear-gradient(135deg,rgba(109,94,252,0.18),rgba(55,207,255,0.08))] blur-2xl" />
          <div className="relative overflow-hidden rounded-[32px] border border-[var(--border-strong)] bg-[var(--background-panel)] p-5 alamin-glow md:p-6">
            <div className="rounded-[26px] border border-[var(--border)] bg-[var(--background-elevated)] p-5 md:p-6">
              {showOrgPicker ? (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                        Workspace selection
                      </div>
                      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--foreground)]">
                        Choose your company
                      </h2>
                      <p className="mt-3 max-w-md text-sm leading-7 text-[var(--foreground-muted)]">
                        This account belongs to multiple organizations. Pick the workspace you want
                        to enter.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void logout()}
                      className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-semibold text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
                    >
                      Logout
                    </button>
                  </div>

                  <div className="mt-6 grid gap-3">
                    {orgs.map((org) => (
                      <button
                        key={org.id}
                        type="button"
                        onClick={() => selectOrg(org.slug)}
                        className="group flex w-full items-center justify-between rounded-[22px] border border-[var(--border)] bg-[var(--card-subtle)] px-5 py-4 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
                      >
                        <div>
                          <div className="text-base font-semibold text-[var(--foreground)]">{org.name}</div>
                          <div className="mt-1 text-sm text-[var(--foreground-faint)]">/{org.slug}</div>
                        </div>
                        <span className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3 py-1 text-xs font-semibold text-[var(--foreground-soft)] transition group-hover:border-[var(--border-strong)] group-hover:bg-[var(--button-secondary-hover)]">
                          Open
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                        Secure access
                      </div>
                      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--foreground)]">
                        {mode === "login" ? "Welcome back" : "Create your account"}
                      </h2>
                      <p className="mt-3 text-sm leading-7 text-[var(--foreground-muted)]">
                        {mode === "login"
                          ? "Log in to access your workspace and continue execution."
                          : "Start with the right company context, then continue to onboarding."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 inline-flex rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] p-1">
                    <button
                      type="button"
                      onClick={() => setMode("login")}
                      disabled={loading || resolvingTenant}
                      className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                        mode === "login"
                          ? "bg-[var(--foreground)] text-[var(--background)]"
                          : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      Login
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("signup")}
                      disabled={loading || resolvingTenant}
                      className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                        mode === "signup"
                          ? "bg-[var(--foreground)] text-[var(--background)]"
                          : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      Sign up
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
                    {mode === "signup" ? (
                      <>
                        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card-subtle)] p-4">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                            Personal info
                          </div>
                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <FieldShell label="First name">
                              <input
                                placeholder="First name"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                type="text"
                                autoComplete="given-name"
                                className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                              />
                            </FieldShell>

                            <FieldShell label="Last name">
                              <input
                                placeholder="Last name"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                type="text"
                                autoComplete="family-name"
                                className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                              />
                            </FieldShell>

                            <div className="md:col-span-2">
                              <FieldShell label="Organization email only" hint="Personal email domains are blocked">
                                <input
                                  placeholder="name@company.com"
                                  value={email}
                                  onChange={(e) => setEmail(e.target.value)}
                                  type="email"
                                  autoComplete="email"
                                  className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                                />
                              </FieldShell>
                            </div>

                            <div className="md:col-span-2">
                              <FieldShell label="Password" hint="Use a strong password for workspace access">
                                <input
                                  placeholder="Create a password"
                                  value={password}
                                  onChange={(e) => setPassword(e.target.value)}
                                  type="password"
                                  autoComplete="new-password"
                                  className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                                />
                              </FieldShell>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card-subtle)] p-4">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                            Company info
                          </div>
                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <FieldShell label="Company name">
                              <input
                                placeholder="Company name"
                                value={companyName}
                                onChange={(e) => {
                                  setCompanyName(e.target.value);
                                  if (!newOrgName) setNewOrgName(e.target.value);
                                }}
                                type="text"
                                className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                              />
                            </FieldShell>

                            <FieldShell
                              label="Company registration number"
                              hint={country === "Saudi Arabia" ? "Saudi companies only" : "Optional outside Saudi Arabia"}
                            >
                              <input
                                placeholder="CR Number"
                                value={companyRegistrationNumber}
                                onChange={(e) => setCompanyRegistrationNumber(e.target.value)}
                                type="text"
                                className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                              />
                            </FieldShell>

                            <FieldShell label="Industry">
                              <select
                                value={industry}
                                onChange={(e) => setIndustry(e.target.value)}
                                className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none transition focus:border-[var(--border-strong)]"
                              >
                                {INDUSTRIES.map((item) => (
                                  <option key={item} value={item} className="bg-[#0d1118] text-white">
                                    {item}
                                  </option>
                                ))}
                              </select>
                            </FieldShell>

                            <FieldShell label="Country">
                              <select
                                value={country}
                                onChange={(e) => setCountry(e.target.value)}
                                className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none transition focus:border-[var(--border-strong)]"
                              >
                                {COUNTRIES.map((item) => (
                                  <option key={item} value={item} className="bg-[#0d1118] text-white">
                                    {item}
                                  </option>
                                ))}
                              </select>
                            </FieldShell>

                            <div className="md:col-span-2">
                              <FieldShell label="Number of employees">
                                <input
                                  placeholder="e.g. 500"
                                  value={employeeCount}
                                  onChange={(e) => setEmployeeCount(e.target.value)}
                                  type="number"
                                  inputMode="numeric"
                                  className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                                />
                              </FieldShell>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card-subtle)] p-4">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                            Next step after signup
                          </div>
                          <div className="mt-3 text-sm leading-7 text-[var(--foreground-muted)]">
                            You will continue into onboarding to complete:
                            <br />
                            1. Main company strategy
                            <br />
                            2. Departments
                            <br />
                            3. Heads of departments
                            <br />
                            4. AI setup foundation
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <FieldShell label="Work email">
                          <input
                            placeholder="name@company.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            type="email"
                            autoComplete="email"
                            required
                            className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                          />
                        </FieldShell>

                        <FieldShell label="Password">
                          <input
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            type="password"
                            autoComplete="current-password"
                            required
                            className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                          />
                        </FieldShell>
                      </>
                    )}

                    <button
                      type="submit"
                      disabled={loading || resolvingTenant}
                      className="mt-2 inline-flex h-12 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading || resolvingTenant
                        ? "Please wait..."
                        : mode === "login"
                          ? "Log in"
                          : "Create account and continue"}
                    </button>
                  </form>

                  {msg ? (
                    <div
                      className={`mt-5 rounded-[20px] border px-4 py-3 text-sm leading-6 whitespace-pre-wrap ${
                        showWorkspaceCreate
                          ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
                          : "border-red-400/20 bg-red-400/10 text-red-100"
                      }`}
                    >
                      {msg}
                    </div>
                  ) : null}

                  {showWorkspaceCreate ? (
                    <div className="mt-6 rounded-[24px] border border-[var(--border)] bg-[var(--card-subtle)] p-5">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                        Create a workspace
                      </div>
                      <div className="mt-3 text-base font-semibold text-[var(--foreground)]">
                        No company is linked to this account yet
                      </div>
                      <div className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">
                        Continue into the structured onboarding flow with a company and workspace slug.
                      </div>

                      <div className="mt-4 grid gap-3">
                        <input
                          value={newOrgName}
                          onChange={(e) => setNewOrgName(e.target.value)}
                          placeholder="Company name"
                          className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                        />
                        <input
                          value={newOrgSlug}
                          onChange={(e) => setNewOrgSlug(normalizeSlug(e.target.value))}
                          placeholder="workspace-slug"
                          className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                        />
                        <button
                          type="button"
                          onClick={goToCreateWorkspace}
                          className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
                        >
                          Continue to onboarding
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--card-subtle)] p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                      What you get inside
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <MiniFeature
                        title="Structured onboarding"
                        desc="Personal, company, and AI setup flow from the start."
                      />
                      <MiniFeature
                        title="Organization email only"
                        desc="Better quality company onboarding and less junk signups."
                      />
                      <MiniFeature
                        title="AI-ready setup"
                        desc="Prepare strategy, departments, and ownership before execution begins."
                      />
                      <MiniFeature
                        title="Tenant-safe access"
                        desc="Keep company data scoped to the right workspace."
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function FieldShell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-[var(--foreground-soft)]">{label}</label>
        {hint ? <span className="text-xs text-[var(--foreground-faint)]">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function InfoPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card)] px-5 py-4 alamin-shadow">
      <div className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">{value}</div>
      <div className="mt-1 text-sm text-[var(--foreground-muted)]">{label}</div>
    </div>
  );
}

function SignalCard({
  eyebrow,
  title,
  desc,
}: {
  eyebrow: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-6 alamin-shadow">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
        {eyebrow}
      </div>
      <div className="mt-3 text-lg font-semibold text-[var(--foreground)]">{title}</div>
      <div className="mt-3 text-sm leading-7 text-[var(--foreground-muted)]">{desc}</div>
    </div>
  );
}

function MiniFeature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card-subtle)] p-4">
      <div className="text-sm font-semibold text-[var(--foreground)]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[var(--foreground-muted)]">{desc}</div>
    </div>
  );
}