"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type CycleSummary = {
  id: string;
  year: number;
  quarter: number;
  status: string;
  starts_on?: string | null;
  ends_on?: string | null;
  name?: string | null;
};

type CycleListResponse = {
  ok: boolean;
  cycles?: CycleSummary[];
  activeCycle?: CycleSummary | null;
  error?: string;
};

type CycleMutationResponse = {
  ok: boolean;
  cycle?: CycleSummary;
  error?: string;
};

type CycleManagerProps = {
  slug: string;
  currentCycle: CycleSummary | null;
  onCycleChanged: (cycle: CycleSummary) => void;
  buttonLabel?: string;
};

type Mode = "menu" | "switch" | "create" | "edit";

// ─────────────────────────────────────────────────────────────────────────────
// Style helpers
// ─────────────────────────────────────────────────────────────────────────────

function inputClass() {
  return "w-full rounded-2xl border border-[var(--border)] bg-[var(--background-elevated)] px-4 py-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] focus:border-[var(--border-active)] disabled:opacity-60";
}

function primaryButtonClass() {
  return "inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
}

function secondaryButtonClass() {
  return "inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)] disabled:cursor-not-allowed disabled:opacity-50";
}

function warningButtonClass() {
  return "inline-flex h-11 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 px-5 text-sm font-semibold text-amber-700 dark:text-amber-100 transition hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50";
}

