"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const maybe = err as { message?: unknown };
    if (typeof maybe.message === "string" && maybe.message.trim()) {
      return maybe.message;
    }
  }
  return fallback;
}

export default function SetPasswordPage() {
  const router = useRouter();

  const [booting, setBooting] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const canSubmit =
    password.trim().length >= 8 &&
    confirmPassword.trim().length >= 8 &&
    password === confirmPassword &&
    !saving;

  // ─── Detect session from URL hash (recovery/invite token) ───────────────
  useEffect(() => {
    let alive = true;

    // Supabase SDK auto-parses tokens from the URL hash (#access_token=...)
    // on page load. We wait briefly for it to establish a session, then
    // check if we have one.
    async function boot() {
      // Give the SDK a tick to parse the hash
      await new Promise((resolve) => setTimeout(resolve, 200));

      if (!alive) return;

      const { data, error: sessionErr } = await supabase.auth.getSession();

      if (!alive) return;

      if (sessionErr) {
        setError(getErrorMessage(sessionErr, "Failed to read session"));
        setBooting(false);
        return;
      }

      if (!data.session) {
        setError(
          "This password setup link is invalid or has expired. Request a new recovery email from the login page.",
        );
        setBooting(false);
        return;
      }

      setEmail(data.session.user.email ?? null);
      setSessionReady(true);
      setBooting(false);
    }

    void boot();

    return () => {
      alive = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);

    if (!sessionReady) {
      setError("No active recovery session. Request a new recovery email.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);

    try {
      const { error: updateErr } = await supabase.auth.updateUser({
        password,
      });

      if (updateErr) {
        throw updateErr;
      }

      setOkMsg("Password updated. Redirecting to login…");

      // Sign out the recovery session so the user logs in fresh with their
      // new password. This is cleaner than keeping them auto-logged-in.
      await supabase.auth.signOut();

      setTimeout(() => {
        router.replace("/auth");
      }, 600);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to update password"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--foreground-faint)]">
            ALAMIN
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-[var(--foreground)]">
            Set your password
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--foreground-muted)]">
            {email
              ? `Create a password for ${email} to finish setup.`
              : "Create a password to finish account setup."}
          </p>
        </div>

        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg">
          {booting ? (
            <div className="flex items-center justify-center gap-3 py-10 text-sm text-[var(--foreground-muted)]">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--foreground)]" />
              Reading recovery link…
            </div>
          ) : !sessionReady ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
                {error || "Recovery link invalid."}
              </div>
              <button
                type="button"
                onClick={() => router.push("/auth")}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--button-secondary-hover)]"
              >
                Back to login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                  New password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={saving}
                  minLength={8}
                  className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--background-elevated)] px-4 py-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--border-active)]"
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                  Confirm password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={saving}
                  minLength={8}
                  className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--background-elevated)] px-4 py-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--border-active)]"
                  placeholder="Re-enter your password"
                />
              </div>

              {error && (
                <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              {okMsg && (
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                  {okMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--foreground)] px-5 py-3 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Set password and continue"}
              </button>
            </form>
          )}
        </div>

        <div className="mt-6 text-center text-xs text-[var(--foreground-faint)]">
          Having trouble? Request a new recovery email from the{" "}
          <button
            type="button"
            onClick={() => router.push("/auth")}
            className="underline hover:text-[var(--foreground-muted)]"
          >
            login page
          </button>
          .
        </div>
      </div>
    </main>
  );
}
