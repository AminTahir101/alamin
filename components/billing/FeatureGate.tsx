"use client";

import type { ReactNode } from "react";
import type { FeatureKey } from "@/lib/billing/features";
import { useEntitlement } from "@/lib/billing/useEntitlements";
import LockedFeatureCard from "@/components/billing/LockedFeatureCard";

type FeatureGateProps = {
  slug: string;
  feature: FeatureKey;
  children: ReactNode;
  fallback?: ReactNode;
};

export default function FeatureGate({
  slug,
  feature,
  children,
  fallback,
}: FeatureGateProps) {
  const { loading, hasFeature } = useEntitlement(slug);

  if (loading) {
    return <div className="h-40 animate-pulse rounded-[24px] border border-white/10 bg-white/5" />;
  }

  if (!hasFeature(feature)) {
    return <>{fallback ?? <LockedFeatureCard feature={feature} />}</>;
  }

  return <>{children}</>;
}