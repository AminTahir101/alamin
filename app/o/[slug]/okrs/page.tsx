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

type Role = "owner" | "admin" | "manager" | "dept_head" | "finance" | "member" | "employee";

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
  status: OkrItem["status"],
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
            okrs.reduce((sum, item) => sum + (typeof item.progress === "number" ? item.progress : 0), 0) / total,
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
        | "cancelled",
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
    [canManage, ensureAuth, load, orgSlug],
  );

  const cycleText = cycle ? `Q${cycle.quarter} ${cycle.year} · ${cycle.status}` : "No active cycle";

  return (
    <AppShell slug={orgSlug} sessionEmail={sessionEmail}>
      <AppPageHeader
        eyebrow={cycleText}
        title="OKRs"
        description="Manage objective-linked OKRs and drill into key results, owners, and linked KPIs."
        actions={
          canManage ? (
            <button
              type="button"
              onClick={openCreate}
              className="rounded-2xl border border-white/12 bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90"
            >
              New OKR
            </button>
          ) : null
        }
      />

      {msg ? (
        <div className="mb-6 rounded-[20px] border border-red-400/20 bg-red-400/8 px-5 py-4 text-sm text-red-100">
          {msg}
        </div>
      ) : null}

      {success ? (
        <div className="mb-6 rounded-[20px] border border-emerald-400/20 bg-emerald-400/8 px-5 py-4 text-sm text-emerald-100">
          {success}
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-white/4 p-5">
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">Total OKRs</div>
          <div className="mt-3 text-3xl font-black text-white">{summary.total}</div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/4 p-5">
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">Active</div>
          <div className="mt-3 text-3xl font-black text-white">{summary.active}</div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/4 p-5">
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">Pending Approval</div>
          <div className="mt-3 text-3xl font-black text-white">{summary.pending}</div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/4 p-5">
          <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">Avg. Progress</div>
          <div className="mt-3 text-3xl font-black text-white">{summary.avgProgress}%</div>
        </div>
      </div>

      <SectionCard
        title="OKR Registry"
        subtitle="Each OKR links the strategic objective to measurable key results and downstream execution."
      >
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-[20px] border border-white/10 bg-white/5" />
            ))}
          </div>
        ) : okrs.length ? (
          <div className="space-y-4">
            {okrs.map((item) => (
              <div key={item.id} className="rounded-[22px] border border-white/10 bg-white/5 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href={`/o/${encodeURIComponent(orgSlug)}/okrs/${item.id}`}
                        className="text-lg font-bold text-white transition hover:text-white/80"
                      >
                        {item.title}
                      </Link>

                      <StatusBadge tone={statusTone(item.status)}>
                        {item.status.replaceAll("_", " ")}
                      </StatusBadge>

                      {item.is_assigned_to_me ? <StatusBadge tone="warning">Assigned to me</StatusBadge> : null}
                    </div>

                    {item.description ? (
                      <div className="mt-2 text-sm text-white/60">{item.description}</div>
                    ) : null}

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                      <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-white/38">Objective</div>
                        <div className="mt-2 text-sm font-semibold text-white">
                          {item.objective_title ?? "—"}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-white/38">Department</div>
                        <div className="mt-2 text-sm font-semibold text-white">
                          {item.department_name ?? "—"}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-white/38">Owner</div>
                        <div className="mt-2 text-sm font-semibold text-white">
                          {item.owner_email ?? "Unassigned"}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-white/38">Progress</div>
                        <div className="mt-2 text-sm font-semibold text-white">
                          {formatPercent(item.progress)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-white/38">Key Results</div>
                        <div className="mt-2 text-sm font-semibold text-white">
                          {item.key_results_count ?? 0}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-white/38">Linked KPIs</div>
                        <div className="mt-2 text-sm font-semibold text-white">
                          {item.linked_kpis_count ?? 0}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/o/${encodeURIComponent(orgSlug)}/okrs/${item.id}`}
                        className="rounded-2xl border border-white/12 bg-white/6 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                      >
                        Open OKR
                      </Link>

                      {canManage && item.status === "draft" ? (
                        <button
                          type="button"
                          onClick={() => void handleQuickStatus(item, "pending_approval")}
                          className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-2.5 text-sm font-medium text-amber-100 transition hover:bg-amber-400/15"
                        >
                          Send for Approval
                        </button>
                      ) : null}

                      {canManage && item.status === "pending_approval" ? (
                        <button
                          type="button"
                          onClick={() => void handleQuickStatus(item, "active")}
                          className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/15"
                        >
                          Approve & Activate
                        </button>
                      ) : null}

                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="rounded-2xl border border-white/12 bg-white/6 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                        >
                          Edit
                        </button>
                      ) : null}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-[28px] border border-white/10 bg-[#0b0b0b] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-black text-white">
                  {editingId ? "Edit OKR" : "Create OKR"}
                </div>
                <div className="mt-1 text-sm text-white/50">
                  Every OKR should belong to an objective and lead to key results and linked KPIs.
                </div>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="rounded-2xl border border-white/12 bg-white/6 px-3 py-2 text-sm text-white hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-white/80">Objective</label>
                <select
                  value={form.objective_id}
                  onChange={(e) => setForm((s) => ({ ...s, objective_id: e.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                >
                  <option value="" className="bg-[#111]">
                    Select objective
                  </option>
                  {objectives.map((objective) => (
                    <option key={objective.id} value={objective.id} className="bg-[#111]">
                      {objective.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-white/80">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-white/80">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                  rows={4}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">Owner</label>
                <select
                  value={form.owner_user_id}
                  onChange={(e) => setForm((s) => ({ ...s, owner_user_id: e.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                >
                  <option value="" className="bg-[#111]">
                    Unassigned
                  </option>
                  {memberOptions.map((member) => (
                    <option key={member.value} value={member.value} className="bg-[#111]">
                      {member.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">Status</label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      status: e.target.value as FormState["status"],
                    }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                >
                  <option value="draft" className="bg-[#111]">
                    Draft
                  </option>
                  <option value="pending_approval" className="bg-[#111]">
                    Pending approval
                  </option>
                  <option value="active" className="bg-[#111]">
                    Active
                  </option>
                  <option value="on_track" className="bg-[#111]">
                    On track
                  </option>
                  <option value="at_risk" className="bg-[#111]">
                    At risk
                  </option>
                  <option value="off_track" className="bg-[#111]">
                    Off track
                  </option>
                  <option value="completed" className="bg-[#111]">
                    Completed
                  </option>
                  <option value="cancelled" className="bg-[#111]">
                    Cancelled
                  </option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded-2xl border border-white/12 bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving..." : editingId ? "Save changes" : "Create OKR"}
              </button>

              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="rounded-2xl border border-white/12 bg-white/6 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
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