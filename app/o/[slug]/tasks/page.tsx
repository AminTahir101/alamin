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
type Member = {
  userId: string;
  email: string | null;
  role: string;
  departmentId?: string | null;
};
type OptionRow = { id: string; title: string; department_id?: string | null };
type Cluster = {
  id: string;
  title: string;
  department_id?: string | null;
  department_name?: string | null;
  objective_id?: string | null;
  objective_title?: string | null;
  okr_id?: string | null;
  okr_title?: string | null;
  key_result_id?: string | null;
  key_result_title?: string | null;
  status: string;
};
type Task = {
  id: string;
  jtbd_cluster_id?: string | null;
  cluster_title?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  objective_id?: string | null;
  objective_title?: string | null;
  okr_id?: string | null;
  okr_title?: string | null;
  key_result_id?: string | null;
  key_result_title?: string | null;
  kpi_id?: string | null;
  kpi_title?: string | null;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  assigned_to_user_id?: string | null;
  due_date?: string | null;
  is_assigned_to_me?: boolean;
};
type Response = {
  ok: boolean;
  cycle?: { id: string; year: number; quarter: number; status: string } | null;
  departments?: Department[];
  members?: Member[];
  objectives?: OptionRow[];
  okrs?: OptionRow[];
  keyResults?: OptionRow[];
  kpis?: OptionRow[];
  clusters?: Cluster[];
  tasks?: Task[];
  canManage?: boolean;
  error?: string;
};
type FormState = {
  jtbd_cluster_id: string;
  cluster_title: string;
  cluster_description: string;
  department_id: string;
  objective_id: string;
  okr_id: string;
  key_result_id: string;
  kpi_id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigned_to_user_id: string;
  due_date: string;
  visible_to_department: boolean;
};

const EMPTY_FORM: FormState = {
  jtbd_cluster_id: "",
  cluster_title: "",
  cluster_description: "",
  department_id: "",
  objective_id: "",
  okr_id: "",
  key_result_id: "",
  kpi_id: "",
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  assigned_to_user_id: "",
  due_date: "",
  visible_to_department: true,
};

const getErrorMessage = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : typeof e === "string" ? e : fallback;

