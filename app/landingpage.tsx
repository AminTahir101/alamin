"use client";

import Link from "next/link";

type Feature = {
  title: string;
  desc: string;
};

type PriceTier = {
  title: string;
  price: string;
  subtitle: string;
  bullets: string[];
  cta: string;
  href: string;
  highlight?: boolean;
  badge?: string;
};

const features: Feature[] = [
  {
    title: "KPI to OKR generation",
    desc: "Turn raw KPI inputs into measurable objectives and key results without manual rewriting.",
  },
  {
    title: "JTBD mapping",
    desc: "Translate goals into real workstreams and responsibilities instead of disconnected planning docs.",
  },
  {
    title: "AI performance reviews",
    desc: "Surface execution gaps, blockers, and recommendations from live company data.",
  },
  {
    title: "Department-level ownership",
    desc: "Give every team clear visibility into what they own, what is slipping, and what needs action.",
  },
  {
    title: "Executive decision layer",
    desc: "Move from reporting screens to an execution command center with summaries and next actions.",
  },
  {
    title: "Secure multi-tenant setup",
    desc: "Built around organization isolation, role-based access, and Supabase-ready tenant-safe architecture.",
  },
];

const tiers: PriceTier[] = [
  {
    title: "Core",
    price: "35 SAR / seat / month",
    subtitle:
      "For companies that need a structured execution system without manual KPI and OKR overhead.",
    bullets: [
      "KPI, Objectives, and OKRs",
      "AI-assisted generation",
      "Department ownership",
      "Execution tracking",
      "Standard dashboards",
    ],
    cta: "Request demo",
    href: "/demo",
  },
  {
    title: "Growth",
    price: "50 SAR / seat / month",
    subtitle:
      "For organizations that need deeper execution intelligence, visibility, and control.",
    bullets: [
      "Everything in Core",
      "Advanced AI recommendations and evaluations",
      "JTBD mapping and task orchestration",
      "Cross-department visibility",
      "Approvals and workflows",
      "Priority support",
    ],
    cta: "Request demo",
    href: "/demo",
    highlight: true,
    badge: "Most popular",
  },
  {
    title: "Enterprise",
    price: "Custom pricing",
    subtitle:
      "For large organizations with rollout, governance, integration, and deployment requirements.",
    bullets: [
      "Unlimited scale",
      "Custom onboarding and rollout",
      "Advanced permissions and controls",
      "Dedicated support and SLA",
      "Custom integrations and deployment",
    ],
    cta: "Talk to sales",
    href: "/demo",
  },
];