function subCardClass() {
  return "rounded-2xl border border-[var(--border)] bg-[var(--card-soft)] p-4";
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CycleManager({
  slug,
  currentCycle,
  onCycleChanged,
  buttonLabel = "Manage cycle",
}: CycleManagerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cycles, setCycles] = useState<CycleSummary[]>([]);

  // Switch state
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);
  const [switchConfirm, setSwitchConfirm] = useState(false);

  // Create state
  const now = new Date();
  const [createYear, setCreateYear] = useState<number>(now.getUTCFullYear());
  const [createQuarter, setCreateQuarter] = useState<number>(
    Math.floor(now.getUTCMonth() / 3) + 1,
  );
  const [createActivate, setCreateActivate] = useState(true);
  const [createConfirm, setCreateConfirm] = useState(false);

  // Edit state
  const [editStartsOn, setEditStartsOn] = useState("");
  const [editEndsOn, setEditEndsOn] = useState("");
  const [editConfirm, setEditConfirm] = useState(false);

  const reset = useCallback(() => {
    setMode("menu");
    setErrorMsg(null);
    setPendingSwitchId(null);
    setSwitchConfirm(false);
    setCreateConfirm(false);
    setEditConfirm(false);
  }, []);

  const closeModal = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  const fetchCycles = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(
        `/api/o/${encodeURIComponent(slug)}/cycles`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      const data = (await res.json()) as CycleListResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Failed (HTTP ${res.status})`);
      }
      setCycles(data.cycles ?? []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load cycles");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (open) {
      void fetchCycles();
      // Pre-fill edit form with current cycle dates
      if (currentCycle) {
        setEditStartsOn(currentCycle.starts_on ?? "");
        setEditEndsOn(currentCycle.ends_on ?? "");
      }
    }
  }, [open, fetchCycles, currentCycle]);

  // ─── Action handlers ───────────────────────────────────────────────────────

  const performSwitch = useCallback(
    async (cycleId: string) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("Not authenticated");

        const res = await fetch(
          `/api/o/${encodeURIComponent(slug)}/cycles/${cycleId}`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const data = (await res.json()) as CycleMutationResponse;
        if (!res.ok || !data.ok || !data.cycle) {
          throw new Error(data.error || `Failed (HTTP ${res.status})`);
        }
        onCycleChanged(data.cycle);
        closeModal();
      } catch (err: unknown) {
        setErrorMsg(
          err instanceof Error ? err.message : "Failed to switch cycle",
        );
      } finally {
        setLoading(false);
      }
    },
    [slug, onCycleChanged, closeModal],
  );

  const performCreate = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(
        `/api/o/${encodeURIComponent(slug)}/cycles`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            year: createYear,
            quarter: createQuarter,
            activate: createActivate,
          }),
        },
      );
      const data = (await res.json()) as CycleMutationResponse;
      if (!res.ok || !data.ok || !data.cycle) {
        throw new Error(data.error || `Failed (HTTP ${res.status})`);
      }
      if (createActivate) {
        onCycleChanged(data.cycle);
      } else {
        // Refresh list, keep modal open on switch view
        await fetchCycles();
        setMode("switch");
      }
      if (createActivate) closeModal();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to create cycle",
      );
    } finally {
      setLoading(false);
    }
  }, [
    slug,
    createYear,
    createQuarter,
    createActivate,
    onCycleChanged,
    closeModal,
    fetchCycles,
  ]);

  const performEdit = useCallback(async () => {
    if (!currentCycle) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(
        `/api/o/${encodeURIComponent(slug)}/cycles/${currentCycle.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            starts_on: editStartsOn,
            ends_on: editEndsOn,
          }),
        },
      );
      const data = (await res.json()) as CycleMutationResponse;
      if (!res.ok || !data.ok || !data.cycle) {
        throw new Error(data.error || `Failed (HTTP ${res.status})`);
      }
      onCycleChanged(data.cycle);
      closeModal();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to update cycle",
      );
    } finally {
      setLoading(false);
    }
  }, [
    slug,
    currentCycle,
    editStartsOn,
    editEndsOn,
    onCycleChanged,
    closeModal,
  ]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={secondaryButtonClass()}
      >
        {buttonLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-2xl rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                  Reporting cycle
                </div>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--foreground)]">
                  {mode === "menu" && "Manage cycle"}
                  {mode === "switch" && "Switch active cycle"}
                  {mode === "create" && "Create new cycle"}
                  {mode === "edit" && "Edit current cycle"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3 py-1 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              >
                ✕
              </button>
            </div>

            {/* Error */}
            {errorMsg && (
              <div className="mb-4 rounded-[20px] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-700 dark:text-red-100">
                {errorMsg}
              </div>
            )}

            {/* MENU MODE */}
            {mode === "menu" && (
              <div className="space-y-4">
                <div className={subCardClass()}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                    Currently active
                  </div>
                  <div className="mt-1 text-lg font-semibold text-[var(--foreground)]">
                    {currentCycle
                      ? `Q${currentCycle.quarter} ${currentCycle.year}`
                      : "No active cycle"}
                  </div>
                  {currentCycle && (currentCycle.starts_on || currentCycle.ends_on) && (
                    <div className="mt-1 text-xs text-[var(--foreground-muted)]">
                      {currentCycle.starts_on} → {currentCycle.ends_on}
                    </div>
                  )}
                </div>

                <div className="grid gap-3">
                  <button
                    type="button"
                    onClick={() => setMode("switch")}
                    className="flex items-start gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card-subtle)] p-4 text-left transition hover:border-[var(--border-strong)]"
                  >
                    <div>
                      <div className="font-semibold text-[var(--foreground)]">
                        Switch to a different cycle
                      </div>
                      <div className="mt-1 text-sm text-[var(--foreground-muted)]">
                        Activate an existing cycle. Current active cycle will be closed.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode("create")}
                    className="flex items-start gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card-subtle)] p-4 text-left transition hover:border-[var(--border-strong)]"
                  >
                    <div>
                      <div className="font-semibold text-[var(--foreground)]">
                        Create a new cycle
                      </div>
                      <div className="mt-1 text-sm text-[var(--foreground-muted)]">
                        Define a new quarterly cycle. You can activate it immediately or save as draft.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode("edit")}
                    disabled={!currentCycle}
                    className="flex items-start gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card-subtle)] p-4 text-left transition hover:border-[var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div>
                      <div className="font-semibold text-[var(--foreground)]">
                        Edit current cycle dates
                      </div>
                      <div className="mt-1 text-sm text-[var(--foreground-muted)]">
                        Change the start or end date of the current active cycle.
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* SWITCH MODE */}
            {mode === "switch" && (
              <div className="space-y-4">
                {!switchConfirm && (
                  <>
                    <div className="text-sm text-[var(--foreground-muted)]">
                      Pick a cycle to activate. The current active cycle will be moved to closed status.
                    </div>
                    {loading ? (
                      <div className="py-6 text-center text-sm text-[var(--foreground-muted)]">
                        Loading cycles…
                      </div>
                    ) : cycles.length === 0 ? (
                      <div className={subCardClass()}>
                        <div className="text-sm text-[var(--foreground-muted)]">
                          No other cycles exist. Create one instead.
                        </div>
                      </div>
                    ) : (
                      <div className="grid max-h-72 gap-2 overflow-y-auto">
                        {cycles.map((c) => {
                          const isActive = c.id === currentCycle?.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              disabled={isActive}
                              onClick={() => {
                                setPendingSwitchId(c.id);
                                setSwitchConfirm(true);
                              }}
                              className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card-subtle)] px-4 py-3 text-left transition hover:border-[var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <div>
                                <div className="text-sm font-semibold text-[var(--foreground)]">
                                  Q{c.quarter} {c.year}
                                </div>
                                <div className="text-xs text-[var(--foreground-muted)]">
                                  {c.starts_on} → {c.ends_on}
                                </div>
                              </div>
                              <span className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--foreground-muted)]">
                                {isActive ? "Active" : c.status}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}

                {switchConfirm && pendingSwitchId && (
                  <div className="space-y-4">
                    <div className="rounded-[20px] border border-amber-500/20 bg-amber-500/10 px-5 py-4">
                      <div className="text-sm font-semibold text-amber-800 dark:text-amber-100">
                        Switching cycles will affect your workspace
                      </div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--foreground-muted)]">
                        <li>
                          KPIs, OKRs, and tasks tied to the current cycle will stay tied to it (not lost, just historical).
                        </li>
                        <li>
                          New AI blueprints, KPIs, and reports will use the new active cycle.
                        </li>
                        <li>
                          The current cycle will move to <strong>closed</strong> status.
                        </li>
                      </ul>
                    </div>
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSwitchConfirm(false);
                          setPendingSwitchId(null);
                        }}
                        className={secondaryButtonClass()}
                        disabled={loading}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => performSwitch(pendingSwitchId)}
                        disabled={loading}
                        className={warningButtonClass()}
                      >
                        {loading ? "Switching…" : "Confirm switch"}
                      </button>
                    </div>
                  </div>
                )}

                {!switchConfirm && (
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setMode("menu")}
                      className={secondaryButtonClass()}
                    >
                      Back
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* CREATE MODE */}
            {mode === "create" && (
              <div className="space-y-4">
                {!createConfirm && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                          Year
                        </label>
                        <input
                          type="number"
                          value={createYear}
                          onChange={(e) => setCreateYear(Number(e.target.value))}
                          className={`mt-1 ${inputClass()}`}
                          min={2000}
                          max={2100}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                          Quarter
                        </label>
                        <select
                          value={createQuarter}
                          onChange={(e) => setCreateQuarter(Number(e.target.value))}
                          className={`mt-1 ${inputClass()}`}
                        >
                          <option value={1}>Q1</option>
                          <option value={2}>Q2</option>
                          <option value={3}>Q3</option>
                          <option value={4}>Q4</option>
                        </select>
                      </div>
                    </div>

                    <label className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-subtle)] px-4 py-3">
                      <input
                        type="checkbox"
                        checked={createActivate}
                        onChange={(e) => setCreateActivate(e.target.checked)}
                        className="mt-1 h-4 w-4 cursor-pointer"
                      />
                      <div>
                        <div className="text-sm font-semibold text-[var(--foreground)]">
                          Activate immediately
                        </div>
                        <div className="text-xs text-[var(--foreground-muted)]">
                          Make this the active cycle. The current active cycle will be closed.
                        </div>
                      </div>
                    </label>

                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setMode("menu")}
                        className={secondaryButtonClass()}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (createActivate) {
                            setCreateConfirm(true);
                          } else {
                            void performCreate();
                          }
                        }}
                        disabled={loading}
                        className={primaryButtonClass()}
                      >
                        {loading ? "Creating…" : createActivate ? "Continue" : "Create cycle"}
                      </button>
                    </div>
                  </>
                )}

                {createConfirm && (
                  <div className="space-y-4">
                    <div className="rounded-[20px] border border-amber-500/20 bg-amber-500/10 px-5 py-4">
                      <div className="text-sm font-semibold text-amber-800 dark:text-amber-100">
                        You&apos;re about to create and activate Q{createQuarter} {createYear}
                      </div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--foreground-muted)]">
                        <li>
                          Current cycle{currentCycle ? ` (Q${currentCycle.quarter} ${currentCycle.year})` : ""} will be closed.
                        </li>
                        <li>
                          New AI blueprints will be tied to Q{createQuarter} {createYear}.
                        </li>
                        <li>
                          Existing KPIs and OKRs will remain on their original cycles.
                        </li>
                      </ul>
                    </div>
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setCreateConfirm(false)}
                        className={secondaryButtonClass()}
                        disabled={loading}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void performCreate()}
                        disabled={loading}
                        className={warningButtonClass()}
                      >
                        {loading ? "Creating…" : "Create and activate"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* EDIT MODE */}
            {mode === "edit" && currentCycle && (
              <div className="space-y-4">
                {!editConfirm && (
                  <>
                    <div className={subCardClass()}>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                        Editing
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                        Q{currentCycle.quarter} {currentCycle.year}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                          Start date
                        </label>
                        <input
                          type="date"
                          value={editStartsOn}
                          onChange={(e) => setEditStartsOn(e.target.value)}
                          className={`mt-1 ${inputClass()}`}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">
                          End date
                        </label>
                        <input
                          type="date"
                          value={editEndsOn}
                          onChange={(e) => setEditEndsOn(e.target.value)}
                          className={`mt-1 ${inputClass()}`}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setMode("menu")}
                        className={secondaryButtonClass()}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditConfirm(true)}
                        disabled={loading || (!editStartsOn && !editEndsOn)}
                        className={primaryButtonClass()}
                      >
                        Continue
                      </button>
                    </div>
                  </>
                )}

                {editConfirm && (
                  <div className="space-y-4">
                    <div className="rounded-[20px] border border-amber-500/20 bg-amber-500/10 px-5 py-4">
                      <div className="text-sm font-semibold text-amber-800 dark:text-amber-100">
                        Editing the active cycle&apos;s dates
                      </div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--foreground-muted)]">
                        <li>
                          Date changes affect any reports or analytics scoped to this cycle.
                        </li>
                        <li>
                          KPI history records keep their original timestamps but their attribution changes.
                        </li>
                        <li>
                          Use this only when you need to correct cycle boundaries — not for routine adjustments.
                        </li>
                      </ul>
                    </div>
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setEditConfirm(false)}
                        className={secondaryButtonClass()}
                        disabled={loading}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void performEdit()}
                        disabled={loading}
                        className={warningButtonClass()}
                      >
                        {loading ? "Saving…" : "Save changes"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
