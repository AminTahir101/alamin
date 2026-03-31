"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AppPageHeader, AppShell } from "@/components/app/AppShell";
import SectionCard from "@/components/ui/SectionCard";
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

type SettingsResponse = {
  ok: boolean;
  org?: {
    id: string;
    slug: string;
    name: string;
  };
  member?: {
    userId: string;
    email: string | null;
    role: Role;
    permissions: {
      canManageOrg: boolean;
      canManageKPIs: boolean;
      canViewFinance: boolean;
      canInviteMembers: boolean;
    };
  };
  workspace?: {
    departments: number;
    kpis: number;
    objectives: number;
    activeCycle: {
      id: string;
      year: number;
      quarter: number;
      status: string;
    } | null;
  };
  departments?: Department[];
  members?: Array<{
    userId: string;
    email: string | null;
    role: Role;
    departmentId?: string | null;
    departmentName?: string | null;
  }>;
  message?: string;
  error?: string;
};

const INVITABLE_ROLES: Array<{ value: Exclude<Role, "owner">; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "dept_head", label: "Department Head" },
  { value: "finance", label: "Finance" },
  { value: "member", label: "Member" },
  { value: "employee", label: "Employee" },
];

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

function prettyRole(role?: string | null) {
  const value = String(role ?? "").trim();
  if (!value) return "Member";
  if (value === "dept_head") return "Department Head";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function cycleLabel(cycle?: { year: number; quarter: number; status: string } | null) {
  if (!cycle) return "No active cycle";
  return `Q${cycle.quarter} ${cycle.year} · ${cycle.status}`;
}

function roleTone(role?: string | null) {
  const value = String(role ?? "").toLowerCase();
  if (value === "owner" || value === "admin") return "success" as const;
  if (value === "manager" || value === "dept_head" || value === "finance") return "warning" as const;
  return "neutral" as const;
}

function roleSupportsDepartment(role?: string | null) {
  return role === "dept_head" || role === "employee";
}

export default function SettingsPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const orgSlug = String(params?.slug ?? "").trim();

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [org, setOrg] = useState<SettingsResponse["org"]>();
  const [member, setMember] = useState<SettingsResponse["member"]>();
  const [workspace, setWorkspace] = useState<SettingsResponse["workspace"]>();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [members, setMembers] = useState<NonNullable<SettingsResponse["members"]>>([]);

  const [orgName, setOrgName] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<Role, "owner">>("member");
  const [inviteDepartmentId, setInviteDepartmentId] = useState("");
  const [inviting, setInviting] = useState(false);

  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<Exclude<Role, "owner">>("member");
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);

  const [assigningMemberId, setAssigningMemberId] = useState<string | null>(null);
  const [assignDepartmentId, setAssignDepartmentId] = useState("");

  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

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
    setMsg(null);
    setSuccess(null);
    setLoading(true);

    try {
      const session = await ensureAuth();
      if (!session) return;

      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/settings`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });

      const raw = await res.text();
      const parsed = (await safeParseJson(raw)) as SettingsResponse | null;

      if (!res.ok || !parsed || parsed.ok !== true) {
        throw new Error(parsed?.error || raw || `Failed to load settings (HTTP ${res.status})`);
      }

      setOrg(parsed.org);
      setMember(parsed.member);
      setWorkspace(parsed.workspace);
      setDepartments(Array.isArray(parsed.departments) ? parsed.departments : []);
      setMembers(Array.isArray(parsed.members) ? parsed.members : []);
      setOrgName(parsed.org?.name ?? "");
    } catch (e: unknown) {
      setMsg(getErrorMessage(e, "Failed to load settings"));
    } finally {
      setLoading(false);
    }
  }, [ensureAuth, orgSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!roleSupportsDepartment(inviteRole)) {
      setInviteDepartmentId("");
    }
  }, [inviteRole]);

  const handleSaveOrganization = useCallback(async () => {
    if (!member?.permissions?.canManageOrg) {
      setMsg("Only org admins can update organization settings");
      return;
    }

    const nextName = orgName.trim();
    if (!nextName) {
      setMsg("Organization name is required");
      return;
    }

    setMsg(null);
    setSuccess(null);
    setSavingOrg(true);

    try {
      const session = await ensureAuth();
      if (!session) return;

      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "update_org",
          organizationName: nextName,
        }),
      });

      const raw = await res.text();
      const parsed = (await safeParseJson(raw)) as SettingsResponse | null;

      if (!res.ok || !parsed || parsed.ok !== true) {
        throw new Error(parsed?.error || raw || `Failed to update settings (HTTP ${res.status})`);
      }

      setOrg(parsed.org);
      setOrgName(parsed.org?.name ?? nextName);
      setSuccess(parsed.message ?? "Organization settings updated");
      setDepartments(Array.isArray(parsed.departments) ? parsed.departments : []);
      setMembers(Array.isArray(parsed.members) ? parsed.members : []);
    } catch (e: unknown) {
      setMsg(getErrorMessage(e, "Failed to update organization settings"));
    } finally {
      setSavingOrg(false);
    }
  }, [ensureAuth, member?.permissions?.canManageOrg, orgName, orgSlug]);

  const handleInviteMember = useCallback(async () => {
    const email = inviteEmail.trim().toLowerCase();

    if (!member?.permissions?.canInviteMembers) {
      setMsg("Only the owner can add members");
      return;
    }

    if (!email) {
      setMsg("Member email is required");
      return;
    }

    if (roleSupportsDepartment(inviteRole) && !inviteDepartmentId) {
      setMsg("Select a department for Department Head or Employee");
      return;
    }

    setMsg(null);
    setSuccess(null);
    setInviting(true);

    try {
      const session = await ensureAuth();
      if (!session) return;

      const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email,
          role: inviteRole,
          departmentId: roleSupportsDepartment(inviteRole) ? inviteDepartmentId : null,
        }),
      });

      const raw = await res.text();
      const parsed = (await safeParseJson(raw)) as SettingsResponse | null;

      if (!res.ok || !parsed || parsed.ok !== true) {
        throw new Error(parsed?.error || raw || `Failed to add member (HTTP ${res.status})`);
      }

      setInviteEmail("");
      setInviteRole("member");
      setInviteDepartmentId("");
      setDepartments(Array.isArray(parsed.departments) ? parsed.departments : []);
      setMembers(Array.isArray(parsed.members) ? parsed.members : []);
      setSuccess(parsed.message ?? "Member added successfully");
    } catch (e: unknown) {
      setMsg(getErrorMessage(e, "Failed to add member"));
    } finally {
      setInviting(false);
    }
  }, [
    ensureAuth,
    inviteDepartmentId,
    inviteEmail,
    inviteRole,
    member?.permissions?.canInviteMembers,
    orgSlug,
  ]);

  const handleStartRoleEdit = useCallback((userId: string, role: Role) => {
    if (role === "owner") return;
    setEditingMemberId(userId);
    setEditingRole(role);
  }, []);

  const handleChangeRole = useCallback(
    async (userId: string) => {
      if (!member?.permissions?.canInviteMembers) {
        setMsg("Only the owner can change roles");
        return;
      }

      setMsg(null);
      setSuccess(null);
      setUpdatingMemberId(userId);

      try {
        const session = await ensureAuth();
        if (!session) return;

        const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/settings`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: "update_member_role",
            targetUserId: userId,
            role: editingRole,
          }),
        });

        const raw = await res.text();
        const parsed = (await safeParseJson(raw)) as SettingsResponse | null;

        if (!res.ok || !parsed || parsed.ok !== true) {
          throw new Error(parsed?.error || raw || `Failed to update member role (HTTP ${res.status})`);
        }

        setEditingMemberId(null);
        setDepartments(Array.isArray(parsed.departments) ? parsed.departments : []);
        setMembers(Array.isArray(parsed.members) ? parsed.members : []);
        setSuccess(parsed.message ?? "Member role updated");
      } catch (e: unknown) {
        setMsg(getErrorMessage(e, "Failed to update member role"));
      } finally {
        setUpdatingMemberId(null);
      }
    },
    [editingRole, ensureAuth, member?.permissions?.canInviteMembers, orgSlug]
  );

  const handleStartDepartmentAssign = useCallback((userId: string, currentDepartmentId?: string | null) => {
    setAssigningMemberId(userId);
    setAssignDepartmentId(currentDepartmentId ?? "");
  }, []);

  const handleSaveDepartmentAssign = useCallback(
    async (userId: string) => {
      if (!member?.permissions?.canInviteMembers) {
        setMsg("Only the owner can assign departments");
        return;
      }

      setMsg(null);
      setSuccess(null);
      setUpdatingMemberId(userId);

      try {
        const session = await ensureAuth();
        if (!session) return;

        const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/settings`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: "update_member_department",
            targetUserId: userId,
            departmentId: assignDepartmentId || null,
          }),
        });

        const raw = await res.text();
        const parsed = (await safeParseJson(raw)) as SettingsResponse | null;

        if (!res.ok || !parsed || parsed.ok !== true) {
          throw new Error(parsed?.error || raw || `Failed to assign department (HTTP ${res.status})`);
        }

        setAssigningMemberId(null);
        setAssignDepartmentId("");
        setDepartments(Array.isArray(parsed.departments) ? parsed.departments : []);
        setMembers(Array.isArray(parsed.members) ? parsed.members : []);
        setSuccess(parsed.message ?? "Department assignment updated");
      } catch (e: unknown) {
        setMsg(getErrorMessage(e, "Failed to assign department"));
      } finally {
        setUpdatingMemberId(null);
      }
    },
    [assignDepartmentId, ensureAuth, member?.permissions?.canInviteMembers, orgSlug]
  );

  const handleRemoveMember = useCallback(
    async (targetUserId: string, targetEmail: string | null) => {
      if (!member?.permissions?.canInviteMembers) {
        setMsg("Only the owner can remove members");
        return;
      }

      if (targetUserId === member.userId) {
        setMsg("You cannot remove yourself from the organization");
        return;
      }

      const confirmText = `Remove ${targetEmail ?? targetUserId} from this organization?`;
      if (!window.confirm(confirmText)) return;

      setMsg(null);
      setSuccess(null);
      setRemovingMemberId(targetUserId);

      try {
        const session = await ensureAuth();
        if (!session) return;

        const res = await fetch(`/api/o/${encodeURIComponent(orgSlug)}/settings`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            targetUserId,
          }),
        });

        const raw = await res.text();
        const parsed = (await safeParseJson(raw)) as SettingsResponse | null;

        if (!res.ok || !parsed || parsed.ok !== true) {
          throw new Error(parsed?.error || raw || `Failed to remove member (HTTP ${res.status})`);
        }

        if (editingMemberId === targetUserId) setEditingMemberId(null);
        if (assigningMemberId === targetUserId) setAssigningMemberId(null);

        setDepartments(Array.isArray(parsed.departments) ? parsed.departments : []);
        setMembers(Array.isArray(parsed.members) ? parsed.members : []);
        setSuccess(parsed.message ?? "Member removed successfully");
      } catch (e: unknown) {
        setMsg(getErrorMessage(e, "Failed to remove member"));
      } finally {
        setRemovingMemberId(null);
      }
    },
    [assigningMemberId, editingMemberId, ensureAuth, member, orgSlug]
  );

  const initials = useMemo(() => {
    const value = String(sessionEmail ?? org?.name ?? "A").trim();
    return value.slice(0, 1).toUpperCase();
  }, [org?.name, sessionEmail]);

  return (
    <AppShell slug={orgSlug} sessionEmail={sessionEmail}>
      <AppPageHeader
        eyebrow="Workspace settings"
        title="Settings"
        description="Manage organization details, members, department assignment, workspace preferences, and account context."
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-2xl border border-white/12 bg-white/6 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Refresh
            </button>
          </div>
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

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard title="Organization settings" subtitle="Core workspace identity and admin-managed configuration.">
          {loading ? (
            <div className="space-y-4">
              <div className="h-24 animate-pulse rounded-[20px] border border-white/10 bg-white/5" />
              <div className="h-24 animate-pulse rounded-[20px] border border-white/10 bg-white/5" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-white/80">Organization name</label>
                  <input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    disabled={!member?.permissions?.canManageOrg || savingOrg}
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20 disabled:opacity-60"
                    placeholder="Enter organization name"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white/80">Organization slug</label>
                  <input
                    value={org?.slug ?? ""}
                    disabled
                    className="w-full rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-white/55 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleSaveOrganization()}
                  disabled={!member?.permissions?.canManageOrg || savingOrg || !orgName.trim()}
                  className="rounded-2xl border border-white/12 bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingOrg ? "Saving..." : "Save changes"}
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/8 bg-black/15 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">Departments</div>
                  <div className="mt-2 text-2xl font-black text-white">{workspace?.departments ?? 0}</div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-black/15 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">KPIs</div>
                  <div className="mt-2 text-2xl font-black text-white">{workspace?.kpis ?? 0}</div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-black/15 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">Objectives</div>
                  <div className="mt-2 text-2xl font-black text-white">{workspace?.objectives ?? 0}</div>
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Account" subtitle="Current signed-in user and workspace access level.">
          {loading ? (
            <div className="h-52 animate-pulse rounded-[20px] border border-white/10 bg-white/5" />
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-4 rounded-[22px] border border-white/10 bg-white/5 p-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-lg font-black text-white">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-base font-bold text-white">{sessionEmail ?? "Signed-in user"}</div>
                  <div className="mt-1 text-sm text-white/45">Workspace member</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-white/8 bg-black/15 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">Email</div>
                  <div className="mt-2 text-sm font-medium text-white">{member?.email ?? sessionEmail ?? "—"}</div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-black/15 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">Role</div>
                  <div className="mt-2 flex items-center gap-2">
                    <StatusBadge tone={roleTone(member?.role)}>{prettyRole(member?.role)}</StatusBadge>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-black/15 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">Active cycle</div>
                  <div className="mt-2 text-sm font-medium text-white">{cycleLabel(workspace?.activeCycle)}</div>
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Members" subtitle="Owner-only invites, role changes, removal, and department assignment.">
          {loading ? (
            <div className="space-y-4">
              <div className="h-28 animate-pulse rounded-[20px] border border-white/10 bg-white/5" />
              <div className="h-56 animate-pulse rounded-[20px] border border-white/10 bg-white/5" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                <div className="text-base font-bold text-white">Add member</div>
                <div className="mt-1 text-sm text-white/50">
                  Department Head and Employee must be assigned to a department at creation time.
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/80">Email</label>
                    <input
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="name@company.com"
                      disabled={!member?.permissions?.canInviteMembers || inviting}
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20 disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/80">Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as Exclude<Role, "owner">)}
                      disabled={!member?.permissions?.canInviteMembers || inviting}
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/20 disabled:opacity-60"
                    >
                      {INVITABLE_ROLES.map((option) => (
                        <option key={option.value} value={option.value} className="bg-[#111]">
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {roleSupportsDepartment(inviteRole) ? (
                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-medium text-white/80">Department</label>
                    <select
                      value={inviteDepartmentId}
                      onChange={(e) => setInviteDepartmentId(e.target.value)}
                      disabled={!member?.permissions?.canInviteMembers || inviting}
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/20 disabled:opacity-60"
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
                ) : null}

                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleInviteMember()}
                    disabled={!member?.permissions?.canInviteMembers || inviting || !inviteEmail.trim()}
                    className="rounded-2xl border border-white/12 bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {inviting ? "Adding..." : "Add member"}
                  </button>
                </div>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                <div className="text-base font-bold text-white">Current members</div>
                <div className="mt-1 text-sm text-white/50">
                  After changing someone to Department Head or Employee, click Assign department.
                </div>

                {members.length ? (
                  <div className="mt-4 space-y-3">
                    {members.map((item) => {
                      const isSelf = item.userId === member?.userId;
                      const isOwner = item.role === "owner";
                      const isEditingRole = editingMemberId === item.userId;
                      const isAssigningDept = assigningMemberId === item.userId;
                      const supportsDepartment = roleSupportsDepartment(item.role);

                      return (
                        <div
                          key={item.userId}
                          className="rounded-2xl border border-white/8 bg-black/15 px-4 py-4"
                        >
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-white">
                                  {item.email ?? item.userId}
                                </div>
                                <div className="mt-1 text-xs text-white/35">{item.userId}</div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <StatusBadge tone={roleTone(item.role)}>{prettyRole(item.role)}</StatusBadge>

                                  {supportsDepartment ? (
                                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
                                      {item.departmentName ?? "No department"}
                                    </span>
                                  ) : null}

                                  {isSelf ? (
                                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">
                                      You
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {isOwner ? null : (
                                  <button
                                    type="button"
                                    onClick={() => handleStartRoleEdit(item.userId, item.role)}
                                    disabled={!member?.permissions?.canInviteMembers}
                                    className="rounded-2xl border border-white/12 bg-white/6 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Change role
                                  </button>
                                )}

                                {!isOwner && supportsDepartment ? (
                                  <button
                                    type="button"
                                    onClick={() => handleStartDepartmentAssign(item.userId, item.departmentId)}
                                    disabled={!member?.permissions?.canInviteMembers}
                                    className="rounded-2xl border border-white/12 bg-white/6 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Assign department
                                  </button>
                                ) : null}

                                <button
                                  type="button"
                                  onClick={() => void handleRemoveMember(item.userId, item.email)}
                                  disabled={
                                    !member?.permissions?.canInviteMembers ||
                                    removingMemberId === item.userId ||
                                    isOwner ||
                                    isSelf
                                  }
                                  className="rounded-2xl border border-red-400/20 bg-red-400/8 px-4 py-2.5 text-sm font-medium text-red-100 transition hover:bg-red-400/12 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {removingMemberId === item.userId ? "Removing..." : "Remove"}
                                </button>
                              </div>
                            </div>

                            {isEditingRole ? (
                              <div className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-black/20 p-4 sm:flex-row">
                                <select
                                  value={editingRole}
                                  onChange={(e) => setEditingRole(e.target.value as Exclude<Role, "owner">)}
                                  disabled={updatingMemberId === item.userId}
                                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/20"
                                >
                                  {INVITABLE_ROLES.map((option) => (
                                    <option key={option.value} value={option.value} className="bg-[#111]">
                                      {option.label}
                                    </option>
                                  ))}
                                </select>

                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void handleChangeRole(item.userId)}
                                    disabled={updatingMemberId === item.userId}
                                    className="rounded-2xl border border-white/12 bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
                                  >
                                    {updatingMemberId === item.userId ? "Saving..." : "Save"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setEditingMemberId(null)}
                                    disabled={updatingMemberId === item.userId}
                                    className="rounded-2xl border border-white/12 bg-white/6 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : null}

                            {isAssigningDept && supportsDepartment ? (
                              <div className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-black/20 p-4 sm:flex-row">
                                <select
                                  value={assignDepartmentId}
                                  onChange={(e) => setAssignDepartmentId(e.target.value)}
                                  disabled={updatingMemberId === item.userId}
                                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/20"
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

                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveDepartmentAssign(item.userId)}
                                    disabled={updatingMemberId === item.userId}
                                    className="rounded-2xl border border-white/12 bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
                                  >
                                    {updatingMemberId === item.userId ? "Saving..." : "Save"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setAssigningMemberId(null)}
                                    disabled={updatingMemberId === item.userId}
                                    className="rounded-2xl border border-white/12 bg-white/6 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-white/8 bg-black/15 px-4 py-8 text-center text-sm text-white/45">
                    No members found.
                  </div>
                )}
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}