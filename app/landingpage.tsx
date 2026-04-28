"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";

const TIER_CONFIG = [
  { href: "/demo", highlight: false },
  { href: "/demo", highlight: true },
  { href: "/demo", highlight: false },
] as const;

export default function LandingPage() {
  const { t } = useLanguage();
  const lp = t.landing;

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
              <div className="text-sm text-[var(--foreground-muted)]">{t.brand.tagline}</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-[var(--foreground-muted)] md:flex">
            <a href="#features" className="transition hover:text-[var(--foreground)]">
              {t.nav.features}
            </a>
            <a href="#security" className="transition hover:text-[var(--foreground)]">
              {t.nav.security}
            </a>
            <a href="#pricing" className="transition hover:text-[var(--foreground)]">
              {t.nav.pricing}
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              href="/auth"
              className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-medium text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
            >
              {t.nav.login}
            </Link>
            <Link
              href="/demo"
              className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-92"
            >
              {t.nav.requestDemo}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-12 px-6 pb-16 pt-20 lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)] lg:px-8 lg:pb-20 lg:pt-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-xs font-medium text-[var(--foreground-muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />
              {lp.badge}
            </div>

            <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-tight text-[var(--foreground)] md:text-6xl">
              {lp.hero.h1}
              <span className="block bg-[linear-gradient(135deg,var(--foreground)_0%,#9b8cff_38%,#64dcff_100%)] bg-clip-text text-transparent">
                {lp.hero.h1Gradient}
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--foreground-muted)]">
              {lp.hero.body}
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/demo"
                className="inline-flex h-[52px] items-center justify-center rounded-full bg-[var(--foreground)] px-7 text-sm font-semibold text-[var(--background)] transition hover:opacity-92"
              >
                {lp.hero.ctaPrimary}
              </Link>
              <a
                href="#pricing"
                className="inline-flex h-[52px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-7 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
              >
                {lp.hero.ctaSecondary}
              </a>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {lp.metrics.map((m) => (
                <MetricChip key={m.value + m.label} value={m.value} label={m.label} />
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 rounded-[30px] bg-[linear-gradient(135deg,rgba(109,94,252,0.18),rgba(55,207,255,0.08))] blur-2xl" />
            <div className="relative overflow-hidden rounded-[30px] border border-[var(--border-strong)] bg-[var(--background-panel)] p-5 alamin-glow">
              <div className="rounded-[24px] border border-[var(--border)] bg-[var(--background-elevated)] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--foreground-faint)]">
                      {lp.preview.eyebrow}
                    </div>
                    <div className="mt-2 text-lg font-semibold text-[var(--foreground)]">
                      {lp.preview.title}
                    </div>
                  </div>
                  <div className="rounded-full border border-amber-400/20 bg-amber-400/12 px-3 py-1 text-xs font-semibold text-amber-300">
                    {lp.preview.badge}
                  </div>
                </div>

                <div className="mt-5 grid gap-4">
                  <PreviewCard
                    label={lp.preview.objective.label}
                    title={lp.preview.objective.title}
                    body={lp.preview.objective.body}
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <PreviewCard
                      label={lp.preview.keyResult.label}
                      title={lp.preview.keyResult.title}
                      body={lp.preview.keyResult.body}
                    />
                    <PreviewCard
                      label={lp.preview.jtbd.label}
                      title={lp.preview.jtbd.title}
                      body={lp.preview.jtbd.body}
                    />
                  </div>

                  <div className="rounded-[20px] border border-[var(--border)] bg-[var(--card-subtle)] p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                          {lp.preview.nextActions.eyebrow}
                        </div>
                        <div className="mt-2 text-sm text-[var(--foreground-muted)]">
                          {lp.preview.nextActions.body}
                        </div>
                      </div>
                      <div className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--background)]">
                        {lp.preview.nextActions.cta}
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
            {lp.valueCards.map((vc) => (
              <ValueCard key={vc.title} title={vc.title} desc={vc.desc} />
            ))}
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-6 py-[72px] lg:px-8">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--foreground-faint)]">
              {lp.features.eyebrow}
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--foreground)] md:text-4xl">
              {lp.features.heading}
            </h2>
            <p className="mt-4 text-base leading-7 text-[var(--foreground-muted)]">
              {lp.features.body}
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {lp.features.items.map((feature) => (
              <FeatureCard key={feature.title} title={feature.title} desc={feature.desc} />
            ))}
          </div>
        </section>

        <section id="security" className="mx-auto max-w-7xl px-6 py-6 lg:px-8">
          <div className="overflow-hidden rounded-[30px] border border-[var(--border-strong)] bg-[var(--background-panel)] p-8 alamin-shadow md:p-10">
            <div className="grid gap-8 md:grid-cols-[1.15fr_0.85fr] md:items-center">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--foreground-faint)]">
                  {lp.security.eyebrow}
                </div>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--foreground)]">
                  {lp.security.heading}
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--foreground-muted)]">
                  {lp.security.body}
                </p>
              </div>

              <div className="grid gap-3">
                {lp.security.items.map((item) => (
                  <SecurityItem key={item.title} title={item.title} desc={item.desc} />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-7xl px-6 pb-[88px] pt-[72px] lg:px-8">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--foreground-faint)]">
              {lp.pricing.eyebrow}
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--foreground)] md:text-4xl">
              {lp.pricing.heading}
            </h2>
            <p className="mt-4 text-base leading-7 text-[var(--foreground-muted)]">
              {lp.pricing.body}
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {lp.pricing.tiers.map((tier, i) => (
              <PriceCard
                key={tier.title}
                title={tier.title}
                price={tier.price}
                subtitle={tier.subtitle}
                bullets={[...tier.bullets]}
                cta={tier.cta}
                href={TIER_CONFIG[i].href}
                highlight={TIER_CONFIG[i].highlight}
                badge={tier.badge}
              />
            ))}
          </div>

          <div className="mt-8 rounded-[22px] border border-[var(--border)] bg-[var(--button-secondary-bg)] p-5 text-sm text-[var(--foreground-muted)]">
            {lp.pricing.note}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-10 lg:px-8">
          <div className="overflow-hidden rounded-[30px] border border-[var(--border-strong)] bg-[var(--background-panel)] p-8 alamin-shadow md:p-10">
            <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-center">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--foreground-faint)]">
                  {lp.demo.eyebrow}
                </div>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--foreground)] md:text-4xl">
                  {lp.demo.heading}
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--foreground-muted)]">
                  {lp.demo.body}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row md:justify-end">
                <Link
                  href="/demo"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--foreground)] px-6 text-sm font-semibold text-[var(--background)] transition hover:opacity-92"
                >
                  {lp.demo.ctaPrimary}
                </Link>
                <Link
                  href="/auth"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-6 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
                >
                  {lp.demo.ctaSecondary}
                </Link>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-[var(--border)] py-10">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 text-sm text-[var(--foreground-muted)] md:flex-row md:items-center md:justify-between lg:px-8">
            <div>
              © {new Date().getFullYear()} {lp.footer.copyrightBrand}
            </div>
            <div className="flex gap-5">
              <Link href="/auth" className="transition hover:text-[var(--foreground)]">
                {lp.footer.links.login}
              </Link>
              <Link href="/demo" className="transition hover:text-[var(--foreground)]">
                {lp.footer.links.requestDemo}
              </Link>
              <a href="#pricing" className="transition hover:text-[var(--foreground)]">
                {lp.footer.links.pricing}
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
      <div className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">{value}</div>
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

function PreviewCard({ label, title, body }: { label: string; title: string; body: string }) {
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

function FeatureCard({ title, desc }: { title: string; desc: string }) {
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
}: {
  title: string;
  price: string;
  subtitle: string;
  bullets: string[];
  cta: string;
  href: string;
  highlight?: boolean;
  badge?: string;
}) {
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