export default function LandingPage() {
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

          <nav className="hidden items-center gap-8 text-sm text-[var(--foreground-muted)] md:flex">
            <a href="#features" className="transition hover:text-[var(--foreground)]">
              Features
            </a>
            <a href="#security" className="transition hover:text-[var(--foreground)]">
              Security
            </a>
            <a href="#pricing" className="transition hover:text-[var(--foreground)]">
              Pricing
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/auth"
              className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-medium text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
            >
              Log in
            </Link>
            <Link
              href="/demo"
              className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-92"
            >
              Request demo
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-12 px-6 pb-16 pt-20 lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)] lg:px-8 lg:pb-20 lg:pt-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-xs font-medium text-[var(--foreground-muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />
              Built for serious teams that need execution clarity, not admin overhead
            </div>

            <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-tight text-[var(--foreground)] md:text-6xl">
              Turn company strategy into
              <span className="block bg-[linear-gradient(135deg,var(--foreground)_0%,#9b8cff_38%,#64dcff_100%)] bg-clip-text text-transparent">
                measurable execution with AI.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--foreground-muted)]">
              ALAMIN helps companies define goals, generate measurable OKRs, map Jobs-To-Be-Done,
              assign real work, and evaluate performance from one workspace instead of spreadsheets,
              status decks, and scattered follow-ups.
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/demo"
                className="inline-flex h-[52px] items-center justify-center rounded-full bg-[var(--foreground)] px-7 text-sm font-semibold text-[var(--background)] transition hover:opacity-92"
              >
                Request a demo
              </Link>
              <a
                href="#pricing"
                className="inline-flex h-[52px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-7 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
              >
                See pricing in SAR
              </a>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <MetricChip value="10x" label="less manual planning" />
              <MetricChip value="1" label="workspace for goals to execution" />
              <MetricChip value="AI" label="built into every workflow" />
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 rounded-[30px] bg-[linear-gradient(135deg,rgba(109,94,252,0.18),rgba(55,207,255,0.08))] blur-2xl" />
            <div className="relative overflow-hidden rounded-[30px] border border-[var(--border-strong)] bg-[var(--background-panel)] p-5 alamin-glow">
              <div className="rounded-[24px] border border-[var(--border)] bg-[var(--background-elevated)] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--foreground-faint)]">
                      AI command preview
                    </div>
                    <div className="mt-2 text-lg font-semibold text-[var(--foreground)]">
                      Execution health is slipping in Sales
                    </div>
                  </div>
                  <div className="rounded-full border border-amber-400/20 bg-amber-400/12 px-3 py-1 text-xs font-semibold text-amber-300">
                    At risk
                  </div>
                </div>

                <div className="mt-5 grid gap-4">
                  <PreviewCard
                    label="Objective"
                    title="Increase qualified pipeline conversion"
                    body="AI generated from KPI performance and sales execution inputs."
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <PreviewCard
                      label="Key result"
                      title="Improve MQL to SQL conversion from 18% to 27%"
                      body="Owner: Head of Sales · Linked to pipeline KPI"
                    />
                    <PreviewCard
                      label="JTBD cluster"
                      title="Fix lead qualification handoff"
                      body="Create shared rules, reduce low-quality lead routing, assign weekly review owner."
                    />
                  </div>

                  <div className="rounded-[20px] border border-[var(--border)] bg-[var(--card-subtle)] p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                          Next actions
                        </div>
                        <div className="mt-2 text-sm text-[var(--foreground-muted)]">
                          Generate tasks, assign owners, and publish the action plan to the Sales
                          department.
                        </div>
                      </div>
                      <div className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--background)]">
                        Review
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            <ValueCard
              title="From KPI input to action"
              desc="Capture performance signals once, then let the product generate the strategic and operational structure around them."
            />
            <ValueCard
              title="Made for leadership and teams"
              desc="Executives get decision clarity. Departments get ownership, priorities, and execution visibility."
            />
            <ValueCard
              title="No spreadsheet theater"
              desc="Replace fragmented planning decks, manual OKR rewrites, and scattered follow-up work with one execution layer."
            />
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-6 py-[72px] lg:px-8">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--foreground-faint)]">
              Features
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--foreground)] md:text-4xl">
              Built to connect strategy, execution, and evaluation.
            </h2>
            <p className="mt-4 text-base leading-7 text-[var(--foreground-muted)]">
              ALAMIN is not another reporting dashboard. It is the layer that connects KPI
              signals, strategic goals, work ownership, and AI recommendations in one product.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {features.map((feature) => (
              <FeatureCard key={feature.title} title={feature.title} desc={feature.desc} />
            ))}
          </div>
        </section>

        <section id="security" className="mx-auto max-w-7xl px-6 py-6 lg:px-8">
          <div className="overflow-hidden rounded-[30px] border border-[var(--border-strong)] bg-[var(--background-panel)] p-8 alamin-shadow md:p-10">
            <div className="grid gap-8 md:grid-cols-[1.15fr_0.85fr] md:items-center">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--foreground-faint)]">
                  Security
                </div>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--foreground)]">
                  Built for serious B2B use.
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--foreground-muted)]">
                  Tenant isolation, role-ready access control, Supabase RLS compatibility, and a
                  structure designed for organization-safe data access. Keep service role keys on
                  the server where they belong. Not in the browser. Not in client code.
                </p>
              </div>

              <div className="grid gap-3">
                <SecurityItem
                  title="Tenant-safe architecture"
                  desc="Separate organizations, scoped data, predictable routing."
                />
                <SecurityItem
                  title="Role-ready permissions"
                  desc="Support owner, admin, manager, department, and employee visibility."
                />
                <SecurityItem
                  title="Server-side secrets only"
                  desc="Sensitive keys stay out of client bundles and browser sessions."
                />
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-7xl px-6 pb-[88px] pt-[72px] lg:px-8">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--foreground-faint)]">
              Pricing
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--foreground)] md:text-4xl">
              Our pricing Plans.
            </h2>
            <p className="mt-4 text-base leading-7 text-[var(--foreground-muted)]">
              Pricing is seat-based.
              
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {tiers.map((tier) => (
              <PriceCard key={tier.title} {...tier} />
            ))}
          </div>

          <div className="mt-8 rounded-[22px] border border-[var(--border)] bg-[var(--button-secondary-bg)] p-5 text-sm text-[var(--foreground-muted)]">
            You can request a demo at any time, and our team will make sure to reach out.
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-10 lg:px-8">
          <div className="overflow-hidden rounded-[30px] border border-[var(--border-strong)] bg-[var(--background-panel)] p-8 alamin-shadow md:p-10">
            <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-center">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--foreground-faint)]">
                  Request a demo
                </div>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--foreground)] md:text-4xl">
                  See how ALAMIN fits your company before rollout.
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--foreground-muted)]">
                  Book a demo to walk through your KPI structure, execution model, reporting needs,
                  and rollout scope. This is the entry point for new customers.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row md:justify-end">
                <Link
                  href="app/demo/page.tsx"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--foreground)] px-6 text-sm font-semibold text-[var(--background)] transition hover:opacity-92"
                >
                  Request demo
                </Link>
                <Link
                  href="/auth"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-6 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
                >
                  Existing customer login
                </Link>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-[var(--border)] py-10">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 text-sm text-[var(--foreground-muted)] md:flex-row md:items-center md:justify-between lg:px-8">
            <div>© {new Date().getFullYear()} ALAMIN. AI Performance Intelligence.</div>
            <div className="flex gap-5">
              <Link href="/auth" className="transition hover:text-[var(--foreground)]">
                Login
              </Link>
              <Link href="/demo" className="transition hover:text-[var(--foreground)]">
                Request demo
              </Link>
              <a href="#pricing" className="transition hover:text-[var(--foreground)]">
                Pricing
              </a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

