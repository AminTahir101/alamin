"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import OrgAiCopilot from "@/components/ai/OrgAiCopilot";

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

export default function YourAiPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const orgSlug = String(params?.slug ?? "").trim();

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
            className="inline-flex h-11 items-center justify-center rounded-full border border-white/12 bg-white/5 px-5 text-sm font-medium text-white/90 transition hover:border-white/20 hover:bg-white/8"
          >
            Back to dashboard
          </button>
          <button
            type="button"
            onClick={() => router.push(`/o/${encodeURIComponent(orgSlug)}/tasks`)}
            className="inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-[#07090D] transition hover:bg-white/92"
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
        <div className="mb-6 rounded-[22px] border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
          {msg}
        </div>
      ) : null}

      {loading ? (
        <section className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr_0.8fr]">
          <div className="h-[680px] animate-pulse rounded-[28px] border border-white/10 bg-white/5" />
          <div className="h-[680px] animate-pulse rounded-[28px] border border-white/10 bg-white/5" />
          <div className="h-[680px] animate-pulse rounded-[28px] border border-white/10 bg-white/5" />
        </section>
      ) : (
        <OrgAiCopilot slug={orgSlug} />
      )}
    </AppShell>
  );
}