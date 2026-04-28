"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { AppShell } from "@/components/app/AppShell";
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
  const { t } = useLanguage();
  const pg = t.pages.yourAI;

  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const ensureAuth = useCallback(async (): Promise<Session | null> => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    setSessionEmail(session?.user?.email ?? null);
    if (!session) { router.replace("/auth"); return null; }
    return session;
  }, [router]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        setMsg(null);
        const session = await ensureAuth();
        if (!active || !session) return;
      } catch (err: unknown) {
        if (!active) return;
        setMsg(getErrorMessage(err, "Failed to load Your AI"));
      } finally {
        if (!active) return;
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [ensureAuth]);

  return (
    <AppShell
      slug={orgSlug}
      sessionEmail={sessionEmail}
      topActions={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/o/${encodeURIComponent(orgSlug)}/dashboard`)}
            className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-sm font-medium text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
          >
            {pg.backToDashboard}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/o/${encodeURIComponent(orgSlug)}/tasks`)}
            className="inline-flex h-9 items-center justify-center rounded-full bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--background)] transition hover:opacity-90"
          >
            {pg.goToTasks}
          </button>
        </div>
      }
    >
      {msg && (
        <div className="mb-4 rounded-[16px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-100">
          {msg}
        </div>
      )}

      {loading ? (
        <div className="flex h-[60vh] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--foreground)]" />
        </div>
      ) : (
        <OrgAiCopilot slug={orgSlug} />
      )}
    </AppShell>
  );
}
