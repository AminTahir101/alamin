"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import OrgAiCopilot from "@/components/ai/OrgAiCopilot";
import LockedFeatureCard from "@/components/billing/LockedFeatureCard";
import { useEntitlement } from "@/lib/billing/useEntitlements";

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

export default function YourAiPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const orgSlug = String(params?.slug ?? "").trim();
  const { hasFeature } = useEntitlement(orgSlug);

  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

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
    let active = true;

    void (async () => {
      try {
        setMsg(null);
        const session = await ensureAuth();
        if (!active) return;
        if (!session) return;
      } catch (err: unknown) {
        if (!active) return;
        setMsg(getErrorMessage(err, "Failed to load Your AI"));
      } finally {
        if (!active) return;
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [ensureAuth]);

  return (
    <AppShell
      slug={orgSlug}
      sessionEmail={sessionEmail}
      topActions={
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/o/${encodeURIComponent(orgSlug)}/dashboard`)}
            className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-medium text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
          >
            Back to dashboard
          </button>

          <button
            type="button"
            onClick={() => router.push(`/o/${encodeURIComponent(orgSlug)}/tasks`)}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90"
          >
            Open tasks
          </button>
        </div>
      }
    >
      <AppPageHeader
        eyebrow="AI performance intelligence"
        title="Your AI"
        description="Generate, diagnose, preview, approve, and save strategy or execution updates from one AI workspace instead of scattered admin screens."
      />

      {msg ? (
        <div className="mb-6 rounded-[22px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-100">
          {msg}
        </div>
      ) : null}

      {!hasFeature("your_ai_advanced") ? (
        <div className="mb-6">
          <LockedFeatureCard
            feature="your_ai_advanced"
            title="Advanced AI is locked on your current plan"
            description="Basic AI access remains available below. Upgrade to unlock deeper diagnosis, advanced recommendations, and richer cross-functional analysis."
          />
        </div>
      ) : null}

      {loading ? (
        <section className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr_0.8fr]">
          <div className="h-[680px] animate-pulse rounded-[28px] border border-[var(--border)] bg-[var(--card)] alamin-shadow" />
          <div className="h-[680px] animate-pulse rounded-[28px] border border-[var(--border)] bg-[var(--card)] alamin-shadow" />
          <div className="h-[680px] animate-pulse rounded-[28px] border border-[var(--border)] bg-[var(--card)] alamin-shadow" />
        </section>
      ) : (
        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--background-panel)] p-3 md:p-4 alamin-shadow">
          <div className="mb-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[26px] border border-[var(--border)] bg-[var(--background-elevated)] p-5 md:p-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                <span className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />
                AI workspace
              </div>

              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">
                One place to turn performance signals into action
              </h2>

              <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--foreground-muted)] md:text-base">
                Use AI to diagnose weak execution, generate OKRs, create JTBD clusters,
                rewrite vague KPIs, and prepare structured updates before anything is saved.
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <MiniPill label="Grounded in workspace data" />
                <MiniPill label="Preview before save" />
                <MiniPill label="Built for execution teams" />
              </div>
            </div>

            <div className="grid gap-3">
              <InfoCard
                title="What this page is for"
                body="Use this page when you need explanation, diagnosis, structured generation, and approval workflows without jumping between multiple modules."
              />
              <InfoCard
                title="Best next actions"
                body="Diagnose underperformance first, then generate OKRs or tasks from the weak areas instead of creating disconnected work."
              />
            </div>
          </div>

          <OrgAiCopilot slug={orgSlug} />
        </section>
      )}
    </AppShell>
  );
}

function MiniPill({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3 py-2 text-xs font-semibold text-[var(--foreground-soft)]">
      {label}
    </div>
  );
}

function InfoCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-5 alamin-shadow">
      <div className="text-sm font-semibold text-[var(--foreground)]">{title}</div>
      <div className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">{body}</div>
    </div>
  );
}