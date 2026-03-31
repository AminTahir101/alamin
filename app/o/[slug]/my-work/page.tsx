"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";

type Task = { id: string; title: string; description?: string | null; status: string; priority: string; due_date?: string | null; department_name?: string | null; objective_title?: string | null; okr_title?: string | null; key_result_title?: string | null; kpi_title?: string | null };
type Response = { ok: boolean; cycle?: { id: string; year: number; quarter: number; status: string } | null; tasks?: Task[]; error?: string };
const getErrorMessage = (e: unknown, fallback: string) => e instanceof Error ? e.message : typeof e === "string" ? e : fallback;
async function safeParseJson(text: string) { try { return text.trim() ? JSON.parse(text) : null; } catch { return null; } }
const toneForStatus = (status?: string | null) => status === "done" ? "success" : status === "blocked" ? "danger" : status === "in_progress" ? "info" : "neutral";

export default function MyWorkPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const orgSlug = String(params?.slug ?? "");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [cycle, setCycle] = useState<Response["cycle"]>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

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
      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/tasks?mine=1`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      const parsed = await safeParseJson(await res.text()) as Response | null;
      if (!res.ok || !parsed?.ok) throw new Error(parsed?.error || `Failed to load my work (${res.status})`);
      setCycle(parsed.cycle ?? null); setTasks(parsed.tasks ?? []);
    } catch (e) { setMsg(getErrorMessage(e, "Failed to load your work")); }
    finally { setLoading(false); }
  }, [ensureAuth, orgSlug]);

  useEffect(() => { void load(); }, [load]);
  const cycleText = cycle ? `Q${cycle.quarter} ${cycle.year} · ${cycle.status}` : "No active cycle";
  const grouped = useMemo(() => ({ todo: tasks.filter((t) => t.status === "todo"), in_progress: tasks.filter((t) => t.status === "in_progress"), blocked: tasks.filter((t) => t.status === "blocked"), done: tasks.filter((t) => t.status === "done") }), [tasks]);

  const updateStatus = async (taskId: string, status: string) => {
    setSavingId(taskId); setMsg(null);
    try {
      const session = await ensureAuth(); if (!session) return;
      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ status }) });
      const parsed = await safeParseJson(await res.text()) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !parsed?.ok) throw new Error(parsed?.error || `Failed to update task (${res.status})`);
      await load();
    } catch (e) { setMsg(getErrorMessage(e, "Failed to update task")); }
    finally { setSavingId(null); }
  };

  const renderGroup = (title: string, items: Task[]) => <SectionCard title={title}>{items.length === 0 ? <div className="text-sm text-white/40">No items.</div> : <div className="space-y-4">{items.map((task) => <div key={task.id} className="rounded-[24px] border border-white/10 bg-black/20 p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-white">{task.title}</h3><div className="mt-2 flex flex-wrap gap-2"><StatusBadge tone={toneForStatus(task.status)}>{task.status}</StatusBadge><StatusBadge>{task.priority}</StatusBadge>{task.department_name ? <StatusBadge>{task.department_name}</StatusBadge> : null}</div></div></div>{task.description ? <p className="mt-4 text-sm leading-6 text-white/60">{task.description}</p> : null}<div className="mt-4 grid gap-2 text-sm text-white/50"><div>Objective: {task.objective_title ?? "—"}</div><div>OKR: {task.okr_title ?? "—"}</div><div>Key Result: {task.key_result_title ?? "—"}</div><div>KPI: {task.kpi_title ?? "—"}</div><div>Due date: {task.due_date ?? "—"}</div></div><div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={savingId === task.id} onClick={() => updateStatus(task.id, "in_progress")} className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white disabled:opacity-60">Start</button><button type="button" disabled={savingId === task.id} onClick={() => updateStatus(task.id, "blocked")} className="rounded-xl border border-red-400/15 bg-red-400/10 px-3 py-2 text-sm text-red-100 disabled:opacity-60">Block</button><button type="button" disabled={savingId === task.id} onClick={() => updateStatus(task.id, "done")} className="rounded-xl border border-emerald-400/15 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100 disabled:opacity-60">Complete</button></div></div>)}</div>}</SectionCard>;

  return (
    <AppShell slug={orgSlug} sessionEmail={sessionEmail}>
      <AppPageHeader eyebrow={cycleText} title="My Work" description="Tasks assigned to you, with status updates tied directly to OKRs and KPIs." />
      <div className="space-y-6">
        {msg ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{msg}</div> : null}
        {loading ? <SectionCard title="Loading"><div className="text-sm text-white/55">Loading your task list...</div></SectionCard> : tasks.length === 0 ? <EmptyState title="Nothing assigned yet" description="When tasks are assigned to you, they will show here with direct links to the objective, OKR, key result, and KPI they support." /> : <div className="grid gap-6 xl:grid-cols-2">{renderGroup("To do", grouped.todo)}{renderGroup("In progress", grouped.in_progress)}{renderGroup("Blocked", grouped.blocked)}{renderGroup("Done", grouped.done)}</div>}
      </div>
    </AppShell>
  );
}
