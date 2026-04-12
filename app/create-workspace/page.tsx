"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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

export default function CreateWorkspacePage() {
  const router = useRouter();

  const [booting, setBooting] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewSlug = normalizeSlug(name);
  const canSubmit = name.trim().length >= 2 && previewSlug.length >= 2 && !saving;

  useEffect(() => {
    let alive = true;

    async function boot() {
      const { data, error: sessionErr } = await supabase.auth.getSession();
      if (!alive) return;

      if (sessionErr || !data.session) {
        router.replace("/auth");
        return;
      }

      setUserEmail(data.session.user.email ?? null);
      setSessionReady(true);
      setBooting(false);
    }

    void boot();

    return () => {
      alive = false;
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!sessionReady) {
      setError("Not signed in. Please log in first.");
      return;
    }

    const cleanName = name.trim();
    if (cleanName.length < 2) {
      setError("Workspace name must be at least 2 characters.");
      return;
    }

    setSaving(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Session expired. Please log in again.");

      const res = await fetch("/api/create-workspace", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: cleanName }),
      });

      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        organization?: { slug: string };
        error?: string;
      } | null;

      if (!res.ok || !data?.ok || !data.organization) {
        throw new Error(data?.error || `Failed to create workspace (HTTP ${res.status})`);
      }

      // Route to onboarding for the new workspace
      router.replace(
        `/o/${encodeURIComponent(data.organization.slug)}/onboarding`,
      );
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to create workspace"));
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
                Checking your session…
              </div>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute inset-0 rounded-[32px] bg-[linear-gradient(135deg,rgba(109,94,252,0.18),rgba(55,207,255,0.08))] blur-2xl" />
              <div className="relative rounded-[32px] border border-[var(--border-strong)] bg-[var(--background-panel)] p-8 alamin-glow md:p-10">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--foreground-faint)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />
                  New workspace
                </div>

                <h1 className="mt-5 text-3xl font-black tracking-[-0.03em] text-[var(--foreground)] md:text-4xl">
                  Name your workspace
                </h1>

                <p className="mt-4 text-base leading-7 text-[var(--foreground-muted)]">
                  {userEmail ? (
                    <>
                      You&apos;ll be the owner of this workspace, signed in as{" "}
                      <span className="font-semibold text-[var(--foreground)]">{userEmail}</span>
                      . You can invite team members in the next step.
                    </>
                  ) : (
                    "You'll be the owner of this workspace. You can invite team members in the next step."
                  )}
                </p>

                <form onSubmit={handleSubmit} className="mt-8 grid gap-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-[var(--foreground-soft)]">
                      Workspace name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Acme Inc."
                      autoFocus
                      disabled={saving}
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                    />
                  </div>

                  {previewSlug && (
                    <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card-subtle)] px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                        Workspace URL preview
                      </div>
                      <div className="mt-1 font-mono text-sm text-[var(--foreground-soft)]">
                        /o/{previewSlug}
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="rounded-[20px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-100">
                      {error}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? "Creating workspace…" : "Create workspace"}
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push("/auth")}
                      disabled={saving}
                      className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)] disabled:opacity-60"
                    >
                      Back
                    </button>
                  </div>
                </form>

                <div className="mt-8 rounded-[22px] border border-[var(--border)] bg-[var(--card-subtle)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                    What happens next
                  </div>
                  <ul className="mt-3 grid gap-2 text-sm leading-6 text-[var(--foreground-muted)]">
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-2)]" />
                      We&apos;ll create your workspace and make you the owner.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-2)]" />
                      You&apos;ll land in onboarding to set up company info and departments.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-2)]" />
                      After that, ALAMIN generates your KPIs and OKRs from your strategy.
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
