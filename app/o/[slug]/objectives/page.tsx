"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";

type Department = { id: string; name: string };
type Member = { userId: string; email: string | null; role: string; departmentId?: string | null };
type Kpi = { id: string; title: string; department_id?: string | null };
type Objective = {
  id: string;
  title: string;
  description?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  owner_user_id?: string | null;
  status: string;
  progress: number;
  linked_kpi_ids: string[];
  is_assigned_to_me?: boolean;
};
type Response = {
  ok: boolean;
  cycle?: { id: string; year: number; quarter: number; status: string } | null;
  departments?: Department[];
  assignableMembers?: Member[];
  kpis?: Kpi[];
  objectives?: Objective[];
  canManage?: boolean;
  visibility?: string;
  error?: string;
};

type FormState = {
  title: string;
  description: string;
  department_id: string;
  owner_user_id: string;
  status: string;
  progress: string;
  linked_kpi_ids: string[];
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  department_id: "",
  owner_user_id: "",
  status: "draft",
  progress: "0",
  linked_kpi_ids: [],
};

const statuses = [
  "draft",
  "active",
  "on_track",
  "at_risk",
  "off_track",
  "completed",
  "cancelled",
];

const toneForStatus = (status?: string | null) =>
  status === "completed" || status === "on_track"
    ? "success"
    : status === "at_risk"
      ? "warning"
      : status === "off_track" || status === "cancelled"
        ? "danger"
        : status === "active"
          ? "info"
          : "neutral";

const getErrorMessage = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : typeof e === "string" ? e : fallback;

