"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";

type Role = "owner" | "admin" | "manager" | "dept_head" | "finance" | "member" | "employee";

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

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      department_id: departments[0]?.id ?? "",
    });
    setOpenForm(true);
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
    <AppShell slug={orgSlug} sessionEmail={sessionEmail}>
      <AppPageHeader
        eyebrow={cycleText}
        title="KPIs"
        description="Create, assign, and manage KPIs for the active cycle."
        actions={
          canManage ? (
            <button
              type="button"
              onClick={openCreate}
              className="rounded-2xl border border-white/12 bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90"
            >
              New KPI
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

      <SectionCard title="KPI Registry" subtitle="Assigned ownership is now part of the KPI workflow.">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-[20px] border border-white/10 bg-white/5" />
            ))}
          </div>
        ) : kpis.length ? (
          <div className="space-y-3">
            {kpis.map((item) => {
              const assigned = assignableMembers.find((m) => m.userId === item.owner_user_id);

              return (
                <div
                  key={item.id}
                  className="rounded-[22px] border border-white/10 bg-white/5 p-5"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="text-lg font-bold text-white">{item.title}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge tone={item.is_active === false ? "neutral" : "success"}>
                          {item.is_active === false ? "Inactive" : "Active"}
                        </StatusBadge>
                        {item.is_assigned_to_me ? (
                          <StatusBadge tone="warning">Assigned to me</StatusBadge>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                          <div className="text-[11px] uppercase tracking-[0.12em] text-white/38">Department</div>
                          <div className="mt-2 text-sm font-semibold text-white">
                            {item.department_name ?? "—"}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                          <div className="text-[11px] uppercase tracking-[0.12em] text-white/38">Current</div>
                          <div className="mt-2 text-sm font-semibold text-white">
                            {formatNumber(item.current_value)}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                          <div className="text-[11px] uppercase tracking-[0.12em] text-white/38">Target</div>
                          <div className="mt-2 text-sm font-semibold text-white">
                            {formatNumber(item.target_value)}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
                          <div className="text-[11px] uppercase tracking-[0.12em] text-white/38">Assignee</div>
                          <div className="mt-2 text-sm font-semibold text-white">
                            {assigned?.email ?? "Unassigned"}
                          </div>
                        </div>
                      </div>
                    </div>

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-[28px] border border-white/10 bg-[#0b0b0b] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-black text-white">
                  {editingId ? "Edit KPI" : "Create KPI"}
                </div>
                <div className="mt-1 text-sm text-white/50">
                  Add or change assignee ownership directly from the KPI form.
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
              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">Department</label>
                <select
                  value={form.department_id}
                  onChange={(e) => setForm((s) => ({ ...s, department_id: e.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                >
                  <option value="" className="bg-[#111]">
                    Select department
                  </option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id} className="bg-[#111]">
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">Current value</label>
                <input
                  value={form.current_value}
                  onChange={(e) => setForm((s) => ({ ...s, current_value: e.target.value }))}
                  type="number"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">Target value</label>
                <input
                  value={form.target_value}
                  onChange={(e) => setForm((s) => ({ ...s, target_value: e.target.value }))}
                  type="number"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">Weight</label>
                <input
                  value={form.weight}
                  onChange={(e) => setForm((s) => ({ ...s, weight: e.target.value }))}
                  type="number"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">Direction</label>
                <select
                  value={form.direction}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, direction: e.target.value as "increase" | "decrease" }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                >
                  <option value="increase" className="bg-[#111]">Increase</option>
                  <option value="decrease" className="bg-[#111]">Decrease</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-white/80">Assignee</label>
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

              {!editingId ? (
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-white/80">Initial notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
                    rows={4}
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                  />
                </div>
              ) : null}

              <div className="md:col-span-2 flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-white/80">
                  <input
                    checked={form.is_active}
                    onChange={(e) => setForm((s) => ({ ...s, is_active: e.target.checked }))}
                    type="checkbox"
                  />
                  Active KPI
                </label>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded-2xl border border-white/12 bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving..." : editingId ? "Save changes" : "Create KPI"}
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