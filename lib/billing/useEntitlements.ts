"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { FeatureKey, PlanCode } from "@/lib/billing/features";

type EntitlementsResponse = {
  ok: boolean;
  plan?: PlanCode;
  features?: FeatureKey[];
  featureMap?: Record<
    string,
    {
      enabled: boolean;
      limitValue: number | null;
      source: "plan" | "override";
    }
  >;
  allowed?: boolean;
  error?: string;
};

export function useEntitlement(slug: string) {
  const [plan, setPlan] = useState<PlanCode>("core");
  const [features, setFeatures] = useState<FeatureKey[]>([]);
  const [featureMap, setFeatureMap] = useState<
    Record<
      string,
      {
        enabled: boolean;
        limitValue: number | null;
        source: "plan" | "override";
      }
    >
  >({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);

        const { data } = await supabase.auth.getSession();
        const session = data.session;

        const res = await fetch(`/api/o/${encodeURIComponent(slug)}/entitlements`, {
          method: "GET",
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : undefined,
          cache: "no-store",
        });

        const json = (await res.json()) as EntitlementsResponse;

        if (!active) return;

        if (json.ok) {
          setPlan(json.plan ?? "core");
          setFeatures(Array.isArray(json.features) ? json.features : []);
          setFeatureMap(json.featureMap ?? {});
        } else {
          setPlan("core");
          setFeatures([]);
          setFeatureMap({});
        }
      } catch {
        if (!active) return;
        setPlan("core");
        setFeatures([]);
        setFeatureMap({});
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    if (slug) {
      void load();
    } else {
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [slug]);

  const hasFeature = useCallback(
    (feature: FeatureKey) => {
      return features.includes(feature);
    },
    [features]
  );

  const getLimitValue = useCallback(
    (feature: FeatureKey) => {
      return featureMap[feature]?.limitValue ?? null;
    },
    [featureMap]
  );

  return useMemo(
    () => ({
      plan,
      features,
      featureMap,
      loading,
      hasFeature,
      getLimitValue,
    }),
    [plan, features, featureMap, loading, hasFeature, getLimitValue]
  );
}