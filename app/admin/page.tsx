"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import type { FeatureKey, PlanCode } from "@/lib/billing/features";

type OrganizationRow = {
  id: string;
  slug: string;
  name: string;
  createdAt: string | null;
  planCode: PlanCode;
  status: string;
  seats: number;
  startsAt: string | null;
  updatedAt: string | null;
};

type OrganizationsResponse = {
  ok: boolean;
  organizations?: OrganizationRow[];
  error?: string;
};

type OverridesResponse = {
  ok: boolean;
  features?: FeatureKey[];
  overrides?: Array<{
    id: string;
    feature_code: FeatureKey;
    is_enabled: boolean;
    limit_value: number | null;
    reason: string | null;
    updated_at: string | null;
  }>;
  error?: string;
};

type CreateResponse = {
  ok: boolean;
  organization?: { id: string; slug: string; name: string };
  message?: string;
  error?: string;
};

type BasicApiResponse = {
  ok: boolean;
  message?: string;
  error?: string;
};

type DebugState = {
  lastAction: string;
  selectedOrgId: string;
  selectedOrgName: string;
  selectedOrgSlug: string;
  persistedOrgId: string;
  orgCount: number;
  lastOrganizationsPayload: string;
  lastRequestUrl: string;
  lastRequestBody: string;
  lastResponse: string;
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

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function getStorageKey(email: string | null) {
  const safeEmail = String(email ?? "anonymous").trim().toLowerCase();
  return `alamin-admin-selected-org:${safeEmail}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function stringifySafe(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AdminDashboardPage() {
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  const [selectedPlan, setSelectedPlan] = useState<PlanCode>("core");
  const [selectedStatus, setSelectedStatus] = useState("active");
  const [selectedSeats, setSelectedSeats] = useState<number>(25);

  const [features, setFeatures] = useState<FeatureKey[]>([]);
  const [overrides, setOverrides] = useState<
    Array<{
      id: string;
      feature_code: FeatureKey;
      is_enabled: boolean;
      limit_value: number | null;
      reason: string | null;
      updated_at: string | null;
    }>
  >([]);

  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createOwnerEmail, setCreateOwnerEmail] = useState("");
  const [createPlan, setCreatePlan] = useState<PlanCode>("core");
  const [createSeats, setCreateSeats] = useState<number>(25);

  const [overrideFeature, setOverrideFeature] = useState<FeatureKey | "">("");
  const [overrideEnabled, setOverrideEnabled] = useState(true);
  const [overrideLimitValue, setOverrideLimitValue] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const [showDebug, setShowDebug] = useState(true);
  const [debug, setDebug] = useState<DebugState>({
    lastAction: "init",
    selectedOrgId: "",
    selectedOrgName: "",
    selectedOrgSlug: "",
    persistedOrgId: "",
    orgCount: 0,
    lastOrganizationsPayload: "",
    lastRequestUrl: "",
    lastRequestBody: "",
    lastResponse: "",
  });

  const selectedOrg = useMemo(
    () => organizations.find((org) => org.id === selectedOrgId) ?? null,
    [organizations, selectedOrgId]
  );

  const clearNotices = () => {
    setMsg(null);
    setSuccess(null);
  };

  const pushDebug = useCallback((patch: Partial<DebugState>) => {
    setDebug((prev) => ({ ...prev, ...patch }));
  }, []);

  const withAuth = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;

    setSessionEmail(session?.user?.email ?? null);

    if (!session) {
      throw new Error("You must be logged in");
    }

    return {
      token: session.access_token,
      email: session.user.email ?? null,
    };
  }, []);

  const persistSelectedOrgId = useCallback(
    (email: string | null, orgId: string) => {
      if (typeof window === "undefined") return;
      if (!orgId) return;

      try {
        window.localStorage.setItem(getStorageKey(email), orgId);
      } catch {
        // ignore
      }
    },
    []
  );

  const readPersistedSelectedOrgId = useCallback((email: string | null) => {
    if (typeof window === "undefined") return "";

    try {
      return window.localStorage.getItem(getStorageKey(email)) ?? "";
    } catch {
      return "";
    }
  }, []);

  const syncSelectedOrgState = useCallback(
    (rows: OrganizationRow[], preferredOrgId?: string | null, email?: string | null) => {
      if (!rows.length) {
        setSelectedOrgId("");
        pushDebug({
          lastAction: "syncSelectedOrgState:no-rows",
          selectedOrgId: "",
          selectedOrgName: "",
          selectedOrgSlug: "",
          persistedOrgId: "",
          orgCount: 0,
        });
        return;
      }

      const persisted = readPersistedSelectedOrgId(email ?? sessionEmail);

      const validPreferred =
        preferredOrgId && rows.some((row) => row.id === preferredOrgId) ? preferredOrgId : "";

      const currentValid =
        selectedOrgId && rows.some((row) => row.id === selectedOrgId) ? selectedOrgId : "";

      const persistedValid =
        persisted && rows.some((row) => row.id === persisted) ? persisted : "";

      const nextOrgId = validPreferred || currentValid || persistedValid || rows[0].id;
      const match = rows.find((row) => row.id === nextOrgId) ?? rows[0];

      setSelectedOrgId(match.id);
      setSelectedPlan(match.planCode);
      setSelectedStatus(match.status);
      setSelectedSeats(match.seats);
      persistSelectedOrgId(email ?? sessionEmail, match.id);

      pushDebug({
        lastAction: "syncSelectedOrgState",
        selectedOrgId: match.id,
        selectedOrgName: match.name,
        selectedOrgSlug: match.slug,
        persistedOrgId: persisted,
        orgCount: rows.length,
      });
    },
    [
      persistSelectedOrgId,
      pushDebug,
      readPersistedSelectedOrgId,
      selectedOrgId,
      sessionEmail,
    ]
  );

  const loadOrganizations = useCallback(
    async (preferredOrgId?: string | null) => {
      const { token, email } = await withAuth();

      const url = "/api/admin/organizations";
      pushDebug({
        lastAction: "loadOrganizations:request",
        lastRequestUrl: url,
        lastRequestBody: "",
      });

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const json = (await res.json()) as OrganizationsResponse;

      pushDebug({
        lastAction: "loadOrganizations:response",
        lastResponse: stringifySafe(json),
      });

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to load organizations");
      }

      const rows = json.organizations ?? [];

      setOrganizations(rows);

      pushDebug({
        lastOrganizationsPayload: stringifySafe(rows),
        orgCount: rows.length,
      });

      syncSelectedOrgState(rows, preferredOrgId, email);
    },
    [pushDebug, syncSelectedOrgState, withAuth]
  );

  const loadOverrides = useCallback(
    async (orgId: string) => {
      if (!orgId || orgId === "undefined") {
        setFeatures([]);
        setOverrides([]);
        pushDebug({
          lastAction: "loadOverrides:skipped-invalid-org",
          selectedOrgId: orgId,
        });
        return;
      }

      const { token } = await withAuth();

      const url = `/api/admin/organizations/${encodeURIComponent(orgId)}/feature-overrides`;

      pushDebug({
        lastAction: "loadOverrides:request",
        lastRequestUrl: url,
        lastRequestBody: "",
      });

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const json = (await res.json()) as OverridesResponse;

      pushDebug({
        lastAction: "loadOverrides:response",
        lastResponse: stringifySafe(json),
      });

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to load feature overrides");
      }

      setFeatures((json.features ?? []) as FeatureKey[]);
      setOverrides(json.overrides ?? []);
    },
    [pushDebug, withAuth]
  );

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        setLoading(true);
        clearNotices();
        await loadOrganizations();
      } catch (e: unknown) {
        if (!active) return;
        setMsg(e instanceof Error ? e.message : "Failed to load admin dashboard");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [loadOrganizations]);

  useEffect(() => {
    if (!selectedOrgId || selectedOrgId === "undefined") return;

    const match = organizations.find((org) => org.id === selectedOrgId);
    if (match) {
      setSelectedPlan(match.planCode);
      setSelectedStatus(match.status);
      setSelectedSeats(match.seats);

      pushDebug({
        lastAction: "selectedOrg:changed",
        selectedOrgId: match.id,
        selectedOrgName: match.name,
        selectedOrgSlug: match.slug,
      });
    }

    void loadOverrides(selectedOrgId);
  }, [loadOverrides, organizations, pushDebug, selectedOrgId]);

  async function handleCreateOrganization(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearNotices();

    const safeName = createName.trim();
    const safeSlug = normalizeSlug(createSlug || createName);
    const safeOwnerEmail = createOwnerEmail.trim().toLowerCase();
    const safeSeats = Number(createSeats);

    if (!safeName) {
      setMsg("Organization name is required");
      return;
    }

    if (!safeSlug) {
      setMsg("Valid organization slug is required");
      return;
    }

    if (!Number.isFinite(safeSeats) || safeSeats <= 0) {
      setMsg("Seats must be greater than 0");
      return;
    }

    setSaving(true);

    try {
      const { token } = await withAuth();

      const url = "/api/admin/organizations";
      const body = {
        name: safeName,
        slug: safeSlug,
        ownerEmail: safeOwnerEmail || undefined,
        planCode: createPlan,
        seats: safeSeats,
      };

      pushDebug({
        lastAction: "createOrganization:request",
        lastRequestUrl: url,
        lastRequestBody: stringifySafe(body),
      });

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as CreateResponse;

      pushDebug({
        lastAction: "createOrganization:response",
        lastResponse: stringifySafe(json),
      });

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to create organization");
      }

      setSuccess(json.message ?? "Organization created");
      setCreateName("");
      setCreateSlug("");
      setCreateOwnerEmail("");
      setCreatePlan("core");
      setCreateSeats(25);

      const newOrgId = json.organization?.id ?? "";
      await loadOrganizations(newOrgId);

      if (newOrgId) {
        await loadOverrides(newOrgId);
      }
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Failed to create organization");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateSubscription() {
    clearNotices();

    if (!selectedOrgId || selectedOrgId === "undefined") {
      setMsg("Select an organization first");
      return;
    }

    if (!isUuid(selectedOrgId)) {
      setMsg(`Selected organization id is not a valid UUID: ${selectedOrgId}`);
      pushDebug({
        lastAction: "updateSubscription:invalid-selected-org-id",
        selectedOrgId,
      });
      return;
    }

    const safeSeats = Number(selectedSeats);
    if (!Number.isFinite(safeSeats) || safeSeats <= 0) {
      setMsg("Seats must be greater than 0");
      return;
    }

    setSaving(true);

    try {
      const { token } = await withAuth();

      const url = `/api/admin/organizations/${encodeURIComponent(selectedOrgId)}`;
      const body = {
        planCode: selectedPlan,
        status: selectedStatus,
        seats: safeSeats,
      };

      pushDebug({
        lastAction: "updateSubscription:request",
        lastRequestUrl: url,
        lastRequestBody: stringifySafe(body),
      });

      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as BasicApiResponse;

      pushDebug({
        lastAction: "updateSubscription:response",
        lastResponse: stringifySafe(json),
      });

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to update subscription");
      }

      setSuccess(json.message ?? "Subscription updated");
      await loadOrganizations(selectedOrgId);
      await loadOverrides(selectedOrgId);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Failed to update subscription");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveOverride() {
    clearNotices();

    if (!selectedOrgId || selectedOrgId === "undefined") {
      setMsg("Select an organization first");
      return;
    }

    if (!isUuid(selectedOrgId)) {
      setMsg(`Selected organization id is not a valid UUID: ${selectedOrgId}`);
      pushDebug({
        lastAction: "saveOverride:invalid-selected-org-id",
        selectedOrgId,
      });
      return;
    }

    if (!overrideFeature) {
      setMsg("Select a feature first");
      return;
    }

    const safeLimit =
      overrideLimitValue.trim() === "" ? null : Number(overrideLimitValue.trim());

    if (safeLimit !== null && (!Number.isFinite(safeLimit) || safeLimit < 0)) {
      setMsg("Limit value must be a valid number");
      return;
    }

    setSaving(true);

    try {
      const { token } = await withAuth();

      const url = `/api/admin/organizations/${encodeURIComponent(selectedOrgId)}/feature-overrides`;
      const body = {
        featureCode: overrideFeature,
        isEnabled: overrideEnabled,
        limitValue: safeLimit,
        reason: overrideReason.trim() || null,
      };

      pushDebug({
        lastAction: "saveOverride:request",
        lastRequestUrl: url,
        lastRequestBody: stringifySafe(body),
      });

      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as BasicApiResponse;

      pushDebug({
        lastAction: "saveOverride:response",
        lastResponse: stringifySafe(json),
      });

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to save override");
      }

      setSuccess(json.message ?? "Override saved");
      setOverrideFeature("");
      setOverrideEnabled(true);
      setOverrideLimitValue("");
      setOverrideReason("");
      await loadOverrides(selectedOrgId);
      await loadOrganizations(selectedOrgId);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Failed to save override");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteOverride(featureCode: FeatureKey) {
    clearNotices();

    if (!selectedOrgId || selectedOrgId === "undefined") {
      setMsg("Select an organization first");
      return;
    }

    if (!isUuid(selectedOrgId)) {
      setMsg(`Selected organization id is not a valid UUID: ${selectedOrgId}`);
      pushDebug({
        lastAction: "deleteOverride:invalid-selected-org-id",
        selectedOrgId,
      });
      return;
    }

    setSaving(true);

    try {
      const { token } = await withAuth();

      const url = `/api/admin/organizations/${encodeURIComponent(
        selectedOrgId
      )}/feature-overrides?featureCode=${encodeURIComponent(featureCode)}`;

      pushDebug({
        lastAction: "deleteOverride:request",
        lastRequestUrl: url,
        lastRequestBody: "",
      });

      const res = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = (await res.json()) as BasicApiResponse;

      pushDebug({
        lastAction: "deleteOverride:response",
        lastResponse: stringifySafe(json),
      });

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to remove override");
      }

      setSuccess(json.message ?? "Override removed");
      await loadOverrides(selectedOrgId);
      await loadOrganizations(selectedOrgId);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Failed to remove override");
    } finally {
      setSaving(false);
    }
  }

  function handleSelectOrganization(orgId: string) {
    clearNotices();

    pushDebug({
      lastAction: "handleSelectOrganization:clicked",
      selectedOrgId: String(orgId),
    });

    if (!orgId || orgId === "undefined") {
      setMsg("Invalid organization selected");
      return;
    }

    const match = organizations.find((org) => org.id === orgId);

    if (!match) {
      setMsg("Selected organization was not found in state");
      return;
    }

    setSelectedOrgId(match.id);
    persistSelectedOrgId(sessionEmail, match.id);

    setSelectedPlan(match.planCode);
    setSelectedStatus(match.status);
    setSelectedSeats(match.seats);

    pushDebug({
      lastAction: "handleSelectOrganization:selected",
      selectedOrgId: match.id,
      selectedOrgName: match.name,
      selectedOrgSlug: match.slug,
    });
  }

  function handleClearPersistedSelection() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(getStorageKey(sessionEmail));
      pushDebug({
        lastAction: "clearPersistedSelection",
        persistedOrgId: "",
      });
      setSuccess("Cleared persisted selected organization");
      void loadOrganizations();
    } catch {
      setMsg("Failed to clear persisted selection");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--foreground-faint)]">
              Internal admin
            </div>
            <h1 className="mt-3 text-5xl font-black tracking-[-0.04em] text-[var(--foreground)]">
              Admin dashboard
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--foreground-muted)]">
              Create organizations, manage plan tiers, update seats, control subscription status,
              and override feature access without touching SQL.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleClearPersistedSelection}
              className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-medium text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
            >
              Clear saved org
            </button>

            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-medium text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
            >
              Back to site
            </Link>
          </div>
        </div>

        <div className="mb-6 rounded-[20px] border border-[var(--border)] bg-[var(--card)] px-5 py-4 text-sm text-[var(--foreground-muted)]">
          Signed in as: <span className="font-semibold text-[var(--foreground)]">{sessionEmail ?? "—"}</span>
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

        <div className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
          <section className="rounded-[28px] border border-[var(--border-strong)] bg-[var(--background-panel)] p-6 alamin-shadow">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
              Create organization
            </div>
            <h2 className="mt-3 text-2xl font-bold text-[var(--foreground)]">New workspace</h2>

            <form onSubmit={handleCreateOrganization} className="mt-5 grid gap-4">
              <Field label="Organization name">
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Acme Holdings"
                  className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] focus:border-[var(--border-strong)]"
                />
              </Field>

              <Field label="Slug">
                <input
                  value={createSlug}
                  onChange={(e) => setCreateSlug(normalizeSlug(e.target.value))}
                  placeholder={normalizeSlug(createName) || "acme-holdings"}
                  className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] focus:border-[var(--border-strong)]"
                />
              </Field>

              <Field label="Owner email">
                <input
                  value={createOwnerEmail}
                  onChange={(e) => setCreateOwnerEmail(e.target.value)}
                  placeholder="owner@company.com"
                  className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] focus:border-[var(--border-strong)]"
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Plan">
                  <select
                    value={createPlan}
                    onChange={(e) => setCreatePlan(e.target.value as PlanCode)}
                    className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                  >
                    <option value="core">Core</option>
                    <option value="growth">Growth</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </Field>

                <Field label="Seats">
                  <input
                    type="number"
                    min={1}
                    value={createSeats}
                    onChange={(e) => setCreateSeats(Number(e.target.value))}
                    className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                  />
                </Field>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="mt-2 inline-flex h-12 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-92 disabled:opacity-60"
              >
                {saving ? "Creating..." : "Create organization"}
              </button>
            </form>
          </section>

          <section className="rounded-[28px] border border-[var(--border-strong)] bg-[var(--background-panel)] p-6 alamin-shadow">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                  Organizations
                </div>
                <h2 className="mt-3 text-2xl font-bold text-[var(--foreground)]">Workspace list</h2>
              </div>

              <button
                type="button"
                onClick={() => void loadOrganizations(selectedOrgId || null)}
                className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-medium text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
              >
                Refresh
              </button>
            </div>

            <div className="mt-5 overflow-hidden rounded-[22px] border border-[var(--border)]">
              <div className="max-h-[460px] overflow-auto">
                <table className="w-full min-w-[760px] border-collapse">
                  <thead className="bg-[var(--card)]">
                    <tr>
                      <Th>Name</Th>
                      <Th>Slug</Th>
                      <Th>Plan</Th>
                      <Th>Status</Th>
                      <Th>Seats</Th>
                      <Th>Created</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {organizations.map((org) => {
                      const selected = selectedOrgId === org.id;

                      return (
                        <tr
                          key={org.id}
                          onClick={() => handleSelectOrganization(org.id)}
                          className={selected ? "bg-[var(--button-secondary-hover)]" : "bg-transparent"}
                          style={{ cursor: "pointer" }}
                        >
                          <Td strong>{org.name}</Td>
                          <Td>/{org.slug}</Td>
                          <Td>{org.planCode}</Td>
                          <Td>{org.status}</Td>
                          <Td>{org.seats}</Td>
                          <Td>{formatDate(org.createdAt)}</Td>
                        </tr>
                      );
                    })}

                    {!organizations.length ? (
                      <tr>
                        <Td colSpan={6}>No organizations found.</Td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[28px] border border-[var(--border-strong)] bg-[var(--background-panel)] p-6 alamin-shadow">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
              Subscription
            </div>
            <h2 className="mt-3 text-2xl font-bold text-[var(--foreground)]">
              {selectedOrg ? selectedOrg.name : "Select an organization"}
            </h2>

            {selectedOrg ? (
              <div className="mt-5 grid gap-4">
                <Field label="Plan">
                  <select
                    value={selectedPlan}
                    onChange={(e) => setSelectedPlan(e.target.value as PlanCode)}
                    className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                  >
                    <option value="core">Core</option>
                    <option value="growth">Growth</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </Field>

                <Field label="Status">
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                  >
                    <option value="active">active</option>
                    <option value="trialing">trialing</option>
                    <option value="inactive">inactive</option>
                    <option value="cancelled">cancelled</option>
                    <option value="past_due">past_due</option>
                  </select>
                </Field>

                <Field label="Seats">
                  <input
                    type="number"
                    min={1}
                    value={selectedSeats}
                    onChange={(e) => setSelectedSeats(Number(e.target.value))}
                    className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                  />
                </Field>

                <div className="grid gap-3 rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--foreground-muted)]">
                  <div>
                    <span className="font-semibold text-[var(--foreground)]">Org ID:</span> {selectedOrg.id}
                  </div>
                  <div>
                    <span className="font-semibold text-[var(--foreground)]">Slug:</span> /{selectedOrg.slug}
                  </div>
                  <div>
                    <span className="font-semibold text-[var(--foreground)]">Updated:</span> {formatDate(selectedOrg.updatedAt)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleUpdateSubscription()}
                  disabled={saving}
                  className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-92 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save subscription changes"}
                </button>
              </div>
            ) : (
              <div className="mt-4 rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--foreground-muted)]">
                Pick an organization from the list first.
              </div>
            )}
          </section>

          <section className="rounded-[28px] border border-[var(--border-strong)] bg-[var(--background-panel)] p-6 alamin-shadow">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
              Feature overrides
            </div>
            <h2 className="mt-3 text-2xl font-bold text-[var(--foreground)]">
              {selectedOrg ? `Overrides for ${selectedOrg.name}` : "Select an organization"}
            </h2>

            {selectedOrg ? (
              <>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <Field label="Feature">
                    <select
                      value={overrideFeature}
                      onChange={(e) => setOverrideFeature(e.target.value as FeatureKey | "")}
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                    >
                      <option value="">Select feature</option>
                      {features.map((feature) => (
                        <option key={feature} value={feature}>
                          {feature}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Enabled">
                    <select
                      value={overrideEnabled ? "true" : "false"}
                      onChange={(e) => setOverrideEnabled(e.target.value === "true")}
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                    >
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  </Field>

                  <Field label="Limit value (optional)">
                    <input
                      value={overrideLimitValue}
                      onChange={(e) => setOverrideLimitValue(e.target.value)}
                      placeholder="e.g. 100"
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                    />
                  </Field>

                  <Field label="Reason (optional)">
                    <input
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Why this override exists"
                      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                    />
                  </Field>
                </div>

                <button
                  type="button"
                  onClick={() => void handleSaveOverride()}
                  disabled={saving}
                  className="mt-4 inline-flex h-12 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-92 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save override"}
                </button>

                <div className="mt-6 overflow-hidden rounded-[22px] border border-[var(--border)]">
                  <div className="max-h-[380px] overflow-auto">
                    <table className="w-full min-w-[760px] border-collapse">
                      <thead className="bg-[var(--card)]">
                        <tr>
                          <Th>Feature</Th>
                          <Th>Enabled</Th>
                          <Th>Limit</Th>
                          <Th>Reason</Th>
                          <Th>Updated</Th>
                          <Th>Action</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {overrides.map((item) => (
                          <tr key={item.id}>
                            <Td strong>{item.feature_code}</Td>
                            <Td>{item.is_enabled ? "true" : "false"}</Td>
                            <Td>{item.limit_value ?? "—"}</Td>
                            <Td>{item.reason ?? "—"}</Td>
                            <Td>{formatDate(item.updated_at)}</Td>
                            <Td>
                              <button
                                type="button"
                                onClick={() => void handleDeleteOverride(item.feature_code)}
                                disabled={saving}
                                className="inline-flex h-9 items-center justify-center rounded-full border border-red-400/20 bg-red-400/10 px-4 text-xs font-semibold text-red-100 transition hover:bg-red-400/15 disabled:opacity-60"
                              >
                                Remove
                              </button>
                            </Td>
                          </tr>
                        ))}

                        {!overrides.length ? (
                          <tr>
                            <Td colSpan={6}>No overrides found for this organization.</Td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--foreground-muted)]">
                Pick an organization from the list first.
              </div>
            )}
          </section>
        </div>

        {showDebug ? (
          <section className="mt-6 rounded-[28px] border border-amber-400/20 bg-amber-400/10 p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                  Debug
                </div>
                <h2 className="mt-2 text-xl font-bold text-amber-50">Admin debug panel</h2>
              </div>

              <button
                type="button"
                onClick={() => setShowDebug(false)}
                className="inline-flex h-10 items-center justify-center rounded-full border border-amber-400/20 bg-transparent px-4 text-sm font-medium text-amber-100 transition hover:bg-amber-400/10"
              >
                Hide debug
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <DebugCard title="Current selection">
                <DebugRow label="Last action" value={debug.lastAction} />
                <DebugRow label="Selected org id" value={debug.selectedOrgId || "—"} />
                <DebugRow label="Selected org valid uuid" value={isUuid(debug.selectedOrgId) ? "true" : "false"} />
                <DebugRow label="Selected org name" value={debug.selectedOrgName || "—"} />
                <DebugRow label="Selected org slug" value={debug.selectedOrgSlug || "—"} />
                <DebugRow label="Persisted org id" value={debug.persistedOrgId || "—"} />
                <DebugRow label="Persisted valid uuid" value={isUuid(debug.persistedOrgId) ? "true" : "false"} />
                <DebugRow label="Org count" value={String(debug.orgCount)} />
              </DebugCard>

              <DebugCard title="Last request">
                <DebugBlock label="URL" value={debug.lastRequestUrl || "—"} />
                <DebugBlock label="Body" value={debug.lastRequestBody || "—"} />
              </DebugCard>

              <DebugCard title="Last response">
                <DebugBlock label="Response" value={debug.lastResponse || "—"} />
              </DebugCard>

              <DebugCard title="Organizations payload">
                <DebugBlock label="Organizations" value={debug.lastOrganizationsPayload || "—"} />
              </DebugCard>
            </div>
          </section>
        ) : (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowDebug(true)}
              className="inline-flex h-10 items-center justify-center rounded-full border border-amber-400/20 bg-amber-400/10 px-4 text-sm font-medium text-amber-100 transition hover:bg-amber-400/15"
            >
              Show debug panel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium text-[var(--foreground-soft)]">{label}</label>
      {children}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-[var(--border)] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--foreground-faint)]">
      {children}
    </th>
  );
}

function Td({
  children,
  colSpan,
  strong,
}: {
  children: React.ReactNode;
  colSpan?: number;
  strong?: boolean;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border-b border-[var(--border)] px-4 py-3 text-sm ${
        strong ? "font-semibold text-[var(--foreground)]" : "text-[var(--foreground-muted)]"
      }`}
    >
      {children}
    </td>
  );
}

function DebugCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[22px] border border-amber-400/20 bg-black/20 p-4">
      <div className="mb-3 text-sm font-semibold text-amber-50">{title}</div>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}

function DebugRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <div className="text-amber-100/70">{label}</div>
      <div className="max-w-[70%] break-all text-right font-medium text-amber-50">{value}</div>
    </div>
  );
}

function DebugBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-2">
      <div className="text-sm text-amber-100/70">{label}</div>
      <pre className="max-h-64 overflow-auto rounded-[14px] border border-amber-400/10 bg-black/25 p-3 text-xs leading-6 text-amber-50 whitespace-pre-wrap break-all">
        {value}
      </pre>
    </div>
  );
}