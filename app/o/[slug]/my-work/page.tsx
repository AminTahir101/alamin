"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";
import StatCard from "@/components/ui/StatCard";

type Task = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  due_date?: string | null;
  department_name?: string | null;
  objective_title?: string | null;
  okr_title?: string | null;
  key_result_title?: string | null;
  kpi_title?: string | null;
};

type Response = {
  ok: boolean;
  cycle?: { id: string; year: number; quarter: number; status: string } | null;
  tasks?: Task[];
  error?: string;
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
  status === "done"
    ? "success"
    : status === "blocked"
      ? "danger"
      : status === "in_progress"
        ? "info"
        : "neutral";

const toneForPriority = (priority?: string | null) =>
  priority === "critical"
    ? "danger"
    : priority === "high"
      ? "warning"
      : priority === "medium"
        ? "info"
        : "neutral";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function isOverdue(task: Task) {
  if (!task.due_date || task.status === "done") return false;
  const due = new Date(task.due_date);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function buttonClass(kind: "primary" | "secondary" | "danger" | "success") {
  switch (kind) {
    case "primary":
      return "rounded-full border border-[var(--border)] bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:opacity-60";
    case "danger":
      return "rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-500/15 disabled:opacity-60 dark:text-red-100";
    case "success":
      return "rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-500/15 disabled:opacity-60 dark:text-emerald-100";
    default:
      return "rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)] disabled:opacity-60";
  }
}

export default function MyWorkPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const orgSlug = String(params?.slug ?? "");
  const { t } = useLanguage();
  const pg = t.pages.myWork;

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

      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/tasks?mine=1`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });

      const parsed = (await safeParseJson(await res.text())) as Response | null;
      if (!res.ok || !parsed?.ok) {
        throw new Error(parsed?.error || `Failed to load my work (${res.status})`);
      }

      setCycle(parsed.cycle ?? null);
      setTasks(parsed.tasks ?? []);
    } catch (e) {
      setMsg(getErrorMessage(e, "Failed to load your work"));
    } finally {
      setLoading(false);
    }
  }, [ensureAuth, orgSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const cycleText = cycle ? `Q${cycle.quarter} ${cycle.year} · ${cycle.status}` : "No active cycle";

  const grouped = useMemo(
    () => ({
      todo: tasks.filter((t) => t.status === "todo"),
      in_progress: tasks.filter((t) => t.status === "in_progress"),
      blocked: tasks.filter((t) => t.status === "blocked"),
      done: tasks.filter((t) => t.status === "done"),
    }),
    [tasks],
  );

  const stats = useMemo(() => {
    const overdue = tasks.filter((task) => isOverdue(task)).length;
    const highPriority = tasks.filter((task) => ["high", "critical"].includes(task.priority)).length;
    return {
      total: tasks.length,
      todo: grouped.todo.length,
      inProgress: grouped.in_progress.length,
      blocked: grouped.blocked.length,
      done: grouped.done.length,
      overdue,
      highPriority,
    };
  }, [grouped, tasks]);

  const updateStatus = async (taskId: string, status: string) => {
    setSavingId(taskId);
    setMsg(null);
    try {
      const session = await ensureAuth();
      if (!session) return;
      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/tasks/${taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ status }),
      });
      const parsed = (await safeParseJson(await res.text())) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !parsed?.ok) {
        throw new Error(parsed?.error || `Failed to update task (${res.status})`);
      }
      await load();
    } catch (e) {
      setMsg(getErrorMessage(e, "Failed to update task"));
    } finally {
      setSavingId(null);
    }
  };

  const renderGroup = (title: string, items: Task[], accent: string) => (
    <SectionCard
      title={title}
      subtitle={`${items.length} item${items.length === 1 ? "" : "s"}`}
      className="bg-[var(--background-panel)]"
    >
      {items.length === 0 ? (
        <div className="rounded-[20px] border border-[var(--border)] bg-[var(--card)] px-4 py-6 text-sm text-[var(--foreground-faint)]">
          No items.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((task) => {
            const overdue = isOverdue(task);

            return (
              <div
                key={task.id}
                className="rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-5 alamin-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-[var(--foreground)]">{task.title}</h3>
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: accent }}
                      />
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <StatusBadge tone={toneForStatus(task.status)}>{task.status}</StatusBadge>
                      <StatusBadge tone={toneForPriority(task.priority)}>{task.priority}</StatusBadge>
                      {task.department_name ? <StatusBadge>{task.department_name}</StatusBadge> : null}
                      {overdue ? <StatusBadge tone="danger">Overdue</StatusBadge> : null}
                    </div>
                  </div>
                </div>

                {task.description ? (
                  <p className="mt-4 text-sm leading-6 text-[var(--foreground-muted)]">
                    {task.description}
                  </p>
                ) : null}

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <InfoTile label={t.pages.common.objective} value={task.objective_title ?? "—"} />
                  <InfoTile label="OKR" value={task.okr_title ?? "—"} />
                  <InfoTile label={t.pages.common.keyResult} value={task.key_result_title ?? "—"} />
                  <InfoTile label={t.pages.tasks.kpi} value={task.kpi_title ?? "—"} />
                  <InfoTile label={t.pages.common.dueDate} value={formatDate(task.due_date)} />
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {task.status !== "in_progress" ? (
                    <button
                      type="button"
                      disabled={savingId === task.id}
                      onClick={() => updateStatus(task.id, "in_progress")}
                      className={buttonClass("secondary")}
                    >
                      {savingId === task.id ? pg.updating : pg.startBtn}
                    </button>
                  ) : null}

                  {task.status !== "blocked" ? (
                    <button
                      type="button"
                      disabled={savingId === task.id}
                      onClick={() => updateStatus(task.id, "blocked")}
                      className={buttonClass("danger")}
                    >
                      {savingId === task.id ? pg.updating : pg.blockBtn}
                    </button>
                  ) : null}

                  {task.status !== "done" ? (
                    <button
                      type="button"
                      disabled={savingId === task.id}
                      onClick={() => updateStatus(task.id, "done")}
                      className={buttonClass("success")}
                    >
                      {savingId === task.id ? pg.updating : pg.completeBtn}
                    </button>
                  ) : null}

                  {task.status !== "todo" ? (
                    <button
                      type="button"
                      disabled={savingId === task.id}
                      onClick={() => updateStatus(task.id, "todo")}
                      className={buttonClass("secondary")}
                    >
                      {savingId === task.id ? pg.updating : pg.backToTodo}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );

  return (
    <AppShell
      slug={orgSlug}
      sessionEmail={sessionEmail}
      topActions={
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void load()} className={buttonClass("secondary")}>
            Refresh
          </button>
          <button
            type="button"
            onClick={() => router.push(`/o/${encodeURIComponent(orgSlug)}/tasks`)}
            className={buttonClass("primary")}
          >
            Open all tasks
          </button>
        </div>
      }
    >
      <AppPageHeader
        eyebrow={cycleText}
        title={pg.title}
        description={pg.description}
      />

      <section className="mb-6 overflow-hidden rounded-[30px] border border-[var(--border)] bg-[var(--background-panel)] p-6 alamin-shadow">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground-faint)]">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />
              {pg.personalBoardBadge}
            </div>

            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-[var(--foreground)]">
              {pg.heroH2}
            </h2>

            <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--foreground-muted)]">
              {pg.heroBody}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <StatCard title={pg.assignedTasks} value={stats.total} hint={pg.assignedTasksLabel} />
            <StatCard title={pg.inProgress} value={stats.inProgress} hint={pg.inProgressLabel} tone="info" />
            <StatCard title={pg.blockedLabel} value={stats.blocked} hint={pg.blockedDesc} tone="warning" />
            <StatCard title={pg.overdue} value={stats.overdue} hint={pg.overdueLabel} tone="danger" />
          </div>
        </div>
      </section>

      <div className="space-y-6">
        {msg ? (
          <div className="rounded-[20px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-100">
            {msg}
          </div>
        ) : null}

        {loading ? (
          <>
            <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-28 animate-pulse rounded-[24px] border border-[var(--border)] bg-[var(--card)]"
                />
              ))}
            </div>
            <SectionCard title="Loading">
              <div className="text-sm text-[var(--foreground-muted)]">Loading your task list...</div>
            </SectionCard>
          </>
        ) : tasks.length === 0 ? (
          <EmptyState
            title={pg.noTitle}
            description={pg.noDesc}
          />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard title={pg.todo} value={stats.todo} hint="Ready to start" />
              <StatCard title={pg.inProgress} value={stats.inProgress} hint="Active work" tone="info" />
              <StatCard title={pg.blockedLabel} value={stats.blocked} hint="Needs help" tone="warning" />
              <StatCard title={t.pages.common.completed} value={stats.done} hint="Finished items" tone="success" />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              {renderGroup(pg.todo, grouped.todo, "var(--info)")}
              {renderGroup(pg.inProgress, grouped.in_progress, "var(--accent-2)")}
              {renderGroup(pg.blockedLabel, grouped.blocked, "var(--danger)")}
              {renderGroup(pg.done, grouped.done, "var(--success)")}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card-subtle)] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--foreground-faint)]">
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-[var(--foreground)]">{value}</div>
    </div>
  );
}