async function safeParseJson(text: string) {
  try {
    return text.trim() ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function inputClass() {
  return "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[var(--foreground)] outline-none transition placeholder:text-[var(--foreground-faint)] focus:border-[var(--border-strong)]";
}

function panelClass() {
  return "rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-5 alamin-shadow";
}

function subtlePanelClass() {
  return "rounded-[22px] border border-[var(--border)] bg-[var(--card-soft)] p-4";
}

export default function ObjectivesPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const orgSlug = String(params?.slug ?? "");

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cycle, setCycle] = useState<Response["cycle"]>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
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

    try {
      const session = await ensureAuth();
      if (!session) return;

      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/objectives`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });

      const parsed = (await safeParseJson(await res.text())) as Response | null;
      if (!res.ok || !parsed?.ok) {
        throw new Error(parsed?.error || `Failed to load objectives (${res.status})`);
      }

      setCycle(parsed.cycle ?? null);
      setDepartments(parsed.departments ?? []);
      setMembers(parsed.assignableMembers ?? []);
      setKpis(parsed.kpis ?? []);
      setObjectives(parsed.objectives ?? []);
      setCanManage(Boolean(parsed.canManage));
    } catch (e) {
      setMsg(getErrorMessage(e, "Failed to load objectives"));
    } finally {
      setLoading(false);
    }
  }, [ensureAuth, orgSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const memberLabel = useMemo(
    () => new Map(members.map((m) => [m.userId, m.email ?? m.userId])),
    [members]
  );

  const kpiLabel = useMemo(
    () => new Map(kpis.map((k) => [k.id, k.title])),
    [kpis]
  );

  const filteredKpis = useMemo(
    () =>
      form.department_id
        ? kpis.filter((k) => !k.department_id || k.department_id === form.department_id)
        : kpis,
    [form.department_id, kpis]
  );

  const cycleText = cycle ? `Q${cycle.quarter} ${cycle.year} · ${cycle.status}` : "No active cycle";

  const stats = useMemo(() => {
    const total = objectives.length;
    const completed = objectives.filter((o) => o.status === "completed").length;
    const atRisk = objectives.filter((o) => o.status === "at_risk").length;
    const avgProgress =
      total > 0
        ? Math.round(
            objectives.reduce((sum, o) => sum + Number(o.progress || 0), 0) / total
          )
        : 0;

    return { total, completed, atRisk, avgProgress };
  }, [objectives]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, department_id: departments[0]?.id ?? "" });
    setOpenForm(true);
    setMsg(null);
    setSuccess(null);
  };

  const openEdit = (row: Objective) => {
    setEditingId(row.id);
    setForm({
      title: row.title,
      description: row.description ?? "",
      department_id: row.department_id ?? "",
      owner_user_id: row.owner_user_id ?? "",
      status: row.status,
      progress: String(row.progress ?? 0),
      linked_kpi_ids: row.linked_kpi_ids ?? [],
    });
    setOpenForm(true);
    setMsg(null);
    setSuccess(null);
  };

  const closeForm = () => {
    setOpenForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const save = async () => {
    if (!canManage) return;

    setSaving(true);
    setMsg(null);
    setSuccess(null);

    try {
      const session = await ensureAuth();
      if (!session) return;

      const url = editingId
        ? `/api/o/${encodeURIComponent(orgSlug)}/objectives/${editingId}`
        : `/api/o/${encodeURIComponent(orgSlug)}/objectives`;

      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ...form,
          progress: Number(form.progress || 0),
        }),
      });

      const parsed = (await safeParseJson(await res.text())) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !parsed?.ok) {
        throw new Error(parsed?.error || `Failed to save objective (${res.status})`);
      }

      setSuccess(editingId ? "Objective updated" : "Objective created");
      closeForm();
      await load();
    } catch (e) {
      setMsg(getErrorMessage(e, "Failed to save objective"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!canManage || !confirm("Delete this objective?")) return;

    try {
      const session = await ensureAuth();
      if (!session) return;

      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/objectives/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const parsed = (await safeParseJson(await res.text())) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !parsed?.ok) {
        throw new Error(parsed?.error || `Failed to delete objective (${res.status})`);
      }

      await load();
    } catch (e) {
      setMsg(getErrorMessage(e, "Failed to delete objective"));
    }
  };

  return (
    <AppShell
      slug={orgSlug}
      sessionEmail={sessionEmail}
      topActions={
        canManage ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90"
          >
            New objective
          </button>
        ) : null
      }
    >
      <AppPageHeader
        eyebrow={cycleText}
        title="Objectives"
        description="Company and department goals for the active cycle, linked directly to measurable KPIs."
      />

      <div className="space-y-6">
        {msg ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-100">
            {msg}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">
            {success}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total objectives"
            value={String(stats.total)}
            hint="Current registry size"
          />
          <MetricCard
            label="Completed"
            value={String(stats.completed)}
            hint="Objectives marked completed"
          />
          <MetricCard
            label="At risk"
            value={String(stats.atRisk)}
            hint="Needs executive attention"
          />
          <MetricCard
            label="Average progress"
            value={`${stats.avgProgress}%`}
            hint="Across all active objectives"
          />
        </section>

        {openForm ? (
          <SectionCard
            title={editingId ? "Edit objective" : "Create objective"}
            subtitle="Define the goal, owner, department, and KPI linkage."
            className="bg-[var(--background-panel)]"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <FieldShell label="Title">
                <input
                  value={form.title}
                  onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                  className={inputClass()}
                  placeholder="Objective title"
                />
              </FieldShell>

              <FieldShell label="Department">
                <select
                  value={form.department_id}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      department_id: e.target.value,
                      linked_kpi_ids: [],
                    }))
                  }
                  className={inputClass()}
                >
                  <option value="">No department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </FieldShell>

              <div className="md:col-span-2">
                <FieldShell label="Description">
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                    rows={4}
                    className={inputClass()}
                    placeholder="Describe the outcome this objective is meant to achieve"
                  />
                </FieldShell>
              </div>

              <FieldShell label="Owner">
                <select
                  value={form.owner_user_id}
                  onChange={(e) => setForm((s) => ({ ...s, owner_user_id: e.target.value }))}
                  className={inputClass()}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.email ?? m.userId}
                    </option>
                  ))}
                </select>
              </FieldShell>

              <FieldShell label="Status">
                <select
                  value={form.status}
                  onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}
                  className={inputClass()}
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </FieldShell>

              <FieldShell label="Progress %">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.progress}
                  onChange={(e) => setForm((s) => ({ ...s, progress: e.target.value }))}
                  className={inputClass()}
                  placeholder="0"
                />
              </FieldShell>

              <div className="md:col-span-2">
                <FieldShell label="Linked KPIs" hint="Hold Cmd/Ctrl to select multiple KPIs">
                  <select
                    multiple
                    value={form.linked_kpi_ids}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        linked_kpi_ids: Array.from(e.target.selectedOptions).map((o) => o.value),
                      }))
                    }
                    className={`${inputClass()} min-h-40`}
                  >
                    {filteredKpis.map((kpi) => (
                      <option key={kpi.id} value={kpi.id}>
                        {kpi.title}
                      </option>
                    ))}
                  </select>
                </FieldShell>
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Saving..." : editingId ? "Save changes" : "Create objective"}
              </button>

              <button
                type="button"
                onClick={closeForm}
                className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
              >
                Cancel
              </button>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Objective registry"
          subtitle="Current goals, ownership, and KPI linkage."
          className="bg-[var(--background-panel)]"
        >
          {loading ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-64 animate-pulse rounded-[24px] border border-[var(--border)] bg-[var(--card)]"
                />
              ))}
            </div>
          ) : objectives.length === 0 ? (
            <EmptyState
              title="No objectives yet"
              description="Create the first objective for this cycle so OKRs and execution can be built on top of it."
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {objectives.map((row) => (
                <div key={row.id} className={panelClass()}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-[var(--foreground)]">{row.title}</h3>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <StatusBadge tone={toneForStatus(row.status)}>
                          {row.status}
                        </StatusBadge>

                        {row.department_name ? (
                          <StatusBadge>{row.department_name}</StatusBadge>
                        ) : null}

                        {row.is_assigned_to_me ? (
                          <StatusBadge tone="info">Assigned to me</StatusBadge>
                        ) : null}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-black text-[var(--foreground)]">
                        {row.progress ?? 0}%
                      </div>
                      <div className="text-xs text-[var(--foreground-faint)]">progress</div>
                    </div>
                  </div>

                  {row.description ? (
                    <p className="mt-4 text-sm leading-6 text-[var(--foreground-muted)]">
                      {row.description}
                    </p>
                  ) : null}

                  <div className="mt-4 text-sm text-[var(--foreground-muted)]">
                    Owner:{" "}
                    <span className="font-medium text-[var(--foreground)]">
                      {row.owner_user_id
                        ? memberLabel.get(row.owner_user_id) ?? row.owner_user_id
                        : "Unassigned"}
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[var(--foreground-faint)]">
                      Linked KPIs
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {row.linked_kpi_ids?.length ? (
                        row.linked_kpi_ids.map((id) => (
                          <span
                            key={id}
                            className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-3 py-1 text-xs font-medium text-[var(--foreground-soft)]"
                          >
                            {kpiLabel.get(id) ?? id}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-[var(--foreground-faint)]">
                          No linked KPIs
                        </span>
                      )}
                    </div>
                  </div>

                  {canManage ? (
                    <div className="mt-5 flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => remove(row.id)}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-500/15 dark:text-red-100"
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-5 alamin-shadow">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-faint)]">
        {label}
      </div>
      <div className="mt-3 text-3xl font-black tracking-[-0.03em] text-[var(--foreground)]">
        {value}
      </div>
      <div className="mt-2 text-sm text-[var(--foreground-muted)]">{hint}</div>
    </div>
  );
}

function FieldShell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-[var(--foreground-soft)]">{label}</span>
        {hint ? (
          <span className="text-xs text-[var(--foreground-faint)]">{hint}</span>
        ) : null}
      </div>
      {children}
    </label>
  );
}