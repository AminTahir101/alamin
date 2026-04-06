"use client";

import Link from "next/link";
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

type ObjectiveOption = {
  id: string;
  title: string;
  department_id?: string | null;
};

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

type OkrItem = {
  id: string;
  title: string;
  description?: string | null;
  objective_id: string;
  objective_title?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  owner_user_id?: string | null;
  owner_email?: string | null;
  status:
    | "draft"
    | "pending_approval"
    | "active"
    | "on_track"
    | "at_risk"
    | "off_track"
    | "completed"
    | "cancelled";
  progress?: number | null;
  key_results_count?: number;
  linked_kpis_count?: number;
  average_kr_progress?: number | null;
  is_assigned_to_me?: boolean;
};

type OkrsResponse = {
  ok: boolean;
  cycle?: { id: string; year: number; quarter: number; status: string } | null;
  departments?: Department[];
  objectives?: ObjectiveOption[];
  assignableMembers?: AssignableMember[];
  okrs?: OkrItem[];
  visibility?: "org" | "department" | "employee";
  role?: Role;
  canManage?: boolean;
  error?: string;
};

type FormState = {
  id?: string;
  objective_id: string;
  title: string;
  description: string;
  owner_user_id: string;
  status:
    | "draft"
    | "pending_approval"
    | "active"
    | "on_track"
    | "at_risk"
    | "off_track"
    | "completed"
    | "cancelled";
};

