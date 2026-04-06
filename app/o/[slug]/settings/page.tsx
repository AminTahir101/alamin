"use client";

import Link from "next/link";
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

type ThemeMode = "night" | "daylight";

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

function applyTheme(theme: ThemeMode) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.classList.toggle("dark", theme === "night");
  window.localStorage.setItem("alamin-theme", theme);
}

function readTheme(): ThemeMode {
  if (typeof window === "undefined") return "night";
  const stored = window.localStorage.getItem("alamin-theme");
  return stored === "daylight" ? "daylight" : "night";
}

function cardClass() {
  return "rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-5";
}

function softCardClass() {
  return "rounded-2xl border border-[var(--border)] bg-[var(--card-subtle)] p-4";
}

function inputClass() {
  return "w-full rounded-2xl border border-[var(--border)] bg-[var(--background-elevated)] px-4 py-3 text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-faint)] focus:border-[var(--border-active)] disabled:opacity-60";
}

function inputDisabledClass() {
  return "w-full rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-3 text-[var(--foreground-muted)] outline-none";
}

function actionGhostClass() {
  return "rounded-2xl border border-[var(--border)] bg-[var(--button-secondary-bg)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)] disabled:cursor-not-allowed disabled:opacity-50";
}

function actionPrimaryClass() {
  return "rounded-2xl border border-[var(--border)] bg-[var(--foreground)] px-4 py-2.5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
}

function actionDangerClass() {
  return "rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-2.5 text-sm font-medium text-red-200 transition hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-50";
}

function subtlePillClass() {
  return "rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--foreground-muted)]";
}

