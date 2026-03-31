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
type OptionRow = { id: string; title: string; department_id?: string | null };
type Cluster = { id: string; title: string; department_id?: string | null; department_name?: string | null; objective_id?: string | null; objective_title?: string | null; okr_id?: string | null; okr_title?: string | null; key_result_id?: string | null; key_result_title?: string | null; status: string };
type Task = { id: string; jtbd_cluster_id?: string | null; cluster_title?: string | null; department_id?: string | null; department_name?: string | null; objective_id?: string | null; objective_title?: string | null; okr_id?: string | null; okr_title?: string | null; key_result_id?: string | null; key_result_title?: string | null; kpi_id?: string | null; kpi_title?: string | null; title: string; description?: string | null; status: string; priority: string; assigned_to_user_id?: string | null; due_date?: string | null; is_assigned_to_me?: boolean };
type Response = { ok: boolean; cycle?: { id: string; year: number; quarter: number; status: string } | null; departments?: Department[]; members?: Member[]; objectives?: OptionRow[]; okrs?: OptionRow[]; keyResults?: OptionRow[]; kpis?: OptionRow[]; clusters?: Cluster[]; tasks?: Task[]; canManage?: boolean; error?: string };
type FormState = { jtbd_cluster_id: string; cluster_title: string; cluster_description: string; department_id: string; objective_id: string; okr_id: string; key_result_id: string; kpi_id: string; title: string; description: string; status: string; priority: string; assigned_to_user_id: string; due_date: string; visible_to_department: boolean };
const EMPTY_FORM: FormState = { jtbd_cluster_id: "", cluster_title: "", cluster_description: "", department_id: "", objective_id: "", okr_id: "", key_result_id: "", kpi_id: "", title: "", description: "", status: "todo", priority: "medium", assigned_to_user_id: "", due_date: "", visible_to_department: true };
const getErrorMessage = (e: unknown, fallback: string) => e instanceof Error ? e.message : typeof e === "string" ? e : fallback;
async function safeParseJson(text: string) { try { return text.trim() ? JSON.parse(text) : null; } catch { return null; } }
const toneForStatus = (status?: string | null) => status === "done" || status === "completed" ? "success" : status === "blocked" ? "danger" : status === "in_progress" || status === "active" ? "info" : status === "cancelled" ? "neutral" : "warning";

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
    if (!session) { router.replace("/auth"); return null; }
    return session;
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true); setMsg(null);
    try {
      const session = await ensureAuth(); if (!session) return;
      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/tasks`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      const parsed = await safeParseJson(await res.text()) as Response | null;
      if (!res.ok || !parsed?.ok) throw new Error(parsed?.error || `Failed to load tasks (${res.status})`);
      setCycle(parsed.cycle ?? null); setDepartments(parsed.departments ?? []); setMembers(parsed.members ?? []); setObjectives(parsed.objectives ?? []); setOkrs(parsed.okrs ?? []); setKeyResults(parsed.keyResults ?? []); setKpis(parsed.kpis ?? []); setClusters(parsed.clusters ?? []); setTasks(parsed.tasks ?? []); setCanManage(Boolean(parsed.canManage));
    } catch (e) { setMsg(getErrorMessage(e, "Failed to load tasks")); }
    finally { setLoading(false); }
  }, [ensureAuth, orgSlug]);

  useEffect(() => { void load(); }, [load]);
  const cycleText = cycle ? `Q${cycle.quarter} ${cycle.year} · ${cycle.status}` : "No active cycle";
  const memberLabel = useMemo(() => new Map(members.map((m) => [m.userId, m.email ?? m.userId])), [members]);
  const clusterTitleMap = useMemo(() => new Map(clusters.map((c) => [c.id, c.title])), [clusters]);

  const openCreate = () => { setEditingId(null); setForm({ ...EMPTY_FORM, department_id: departments[0]?.id ?? "" }); setOpenForm(true); };
  const openEdit = (task: Task) => { setEditingId(task.id); setForm({ ...EMPTY_FORM, jtbd_cluster_id: task.jtbd_cluster_id ?? "", department_id: task.department_id ?? "", objective_id: task.objective_id ?? "", okr_id: task.okr_id ?? "", key_result_id: task.key_result_id ?? "", kpi_id: task.kpi_id ?? "", title: task.title, description: task.description ?? "", status: task.status, priority: task.priority, assigned_to_user_id: task.assigned_to_user_id ?? "", due_date: task.due_date ?? "" }); setOpenForm(true); };
  const closeForm = () => { setEditingId(null); setOpenForm(false); setForm(EMPTY_FORM); };

  const save = async () => {
    if (!canManage && !editingId) return;
    setSaving(true); setMsg(null); setSuccess(null);
    try {
      const session = await ensureAuth(); if (!session) return;
      const url = editingId ? `/api/o/${encodeURIComponent(orgSlug)}/tasks/${editingId}` : `/api/o/${encodeURIComponent(orgSlug)}/tasks`;
      const res = await fetch(url, { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(form) });
      const parsed = await safeParseJson(await res.text()) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !parsed?.ok) throw new Error(parsed?.error || `Failed to save task (${res.status})`);
      setSuccess(editingId ? "Task updated" : "Task created"); closeForm(); await load();
    } catch (e) { setMsg(getErrorMessage(e, "Failed to save task")); }
    finally { setSaving(false); }
  };
  const remove = async (id: string) => { if (!canManage || !confirm("Delete this task?")) return; try { const session = await ensureAuth(); if (!session) return; const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/tasks/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` } }); const parsed = await safeParseJson(await res.text()) as { ok?: boolean; error?: string } | null; if (!res.ok || !parsed?.ok) throw new Error(parsed?.error || `Failed to delete task (${res.status})`); await load(); } catch (e) { setMsg(getErrorMessage(e, "Failed to delete task")); } };

  return (
    <AppShell slug={orgSlug} sessionEmail={sessionEmail}>
      <AppPageHeader eyebrow={cycleText} title="Tasks" description="Execution work created from JTBD clusters, OKRs, key results, and KPI ownership." actions={canManage ? <button type="button" onClick={openCreate} className="rounded-2xl border border-white/12 bg-white px-5 py-3 text-sm font-semibold text-black">New task</button> : null} />
      <div className="space-y-6">
        {msg ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{msg}</div> : null}
        {success ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{success}</div> : null}
        {openForm ? <SectionCard title={editingId ? "Edit task" : "Create task"} subtitle="Assign the work item and connect it to the right execution chain."><div className="grid gap-4 md:grid-cols-2"><label><span className="mb-2 block text-sm text-white/60">Existing JTBD cluster</span><select value={form.jtbd_cluster_id} onChange={(e) => setForm((s) => ({ ...s, jtbd_cluster_id: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"><option value="">Create from new cluster title</option>{clusters.map((cluster) => <option key={cluster.id} value={cluster.id}>{cluster.title}</option>)}</select></label><label><span className="mb-2 block text-sm text-white/60">New cluster title</span><input value={form.cluster_title} onChange={(e) => setForm((s) => ({ ...s, cluster_title: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white" /></label><label><span className="mb-2 block text-sm text-white/60">Department</span><select value={form.department_id} onChange={(e) => setForm((s) => ({ ...s, department_id: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"><option value="">No department</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label><span className="mb-2 block text-sm text-white/60">Objective</span><select value={form.objective_id} onChange={(e) => setForm((s) => ({ ...s, objective_id: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"><option value="">None</option>{objectives.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label><label><span className="mb-2 block text-sm text-white/60">OKR</span><select value={form.okr_id} onChange={(e) => setForm((s) => ({ ...s, okr_id: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"><option value="">None</option>{okrs.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label><label><span className="mb-2 block text-sm text-white/60">Key result</span><select value={form.key_result_id} onChange={(e) => setForm((s) => ({ ...s, key_result_id: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"><option value="">None</option>{keyResults.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label><label><span className="mb-2 block text-sm text-white/60">Task title</span><input value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white" /></label><label><span className="mb-2 block text-sm text-white/60">Linked KPI</span><select value={form.kpi_id} onChange={(e) => setForm((s) => ({ ...s, kpi_id: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"><option value="">None</option>{kpis.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label><label className="md:col-span-2"><span className="mb-2 block text-sm text-white/60">Description</span><textarea value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} rows={3} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white" /></label><label><span className="mb-2 block text-sm text-white/60">Assigned to</span><select value={form.assigned_to_user_id} onChange={(e) => setForm((s) => ({ ...s, assigned_to_user_id: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"><option value="">Unassigned</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.email ?? m.userId}</option>)}</select></label><label><span className="mb-2 block text-sm text-white/60">Due date</span><input type="date" value={form.due_date} onChange={(e) => setForm((s) => ({ ...s, due_date: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white" /></label><label><span className="mb-2 block text-sm text-white/60">Status</span><select value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white">{["todo", "in_progress", "blocked", "done", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}</select></label><label><span className="mb-2 block text-sm text-white/60">Priority</span><select value={form.priority} onChange={(e) => setForm((s) => ({ ...s, priority: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white">{["low", "medium", "high", "critical"].map((s) => <option key={s} value={s}>{s}</option>)}</select></label></div><div className="mt-5 flex gap-3"><button type="button" onClick={save} disabled={saving} className="rounded-2xl border border-white/12 bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-60">{saving ? "Saving..." : editingId ? "Save changes" : "Create task"}</button><button type="button" onClick={closeForm} className="rounded-2xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-white">Cancel</button></div></SectionCard> : null}
        <SectionCard title="Execution board" subtitle="Live task registry across all JTBD clusters.">{loading ? <div className="text-sm text-white/55">Loading tasks...</div> : tasks.length === 0 ? <EmptyState title="No tasks yet" description="Create the first execution item and assign it to an owner." /> : <div className="grid gap-4 xl:grid-cols-2">{tasks.map((task) => <div key={task.id} className="rounded-[24px] border border-white/10 bg-black/20 p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-white">{task.title}</h3><div className="mt-2 flex flex-wrap gap-2"><StatusBadge tone={toneForStatus(task.status)}>{task.status}</StatusBadge><StatusBadge>{task.priority}</StatusBadge>{task.department_name ? <StatusBadge>{task.department_name}</StatusBadge> : null}</div></div>{task.is_assigned_to_me ? <StatusBadge tone="info">Assigned to me</StatusBadge> : null}</div>{task.description ? <p className="mt-4 text-sm leading-6 text-white/60">{task.description}</p> : null}<div className="mt-4 grid gap-2 text-sm text-white/50"><div>Cluster: {task.jtbd_cluster_id ? clusterTitleMap.get(task.jtbd_cluster_id) ?? task.cluster_title ?? task.jtbd_cluster_id : "—"}</div><div>Owner: {task.assigned_to_user_id ? memberLabel.get(task.assigned_to_user_id) ?? task.assigned_to_user_id : "Unassigned"}</div><div>Objective: {task.objective_title ?? "—"}</div><div>OKR: {task.okr_title ?? "—"}</div><div>KR: {task.key_result_title ?? "—"}</div><div>KPI: {task.kpi_title ?? "—"}</div><div>Due date: {task.due_date || "—"}</div></div>{canManage ? <div className="mt-5 flex gap-2"><button type="button" onClick={() => openEdit(task)} className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white">Edit</button><button type="button" onClick={() => remove(task.id)} className="rounded-xl border border-red-400/15 bg-red-400/10 px-3 py-2 text-sm text-red-100">Delete</button></div> : null}</div>)}</div>}</SectionCard>
      </div>
    </AppShell>
  );
}
