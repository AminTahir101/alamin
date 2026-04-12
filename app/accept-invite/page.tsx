"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type InviteMetadata = {
  invited_to_org_slug?: string;
  invited_to_org_name?: string;
  invited_role?: string;
};

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

function roleLabel(role: string | undefined): string {
  switch ((role ?? "").toLowerCase()) {
    case "owner":
      return "Workspace Owner";
    case "admin":
      return "Admin";
    case "manager":
      return "Manager";
    case "dept_head":
      return "Department Head";
    case "finance":
      return "Finance";
    case "member":
      return "Team Member";
    case "employee":
      return "Employee";
    default:
      return "Team Member";
  }
}

export default function AcceptInvitePage() {
  const router = useRouter();

  const [booting, setBooting] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<InviteMetadata | null>(null);
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

  useEffect(() => {
    let alive = true;

    async function boot() {
      // Give the Supabase SDK a moment to parse the URL hash / token
      await new Promise((resolve) => setTimeout(resolve, 200));

      if (!alive) return;

      const { data, error: sessionErr } = await supabase.auth.getSession();

      if (!alive) return;

      if (sessionErr) {
        setError(getErrorMessage(sessionErr, "Failed to read invite"));
        setBooting(false);
        return;
      }

      if (!data.session) {
        setError(
          "This invite link is invalid or has expired. Ask your admin to resend the invite.",
        );
        setBooting(false);
        return;
      }

      const user = data.session.user;
      setEmail(user.email ?? null);

      const md = user.user_metadata ?? {};
      setMetadata({
        invited_to_org_slug:
          typeof md.invited_to_org_slug === "string"
            ? md.invited_to_org_slug
            : undefined,
        invited_to_org_name:
          typeof md.invited_to_org_name === "string"
            ? md.invited_to_org_name
            : undefined,
        invited_role:
          typeof md.invited_role === "string" ? md.invited_role : undefined,
      });

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
      setError("No active invite session. Ask your admin to resend the invite.");
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

      if (updateErr) throw updateErr;

      setOkMsg("Password set. Taking you to your workspace…");

      // Route to their invited org dashboard if we have a slug, otherwise
      // fall through to /auth which will route them based on memberships.
      const slug = metadata?.invited_to_org_slug?.trim();
      const target = slug
        ? `/o/${encodeURIComponent(slug)}/dashboard`
        : "/auth";

      setTimeout(() => {
        router.replace(target);
      }, 700);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to set password"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_24%)]" />

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
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-76px)] max-w-7xl items-center justify-center px-6 py-10 lg:px-8">
        <div className="w-full max-w-xl">
          {booting ? (
            <div className="rounded-[32px] border border-[var(--border-strong)] bg-[var(--background-panel)] p-10 alamin-glow">
              <div className="flex items-center justify-center gap-3 text-sm text-[var(--foreground-muted)]">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--foreground)]" />
                Reading your invite…
              </div>
            </div>
          ) : !sessionReady ? (
            <div className="rounded-[32px] border border-[var(--border-strong)] bg-[var(--background-panel)] p-10 alamin-glow">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                Invite error
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--foreground)]">
                This invite link doesn&apos;t work
              </h1>
              <div className="mt-4 rounded-[20px] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm leading-6 text-red-700 dark:text-red-100">
                {error || "The invite link is invalid or has expired."}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => router.push("/auth")}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
                >
                  Back to login
                </button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute inset-0 rounded-[32px] bg-[linear-gradient(135deg,rgba(109,94,252,0.18),rgba(55,207,255,0.08))] blur-2xl" />
              <div className="relative rounded-[32px] border border-[var(--border-strong)] bg-[var(--background-panel)] p-8 alamin-glow md:p-10">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--foreground-faint)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />
                  Welcome to ALAMIN
                </div>

                <h1 className="mt-5 text-3xl font-black tracking-[-0.03em] text-[var(--foreground)] md:text-4xl">
                  You&apos;re invited to{" "}
                  <span className="bg-[linear-gradient(135deg,var(--foreground)_0%,#9b8cff_38%,#64dcff_100%)] bg-clip-text text-transparent">
                    {metadata?.invited_to_org_name || "a workspace"}
                  </span>
                </h1>

                <p className="mt-4 text-base leading-7 text-[var(--foreground-muted)]">
                  {email ? (
                    <>
                      You&apos;re joining as{" "}
                      <span className="font-semibold text-[var(--foreground)]">
                        {roleLabel(metadata?.invited_role)}
                      </span>{" "}
                      with the email{" "}
                      <span className="font-semibold text-[var(--foreground)]">
                        {email}
                      </span>
                      . Create a password below to enter your workspace.
                    </>
                  ) : (
                    "Create a password below to enter your workspace."
                  )}
                </p>

                <form onSubmit={handleSubmit} className="mt-8 grid gap-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-[var(--foreground-soft)]">
                      Create a password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      disabled={saving}
                      minLength={8}
                      placeholder="At least 8 characters"
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-[var(--foreground-soft)]">
                      Confirm password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      disabled={saving}
                      minLength={8}
                      placeholder="Re-enter your password"
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                    />
                  </div>

                  {error && (
                    <div className="rounded-[20px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-100">
                      {error}
                    </div>
                  )}

                  {okMsg && (
                    <div className="rounded-[20px] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">
                      {okMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="mt-2 inline-flex h-12 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Setting up your workspace…" : "Enter your workspace"}
                  </button>
                </form>

                <div className="mt-8 rounded-[22px] border border-[var(--border)] bg-[var(--card-subtle)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                    What happens next
                  </div>
                  <ul className="mt-3 grid gap-2 text-sm leading-6 text-[var(--foreground-muted)]">
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-2)]" />
                      Your password is saved securely.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-2)]" />
                      You&apos;ll land directly in your workspace.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-2)]" />
                      You can update your password later in settings.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
