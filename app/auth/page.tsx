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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [resolvingTenant, setResolvingTenant] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [showOrgPicker, setShowOrgPicker] = useState(false);

  const envHint = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    // Supabase supports two key formats:
    //   - Legacy JWT: starts with "eyJ"
    //   - New publishable: starts with "sb_publishable_"
    // Both are valid for browser use.
    const isJwt = key.startsWith("eyJ");
    const isPublishable = key.startsWith("sb_publishable_");
    return {
      url,
      key,
      looksValid: isJwt || isPublishable,
    };
  }, []);

  const resolveTenantAndRoute = useCallback(
    async (session: Session) => {
      setResolvingTenant(true);
      setMsg(null);

      try {
        const user = session.user;
        const invitedSlug = String(user.user_metadata?.invited_to_org_slug ?? "").trim();

        if (invitedSlug) {
          rememberOrgSlug(invitedSlug);
          router.replace(`/o/${encodeURIComponent(invitedSlug)}/onboarding`);
          return;
        }

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
        setMsg("No organization membership was found for this account.");
      } catch (err: unknown) {
        setMsg(getErrorMessage(err, "Failed to resolve workspace"));
      } finally {
        setResolvingTenant(false);
      }
    },
    [router]
  );

  useEffect(() => {
    let alive = true;

    // Listen for PASSWORD_RECOVERY event. Supabase fires this when a user
    // clicks a recovery link and the SDK detects the token in the URL.
    // We route them to /set-password to set a new password.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === "PASSWORD_RECOVERY" && session) {
        router.replace("/set-password");
      }
    });

    async function boot() {
      try {
        // Check the current URL hash for a recovery token before anything else.
        if (typeof window !== "undefined") {
          const hash = window.location.hash || "";
          if (hash.includes("type=recovery")) {
            setTimeout(() => {
              if (alive) router.replace("/set-password");
            }, 100);
            return;
          }
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) {
          await resolveTenantAndRoute(data.session);
        }
      } finally {
        if (alive) setBooting(false);
      }
    }

    void boot();

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [resolveTenantAndRoute, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setMsg("Email is required.");
      return;
    }

    if (!password) {
      setMsg("Password is required.");
      return;
    }

    if (!envHint.url || !envHint.key) {
      setMsg("Supabase env is missing. Check .env.local and restart the dev server.");
      return;
    }

    if (!envHint.looksValid) {
      setMsg(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY does not look valid. It should start with either 'eyJ' (legacy JWT) or 'sb_publishable_' (new format). Restart the dev server after updating .env.local."
      );
      return;
    }

    setLoading(true);

    try {
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
    } catch (err: unknown) {
      const m = getErrorMessage(err, "Something went wrong");

      if (m.toLowerCase().includes("failed to fetch")) {
        setMsg(
          "Failed to reach Supabase.\n\n1) Verify NEXT_PUBLIC_SUPABASE_URL is exactly https://<project>.supabase.co\n2) Verify NEXT_PUBLIC_SUPABASE_ANON_KEY is set (legacy 'eyJ' JWT or new 'sb_publishable_' key).\n3) Restart dev server after editing .env.local.\n4) Disable privacy extensions on localhost."
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

  async function logout() {
    await supabase.auth.signOut();
    setShowOrgPicker(false);
    setOrgs([]);
    setMsg(null);
    setEmail("");
    setPassword("");
  }

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
            Access your company workspace
            <span className="block bg-[linear-gradient(135deg,var(--foreground)_0%,#9b8cff_38%,#64dcff_100%)] bg-clip-text text-transparent">
              and continue execution.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--foreground-muted)]">
            Log in to your workspace. If you were invited by your company admin, you will be taken
            directly into your organization onboarding flow.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <InfoPill value="1" label="workspace per organization" />
            <InfoPill value="AI" label="strategy to execution setup" />
            <InfoPill value="Secure" label="organization email access" />
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <SignalCard
              eyebrow="Invited users"
              title="Onboarding redirect built in"
              desc="If your account was invited into a new organization, login routes you directly into that onboarding flow."
            />
            <SignalCard
              eyebrow="Existing customers"
              title="Multi-org access supported"
              desc="If your account belongs to more than one organization, you can choose which company workspace to enter."
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
                        Welcome back
                      </h2>
                      <p className="mt-3 text-sm leading-7 text-[var(--foreground-muted)]">
                        Log in to access your workspace and continue execution.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
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

                    <button
                      type="submit"
                      disabled={loading || resolvingTenant}
                      className="mt-2 inline-flex h-12 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading || resolvingTenant ? "Please wait..." : "Log in"}
                    </button>
                  </form>

                  {msg ? (
                    <div className="mt-5 rounded-[20px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm leading-6 whitespace-pre-wrap text-red-700 dark:text-red-100">
                      {msg}
                    </div>
                  ) : null}

                  <div className="mt-6 rounded-[22px] border border-[var(--border)] bg-[var(--card-subtle)] p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                      What you get inside
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <MiniFeature
                        title="Structured onboarding"
                        desc="Invited users route directly into the right company onboarding flow."
                      />
                      <MiniFeature
                        title="Organization email only"
                        desc="Company access stays tied to the right workspace and membership layer."
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
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium text-[var(--foreground-soft)]">{label}</label>
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