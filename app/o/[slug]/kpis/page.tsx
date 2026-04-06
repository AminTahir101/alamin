"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";

type Role =
  | "owner"
  | "admin"
  | "manager"
  | "dept_head"
  | "finance"
  | "member"
  | "employee";

type Department = {
  id: string;
  name: string;
};

type AssignableMember = {
  userId: string;
  email: string | null;
  role: string;
  departmentId?: string | null;
};

type Kpi = {
  id: string;
  title: string;
  department_id: string | null;
  department_name?: string | null;
  current_value: number | null;
  target_value: number | null;
  weight: number | null;
  is_active: boolean | null;
  direction: "increase" | "decrease" | null;
  owner_user_id?: string | null;
  is_assigned_to_me?: boolean;
};

type KpisResponse = {
  ok: boolean;
  cycle?: { id: string; year: number; quarter: number; status: string } | null;
  departments?: Department[];
  assignableMembers?: AssignableMember[];
  kpis?: Kpi[];
  visibility?: "org" | "department" | "employee";
  role?: Role;
  canManage?: boolean;
  error?: string;
};

type FormState = {
  id?: string;
  title: string;
  department_id: string;
  current_value: string;
  target_value: string;
  weight: string;
  direction: "increase" | "decrease";
  is_active: boolean;
  owner_user_id: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  department_id: "",
  current_value: "0",
  target_value: "",
  weight: "1",
  direction: "increase",
  is_active: true,
  owner_user_id: "",
  notes: "",
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

function formatNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString();
}

