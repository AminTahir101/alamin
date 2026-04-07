"use client";

import Link from "next/link";
import type { FeatureKey } from "@/lib/billing/features";

const featureLabels: Record<FeatureKey, string> = {
  dashboard: "Dashboard",
  your_ai_basic: "Your AI",
  your_ai_advanced: "Advanced AI",
  objectives: "Objectives",
  okrs: "OKRs",
  kpis: "KPIs",
  tasks: "Tasks",
  reports: "Reports",
  jtbd: "JTBD",
  my_work: "My Work",
  departments: "Departments",
  settings: "Settings",
  onboarding: "Onboarding",
  cross_department_visibility: "Cross-department visibility",
  advanced_exports: "Advanced exports",
  custom_features: "Custom features",
  custom_workflows: "Custom workflows",
  custom_integrations: "Custom integrations",
  advanced_reporting_customization: "Advanced reporting customization",
  enterprise_governance: "Enterprise governance",
};

type LockedFeatureCardProps = {
  feature: FeatureKey;
  title?: string;
  description?: string;
};

export default function LockedFeatureCard({
  feature,
  title,
  description,
}: LockedFeatureCardProps) {
  const label = featureLabels[feature] ?? feature;

  return (
    <div className="rounded-[28px] border border-amber-400/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.12),rgba(255,255,255,0.03))] p-6">
      <div className="inline-flex items-center rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100">
        Upgrade required
      </div>

      <h2 className="mt-4 text-2xl font-black tracking-[-0.03em] text-white">
        {title ?? `${label} is not included in your current plan`}
      </h2>

      <p className="mt-3 max-w-2xl text-sm leading-7 text-white/65">
        {description ??
          `This module is visible so your team can see what unlocks on higher plans, but access is restricted until the workspace subscription is upgraded.`}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/demo"
          className="inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-black transition hover:opacity-90"
        >
          Upgrade or request demo
        </Link>

        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-full border border-white/12 bg-white/5 px-5 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          View plans
        </Link>
      </div>
    </div>
  );
}