function MetricChip({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[22px] border border-[var(--border)] bg-[var(--card)] px-5 py-4 alamin-shadow">
      <div className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
        {value}
      </div>
      <div className="mt-1 text-sm text-[var(--foreground-muted)]">{label}</div>
    </div>
  );
}

function ValueCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-6 alamin-card-hover alamin-shadow">
      <div className="text-lg font-semibold text-[var(--foreground)]">{title}</div>
      <div className="mt-3 text-sm leading-7 text-[var(--foreground-muted)]">{desc}</div>
    </div>
  );
}

function PreviewCard({
  label,
  title,
  body,
}: {
  label: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[20px] border border-[var(--border)] bg-[var(--card-subtle)] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--foreground-faint)]">
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-[var(--foreground)]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[var(--foreground-muted)]">{body}</div>
    </div>
  );
}

function FeatureCard({ title, desc }: Feature) {
  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-6 alamin-card-hover">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)]">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          className="text-[var(--foreground-soft)]"
        >
          <path
            d="M12 3L19 7V17L12 21L5 17V7L12 3Z"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <path
            d="M12 7V12L16 14"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="mt-5 text-lg font-semibold text-[var(--foreground)]">{title}</div>
      <div className="mt-3 text-sm leading-7 text-[var(--foreground-muted)]">{desc}</div>
    </div>
  );
}

function SecurityItem({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="text-sm font-semibold text-[var(--foreground)]">{title}</div>
      <div className="mt-1 text-sm leading-6 text-[var(--foreground-muted)]">{desc}</div>
    </div>
  );
}

function PriceCard({
  title,
  price,
  subtitle,
  bullets,
  cta,
  href,
  highlight,
  badge,
}: PriceTier) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-[28px] border p-6 alamin-shadow",
        highlight
          ? "border-[var(--border-active)] bg-[linear-gradient(180deg,rgba(109,94,252,0.18),rgba(255,255,255,0.04))]"
          : "border-[var(--border)] bg-[var(--card)]",
      ].join(" ")}
    >
      {badge ? (
        <div className="absolute right-4 top-4 rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground-soft)]">
          {badge}
        </div>
      ) : null}

      <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
        {title}
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight text-[var(--foreground)]">
        {price}
      </div>
      <div className="mt-3 min-h-[72px] text-sm leading-6 text-[var(--foreground-muted)]">
        {subtitle}
      </div>

      <ul className="mt-6 space-y-3 text-sm text-[var(--foreground-soft)]">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex gap-3">
            <span className="mt-1 h-2 w-2 rounded-full bg-[var(--accent-2)]" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <Link
          href={href}
          className={[
            "inline-flex h-12 w-full items-center justify-center rounded-full text-sm font-semibold transition",
            highlight
              ? "bg-[var(--foreground)] text-[var(--background)] hover:opacity-92"
              : "border border-[var(--border)] bg-[var(--button-secondary-bg)] text-[var(--foreground)] hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]",
          ].join(" ")}
        >
          {cta}
        </Link>
      </div>
    </div>
  );
}