async function safeParseJson(text: string) {
  try {
    return text.trim() ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

const toneForStatus = (status?: string | null) =>
  status === "done" || status === "completed"
    ? "success"
    : status === "blocked"
      ? "danger"
      : status === "in_progress" || status === "active"
        ? "info"
        : status === "cancelled"
          ? "neutral"
          : "warning";

const toneForPriority = (priority?: string | null) =>
  priority === "critical"
    ? "danger"
    : priority === "high"
      ? "warning"
      : priority === "medium"
        ? "info"
        : "neutral";

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

function metricCardToneClass(tone: "default" | "success" | "warning" | "danger" | "info") {
  switch (tone) {
    case "success":
      return "border-emerald-500/20 bg-emerald-500/10";
    case "warning":
      return "border-amber-500/20 bg-amber-500/10";
    case "danger":
      return "border-red-500/20 bg-red-500/10";
    case "info":
      return "border-sky-500/20 bg-sky-500/10";
    default:
      return "border-[var(--border)] bg-[var(--card)]";
  }
}

function prettyText(value?: string | null) {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  return text.replaceAll("_", " ");
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export default function TasksPage() {
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
  const [objectives, setObjectives] = useState<OptionRow[]>([]);
  const [okrs, setOkrs] = useState<OptionRow[]>([]);
  const [keyResults, setKeyResults] = useState<OptionRow[]>([]);
  const [kpis, setKpis] = useState<OptionRow[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
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

      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/tasks`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });

      const parsed = (await safeParseJson(await res.text())) as Response | null;
      if (!res.ok || !parsed?.ok) {
        throw new Error(parsed?.error || `Failed to load tasks (${res.status})`);
      }

      setCycle(parsed.cycle ?? null);
      setDepartments(parsed.departments ?? []);
      setMembers(parsed.members ?? []);
      setObjectives(parsed.objectives ?? []);
      setOkrs(parsed.okrs ?? []);
      setKeyResults(parsed.keyResults ?? []);
      setKpis(parsed.kpis ?? []);
      setClusters(parsed.clusters ?? []);
      setTasks(parsed.tasks ?? []);
      setCanManage(Boolean(parsed.canManage));
    } catch (e) {
      setMsg(getErrorMessage(e, "Failed to load tasks"));
    } finally {
      setLoading(false);
    }
  }, [ensureAuth, orgSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const cycleText = cycle ? `Q${cycle.quarter} ${cycle.year} · ${cycle.status}` : "No active cycle";

  const memberLabel = useMemo(
    () => new Map(members.map((m) => [m.userId, m.email ?? m.userId])),
    [members],
  );

  const clusterTitleMap = useMemo(
    () => new Map(clusters.map((c) => [c.id, c.title])),
    [clusters],
  );

  const summary = useMemo(() => {
    const total = tasks.length;
    const open = tasks.filter((task) => !["done", "cancelled"].includes(task.status)).length;
    const blocked = tasks.filter((task) => task.status === "blocked").length;
    const assigned = tasks.filter((task) => !!task.assigned_to_user_id).length;
    return { total, open, blocked, assigned };
  }, [tasks]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, department_id: departments[0]?.id ?? "" });
    setOpenForm(true);
    setMsg(null);
    setSuccess(null);
  };

  const openEdit = (task: Task) => {
    setEditingId(task.id);
    setForm({
      ...EMPTY_FORM,
      jtbd_cluster_id: task.jtbd_cluster_id ?? "",
      department_id: task.department_id ?? "",
      objective_id: task.objective_id ?? "",
      okr_id: task.okr_id ?? "",
      key_result_id: task.key_result_id ?? "",
      kpi_id: task.kpi_id ?? "",
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      priority: task.priority,
      assigned_to_user_id: task.assigned_to_user_id ?? "",
      due_date: task.due_date ?? "",
    });
    setOpenForm(true);
    setMsg(null);
    setSuccess(null);
  };

  const closeForm = () => {
    setEditingId(null);
    setOpenForm(false);
    setForm(EMPTY_FORM);
  };

  const save = async () => {
    if (!canManage && !editingId) return;

    setSaving(true);
    setMsg(null);
    setSuccess(null);

    try {
      const session = await ensureAuth();
      if (!session) return;

      const url = editingId
        ? `/api/o/${encodeURIComponent(orgSlug)}/tasks/${editingId}`
        : `/api/o/${encodeURIComponent(orgSlug)}/tasks`;

      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(form),
      });

      const parsed = (await safeParseJson(await res.text())) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !parsed?.ok) {
        throw new Error(parsed?.error || `Failed to save task (${res.status})`);
      }

      setSuccess(editingId ? "Task updated" : "Task created");
      closeForm();
      await load();
    } catch (e) {
      setMsg(getErrorMessage(e, "Failed to save task"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!canManage || !confirm("Delete this task?")) return;

    try {
      const session = await ensureAuth();
      if (!session) return;

      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/tasks/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const parsed = (await safeParseJson(await res.text())) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !parsed?.ok) {
        throw new Error(parsed?.error || `Failed to delete task (${res.status})`);
      }

      await load();
    } catch (e) {
      setMsg(getErrorMessage(e, "Failed to delete task"));
    }
  };

  return (
    <AppShell
      slug={orgSlug}
      sessionEmail={sessionEmail}
      topActions={
        canManage ? (
          <button type="button" onClick={openCreate} className={primaryButtonClass()}>
            New task
          </button>
        ) : null
      }
    >
      <AppPageHeader
        eyebrow={cycleText}
        title="Tasks"
        description="Execution work created from JTBD clusters, OKRs, key results, and KPI ownership."
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

        <section className="overflow-hidden rounded-[30px] border border-[var(--border)] bg-[var(--background-panel)] p-6 alamin-shadow">
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground-faint)]">
                <span className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />
                Execution board
              </div>

              <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-[var(--foreground)]">
                Turn plans into owned work and visible follow-through.
              </h2>

              <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--foreground-muted)]">
                Tasks are where JTBD clusters, OKRs, key results, and KPI pressure become actual execution.
                This page is your operating layer for assignment, urgency, and delivery.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <div className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)]">
                  Linked to strategy
                </div>
                <div className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)]">
                  Assignable to owners
                </div>
                <div className="rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)]">
                  Built for execution visibility
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <MetricCard label="Total tasks" value={String(summary.total)} hint="All execution items" tone="default" />
              <MetricCard label="Open work" value={String(summary.open)} hint="Still needs progress" tone="info" />
              <MetricCard label="Blocked" value={String(summary.blocked)} hint="Needs intervention" tone={summary.blocked > 0 ? "danger" : "success"} />
              <MetricCard label="Assigned" value={String(summary.assigned)} hint="Tasks with an owner" tone="warning" />
            </div>
          </div>
        </section>

        {openForm ? (
          <SectionCard
            title={editingId ? "Edit task" : "Create task"}
            subtitle="Assign the work item and connect it to the right execution chain."
            className="bg-[var(--background-panel)]"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <FieldShell label="Existing JTBD cluster">
                <select
                  value={form.jtbd_cluster_id}
                  onChange={(e) => setForm((s) => ({ ...s, jtbd_cluster_id: e.target.value }))}
                  className={selectClass()}
                >
                  <option value="">Create from new cluster title</option>
                  {clusters.map((cluster) => (
                    <option key={cluster.id} value={cluster.id}>
                      {cluster.title}
                    </option>
                  ))}
                </select>
              </FieldShell>

              <FieldShell label="New cluster title">
                <input
                  value={form.cluster_title}
                  onChange={(e) => setForm((s) => ({ ...s, cluster_title: e.target.value }))}
                  className={inputClass()}
                  placeholder="Optional new JTBD cluster"
                />
              </FieldShell>

              <FieldShell label="Department">
                <select
                  value={form.department_id}
                  onChange={(e) => setForm((s) => ({ ...s, department_id: e.target.value }))}
                  className={selectClass()}
                >
                  <option value="">No department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </FieldShell>

              <FieldShell label="Objective">
                <select
                  value={form.objective_id}
                  onChange={(e) => setForm((s) => ({ ...s, objective_id: e.target.value }))}
                  className={selectClass()}
                >
                  <option value="">None</option>
                  {objectives.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.title}
                    </option>
                  ))}
                </select>
              </FieldShell>

              <FieldShell label="OKR">
                <select
                  value={form.okr_id}
                  onChange={(e) => setForm((s) => ({ ...s, okr_id: e.target.value }))}
                  className={selectClass()}
                >
                  <option value="">None</option>
                  {okrs.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.title}
                    </option>
                  ))}
                </select>
              </FieldShell>

              <FieldShell label="Key result">
                <select
                  value={form.key_result_id}
                  onChange={(e) => setForm((s) => ({ ...s, key_result_id: e.target.value }))}
                  className={selectClass()}
                >
                  <option value="">None</option>
                  {keyResults.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.title}
                    </option>
                  ))}
                </select>
              </FieldShell>

              <FieldShell label="Task title">
                <input
                  value={form.title}
                  onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                  className={inputClass()}
                  placeholder="Task title"
                />
              </FieldShell>

              <FieldShell label="Linked KPI">
                <select
                  value={form.kpi_id}
                  onChange={(e) => setForm((s) => ({ ...s, kpi_id: e.target.value }))}
                  className={selectClass()}
                >
                  <option value="">None</option>
                  {kpis.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.title}
                    </option>
                  ))}
                </select>
              </FieldShell>

              <div className="md:col-span-2">
                <FieldShell label="Description">
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                    rows={3}
                    className={textareaClass()}
                    placeholder="Describe the execution work"
                  />
                </FieldShell>
              </div>

              <FieldShell label="Assigned to">
                <select
                  value={form.assigned_to_user_id}
                  onChange={(e) => setForm((s) => ({ ...s, assigned_to_user_id: e.target.value }))}
                  className={selectClass()}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.email ?? m.userId}
                    </option>
                  ))}
                </select>
              </FieldShell>

              <FieldShell label="Due date">
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((s) => ({ ...s, due_date: e.target.value }))}
                  className={inputClass()}
                />
              </FieldShell>

              <FieldShell label="Status">
                <select
                  value={form.status}
                  onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}
                  className={selectClass()}
                >
                  {["todo", "in_progress", "blocked", "done", "cancelled"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </FieldShell>

              <FieldShell label="Priority">
                <select
                  value={form.priority}
                  onChange={(e) => setForm((s) => ({ ...s, priority: e.target.value }))}
                  className={selectClass()}
                >
                  {["low", "medium", "high", "critical"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </FieldShell>
            </div>

            <div className="mt-5 flex gap-3">
              <button type="button" onClick={save} disabled={saving} className={primaryButtonClass()}>
                {saving ? "Saving..." : editingId ? "Save changes" : "Create task"}
              </button>
              <button type="button" onClick={closeForm} className={secondaryButtonClass()}>
                Cancel
              </button>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Execution board"
          subtitle="Live task registry across all JTBD clusters."
          className="bg-[var(--background-panel)]"
        >
          {loading ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-52 animate-pulse rounded-[24px] border border-[var(--border)] bg-[var(--card)]"
                />
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <EmptyState
              title="No tasks yet"
              description="Create the first execution item and assign it to an owner."
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-5 alamin-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-[var(--foreground)]">{task.title}</h3>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <StatusBadge tone={toneForStatus(task.status)}>
                          {prettyText(task.status)}
                        </StatusBadge>
                        <StatusBadge tone={toneForPriority(task.priority)}>
                          {prettyText(task.priority)}
                        </StatusBadge>
                        {task.department_name ? <StatusBadge>{task.department_name}</StatusBadge> : null}
                      </div>
                    </div>

                    {task.is_assigned_to_me ? <StatusBadge tone="info">Assigned to me</StatusBadge> : null}
                  </div>

                  {task.description ? (
                    <p className="mt-4 text-sm leading-6 text-[var(--foreground-muted)]">
                      {task.description}
                    </p>
                  ) : null}

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <DetailTile
                      label="Cluster"
                      value={
                        task.jtbd_cluster_id
                          ? clusterTitleMap.get(task.jtbd_cluster_id) ??
                            task.cluster_title ??
                            task.jtbd_cluster_id
                          : "—"
                      }
                    />
                    <DetailTile
                      label="Owner"
                      value={
                        task.assigned_to_user_id
                          ? memberLabel.get(task.assigned_to_user_id) ?? task.assigned_to_user_id
                          : "Unassigned"
                      }
                    />
                    <DetailTile label="Objective" value={task.objective_title ?? "—"} />
                    <DetailTile label="OKR" value={task.okr_title ?? "—"} />
                    <DetailTile label="Key Result" value={task.key_result_title ?? "—"} />
                    <DetailTile label="KPI" value={task.kpi_title ?? "—"} />
                    <DetailTile label="Due date" value={fmtDate(task.due_date)} />
                    <DetailTile label="Department" value={task.department_name ?? "—"} />
                  </div>

                  {canManage ? (
                    <div className="mt-5 flex gap-2">
                      <button type="button" onClick={() => openEdit(task)} className={secondaryButtonClass()}>
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(task.id)}
                        className="inline-flex h-11 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 px-5 text-sm font-semibold text-red-700 transition hover:bg-red-500/15 dark:text-red-100"
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
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
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