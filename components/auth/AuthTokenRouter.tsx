"use client";

// components/auth/AuthTokenRouter.tsx
//
// Mounted in the root layout. Runs on every page load. Detects Supabase
// auth tokens in the URL hash (recovery, invite, signup) and routes the
// user to the correct landing page.
//
// Important: signs out any existing session FIRST before letting the new
// token take over. This prevents the bug where a logged-in user clicking
// an invite link gets ignored because their existing session "wins".

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const TARGET_PATHS = {
  recovery: "/set-password",
  invite: "/accept-invite",
  signup: "/accept-invite",
} as const;

type TokenType = keyof typeof TARGET_PATHS;

function detectTokenType(hash: string): TokenType | null {
  if (!hash) return null;
  if (hash.includes("type=recovery")) return "recovery";
  if (hash.includes("type=invite")) return "invite";
  if (hash.includes("type=signup")) return "signup";
  return null;
}

export default function AuthTokenRouter() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash || "";
    const tokenType = detectTokenType(hash);
    if (!tokenType) return;

    const target = TARGET_PATHS[tokenType];

    // If we're already on the target page, let that page handle it.
    if (pathname === target) return;

    let alive = true;

    async function handleToken() {
      try {
        // Step 1: Sign out any existing session BEFORE the new token takes over.
        // This prevents the existing session from "winning" and the invite
        // token getting silently dropped.
        //
        // We need to preserve the URL hash through this navigation so the
        // target page can read the token. signOut() doesn't touch the URL.
        const { data: existing } = await supabase.auth.getSession();

        if (existing.session) {
          // Note: we sign out using scope: 'local' to clear browser session
          // only. We do NOT call signOut() with scope: 'global' because that
          // would invalidate the access token in the URL hash, which is what
          // we want Supabase to PROCESS, not invalidate.
          await supabase.auth.signOut({ scope: "local" });
        }

        if (!alive) return;

        // Step 2: Navigate to the target page, preserving the hash so the
        // SDK on the target page can parse the token and establish a session.
        //
        // router.replace strips the hash by default. We need to use a hard
        // window.location to preserve it.
        window.location.href = `${target}${window.location.hash}`;
      } catch {
        // If anything fails, fall back to a hard navigation that at least
        // preserves the hash.
        if (alive) {
          window.location.href = `${target}${window.location.hash}`;
        }
      }
    }

    void handleToken();

    return () => {
      alive = false;
    };
    // We intentionally only run this once on mount. Re-running on path
    // change would cause loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