const EMPTY_FORM: FormState = {
  objective_id: "",
  title: "",
  description: "",
  owner_user_id: "",
  status: "draft",
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

function prettyRole(value?: string | null) {
  const role = String(value ?? "").trim();
  if (!role) return "Member";
  if (role === "dept_head") return "Department Head";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function statusTone(
  status: OkrItem["status"]
): "success" | "warning" | "danger" | "neutral" {
  if (status === "completed" || status === "active" || status === "on_track") return "success";
  if (status === "pending_approval" || status === "at_risk") return "warning";
  if (status === "off_track" || status === "cancelled") return "danger";
  return "neutral";
}

function formatPercent(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

function inputClass() {
  return "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[var(--foreground)] outline-none transition placeholder:text-[var(--foreground-faint)] focus:border-[var(--border-strong)]";
}

function selectClass() {
  return "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[var(--foreground)] outline-none transition focus:border-[var(--border-strong)]";
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

export default function OkrsPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const orgSlug = String(params?.slug ?? "").trim();

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [cycle, setCycle] = useState<OkrsResponse["cycle"]>(null);
  const [, setDepartments] = useState<Department[]>([]);
  const [objectives, setObjectives] = useState<ObjectiveOption[]>([]);
  const [assignableMembers, setAssignableMembers] = useState<AssignableMember[]>([]);
  const [okrs, setOkrs] = useState<OkrItem[]>([]);
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

      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/okrs`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });

      const raw = await res.text();
      const parsed = (await safeParseJson(raw)) as OkrsResponse | null;

      if (!res.ok || !parsed || parsed.ok !== true) {
        throw new Error(parsed?.error || raw || `Failed to load OKRs (HTTP ${res.status})`);
      }

      setCycle(parsed.cycle ?? null);
      setDepartments(Array.isArray(parsed.departments) ? parsed.departments : []);
      setObjectives(Array.isArray(parsed.objectives) ? parsed.objectives : []);
      setAssignableMembers(Array.isArray(parsed.assignableMembers) ? parsed.assignableMembers : []);
      setOkrs(Array.isArray(parsed.okrs) ? parsed.okrs : []);
      setCanManage(Boolean(parsed.canManage));
    } catch (e: unknown) {
      setMsg(getErrorMessage(e, "Failed to load OKRs"));
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
    const total = okrs.length;
    const active = okrs.filter((o) => ["active", "on_track"].includes(o.status)).length;
    const pending = okrs.filter((o) => o.status === "pending_approval").length;
    const avgProgress =
      total > 0
        ? Math.round(
            okrs.reduce(
              (sum, item) => sum + (typeof item.progress === "number" ? item.progress : 0),
              0
            ) / total
          )
        : 0;

    return { total, active, pending, avgProgress };
  }, [okrs]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      objective_id: objectives[0]?.id ?? "",
    });
    setOpenForm(true);
    setMsg(null);
    setSuccess(null);
  }, [objectives]);

  const openEdit = useCallback((item: OkrItem) => {
    setEditingId(item.id);
    setForm({
      id: item.id,
      objective_id: item.objective_id,
      title: item.title,
      description: item.description ?? "",
      owner_user_id: item.owner_user_id ?? "",
      status: item.status,
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
      setMsg("You do not have permission to manage OKRs");
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
        objective_id: form.objective_id,
        title: form.title,
        description: form.description || null,
        owner_user_id: form.owner_user_id || null,
        status: form.status,
      };

      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/okrs`, {
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
        throw new Error(parsed?.error || raw || `Failed to save OKR (HTTP ${res.status})`);
      }

      setSuccess(editingId ? "OKR updated successfully" : "OKR created successfully");
      closeForm();
      await load();
    } catch (e: unknown) {
      setMsg(getErrorMessage(e, "Failed to save OKR"));
    } finally {
      setSaving(false);
    }
  }, [canManage, closeForm, editingId, ensureAuth, form, load, orgSlug]);

  const handleQuickStatus = useCallback(
    async (
      item: OkrItem,
      status:
        | "draft"
        | "pending_approval"
        | "active"
        | "on_track"
        | "at_risk"
        | "off_track"
        | "completed"
        | "cancelled"
    ) => {
      if (!canManage) return;

      setMsg(null);
      setSuccess(null);

      try {
        const session = await ensureAuth();
        if (!session) return;

        const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/okrs/${item.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            type: "okr",
            id: item.id,
            status,
          }),
        });

        const raw = await res.text();
        const parsed = (await safeParseJson(raw)) as { ok?: boolean; error?: string } | null;

        if (!res.ok || !parsed?.ok) {
          throw new Error(parsed?.error || raw || `Failed to update OKR status (HTTP ${res.status})`);
        }

        setSuccess(`OKR moved to ${status.replaceAll("_", " ")}`);
        await load();
      } catch (e: unknown) {
        setMsg(getErrorMessage(e, "Failed to update OKR status"));
      }
    },
    [canManage, ensureAuth, load, orgSlug]
  );

  const cycleText = cycle ? `Q${cycle.quarter} ${cycle.year} · ${cycle.status}` : "No active cycle";

  return (
    <AppShell
      slug={orgSlug}
      sessionEmail={sessionEmail}
      topActions={
        canManage ? (
          <button type="button" onClick={openCreate} className={primaryButtonClass()}>
            New OKR
          </button>
        ) : null
      }
    >
      <AppPageHeader
        eyebrow={cycleText}
        title="OKRs"
        description="Manage objective-linked OKRs and drill into key results, owners, and linked KPIs."
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
              OKR workspace
            </div>

            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-[var(--foreground)]">
              Connect objectives to measurable execution.
            </h2>

            <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--foreground-muted)]">
              Each OKR should sit under a real objective, have a clear owner, and lead into key results
              and KPI-linked execution. This page is your registry, review point, and operating layer.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <div className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)]">
                Objective-linked structure
              </div>
              <div className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)]">
                Fast status control
              </div>
              <div className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)]">
                Built for approval flow
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <MetricCard
              label="Total OKRs"
              value={String(summary.total)}
              hint="Current OKR count"
              tone="default"
            />
            <MetricCard
              label="Active"
              value={String(summary.active)}
              hint="Running this cycle"
              tone="success"
            />
            <MetricCard
              label="Pending approval"
              value={String(summary.pending)}
              hint="Needs decision"
              tone="warning"
            />
            <MetricCard
              label="Avg. progress"
              value={`${summary.avgProgress}%`}
              hint="Across all OKRs"
              tone={summary.avgProgress >= 70 ? "success" : summary.avgProgress >= 40 ? "warning" : "danger"}
            />
          </div>
        </div>
      </section>

      <SectionCard
        title="OKR Registry"
        subtitle="Each OKR links the strategic objective to measurable key results and downstream execution."
        className="bg-[var(--background-panel)]"
      >
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-48 animate-pulse rounded-[20px] border border-[var(--border)] bg-[var(--card)]"
              />
            ))}
          </div>
        ) : okrs.length ? (
          <div className="space-y-4">
            {okrs.map((item) => (
              <div
                key={item.id}
                className="rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-5 alamin-shadow"
              >
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href={`/o/${encodeURIComponent(orgSlug)}/okrs/${item.id}`}
                        className="text-lg font-bold text-[var(--foreground)] transition hover:opacity-75"
                      >
                        {item.title}
                      </Link>

                      <StatusBadge tone={statusTone(item.status)}>
                        {item.status.replaceAll("_", " ")}
                      </StatusBadge>

                      {item.is_assigned_to_me ? (
                        <StatusBadge tone="info">Assigned to me</StatusBadge>
                      ) : null}
                    </div>

                    {item.description ? (
                      <div className="mt-2 text-sm leading-6 text-[var(--foreground-muted)]">
                        {item.description}
                      </div>
                    ) : null}

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                      <DetailTile label="Objective" value={item.objective_title ?? "—"} />
                      <DetailTile label="Department" value={item.department_name ?? "—"} />
                      <DetailTile label="Owner" value={item.owner_email ?? "Unassigned"} />
                      <DetailTile label="Progress" value={formatPercent(item.progress)} />
                      <DetailTile label="Key Results" value={String(item.key_results_count ?? 0)} />
                      <DetailTile label="Linked KPIs" value={String(item.linked_kpis_count ?? 0)} />
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link
                        href={`/o/${encodeURIComponent(orgSlug)}/okrs/${item.id}`}
                        className={secondaryButtonClass()}
                      >
                        Open OKR
                      </Link>

                      {canManage && item.status === "draft" ? (
                        <button
                          type="button"
                          onClick={() => void handleQuickStatus(item, "pending_approval")}
                          className="inline-flex h-11 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10 px-5 text-sm font-semibold text-amber-700 transition hover:bg-amber-500/15 dark:text-amber-100"
                        >
                          Send for approval
                        </button>
                      ) : null}

                      {canManage && item.status === "pending_approval" ? (
                        <button
                          type="button"
                          onClick={() => void handleQuickStatus(item, "active")}
                          className="inline-flex h-11 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-500/15 dark:text-emerald-100"
                        >
                          Approve & activate
                        </button>
                      ) : null}

                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className={secondaryButtonClass()}
                        >
                          Edit
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="w-full max-w-[260px] rounded-[22px] border border-[var(--border)] bg-[var(--card-soft)] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground-faint)]">
                      Health snapshot
                    </div>

                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div className="text-3xl font-black tracking-[-0.03em] text-[var(--foreground)]">
                        {formatPercent(item.progress)}
                      </div>
                      <div className="text-xs text-[var(--foreground-faint)]">
                        KR avg. {formatPercent(item.average_kr_progress)}
                      </div>
                    </div>

                    <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--button-secondary-bg)]">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#6d5efc_0%,#37cfff_100%)]"
                        style={{ width: `${Math.max(0, Math.min(100, item.progress ?? 0))}%` }}
                      />
                    </div>

                    <div className="mt-4 text-sm leading-6 text-[var(--foreground-muted)]">
                      Objective-linked OKR with measurable execution depth and owner visibility.
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No OKRs yet"
            description="Create your first OKR to connect an objective to measurable key results."
          />
        )}
      </SectionCard>

      {openForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-[30px] border border-[var(--border)] bg-[var(--background-elevated)] p-6 alamin-shadow">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
                  OKR editor
                </div>
                <div className="mt-3 text-3xl font-black tracking-[-0.04em] text-[var(--foreground)]">
                  {editingId ? "Edit OKR" : "Create OKR"}
                </div>
                <div className="mt-2 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)]">
                  Every OKR should belong to an objective and lead to key results and linked KPIs.
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
              <div className="md:col-span-2">
                <FieldShell label="Objective">
                  <select
                    value={form.objective_id}
                    onChange={(e) => setForm((s) => ({ ...s, objective_id: e.target.value }))}
                    className={selectClass()}
                  >
                    <option value="">Select objective</option>
                    {objectives.map((objective) => (
                      <option key={objective.id} value={objective.id}>
                        {objective.title}
                      </option>
                    ))}
                  </select>
                </FieldShell>
              </div>

              <div className="md:col-span-2">
                <FieldShell label="Title">
                  <input
                    value={form.title}
                    onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                    className={inputClass()}
                    placeholder="OKR title"
                  />
                </FieldShell>
              </div>

              <div className="md:col-span-2">
                <FieldShell label="Description">
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                    rows={4}
                    className={inputClass()}
                    placeholder="Describe the intent and expected outcome"
                  />
                </FieldShell>
              </div>

              <div>
                <FieldShell label="Owner">
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

              <div>
                <FieldShell label="Status">
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        status: e.target.value as FormState["status"],
                      }))
                    }
                    className={selectClass()}
                  >
                    <option value="draft">Draft</option>
                    <option value="pending_approval">Pending approval</option>
                    <option value="active">Active</option>
                    <option value="on_track">On track</option>
                    <option value="at_risk">At risk</option>
                    <option value="off_track">Off track</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </FieldShell>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className={primaryButtonClass()}
              >
                {saving ? "Saving..." : editingId ? "Save changes" : "Create OKR"}
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
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-soft)] p-3">
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