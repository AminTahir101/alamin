"use client";

import Link from "next/link";
import { useState } from "react";

type DemoRequestPayload = {
  fullName: string;
  workEmail: string;
  companyName: string;
  jobTitle: string;
  companySize: string;
  country: string;
  notes: string;
};

type DemoResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
};

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
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

export default function DemoPage() {
  const [form, setForm] = useState<DemoRequestPayload>({
    fullName: "",
    workEmail: "",
    companyName: "",
    jobTitle: "",
    companySize: "",
    country: "Saudi Arabia",
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function updateField<K extends keyof DemoRequestPayload>(
    key: K,
    value: DemoRequestPayload[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setSuccess(null);

    if (!form.fullName.trim()) {
      setMsg("Full name is required.");
      return;
    }

    if (!form.workEmail.trim()) {
      setMsg("Work email is required.");
      return;
    }

    if (!form.companyName.trim()) {
      setMsg("Company name is required.");
      return;
    }

    if (!form.jobTitle.trim()) {
      setMsg("Job title is required.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const raw = await res.text();
      const parsed = (await safeParseJson(raw)) as DemoResponse | null;

      if (!res.ok || !parsed?.ok) {
        throw new Error(parsed?.error || raw || "Failed to submit demo request");
      }

      setSuccess(
        parsed.message ||
          "Your demo request was submitted. The team will reach out to you soon.",
      );

      setForm({
        fullName: "",
        workEmail: "",
        companyName: "",
        jobTitle: "",
        companySize: "",
        country: "Saudi Arabia",
        notes: "",
      });
    } catch (err: unknown) {
      setMsg(getErrorMessage(err, "Failed to submit demo request"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(circle_at_top,rgba(109,94,252,0.24),transparent_36%),radial-gradient(circle_at_top_right,rgba(55,207,255,0.14),transparent_28%)]" />

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

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-medium text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
            >
              Back to site
            </Link>
            <Link
              href="/auth"
              className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-92"
            >
              Existing customer login
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
        <section className="flex flex-col justify-center">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-xs font-medium text-[var(--foreground-muted)]">
            <span className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />
            Demo-first onboarding for qualified companies
          </div>

          <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-tight text-[var(--foreground)] md:text-6xl">
            Request a demo for
            <span className="block bg-[linear-gradient(135deg,var(--foreground)_0%,#9b8cff_38%,#64dcff_100%)] bg-clip-text text-transparent">
              ALAMIN.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--foreground-muted)]">
            Show us your company context and we will walk you through how ALAMIN
            can structure KPI inputs, generate OKRs, map JTBD, and give your
            leadership team a real execution layer.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <MetricCard value="Paid" label="plans only" />
            <MetricCard value="AI" label="execution intelligence" />
            <MetricCard value="B2B" label="serious company rollout" />
          </div>

          <div className="mt-10 grid gap-4">
            <InfoCard
              title="What happens next"
              desc="Your request is reviewed, qualified, and routed to sales instead of opening the product publicly to everyone."
            />
            <InfoCard
              title="Who this is for"
              desc="Companies that want KPI-to-OKR generation, execution tracking, department ownership, and AI performance review in one product."
            />
            <InfoCard
              title="Why no free plan"
              desc="This is not a toy signup funnel. The product is positioned for paid B2B adoption and controlled rollout."
            />
          </div>
        </section>

        <section className="relative">
          <div className="absolute inset-0 rounded-[32px] bg-[linear-gradient(135deg,rgba(109,94,252,0.18),rgba(55,207,255,0.08))] blur-2xl" />
          <div className="relative overflow-hidden rounded-[32px] border border-[var(--border-strong)] bg-[var(--background-panel)] p-5 alamin-glow md:p-6">
            <div className="rounded-[26px] border border-[var(--border)] bg-[var(--background-elevated)] p-5 md:p-6">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                Demo request
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--foreground)]">
                Tell us about your company
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--foreground-muted)]">
                Use a real work email and enough context so the demo is not a
                waste of time.
              </p>

              {(msg || success) && (
                <div className="mt-5 grid gap-3">
                  {msg ? (
                    <div className="rounded-[20px] border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                      {msg}
                    </div>
                  ) : null}

                  {success ? (
                    <div className="rounded-[20px] border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                      {success}
                    </div>
                  ) : null}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Full name">
                    <input
                      value={form.fullName}
                      onChange={(e) => updateField("fullName", e.target.value)}
                      placeholder="Your full name"
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                    />
                  </Field>

                  <Field label="Work email">
                    <input
                      type="email"
                      value={form.workEmail}
                      onChange={(e) => updateField("workEmail", e.target.value)}
                      placeholder="name@company.com"
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                    />
                  </Field>

                  <Field label="Company name">
                    <input
                      value={form.companyName}
                      onChange={(e) => updateField("companyName", e.target.value)}
                      placeholder="Company name"
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                    />
                  </Field>

                  <Field label="Job title">
                    <input
                      value={form.jobTitle}
                      onChange={(e) => updateField("jobTitle", e.target.value)}
                      placeholder="Head of Strategy"
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                    />
                  </Field>

                  <Field label="Company size">
                    <select
                      value={form.companySize}
                      onChange={(e) => updateField("companySize", e.target.value)}
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none transition focus:border-[var(--border-strong)]"
                    >
                      <option value="">Select company size</option>
                      <option value="1-50">1-50 employees</option>
                      <option value="51-200">51-200 employees</option>
                      <option value="201-500">201-500 employees</option>
                      <option value="501-1000">501-1000 employees</option>
                      <option value="1000+">1000+ employees</option>
                    </select>
                  </Field>

                  <Field label="Country">
                    <input
                      value={form.country}
                      onChange={(e) => updateField("country", e.target.value)}
                      placeholder="Saudi Arabia"
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                    />
                  </Field>
                </div>

                <Field
                  label="What do you want to solve?"
                  hint="Share KPI pain, execution pain, or reporting pain"
                >
                  <textarea
                    value={form.notes}
                    onChange={(e) => updateField("notes", e.target.value)}
                    placeholder="Example: We track KPIs manually in spreadsheets, struggle to convert company strategy into measurable OKRs, and leadership has no clean execution view across departments."
                    className="min-h-30 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-3 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] transition focus:border-[var(--border-strong)]"
                  />
                </Field>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 inline-flex h-12 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Submitting..." : "Request demo"}
                </button>
              </form>

              <div className="mt-6 rounded-[20px] border border-[var(--border)] bg-[var(--card-subtle)] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                  Entry policy
                </div>
                <div className="mt-3 text-sm leading-7 text-[var(--foreground-muted)]">
                  No free plan. No open public product access. New companies come
                  in through demo qualification and paid onboarding only.
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-[var(--foreground-soft)]">
          {label}
        </label>
        {hint ? (
          <span className="text-xs text-[var(--foreground-faint)]">{hint}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function MetricCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card)] px-5 py-4 alamin-shadow">
      <div className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
        {value}
      </div>
      <div className="mt-1 text-sm text-[var(--foreground-muted)]">{label}</div>
    </div>
  );
}

function InfoCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-6 alamin-shadow">
      <div className="text-lg font-semibold text-[var(--foreground)]">{title}</div>
      <div className="mt-3 text-sm leading-7 text-[var(--foreground-muted)]">
        {desc}
      </div>
    </div>
  );
}