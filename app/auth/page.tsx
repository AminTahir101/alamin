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

export default function AuthPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
          "No organization membership was found for this account yet. Create a workspace slug below to continue onboarding."
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

    const cleanEmail = email.trim();
    if (!cleanEmail) return setMsg("Email is required.");
    if (!password) return setMsg("Password is required.");

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
        const { error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
        });
        if (error) throw error;

        const session = await waitForSession(3500);
        if (session) {
          await resolveTenantAndRoute(session);
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
    const slug = normalizeSlug(newOrgSlug || newOrgName);
    if (!slug) {
      setMsg("Enter a valid workspace slug or company name.");
      return;
    }

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
      <div className="min-h-screen bg-[#07090D] text-white">
        <div className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.28),transparent_38%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.14),transparent_28%)]" />
        <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6">
          <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
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
    <div className="min-h-screen bg-[#07090D] text-white">
      <div className="absolute inset-x-0 top-0 -z-10 h-[580px] bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.28),transparent_36%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.14),transparent_28%)]" />

      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07090D]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_0_1px_rgba(124,58,237,0.12),0_14px_30px_rgba(0,0,0,0.35)]">
              <div className="h-5 w-5 rounded-full bg-[linear-gradient(135deg,#7C3AED_0%,#22D3EE_100%)]" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-[0.22em] text-white/60">ALAMIN</div>
              <div className="text-sm text-white/80">AI Performance Intelligence</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-white/70 md:flex">
            <Link href="/#features" className="transition hover:text-white">
              Features
            </Link>
            <Link href="/#security" className="transition hover:text-white">
              Security
            </Link>
            <Link href="/#pricing" className="transition hover:text-white">
              Pricing
            </Link>
          </nav>

          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-full border border-white/12 bg-white/5 px-5 text-sm font-medium text-white/90 transition hover:border-white/20 hover:bg-white/8"
          >
            Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-76px)] max-w-7xl gap-12 px-6 py-10 lg:grid-cols-[minmax(0,1.04fr)_minmax(420px,0.96fr)] lg:px-8 lg:py-14">
        <section className="flex flex-col justify-center">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70">
            <span className="h-2 w-2 rounded-full bg-[#22D3EE]" />
            Secure workspace access for strategy, execution, and AI
          </div>

          <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[1.02] tracking-tight text-white md:text-6xl">
            Access your company execution
            <span className="block bg-[linear-gradient(135deg,#FFFFFF_0%,#B69CFF_38%,#7DE7F3_100%)] bg-clip-text text-transparent">
              command center.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/68">
            Log in to your workspace, continue onboarding, or switch between organizations without
            losing context. This is where KPIs, objectives, OKRs, tasks, and AI decisions come
            together.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <InfoPill value="1" label="secure workspace per organization" />
            <InfoPill value="AI" label="generation, review, and action" />
            <InfoPill value="Live" label="performance and execution visibility" />
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <SignalCard
              eyebrow="What happens after login"
              title="Route users to the right workspace"
              desc="Users land in the correct organization automatically, or pick from multiple workspaces when needed."
            />
            <SignalCard
              eyebrow="Built for B2B reality"
              title="No messy tenant confusion"
              desc="Workspace routing, organization memory, and onboarding fallback are all handled in one flow."
            />
          </div>
        </section>

        <section className="relative">
          <div className="absolute inset-0 rounded-[30px] bg-[linear-gradient(135deg,rgba(124,58,237,0.22),rgba(34,211,238,0.08))] blur-2xl" />
          <div className="relative overflow-hidden rounded-[30px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_0_0_1px_rgba(124,58,237,0.12),0_24px_80px_rgba(0,0,0,0.45)] md:p-6">
            <div className="rounded-[24px] border border-white/10 bg-[#0D1118] p-5 md:p-6">
              {showOrgPicker ? (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                        Workspace selection
                      </div>
                      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                        Choose your company
                      </h2>
                      <p className="mt-3 max-w-md text-sm leading-7 text-white/62">
                        This account belongs to multiple organizations. Pick the workspace you want
                        to enter.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void logout()}
                      className="inline-flex h-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-5 text-sm font-semibold text-white/88 transition hover:border-white/22 hover:bg-white/[0.08]"
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
                        className="group flex w-full items-center justify-between rounded-[22px] border border-white/10 bg-white/[0.03] px-5 py-4 text-left transition hover:border-white/20 hover:bg-white/[0.06]"
                      >
                        <div>
                          <div className="text-base font-semibold text-white">{org.name}</div>
                          <div className="mt-1 text-sm text-white/45">/{org.slug}</div>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/75 transition group-hover:border-white/18 group-hover:bg-white/[0.08]">
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
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                        Secure access
                      </div>
                      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                        {mode === "login" ? "Welcome back" : "Create your account"}
                      </h2>
                      <p className="mt-3 text-sm leading-7 text-white/62">
                        {mode === "login"
                          ? "Log in to access your workspace and continue execution."
                          : "Create an account, then continue to your company workspace."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
                    <button
                      type="button"
                      onClick={() => setMode("login")}
                      disabled={loading || resolvingTenant}
                      className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                        mode === "login"
                          ? "bg-white text-[#07090D]"
                          : "text-white/70 hover:text-white"
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
                          ? "bg-white text-[#07090D]"
                          : "text-white/70 hover:text-white"
                      }`}
                    >
                      Sign up
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
                    <FieldShell
                      label="Work email"
                      hint={mode === "signup" ? "Use your company email if possible." : undefined}
                    >
                      <input
                        placeholder="name@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        type="email"
                        autoComplete="email"
                        required
                        className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-white outline-none placeholder:text-white/25 transition focus:border-white/20"
                      />
                    </FieldShell>

                    <FieldShell
                      label="Password"
                      hint={mode === "signup" ? "Use a strong password for your workspace access." : undefined}
                    >
                      <input
                        placeholder={mode === "login" ? "Enter your password" : "Create a password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        type="password"
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        required
                        className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-white outline-none placeholder:text-white/25 transition focus:border-white/20"
                      />
                    </FieldShell>

                    <button
                      type="submit"
                      disabled={loading || resolvingTenant}
                      className="mt-2 inline-flex h-12 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-[#07090D] transition hover:bg-white/92 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading || resolvingTenant
                        ? "Please wait..."
                        : mode === "login"
                          ? "Log in"
                          : "Create account"}
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
                    <div className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                        Create a workspace
                      </div>
                      <div className="mt-3 text-base font-semibold text-white">
                        No company is linked to this account yet
                      </div>
                      <div className="mt-2 text-sm leading-7 text-white/62">
                        Continue onboarding with a company name and workspace slug.
                      </div>

                      <div className="mt-4 grid gap-3">
                        <input
                          value={newOrgName}
                          onChange={(e) => setNewOrgName(e.target.value)}
                          placeholder="Company name"
                          className="h-11 rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-white outline-none placeholder:text-white/25 transition focus:border-white/20"
                        />
                        <input
                          value={newOrgSlug}
                          onChange={(e) => setNewOrgSlug(normalizeSlug(e.target.value))}
                          placeholder="workspace-slug"
                          className="h-11 rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-white outline-none placeholder:text-white/25 transition focus:border-white/20"
                        />
                        <button
                          type="button"
                          onClick={goToCreateWorkspace}
                          className="inline-flex h-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] px-4 text-sm font-semibold text-white transition hover:border-white/22 hover:bg-white/[0.1]"
                        >
                          Continue to onboarding
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-6 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                      What you get inside
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <MiniFeature
                        title="Workspace routing"
                        desc="Send users to the right organization without friction."
                      />
                      <MiniFeature
                        title="Structured onboarding"
                        desc="Create company setup and continue directly into execution."
                      />
                      <MiniFeature
                        title="AI-ready flows"
                        desc="Access KPI, OKR, JTBD, and task generation workflows."
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
        <label className="text-sm font-medium text-white/72">{label}</label>
        {hint ? <span className="text-xs text-white/38">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function InfoPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.04] px-5 py-4 shadow-[0_14px_30px_rgba(0,0,0,0.22)]">
      <div className="text-2xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-1 text-sm text-white/58">{label}</div>
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
    <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-6 shadow-[0_16px_36px_rgba(0,0,0,0.22)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
        {eyebrow}
      </div>
      <div className="mt-3 text-lg font-semibold text-white">{title}</div>
      <div className="mt-3 text-sm leading-7 text-white/62">{desc}</div>
    </div>
  );
}

function MiniFeature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4">
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm leading-6 text-white/60">{desc}</div>
    </div>
  );
}