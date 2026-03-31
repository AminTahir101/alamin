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
const EMPTY_FORM: FormState = { title: "", description: "", department_id: "", owner_user_id: "", status: "draft", progress: "0", linked_kpi_ids: [] };
const statuses = ["draft", "active", "on_track", "at_risk", "off_track", "completed", "cancelled"];
const toneForStatus = (status?: string | null) => status === "completed" || status === "on_track" ? "success" : status === "at_risk" ? "warning" : status === "off_track" || status === "cancelled" ? "danger" : status === "active" ? "info" : "neutral";
const getErrorMessage = (e: unknown, fallback: string) => e instanceof Error ? e.message : typeof e === "string" ? e : fallback;
async function safeParseJson(text: string) { try { return text.trim() ? JSON.parse(text) : null; } catch { return null; } }

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
    if (!session) { router.replace("/auth"); return null; }
    return session;
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true); setMsg(null);
    try {
      const session = await ensureAuth(); if (!session) return;
      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/objectives`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      const parsed = await safeParseJson(await res.text()) as Response | null;
      if (!res.ok || !parsed?.ok) throw new Error(parsed?.error || `Failed to load objectives (${res.status})`);
      setCycle(parsed.cycle ?? null);
      setDepartments(parsed.departments ?? []);
      setMembers(parsed.assignableMembers ?? []);
      setKpis(parsed.kpis ?? []);
      setObjectives(parsed.objectives ?? []);
      setCanManage(Boolean(parsed.canManage));
    } catch (e) { setMsg(getErrorMessage(e, "Failed to load objectives")); }
    finally { setLoading(false); }
  }, [ensureAuth, orgSlug]);

  useEffect(() => { void load(); }, [load]);

  const memberLabel = useMemo(() => new Map(members.map((m) => [m.userId, m.email ?? m.userId])), [members]);
  const kpiLabel = useMemo(() => new Map(kpis.map((k) => [k.id, k.title])), [kpis]);
  const filteredKpis = useMemo(() => form.department_id ? kpis.filter((k) => !k.department_id || k.department_id === form.department_id) : kpis, [form.department_id, kpis]);
  const cycleText = cycle ? `Q${cycle.quarter} ${cycle.year} · ${cycle.status}` : "No active cycle";

  const openCreate = () => { setEditingId(null); setForm({ ...EMPTY_FORM, department_id: departments[0]?.id ?? "" }); setOpenForm(true); setMsg(null); setSuccess(null); };
  const openEdit = (row: Objective) => { setEditingId(row.id); setForm({ title: row.title, description: row.description ?? "", department_id: row.department_id ?? "", owner_user_id: row.owner_user_id ?? "", status: row.status, progress: String(row.progress ?? 0), linked_kpi_ids: row.linked_kpi_ids ?? [] }); setOpenForm(true); setMsg(null); setSuccess(null); };
  const closeForm = () => { setOpenForm(false); setEditingId(null); setForm(EMPTY_FORM); };

  const save = async () => {
    if (!canManage) return;
    setSaving(true); setMsg(null); setSuccess(null);
    try {
      const session = await ensureAuth(); if (!session) return;
      const url = editingId ? `/api/o/${encodeURIComponent(orgSlug)}/objectives/${editingId}` : `/api/o/${encodeURIComponent(orgSlug)}/objectives`;
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ...form, progress: Number(form.progress || 0) }),
      });
      const parsed = await safeParseJson(await res.text()) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !parsed?.ok) throw new Error(parsed?.error || `Failed to save objective (${res.status})`);
      setSuccess(editingId ? "Objective updated" : "Objective created");
      closeForm();
      await load();
    } catch (e) { setMsg(getErrorMessage(e, "Failed to save objective")); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!canManage || !confirm("Delete this objective?")) return;
    try {
      const session = await ensureAuth(); if (!session) return;
      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/objectives/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` } });
      const parsed = await safeParseJson(await res.text()) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !parsed?.ok) throw new Error(parsed?.error || `Failed to delete objective (${res.status})`);
      await load();
    } catch (e) { setMsg(getErrorMessage(e, "Failed to delete objective")); }
  };

  return (
    <AppShell slug={orgSlug} sessionEmail={sessionEmail}>
      <AppPageHeader eyebrow={cycleText} title="Objectives" description="Company and department goals for the active cycle, linked directly to measurable KPIs." actions={canManage ? <button type="button" onClick={openCreate} className="rounded-2xl border border-white/12 bg-white px-5 py-3 text-sm font-semibold text-black">New objective</button> : null} />

      <div className="space-y-6">
        {msg ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{msg}</div> : null}
        {success ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{success}</div> : null}

        {openForm ? (
          <SectionCard title={editingId ? "Edit objective" : "Create objective"} subtitle="Define the goal, owner, department, and KPI linkage.">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block"><span className="mb-2 block text-sm text-white/60">Title</span><input value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" /></label>
              <label className="block"><span className="mb-2 block text-sm text-white/60">Department</span><select value={form.department_id} onChange={(e) => setForm((s) => ({ ...s, department_id: e.target.value, linked_kpi_ids: [] }))} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"><option value="">No department</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
              <label className="block md:col-span-2"><span className="mb-2 block text-sm text-white/60">Description</span><textarea value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} rows={4} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" /></label>
              <label className="block"><span className="mb-2 block text-sm text-white/60">Owner</span><select value={form.owner_user_id} onChange={(e) => setForm((s) => ({ ...s, owner_user_id: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"><option value="">Unassigned</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.email ?? m.userId}</option>)}</select></label>
              <label className="block"><span className="mb-2 block text-sm text-white/60">Status</span><select value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none">{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
              <label className="block"><span className="mb-2 block text-sm text-white/60">Progress %</span><input type="number" min={0} max={100} value={form.progress} onChange={(e) => setForm((s) => ({ ...s, progress: e.target.value }))} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" /></label>
              <label className="block md:col-span-2"><span className="mb-2 block text-sm text-white/60">Linked KPIs</span><select multiple value={form.linked_kpi_ids} onChange={(e) => setForm((s) => ({ ...s, linked_kpi_ids: Array.from(e.target.selectedOptions).map((o) => o.value) }))} className="min-h-36 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none">{filteredKpis.map((kpi) => <option key={kpi.id} value={kpi.id}>{kpi.title}</option>)}</select><div className="mt-2 text-xs text-white/40">Hold Cmd/Ctrl to select multiple KPIs.</div></label>
            </div>
            <div className="mt-5 flex gap-3"><button type="button" onClick={save} disabled={saving} className="rounded-2xl border border-white/12 bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-60">{saving ? "Saving..." : editingId ? "Save changes" : "Create objective"}</button><button type="button" onClick={closeForm} className="rounded-2xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-white">Cancel</button></div>
          </SectionCard>
        ) : null}

        <SectionCard title="Objective registry" subtitle="Current goals, ownership, and KPI linkage.">
          {loading ? <div className="text-sm text-white/55">Loading objectives...</div> : objectives.length === 0 ? <EmptyState title="No objectives yet" description="Create the first objective for this cycle so OKRs and execution can be built on top of it." /> : <div className="grid gap-4 xl:grid-cols-2">{objectives.map((row) => <div key={row.id} className="rounded-[24px] border border-white/10 bg-black/20 p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-white">{row.title}</h3><div className="mt-2 flex flex-wrap gap-2"><StatusBadge tone={toneForStatus(row.status)}>{row.status}</StatusBadge>{row.department_name ? <StatusBadge>{row.department_name}</StatusBadge> : null}{row.is_assigned_to_me ? <StatusBadge tone="info">Assigned to me</StatusBadge> : null}</div></div><div className="text-right"><div className="text-2xl font-black text-white">{row.progress ?? 0}%</div><div className="text-xs text-white/45">progress</div></div></div>{row.description ? <p className="mt-4 text-sm leading-6 text-white/60">{row.description}</p> : null}<div className="mt-4 text-sm text-white/50">Owner: {row.owner_user_id ? memberLabel.get(row.owner_user_id) ?? row.owner_user_id : "Unassigned"}</div><div className="mt-4"><div className="mb-2 text-xs uppercase tracking-[0.16em] text-white/35">Linked KPIs</div><div className="flex flex-wrap gap-2">{row.linked_kpi_ids?.length ? row.linked_kpi_ids.map((id) => <span key={id} className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-white/70">{kpiLabel.get(id) ?? id}</span>) : <span className="text-sm text-white/35">No linked KPIs</span>}</div></div>{canManage ? <div className="mt-5 flex gap-2"><button type="button" onClick={() => openEdit(row)} className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white">Edit</button><button type="button" onClick={() => remove(row.id)} className="rounded-xl border border-red-400/15 bg-red-400/10 px-3 py-2 text-sm text-red-100">Delete</button></div> : null}</div>)}</div>}
        </SectionCard>
      </div>
    </AppShell>
  );
}