function prettyRole(value?: string | null) {
  const role = String(value ?? "").trim();
  if (!role) return "Member";
  if (role === "dept_head") return "Department Head";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function directionLabel(direction: "increase" | "decrease" | null | undefined) {
  return direction === "decrease" ? "Decrease" : "Increase";
}

function kpiHealthTone(item: Kpi): "success" | "warning" | "danger" | "neutral" {
  if (item.is_active === false) return "neutral";
  const current = typeof item.current_value === "number" ? item.current_value : null;
  const target = typeof item.target_value === "number" ? item.target_value : null;
  if (current === null || target === null || target === 0) return "neutral";

  const progress =
    item.direction === "decrease"
      ? current <= target
        ? 100
        : Math.max(0, Math.min(100, (target / current) * 100))
      : Math.max(0, Math.min(100, (current / target) * 100));

  if (progress >= 85) return "success";
  if (progress >= 60) return "warning";
  return "danger";
}

function progressPercent(item: Kpi) {
  const current = typeof item.current_value === "number" ? item.current_value : null;
  const target = typeof item.target_value === "number" ? item.target_value : null;

  if (current === null || target === null || target === 0) return null;

  if (item.direction === "decrease") {
    if (current <= target) return 100;
    return Math.max(0, Math.min(100, (target / current) * 100));
  }

  return Math.max(0, Math.min(100, (current / target) * 100));
}

function inputClass() {
  return "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[var(--foreground)] outline-none transition placeholder:text-[var(--foreground-faint)] focus:border-[var(--border-strong)]";
}

function selectClass() {
  return "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[var(--foreground)] outline-none transition focus:border-[var(--border-strong)]";
}

function textareaClass() {
  return "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[var(--foreground)] outline-none transition placeholder:text-[var(--foreground-faint)] focus:border-[var(--border-strong)]";
}

function primaryButtonClass() {
  return "inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
}

function secondaryButtonClass() {
  return "inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)] disabled:cursor-not-allowed disabled:opacity-50";
}

function metricCardToneClass(tone: "default" | "success" | "warning" | "danger") {
  switch (tone) {
    case "success":
      return "border-emerald-500/20 bg-emerald-500/10";
    case "warning":
      return "border-amber-500/20 bg-amber-500/10";
    case "danger":
      return "border-red-500/20 bg-red-500/10";
    default:
      return "border-[var(--border)] bg-[var(--card)]";
  }
}

export default function KpisPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const orgSlug = String(params?.slug ?? "").trim();

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [cycle, setCycle] = useState<KpisResponse["cycle"]>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [assignableMembers, setAssignableMembers] = useState<AssignableMember[]>([]);
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [canManage, setCanManage] = useState(false);

  const [openForm, setOpenForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const ensureAuth = useCallback(async (): Promise<Session | null> => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    setSessionEmail(session?.user?.email ?? null);

    if (!session) {
      router.replace("/auth");
      return null;
    }
    return session;
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    setSuccess(null);

    try {
      const session = await ensureAuth();
      if (!session) return;

      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/kpis`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });

      const raw = await res.text();
      const parsed = (await safeParseJson(raw)) as KpisResponse | null;

      if (!res.ok || !parsed || parsed.ok !== true) {
        throw new Error(parsed?.error || raw || `Failed to load KPIs (HTTP ${res.status})`);
      }

      setCycle(parsed.cycle ?? null);
      setDepartments(Array.isArray(parsed.departments) ? parsed.departments : []);
      setAssignableMembers(Array.isArray(parsed.assignableMembers) ? parsed.assignableMembers : []);
      setKpis(Array.isArray(parsed.kpis) ? parsed.kpis : []);
      setCanManage(Boolean(parsed.canManage));
    } catch (e: unknown) {
      setMsg(getErrorMessage(e, "Failed to load KPIs"));
    } finally {
      setLoading(false);
    }
  }, [ensureAuth, orgSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const memberOptions = useMemo(() => {
    return assignableMembers.map((member) => ({
      value: member.userId,
      label: `${member.email ?? member.userId} · ${prettyRole(member.role)}`,
    }));
  }, [assignableMembers]);

  const summary = useMemo(() => {
    const total = kpis.length;
    const active = kpis.filter((item) => item.is_active !== false).length;
    const assigned = kpis.filter((item) => !!item.owner_user_id).length;
    const atRisk = kpis.filter((item) => kpiHealthTone(item) === "danger").length;

    return { total, active, assigned, atRisk };
  }, [kpis]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      department_id: departments[0]?.id ?? "",
    });
    setOpenForm(true);
    setMsg(null);
    setSuccess(null);
  }, [departments]);

  const openEdit = useCallback((item: Kpi) => {
    setEditingId(item.id);
    setForm({
      id: item.id,
      title: item.title,
      department_id: item.department_id ?? "",
      current_value: String(item.current_value ?? 0),
      target_value: String(item.target_value ?? ""),
      weight: String(item.weight ?? 1),
      direction: item.direction ?? "increase",
      is_active: item.is_active !== false,
      owner_user_id: item.owner_user_id ?? "",
      notes: "",
    });
    setOpenForm(true);
    setMsg(null);
    setSuccess(null);
  }, []);

  const closeForm = useCallback(() => {
    setOpenForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }, []);

  const handleSave = useCallback(async () => {
    if (!canManage) {
      setMsg("You do not have permission to manage KPIs");
      return;
    }

    setSaving(true);
    setMsg(null);
    setSuccess(null);

    try {
      const session = await ensureAuth();
      if (!session) return;

      const payload = {
        ...(editingId ? { id: editingId } : {}),
        title: form.title,
        department_id: form.department_id,
        current_value: Number(form.current_value),
        target_value: Number(form.target_value),
        weight: Number(form.weight),
        direction: form.direction,
        is_active: form.is_active,
        owner_user_id: form.owner_user_id || null,
        notes: form.notes,
      };

      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/kpis`, {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const raw = await res.text();
      const parsed = (await safeParseJson(raw)) as { ok?: boolean; error?: string } | null;

      if (!res.ok || !parsed?.ok) {
        throw new Error(parsed?.error || raw || `Failed to save KPI (HTTP ${res.status})`);
      }

      setSuccess(editingId ? "KPI updated successfully" : "KPI created successfully");
      closeForm();
      await load();
    } catch (e: unknown) {
      setMsg(getErrorMessage(e, "Failed to save KPI"));
    } finally {
      setSaving(false);
    }
  }, [canManage, closeForm, editingId, ensureAuth, form, load, orgSlug]);

  const cycleText = cycle ? `Q${cycle.quarter} ${cycle.year} · ${cycle.status}` : "No active cycle";

  return (
    <AppShell
      slug={orgSlug}
      sessionEmail={sessionEmail}
      topActions={
        canManage ? (
          <button type="button" onClick={openCreate} className={primaryButtonClass()}>
            New KPI
          </button>
        ) : null
      }
    >
      <AppPageHeader
        eyebrow={cycleText}
        title="KPIs"
        description="Create, assign, and manage KPIs for the active cycle."
      />

      {msg ? (
        <div className="mb-6 rounded-[20px] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-700 dark:text-red-100">
          {msg}
        </div>
      ) : null}

      {success ? (
        <div className="mb-6 rounded-[20px] border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-700 dark:text-emerald-100">
          {success}
        </div>
      ) : null}

      <section className="mb-6 overflow-hidden rounded-[30px] border border-[var(--border)] bg-[var(--background-panel)] p-6 alamin-shadow">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground-faint)]">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />
              KPI workspace
            </div>

            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-[var(--foreground)]">
              Turn raw signals into accountable performance tracking.
            </h2>

            <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--foreground-muted)]">
              KPIs are the measurable layer underneath your objectives and OKRs. This page lets you
              define ownership, set targets, control direction, and keep the active cycle grounded
              in real numbers.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <div className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)]">
                Assignee-based ownership
              </div>
              <div className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)]">
                Target-driven tracking
              </div>
              <div className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)]">
                Department visibility
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <MetricCard
              label="Total KPIs"
              value={String(summary.total)}
              hint="Current KPI count"
              tone="default"
            />
            <MetricCard
              label="Active"
              value={String(summary.active)}
              hint="Live KPIs in cycle"
              tone="success"
            />
            <MetricCard
              label="Assigned"
              value={String(summary.assigned)}
              hint="KPIs with an owner"
              tone="warning"
            />
            <MetricCard
              label="At risk"
              value={String(summary.atRisk)}
              hint="Needs intervention"
              tone={summary.atRisk > 0 ? "danger" : "success"}
            />
          </div>
        </div>
      </section>

      <SectionCard
        title="KPI Registry"
        subtitle="Assigned ownership is now part of the KPI workflow."
        className="bg-[var(--background-panel)]"
      >
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-36 animate-pulse rounded-[20px] border border-[var(--border)] bg-[var(--card)]"
              />
            ))}
          </div>
        ) : kpis.length ? (
          <div className="space-y-4">
            {kpis.map((item) => {
              const assigned = assignableMembers.find((m) => m.userId === item.owner_user_id);
              const progress = progressPercent(item);
              const tone = kpiHealthTone(item);

              return (
                <div
                  key={item.id}
                  className="rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-5 alamin-shadow"
                >
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-lg font-bold text-[var(--foreground)]">{item.title}</div>

                        <StatusBadge tone={item.is_active === false ? "neutral" : "success"}>
                          {item.is_active === false ? "Inactive" : "Active"}
                        </StatusBadge>

                        <StatusBadge tone={tone}>
                          {tone === "success"
                            ? "On track"
                            : tone === "warning"
                              ? "At risk"
                              : tone === "danger"
                                ? "Off track"
                                : "Not enough data"}
                        </StatusBadge>

                        {item.is_assigned_to_me ? (
                          <StatusBadge tone="warning">Assigned to me</StatusBadge>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                        <DetailTile label="Department" value={item.department_name ?? "—"} />
                        <DetailTile label="Current" value={formatNumber(item.current_value)} />
                        <DetailTile label="Target" value={formatNumber(item.target_value)} />
                        <DetailTile label="Weight" value={formatNumber(item.weight)} />
                        <DetailTile label="Direction" value={directionLabel(item.direction)} />
                        <DetailTile label="Assignee" value={assigned?.email ?? "Unassigned"} />
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        {canManage ? (
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className={secondaryButtonClass()}
                          >
                            Edit KPI
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="w-full max-w-[280px] rounded-[22px] border border-[var(--border)] bg-[var(--card-subtle)] p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground-faint)]">
                        KPI health
                      </div>

                      <div className="mt-4 flex items-end justify-between gap-3">
                        <div className="text-3xl font-black tracking-[-0.03em] text-[var(--foreground)]">
                          {progress === null ? "—" : `${Math.round(progress)}%`}
                        </div>
                        <div className="text-xs text-[var(--foreground-faint)]">
                          {directionLabel(item.direction)} target
                        </div>
                      </div>

                      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--button-secondary-bg)]">
                        <div
                          className={[
                            "h-full rounded-full",
                            tone === "success"
                              ? "bg-emerald-500"
                              : tone === "warning"
                                ? "bg-amber-500"
                                : tone === "danger"
                                  ? "bg-red-500"
                                  : "bg-slate-400",
                          ].join(" ")}
                          style={{ width: `${Math.max(0, Math.min(100, progress ?? 0))}%` }}
                        />
                      </div>

                      <div className="mt-4 text-sm leading-6 text-[var(--foreground-muted)]">
                        Keep KPI ownership visible and measurable before AI turns weak signals into
                        OKRs and execution work.
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No KPIs yet"
            description="Create your first KPI and assign it to a department owner or employee."
          />
        )}
      </SectionCard>

      {openForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-[30px] border border-[var(--border)] bg-[var(--background-elevated)] p-6 alamin-shadow">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                  KPI editor
                </div>
                <div className="mt-3 text-3xl font-black tracking-[-0.04em] text-[var(--foreground)]">
                  {editingId ? "Edit KPI" : "Create KPI"}
                </div>
                <div className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">
                  Add or change assignee ownership directly from the KPI form.
                </div>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className={secondaryButtonClass()}
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div>
                <FieldShell label="Title">
                  <input
                    value={form.title}
                    onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                    className={inputClass()}
                    placeholder="KPI title"
                  />
                </FieldShell>
              </div>

              <div>
                <FieldShell label="Department">
                  <select
                    value={form.department_id}
                    onChange={(e) => setForm((s) => ({ ...s, department_id: e.target.value }))}
                    className={selectClass()}
                  >
                    <option value="">Select department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </FieldShell>
              </div>

              <div>
                <FieldShell label="Current value">
                  <input
                    value={form.current_value}
                    onChange={(e) => setForm((s) => ({ ...s, current_value: e.target.value }))}
                    type="number"
                    className={inputClass()}
                  />
                </FieldShell>
              </div>

              <div>
                <FieldShell label="Target value">
                  <input
                    value={form.target_value}
                    onChange={(e) => setForm((s) => ({ ...s, target_value: e.target.value }))}
                    type="number"
                    className={inputClass()}
                  />
                </FieldShell>
              </div>

              <div>
                <FieldShell label="Weight">
                  <input
                    value={form.weight}
                    onChange={(e) => setForm((s) => ({ ...s, weight: e.target.value }))}
                    type="number"
                    className={inputClass()}
                  />
                </FieldShell>
              </div>

              <div>
                <FieldShell label="Direction">
                  <select
                    value={form.direction}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        direction: e.target.value as "increase" | "decrease",
                      }))
                    }
                    className={selectClass()}
                  >
                    <option value="increase">Increase</option>
                    <option value="decrease">Decrease</option>
                  </select>
                </FieldShell>
              </div>

              <div className="md:col-span-2">
                <FieldShell label="Assignee">
                  <select
                    value={form.owner_user_id}
                    onChange={(e) => setForm((s) => ({ ...s, owner_user_id: e.target.value }))}
                    className={selectClass()}
                  >
                    <option value="">Unassigned</option>
                    {memberOptions.map((member) => (
                      <option key={member.value} value={member.value}>
                        {member.label}
                      </option>
                    ))}
                  </select>
                </FieldShell>
              </div>

              {!editingId ? (
                <div className="md:col-span-2">
                  <FieldShell label="Initial notes">
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
                      rows={4}
                      className={textareaClass()}
                      placeholder="Optional context for this KPI"
                    />
                  </FieldShell>
                </div>
              ) : null}

              <div className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                <input
                  checked={form.is_active}
                  onChange={(e) => setForm((s) => ({ ...s, is_active: e.target.checked }))}
                  type="checkbox"
                  className="h-4 w-4"
                />
                <div className="text-sm font-medium text-[var(--foreground-soft)]">Active KPI</div>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className={primaryButtonClass()}
              >
                {saving ? "Saving..." : editingId ? "Save changes" : "Create KPI"}
              </button>

              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className={secondaryButtonClass()}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <div className={`rounded-[24px] border p-5 alamin-shadow ${metricCardToneClass(tone)}`}>
      <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--foreground-faint)]">
        {label}
      </div>
      <div className="mt-3 text-3xl font-black tracking-[-0.03em] text-[var(--foreground)]">
        {value}
      </div>
      <div className="mt-2 text-sm text-[var(--foreground-muted)]">{hint}</div>
    </div>
  );
}

function DetailTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-subtle)] p-3">
      <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--foreground-faint)]">
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-[var(--foreground)]">
        {value}
      </div>
    </div>
  );
}

function FieldShell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 block text-sm font-medium text-[var(--foreground-soft)]">
        {label}
      </div>
      {children}
    </label>
  );
}