"use client";

import type { ReactNode } from "react";
import type { FeatureKey } from "@/lib/billing/features";
import FeatureGate from "@/components/billing/FeatureGate";

type PageGuardProps = {
  slug: string;
  feature: FeatureKey;
  children: ReactNode;
  fallback?: ReactNode;
};

export default function PageGuard({
  slug,
  feature,
  children,
  fallback,
}: PageGuardProps) {
  return (
    <FeatureGate slug={slug} feature={feature} fallback={fallback}>
      {children}
    </FeatureGate>
  );
}