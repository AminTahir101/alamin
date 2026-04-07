"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

export default function SetPasswordPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [orgSlug, setOrgSlug] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return password.trim().length >= 8 && confirmPassword.trim().length >= 8;
  }, [password, confirmPassword]);

  useEffect(() => {
    let active = true;

    async function boot() {
      try {
        setLoading(true);
        setMsg(null);

        const { data, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        const session = data.session;

        if (!active) return;

        if (!session) {
          setMsg("This password setup link is invalid or expired. Request a new invite.");
          setSessionReady(false);
          return;
        }

        const user = session.user;
        const invitedSlug = String(user.user_metadata?.invited_to_org_slug ?? "").trim();

        setEmail(user.email ?? null);
        setOrgSlug(invitedSlug);
        setSessionReady(true);
      } catch (err: unknown) {
        if (!active) return;
        setMsg(getErrorMessage(err, "Failed to load password setup"));
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    void boot();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setOkMsg(null);

    if (!sessionReady) {
      setMsg("Session is not ready. Open the invite link again.");
      return;
    }

    if (password.trim().length < 8) {
      setMsg("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMsg("Passwords do not match.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        throw error;
      }

      setOkMsg("Password saved successfully.");

      const nextUrl = orgSlug
        ? `/o/${encodeURIComponent(orgSlug)}/onboarding`
        : "/auth";

      window.setTimeout(() => {
        router.replace(nextUrl);
      }, 800);
    } catch (err: unknown) {
      setMsg(getErrorMessage(err, "Failed to save password"));
    } finally {
      setSaving(false);
    }
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

          <Link
            href="/auth"
            className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-medium text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
          >
            Back to login
          </Link>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-76px)] max-w-7xl items-center justify-center px-6 py-10 lg:px-8 lg:py-14">
        <section className="relative w-full max-w-2xl">
          <div className="absolute inset-0 rounded-[32px] bg-[linear-gradient(135deg,rgba(109,94,252,0.18),rgba(55,207,255,0.08))] blur-2xl" />
          <div className="relative overflow-hidden rounded-[32px] border border-[var(--border-strong)] bg-[var(--background-panel)] p-5 alamin-glow md:p-6">
            <div className="rounded-[26px] border border-[var(--border)] bg-[var(--background-elevated)] p-5 md:p-6">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                Password setup
              </div>

              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--foreground)]">
                Create your password
              </h1>

              <p className="mt-3 text-sm leading-7 text-[var(--foreground-muted)]">
                Save a permanent password for your invited account, then continue into your company onboarding flow.
              </p>

              {loading ? (
                <div className="mt-6 grid gap-4">
                  <div className="h-12 animate-pulse rounded-2xl bg-white/10" />
                  <div className="h-12 animate-pulse rounded-2xl bg-white/10" />
                  <div className="h-12 animate-pulse rounded-2xl bg-white/10" />
                </div>
              ) : (
                <>
                  <div className="mt-6 rounded-[20px] border border-[var(--border)] bg-[var(--card-subtle)] p-4 text-sm text-[var(--foreground-muted)]">
                    <div>
                      <span className="font-semibold text-[var(--foreground)]">Email:</span>{" "}
                      {email ?? "—"}
                    </div>
                    <div className="mt-2">
                      <span className="font-semibold text-[var(--foreground)]">Organization:</span>{" "}
                      {orgSlug || "Pending routing"}
                    </div>
                  </div>

                  {msg ? (
                    <div className="mt-5 rounded-[20px] border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                      {msg}
                    </div>
                  ) : null}

                  {okMsg ? (
                    <div className="mt-5 rounded-[20px] border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                      {okMsg}
                    </div>
                  ) : null}

                  <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-[var(--foreground-soft)]">
                        New password
                      </label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter a new password"
                        className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                      />
                    </div>

                    <div className="grid gap-2">
                      <label className="text-sm font-medium text-[var(--foreground-soft)]">
                        Confirm password
                      </label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm your password"
                        className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={saving || !sessionReady || !canSubmit}
                      className="mt-2 inline-flex h-12 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? "Saving password..." : "Save password and continue"}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}