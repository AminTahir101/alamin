"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";


type ApiResponse = {
  ok: boolean;
  organization?: {
    id: string;
    name: string;
    slug: string;
  };
  ownerUserId?: string;
  message?: string;
  error?: string;
};

function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function CreateOrganizationAdminPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  const suggestedSlug = useMemo(() => normalizeSlug(slug || name), [name, slug]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setSuccess(null);
    setCreatedSlug(null);

    const cleanName = name.trim();
    const cleanSlug = normalizeSlug(slug || name);
    const cleanOwnerEmail = ownerEmail.trim().toLowerCase();

    if (!cleanName) {
      setMsg("Organization name is required");
      return;
    }

    if (!cleanSlug) {
      setMsg("Valid organization slug is required");
      return;
    }

    setLoading(true);

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        setMsg("You must be logged in");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/admin/create-organization", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: cleanName,
          slug: cleanSlug,
          ownerEmail: cleanOwnerEmail || undefined,
        }),
      });

      const json = (await res.json()) as ApiResponse;

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to create organization");
      }

      setSuccess(json.message ?? "Organization created successfully");
      setCreatedSlug(json.organization?.slug ?? null);
      setName("");
      setSlug("");
      setOwnerEmail("");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Failed to create organization");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-10 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--foreground-faint)]">
              Internal admin
            </div>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--foreground)]">
              Create organization
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--foreground-muted)]">
              Create a new organization, assign an owner, and automatically seed a Core subscription.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-medium text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
          >
            Back
          </Link>
        </div>

        {msg ? (
          <div className="mb-5 rounded-[20px] border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
            {msg}
          </div>
        ) : null}

        {success ? (
          <div className="mb-5 rounded-[20px] border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {success}
          </div>
        ) : null}

        <div className="rounded-[28px] border border-[var(--border-strong)] bg-[var(--background-panel)] p-6 alamin-shadow">
          <form onSubmit={handleSubmit} className="grid gap-5">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium text-[var(--foreground-soft)]">
                  Organization name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Holdings"
                  className="h-12 rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] focus:border-[var(--border-strong)]"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-[var(--foreground-soft)]">
                  Organization slug
                </label>
                <input
                  value={slug}
                  onChange={(e) => setSlug(normalizeSlug(e.target.value))}
                  placeholder="acme-holdings"
                  className="h-12 rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] focus:border-[var(--border-strong)]"
                />
                <div className="text-xs text-[var(--foreground-faint)]">
                  Final slug: {suggestedSlug || "—"}
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-[var(--foreground-soft)]">
                Owner email
              </label>
              <input
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="owner@company.com"
                className="h-12 rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] focus:border-[var(--border-strong)]"
              />
              <div className="text-xs text-[var(--foreground-faint)]">
                Leave empty to assign the current logged-in user as owner.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--foreground)] px-6 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Creating..." : "Create organization"}
              </button>

              {createdSlug ? (
                <button
                  type="button"
                  onClick={() => router.push(`/o/${encodeURIComponent(createdSlug)}/dashboard`)}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-6 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
                >
                  Open organization
                </button>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}