function AppearanceCard() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => readTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setMounted(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  const changeTheme = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
  };

  return (
    <SectionCard
      title="Appearance"
      subtitle="Control workspace theme from one place"
      className="bg-[var(--background-panel)]"
    >
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className={cardClass()}>
          <div className="text-sm font-semibold text-[var(--foreground)]">Theme mode</div>
          <div className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">
            Daylight is better for bright environments. Night keeps the interface lower glare and more focused.
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => changeTheme("daylight")}
              disabled={!mounted}
              className={[
                "inline-flex h-11 items-center justify-center rounded-full border px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                theme === "daylight"
                  ? "border-[var(--border-active)] bg-[var(--foreground)] text-[var(--background)]"
                  : "border-[var(--border)] bg-[var(--button-secondary-bg)] text-[var(--foreground)] hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]",
              ].join(" ")}
            >
              Daylight
            </button>

            <button
              type="button"
              onClick={() => changeTheme("night")}
              disabled={!mounted}
              className={[
                "inline-flex h-11 items-center justify-center rounded-full border px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                theme === "night"
                  ? "border-[var(--border-active)] bg-[var(--foreground)] text-[var(--background)]"
                  : "border-[var(--border)] bg-[var(--button-secondary-bg)] text-[var(--foreground)] hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]",
              ].join(" ")}
            >
              Night
            </button>
          </div>
        </div>

        <div className={cardClass()}>
          <div className="text-sm font-semibold text-[var(--foreground)]">Current preference</div>
          <div className="mt-4 flex items-center gap-3">
            <StatusBadge tone="info">{theme === "night" ? "Night mode" : "Daylight mode"}</StatusBadge>
          </div>
          <div className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
            The theme switch was removed from the sidebar and homepage. Settings is now the only place that controls it.
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function WorkspaceSetupCard({ slug }: { slug: string }) {
  return (
    <SectionCard
      title="Workspace Setup"
      subtitle="Access onboarding from settings instead of the sidebar"
      className="bg-[var(--background-panel)]"
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className={cardClass()}>
          <div className="text-base font-bold text-[var(--foreground)]">Onboarding management</div>
          <div className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">
            Update the original company setup, strategy, department heads, and seeded KPI layer from the onboarding flow.
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={`/o/${encodeURIComponent(slug)}/onboarding`}
              className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90"
            >
              Open onboarding
            </Link>

            <Link
              href={`/o/${encodeURIComponent(slug)}/dashboard`}
              className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--button-secondary-bg)] px-5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]"
            >
              Back to dashboard
            </Link>
          </div>
        </div>

        <div className={cardClass()}>
          <div className="text-sm font-semibold text-[var(--foreground)]">What changed</div>
          <div className="mt-4 grid gap-3">
            <MiniSettingItem
              title="Theme toggle moved"
              desc="No more appearance switch in the sidebar."
            />
            <MiniSettingItem
              title="Onboarding moved"
              desc="No more onboarding item in workspace navigation."
            />
            <MiniSettingItem
              title="Trends removed"
              desc="The Trends section was removed from navigation."
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function MiniSettingItem({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card-subtle)] p-3">
      <div className="text-sm font-semibold text-[var(--foreground)]">{title}</div>
      <div className="mt-1 text-sm leading-6 text-[var(--foreground-muted)]">{desc}</div>
    </div>
  );
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
        description="Manage organization details, members, theme preferences, onboarding access, and account context."
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void load()}
              className={actionGhostClass()}
            >
              Refresh
            </button>
          </div>
        }
      />

      {msg ? (
        <div className="mb-6 rounded-[20px] border border-red-400/20 bg-red-400/10 px-5 py-4 text-sm text-red-200">
          {msg}
        </div>
      ) : null}

      {success ? (
        <div className="mb-6 rounded-[20px] border border-emerald-400/20 bg-emerald-400/10 px-5 py-4 text-sm text-emerald-200">
          {success}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard title="Organization settings" subtitle="Core workspace identity and admin-managed configuration.">
          {loading ? (
            <div className="space-y-4">
              <div className="h-24 animate-pulse rounded-[20px] border border-[var(--border)] bg-[var(--card)]" />
              <div className="h-24 animate-pulse rounded-[20px] border border-[var(--border)] bg-[var(--card)]" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--foreground-soft)]">Organization name</label>
                  <input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    disabled={!member?.permissions?.canManageOrg || savingOrg}
                    className={inputClass()}
                    placeholder="Enter organization name"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--foreground-soft)]">Organization slug</label>
                  <input
                    value={org?.slug ?? ""}
                    disabled
                    className={inputDisabledClass()}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleSaveOrganization()}
                  disabled={!member?.permissions?.canManageOrg || savingOrg || !orgName.trim()}
                  className={actionPrimaryClass()}
                >
                  {savingOrg ? "Saving..." : "Save changes"}
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className={softCardClass()}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">Departments</div>
                  <div className="mt-2 text-2xl font-black text-[var(--foreground)]">{workspace?.departments ?? 0}</div>
                </div>

                <div className={softCardClass()}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">KPIs</div>
                  <div className="mt-2 text-2xl font-black text-[var(--foreground)]">{workspace?.kpis ?? 0}</div>
                </div>

                <div className={softCardClass()}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">Objectives</div>
                  <div className="mt-2 text-2xl font-black text-[var(--foreground)]">{workspace?.objectives ?? 0}</div>
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Account" subtitle="Current signed-in user and workspace access level.">
          {loading ? (
            <div className="h-52 animate-pulse rounded-[20px] border border-[var(--border)] bg-[var(--card)]" />
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-4 rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--background-elevated)] text-lg font-black text-[var(--foreground)]">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-base font-bold text-[var(--foreground)]">{sessionEmail ?? "Signed-in user"}</div>
                  <div className="mt-1 text-sm text-[var(--foreground-muted)]">Workspace member</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className={softCardClass()}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">Email</div>
                  <div className="mt-2 text-sm font-medium text-[var(--foreground)]">{member?.email ?? sessionEmail ?? "—"}</div>
                </div>

                <div className={softCardClass()}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">Role</div>
                  <div className="mt-2 flex items-center gap-2">
                    <StatusBadge tone={roleTone(member?.role)}>{prettyRole(member?.role)}</StatusBadge>
                  </div>
                </div>

                <div className={softCardClass()}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">Active cycle</div>
                  <div className="mt-2 text-sm font-medium text-[var(--foreground)]">{cycleLabel(workspace?.activeCycle)}</div>
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-6">
        <AppearanceCard />
        <WorkspaceSetupCard slug={orgSlug} />
      </div>

      <div className="mt-6">
        <SectionCard title="Members" subtitle="Owner-only invites, role changes, removal, and department assignment.">
          {loading ? (
            <div className="space-y-4">
              <div className="h-28 animate-pulse rounded-[20px] border border-[var(--border)] bg-[var(--card)]" />
              <div className="h-56 animate-pulse rounded-[20px] border border-[var(--border)] bg-[var(--card)]" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className={cardClass()}>
                <div className="text-base font-bold text-[var(--foreground)]">Add member</div>
                <div className="mt-1 text-sm text-[var(--foreground-muted)]">
                  Department Head and Employee must be assigned to a department at creation time.
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[var(--foreground-soft)]">Email</label>
                    <input
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="name@company.com"
                      disabled={!member?.permissions?.canInviteMembers || inviting}
                      className={inputClass()}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-[var(--foreground-soft)]">Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as Exclude<Role, "owner">)}
                      disabled={!member?.permissions?.canInviteMembers || inviting}
                      className={inputClass()}
                    >
                      {INVITABLE_ROLES.map((option) => (
                        <option key={option.value} value={option.value} className="bg-[var(--background)] text-[var(--foreground)]">
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {roleSupportsDepartment(inviteRole) ? (
                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-medium text-[var(--foreground-soft)]">Department</label>
                    <select
                      value={inviteDepartmentId}
                      onChange={(e) => setInviteDepartmentId(e.target.value)}
                      disabled={!member?.permissions?.canInviteMembers || inviting}
                      className={inputClass()}
                    >
                      <option value="" className="bg-[var(--background)] text-[var(--foreground)]">
                        Select department
                      </option>
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id} className="bg-[var(--background)] text-[var(--foreground)]">
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
                    className={actionPrimaryClass()}
                  >
                    {inviting ? "Adding..." : "Add member"}
                  </button>
                </div>
              </div>

              <div className={cardClass()}>
                <div className="text-base font-bold text-[var(--foreground)]">Current members</div>
                <div className="mt-1 text-sm text-[var(--foreground-muted)]">
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
                          className="rounded-2xl border border-[var(--border)] bg-[var(--card-subtle)] px-4 py-4"
                        >
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-[var(--foreground)]">
                                  {item.email ?? item.userId}
                                </div>
                                <div className="mt-1 text-xs text-[var(--foreground-faint)]">{item.userId}</div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <StatusBadge tone={roleTone(item.role)}>{prettyRole(item.role)}</StatusBadge>

                                  {supportsDepartment ? (
                                    <span className={subtlePillClass()}>
                                      {item.departmentName ?? "No department"}
                                    </span>
                                  ) : null}

                                  {isSelf ? (
                                    <span className={subtlePillClass()}>
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
                                    className={actionGhostClass()}
                                  >
                                    Change role
                                  </button>
                                )}

                                {!isOwner && supportsDepartment ? (
                                  <button
                                    type="button"
                                    onClick={() => handleStartDepartmentAssign(item.userId, item.departmentId)}
                                    disabled={!member?.permissions?.canInviteMembers}
                                    className={actionGhostClass()}
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
                                  className={actionDangerClass()}
                                >
                                  {removingMemberId === item.userId ? "Removing..." : "Remove"}
                                </button>
                              </div>
                            </div>

                            {isEditingRole ? (
                              <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background-elevated)] p-4 sm:flex-row">
                                <select
                                  value={editingRole}
                                  onChange={(e) => setEditingRole(e.target.value as Exclude<Role, "owner">)}
                                  disabled={updatingMemberId === item.userId}
                                  className={inputClass()}
                                >
                                  {INVITABLE_ROLES.map((option) => (
                                    <option key={option.value} value={option.value} className="bg-[var(--background)] text-[var(--foreground)]">
                                      {option.label}
                                    </option>
                                  ))}
                                </select>

                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void handleChangeRole(item.userId)}
                                    disabled={updatingMemberId === item.userId}
                                    className={actionPrimaryClass()}
                                  >
                                    {updatingMemberId === item.userId ? "Saving..." : "Save"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setEditingMemberId(null)}
                                    disabled={updatingMemberId === item.userId}
                                    className={actionGhostClass()}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : null}

                            {isAssigningDept && supportsDepartment ? (
                              <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background-elevated)] p-4 sm:flex-row">
                                <select
                                  value={assignDepartmentId}
                                  onChange={(e) => setAssignDepartmentId(e.target.value)}
                                  disabled={updatingMemberId === item.userId}
                                  className={inputClass()}
                                >
                                  <option value="" className="bg-[var(--background)] text-[var(--foreground)]">
                                    Select department
                                  </option>
                                  {departments.map((dept) => (
                                    <option key={dept.id} value={dept.id} className="bg-[var(--background)] text-[var(--foreground)]">
                                      {dept.name}
                                    </option>
                                  ))}
                                </select>

                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveDepartmentAssign(item.userId)}
                                    disabled={updatingMemberId === item.userId}
                                    className={actionPrimaryClass()}
                                  >
                                    {updatingMemberId === item.userId ? "Saving..." : "Save"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setAssigningMemberId(null)}
                                    disabled={updatingMemberId === item.userId}
                                    className={actionGhostClass()}
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
                  <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--card-subtle)] px-4 py-8 text-center text-sm text-[var(--foreground-muted)]">
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