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
    subtitle: "For teams getting started with structured execution.",
    bullets: [
      "KPI, Objectives, and OKRs",
      "Basic AI generation",
      "Department ownership",
      "Execution tracking",
      "Standard dashboards",
    ],
    cta: "Get started",
  },
  {
    title: "Growth",
    price: "50 SAR / seat / month",
    subtitle: "For companies that need full execution visibility and control.",
    bullets: [
      "Everything in Core",
      "Advanced AI recommendations and evaluations",
      "JTBD mapping and task orchestration",
      "Cross-department visibility",
      "Approvals and workflows",
      "Priority support",
    ],
    cta: "Choose Growth",
    highlight: true,
    badge: "Most popular",
  },
  {
    title: "Enterprise",
    price: "Contact Sales",
    subtitle: "For large organizations with custom requirements.",
    bullets: [
      "Unlimited scale",
      "Custom onboarding and rollout",
      "Advanced permissions and controls",
      "Dedicated support and SLA",
      "Custom integrations and deployment",
    ],
    cta: "Contact sales",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#07090D] text-white">
      <div className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.28),transparent_38%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.14),transparent_28%)]" />

      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07090D]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_0_1px_rgba(124,58,237,0.12),0_14px_30px_rgba(0,0,0,0.35)]">
              <div className="h-5 w-5 rounded-full bg-[linear-gradient(135deg,#7C3AED_0%,#22D3EE_100%)]" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-[0.22em] text-white/60">ALAMIN</div>
              <div className="text-sm text-white/80">AI Performance Intelligence</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-white/70 md:flex">
            <a href="#features" className="transition hover:text-white">
              Features
            </a>
            <a href="#security" className="transition hover:text-white">
              Security
            </a>
            <a href="#pricing" className="transition hover:text-white">
              Pricing
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/auth"
              className="inline-flex h-11 items-center justify-center rounded-full border border-white/12 bg-white/5 px-5 text-sm font-medium text-white/90 transition hover:border-white/20 hover:bg-white/8"
            >
              Log in
            </Link>
            <Link
              href="/auth"
              className="inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-[#07090D] transition hover:bg-white/90"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-12 px-6 pt-20 pb-16 lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)] lg:px-8 lg:pt-24 lg:pb-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70">
              <span className="h-2 w-2 rounded-full bg-[#22D3EE]" />
              Built for teams that need execution clarity, not more admin work
            </div>

            <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-tight text-white md:text-6xl">
              Turn company strategy into
              <span className="block bg-[linear-gradient(135deg,#FFFFFF_0%,#B69CFF_38%,#7DE7F3_100%)] bg-clip-text text-transparent">
                measurable execution with AI.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/68">
              ALAMIN helps companies define goals, generate measurable OKRs, map Jobs-To-Be-Done,
              assign real work, and evaluate performance from one workspace instead of spreadsheets,
              status decks, and scattered follow-ups.
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/auth"
                className="inline-flex h-13 items-center justify-center rounded-full bg-white px-7 text-sm font-semibold text-[#07090D] transition hover:bg-white/90"
              >
                Get started
              </Link>
              <a
                href="#pricing"
                className="inline-flex h-13 items-center justify-center rounded-full border border-white/14 bg-white/5 px-7 text-sm font-semibold text-white transition hover:border-white/22 hover:bg-white/8"
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
            <div className="absolute inset-0 rounded-[28px] bg-[linear-gradient(135deg,rgba(124,58,237,0.22),rgba(34,211,238,0.08))] blur-2xl" />
            <div className="relative overflow-hidden rounded-[28px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 shadow-[0_0_0_1px_rgba(124,58,237,0.12),0_24px_80px_rgba(0,0,0,0.45)]">
              <div className="rounded-[22px] border border-white/10 bg-[#0D1118] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.22em] text-white/40">
                      AI command preview
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      Execution health is slipping in Sales
                    </div>
                  </div>
                  <div className="rounded-full border border-[#F59E0B]/20 bg-[#F59E0B]/12 px-3 py-1 text-xs font-semibold text-[#F7C15D]">
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

                  <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-[0.18em] text-white/40">
                          Next actions
                        </div>
                        <div className="mt-2 text-sm text-white/75">
                          Generate tasks, assign owners, and publish the action plan to the Sales department.
                        </div>
                      </div>
                      <div className="inline-flex h-10 items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-[#07090D]">
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

        <section id="features" className="mx-auto max-w-7xl px-6 py-18 lg:px-8">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/40">
              Features
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Built to connect strategy, execution, and evaluation.
            </h2>
            <p className="mt-4 text-base leading-7 text-white/65">
              ALAMIN is not another reporting dashboard. It is the layer that connects KPI signals,
              strategic goals, work ownership, and AI recommendations in one product.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {features.map((feature) => (
              <FeatureCard key={feature.title} title={feature.title} desc={feature.desc} />
            ))}
          </div>
        </section>

        <section id="security" className="mx-auto max-w-7xl px-6 py-6 lg:px-8">
          <div className="overflow-hidden rounded-[28px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-8 shadow-[0_18px_50px_rgba(0,0,0,0.35)] md:p-10">
            <div className="grid gap-8 md:grid-cols-[1.15fr_0.85fr] md:items-center">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/40">
                  Security
                </div>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                  Built for serious B2B use.
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-white/65">
                  Tenant isolation, role-ready access control, Supabase RLS compatibility, and a structure
                  designed for organization-safe data access. Keep service role keys on the server where
                  they belong. Not in the browser. Not in client code.
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

        <section id="pricing" className="mx-auto max-w-7xl px-6 pt-18 pb-22 lg:px-8">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/40">
              Pricing
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Straightforward pricing in SAR.
            </h2>
            <p className="mt-4 text-base leading-7 text-white/65">
              Pricing built for Saudi teams and global scale. Simple per-seat pricing. No hidden tiers.
              Pay only for active users.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {tiers.map((tier) => (
              <PriceCard key={tier.title} {...tier} />
            ))}
          </div>

          <div className="mt-8 rounded-[22px] border border-white/10 bg-white/5 p-5 text-sm text-white/62">
            Annual billing can be offered later. For now, keep it simple: monthly pricing in SAR,
            per-seat clarity, and enterprise handled through sales.
          </div>
        </section>

        <footer className="border-t border-white/10 py-10">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 text-sm text-white/55 md:flex-row md:items-center md:justify-between lg:px-8">
            <div>© {new Date().getFullYear()} ALAMIN. AI Performance Intelligence.</div>
            <div className="flex gap-5">
              <Link href="/auth" className="transition hover:text-white">
                Login
              </Link>
              <a href="#features" className="transition hover:text-white">
                Features
              </a>
              <a href="#pricing" className="transition hover:text-white">
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
    <div className="rounded-[20px] border border-white/10 bg-white/[0.04] px-5 py-4 shadow-[0_14px_30px_rgba(0,0,0,0.22)]">
      <div className="text-2xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-1 text-sm text-white/58">{label}</div>
    </div>
  );
}

function ValueCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-6 shadow-[0_16px_36px_rgba(0,0,0,0.22)]">
      <div className="text-lg font-semibold text-white">{title}</div>
      <div className="mt-3 text-sm leading-7 text-white/62">{desc}</div>
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
    <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm leading-6 text-white/62">{body}</div>
    </div>
  );
}

function FeatureCard({ title, desc }: Feature) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-6 transition hover:-translate-y-0.5 hover:border-white/16 hover:bg-white/[0.05]">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white/90">
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
      <div className="mt-5 text-lg font-semibold text-white">{title}</div>
      <div className="mt-3 text-sm leading-7 text-white/62">{desc}</div>
    </div>
  );
}

function SecurityItem({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.035] p-4">
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 text-sm leading-6 text-white/62">{desc}</div>
    </div>
  );
}

function PriceCard({
  title,
  price,
  subtitle,
  bullets,
  cta,
  highlight,
  badge,
}: PriceTier) {
  const href = title === "Enterprise" ? "/contact" : "/auth";

  return (
    <div
      className={[
        "relative overflow-hidden rounded-[28px] border p-6 shadow-[0_20px_40px_rgba(0,0,0,0.28)]",
        highlight
          ? "border-[#A78BFA]/35 bg-[linear-gradient(180deg,rgba(124,58,237,0.2),rgba(255,255,255,0.06))]"
          : "border-white/10 bg-white/[0.04]",
      ].join(" ")}
    >
      {badge ? (
        <div className="absolute top-4 right-4 rounded-full border border-white/14 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80">
          {badge}
        </div>
      ) : null}

      <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">{title}</div>
      <div className="mt-4 text-3xl font-semibold tracking-tight text-white">{price}</div>
      <div className="mt-3 min-h-[52px] text-sm leading-6 text-white/62">{subtitle}</div>

      <ul className="mt-6 space-y-3 text-sm text-white/72">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex gap-3">
            <span className="mt-1 h-2 w-2 rounded-full bg-[#22D3EE]" />
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
              ? "bg-white text-[#07090D] hover:bg-white/92"
              : "border border-white/14 bg-white/[0.04] text-white hover:border-white/22 hover:bg-white/[0.08]",
          ].join(" ")}
        >
          {cta}
        </Link>
      </div>
    </div>
  );
}