"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageContext";
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
  const { t } = useLanguage();
  const pg = t.pages.settings;
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => readTheme());

  useEffect(() => {
    // Re-read the theme after mount to sync with client-side storage.
    // This is the canonical pattern for avoiding hydration mismatches
    // when state depends on localStorage or other browser-only sources.
    setTheme(readTheme());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyTheme(theme);
  }, [theme, mounted]);

  const changeTheme = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
  };

  // On first render (server + pre-hydration client), render a neutral
  // skeleton so the server-rendered HTML matches the initial client
  // output. After mount we swap in the real theme-dependent UI.
  const daylightActive = mounted && theme === "daylight";
  const nightActive = mounted && theme === "night";
  const currentThemeLabel = mounted
    ? theme === "night"
      ? pg.nightModeLabel
      : pg.daylightModeLabel
    : t.pages.common.loading;

  return (
    <SectionCard
      title={pg.theme}
      subtitle={pg.themeSubtitle}
      className="bg-[var(--background-panel)]"
    >
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className={cardClass()}>
          <div className="text-sm font-semibold text-[var(--foreground)]">{pg.themeMode}</div>
          <div className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">
            {pg.themeHint}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => changeTheme("daylight")}
              disabled={!mounted}
              className={[
                "inline-flex h-11 items-center justify-center rounded-full border px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                daylightActive
                  ? "border-[var(--border-active)] bg-[var(--foreground)] text-[var(--background)]"
                  : "border-[var(--border)] bg-[var(--button-secondary-bg)] text-[var(--foreground)] hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]",
              ].join(" ")}
            >
              {pg.daylight}
            </button>

            <button
              type="button"
              onClick={() => changeTheme("night")}
              disabled={!mounted}
              className={[
                "inline-flex h-11 items-center justify-center rounded-full border px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                nightActive
                  ? "border-[var(--border-active)] bg-[var(--foreground)] text-[var(--background)]"
                  : "border-[var(--border)] bg-[var(--button-secondary-bg)] text-[var(--foreground)] hover:border-[var(--border-strong)] hover:bg-[var(--button-secondary-hover)]",
              ].join(" ")}
            >
              {pg.night}
            </button>
          </div>
        </div>

        <div className={cardClass()}>
          <div className="text-sm font-semibold text-[var(--foreground)]">{pg.currentTheme}</div>
          <div className="mt-4 flex items-center gap-3">
            <StatusBadge tone="info">{currentThemeLabel}</StatusBadge>
          </div>
          <div className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
            {pg.themeHelpText}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function WorkspaceSetupCard({ slug }: { slug: string }) {
  const { t } = useLanguage();
  const pg = t.pages.settings;
  return (
    <SectionCard
      title={pg.workspaceSetup}
      subtitle={pg.workspaceSetupSubtitle}
      className="bg-[var(--background-panel)]"
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className={cardClass()}>
          <div className="text-base font-bold text-[var(--foreground)]">{pg.performanceCycles}</div>
          <div className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">
            {pg.performanceCyclesDesc}
          </div>

          <div className="mt-5">
            <Link
              href={`/o/${encodeURIComponent(slug)}/cycles`}
              className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90"
            >
              {pg.manageCycles}
            </Link>
          </div>
        </div>

        <div className={cardClass()}>
          <div className="text-sm font-semibold text-[var(--foreground)]">{pg.recentChanges}</div>
          <div className="mt-4 grid gap-3">
            <MiniSettingItem
              title={pg.changeNotice1Title}
              desc={pg.changeNotice1Desc}
            />
            <MiniSettingItem
              title={pg.changeNotice2Title}
              desc={pg.changeNotice2Desc}
            />
            <MiniSettingItem
              title={pg.changeNotice3Title}
              desc={pg.changeNotice3Desc}
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

function StrategyCard({ slug }: { slug: string }) {
  const { t } = useLanguage();
  const pg = t.pages.settings;
  const [strategy, setStrategy] = useState("");
  const [originalStrategy, setOriginalStrategy] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from("organizations")
          .select("description")
          .eq("slug", slug)
          .maybeSingle();

        if (!error && data) {
          setStrategy(data.description ?? "");
          setOriginalStrategy(data.description ?? "");
        }
      } catch {
        // Non-fatal
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [slug]);

  async function handleSave() {
    const trimmed = strategy.trim();
    if (!trimmed) {
      setMsg("Strategy cannot be empty.");
      return;
    }
    setSaving(true);
    setMsg(null);
    setOk(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;

      // Update organizations.description
      const { error: orgErr } = await supabase
        .from("organizations")
        .update({ description: trimmed, updated_at: new Date().toISOString() })
        .eq("slug", slug);

      if (orgErr) throw new Error(orgErr.message);

      // Also update org_ai_profiles.strategy_summary if it exists
      const { data: orgRow } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      if (orgRow) {
        await supabase
          .from("org_ai_profiles")
          .update({
            strategy_summary: trimmed,
            updated_at: new Date().toISOString(),
          })
          .eq("org_id", orgRow.id);
      }

      setOriginalStrategy(trimmed);
      setOk("Strategy saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save strategy.");
    } finally {
      setSaving(false);
    }
  }

  const isDirty = strategy.trim() !== originalStrategy;

  return (
    <SectionCard
      title={pg.companyStrategy}
      subtitle={pg.companyStrategySubtitle}
      className="bg-[var(--background-panel)]"
    >
      {loading ? (
        <div className="h-40 animate-pulse rounded-[20px] border border-[var(--border)] bg-[var(--card)]" />
      ) : (
        <>
          <div className="text-sm leading-7 text-[var(--foreground-muted)]">
            {pg.strategyHint}
          </div>

          <textarea
            value={strategy}
            onChange={(e) => {
              setStrategy(e.target.value);
              setMsg(null);
              setOk(null);
            }}
            className={`mt-4 min-h-[140px] w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm leading-7 text-[var(--foreground)] outline-none transition placeholder:text-[var(--foreground-faint)] focus:border-[var(--border-strong)]`}
            placeholder="Example: Grow enterprise revenue by improving sales efficiency, onboarding conversion, and cross-department execution discipline."
          />

          {msg ? (
            <div className="mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">
              {msg}
            </div>
          ) : null}

          {ok ? (
            <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-200">
              {ok}
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !isDirty}
              className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--foreground)] px-5 text-sm font-semibold text-[var(--background)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? t.pages.common.saving : pg.saveStrategy}
            </button>
          </div>
        </>
      )}
    </SectionCard>
  );
}

export default function SettingsPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const orgSlug = String(params?.slug ?? "").trim();
  const { t } = useLanguage();
  const pg = t.pages.settings;

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
        throw new Error(parsed?.error || raw || `Couldn't load your settings (HTTP ${res.status})`);
      }

      setOrg(parsed.org);
      setMember(parsed.member);
      setWorkspace(parsed.workspace);
      setDepartments(Array.isArray(parsed.departments) ? parsed.departments : []);
      setMembers(Array.isArray(parsed.members) ? parsed.members : []);
      setOrgName(parsed.org?.name ?? "");
    } catch (e: unknown) {
      setMsg(getErrorMessage(e, "Couldn't load your settings. Try refreshing."));
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
      setMsg("Only admins can update workspace settings.");
      return;
    }

    const nextName = orgName.trim();
    if (!nextName) {
      setMsg("Workspace name is required.");
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
        throw new Error(parsed?.error || raw || `Couldn't save workspace settings (HTTP ${res.status})`);
      }

      setOrg(parsed.org);
      setOrgName(parsed.org?.name ?? nextName);
      setSuccess(parsed.message ?? "Workspace settings saved.");
      setDepartments(Array.isArray(parsed.departments) ? parsed.departments : []);
      setMembers(Array.isArray(parsed.members) ? parsed.members : []);
    } catch (e: unknown) {
      setMsg(getErrorMessage(e, "Couldn't save workspace settings. Try again."));
    } finally {
      setSavingOrg(false);
    }
  }, [ensureAuth, member?.permissions?.canManageOrg, orgName, orgSlug]);

  const handleInviteMember = useCallback(async () => {
    const email = inviteEmail.trim().toLowerCase();

    if (!member?.permissions?.canInviteMembers) {
      setMsg("Only the workspace owner can invite teammates.");
      return;
    }

    if (!email) {
      setMsg("Work email is required.");
      return;
    }

    if (roleSupportsDepartment(inviteRole) && !inviteDepartmentId) {
      setMsg("Department is required for Department Heads and Employees.");
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
        throw new Error(parsed?.error || raw || `Couldn't send the invite (HTTP ${res.status})`);
      }

      setInviteEmail("");
      setInviteRole("member");
      setInviteDepartmentId("");
      setDepartments(Array.isArray(parsed.departments) ? parsed.departments : []);
      setMembers(Array.isArray(parsed.members) ? parsed.members : []);
      setSuccess(parsed.message ?? "Invite sent.");
    } catch (e: unknown) {
      setMsg(getErrorMessage(e, "Couldn't send the invite. Try again."));
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
        setMsg("Only the workspace owner can change roles.");
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
          throw new Error(parsed?.error || raw || `Couldn't update their role (HTTP ${res.status})`);
        }

        setEditingMemberId(null);
        setDepartments(Array.isArray(parsed.departments) ? parsed.departments : []);
        setMembers(Array.isArray(parsed.members) ? parsed.members : []);
        setSuccess(parsed.message ?? "Role updated.");
      } catch (e: unknown) {
        setMsg(getErrorMessage(e, "Couldn't update their role. Try again."));
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
        setMsg("Only the workspace owner can assign departments.");
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
          throw new Error(parsed?.error || raw || `Couldn't update their department (HTTP ${res.status})`);
        }

        setAssigningMemberId(null);
        setAssignDepartmentId("");
        setDepartments(Array.isArray(parsed.departments) ? parsed.departments : []);
        setMembers(Array.isArray(parsed.members) ? parsed.members : []);
        setSuccess(parsed.message ?? "Department updated.");
      } catch (e: unknown) {
        setMsg(getErrorMessage(e, "Couldn't update their department. Try again."));
      } finally {
        setUpdatingMemberId(null);
      }
    },
    [assignDepartmentId, ensureAuth, member?.permissions?.canInviteMembers, orgSlug]
  );

  const handleRemoveMember = useCallback(
    async (targetUserId: string, targetEmail: string | null) => {
      if (!member?.permissions?.canInviteMembers) {
        setMsg("Only the workspace owner can remove members.");
        return;
      }

      if (targetUserId === member.userId) {
        setMsg("You can't remove yourself from the workspace.");
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
          throw new Error(parsed?.error || raw || `Couldn't remove the member (HTTP ${res.status})`);
        }

        if (editingMemberId === targetUserId) setEditingMemberId(null);
        if (assigningMemberId === targetUserId) setAssigningMemberId(null);

        setDepartments(Array.isArray(parsed.departments) ? parsed.departments : []);
        setMembers(Array.isArray(parsed.members) ? parsed.members : []);
        setSuccess(parsed.message ?? "Member removed.");
      } catch (e: unknown) {
        setMsg(getErrorMessage(e, "Couldn't remove the member. Try again."));
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
        eyebrow={pg.eyebrow}
        title={pg.title}
        description={pg.description}
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void load()}
              className={actionGhostClass()}
            >
              {t.pages.common.refresh}
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
        <SectionCard title={pg.workspaceIdentity} subtitle={pg.workspaceIdentitySubtitle}>
          {loading ? (
            <div className="space-y-4">
              <div className="h-24 animate-pulse rounded-[20px] border border-[var(--border)] bg-[var(--card)]" />
              <div className="h-24 animate-pulse rounded-[20px] border border-[var(--border)] bg-[var(--card)]" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--foreground-soft)]">{pg.workspaceNameLabel}</label>
                  <input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    disabled={!member?.permissions?.canManageOrg || savingOrg}
                    className={inputClass()}
                    placeholder="e.g. Acme Inc."
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--foreground-soft)]">{pg.workspaceURL}</label>
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
                  {savingOrg ? t.pages.common.saving : t.pages.common.save}
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className={softCardClass()}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">{t.pages.departments.title}</div>
                  <div className="mt-2 text-2xl font-black text-[var(--foreground)]">{workspace?.departments ?? 0}</div>
                </div>

                <div className={softCardClass()}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">{t.appShell.nav.kpis}</div>
                  <div className="mt-2 text-2xl font-black text-[var(--foreground)]">{workspace?.kpis ?? 0}</div>
                </div>

                <div className={softCardClass()}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">{t.pages.dashboard.objectives}</div>
                  <div className="mt-2 text-2xl font-black text-[var(--foreground)]">{workspace?.objectives ?? 0}</div>
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title={pg.yourAccount} subtitle={pg.yourAccountSubtitle}>
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
                  <div className="mt-1 text-sm text-[var(--foreground-muted)]">{pg.signedIn}</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className={softCardClass()}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">{pg.emailLabel}</div>
                  <div className="mt-2 text-sm font-medium text-[var(--foreground)]">{member?.email ?? sessionEmail ?? "—"}</div>
                </div>

                <div className={softCardClass()}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">{pg.roleLabel}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <StatusBadge tone={roleTone(member?.role)}>{prettyRole(member?.role)}</StatusBadge>
                  </div>
                </div>

                <div className={softCardClass()}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground-faint)]">{pg.activeCycle}</div>
                  <div className="mt-2 text-sm font-medium text-[var(--foreground)]">
                    {workspace?.activeCycle
                      ? `Q${workspace.activeCycle.quarter} ${workspace.activeCycle.year} · ${workspace.activeCycle.status}`
                      : t.pages.common.noActiveCycle}
                  </div>
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-6">
        <AppearanceCard />
        <WorkspaceSetupCard slug={orgSlug} />
        <StrategyCard slug={orgSlug} />
      </div>

      <div className="mt-6">
        <SectionCard title={pg.teamMembers} subtitle={pg.teamMembersSubtitle}>
          {loading ? (
            <div className="space-y-4">
              <div className="h-28 animate-pulse rounded-[20px] border border-[var(--border)] bg-[var(--card)]" />
              <div className="h-56 animate-pulse rounded-[20px] border border-[var(--border)] bg-[var(--card)]" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className={cardClass()}>
                <div className="text-base font-bold text-[var(--foreground)]">{pg.inviteTeammate}</div>
                <div className="mt-1 text-sm text-[var(--foreground-muted)]">
                  {pg.inviteHint}
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[var(--foreground-soft)]">{pg.workEmailLabel}</label>
                    <input
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="name@company.com"
                      disabled={!member?.permissions?.canInviteMembers || inviting}
                      className={inputClass()}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-[var(--foreground-soft)]">{pg.roleLabel}</label>
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
                    <label className="mb-2 block text-sm font-medium text-[var(--foreground-soft)]">{t.pages.common.department}</label>
                    <select
                      value={inviteDepartmentId}
                      onChange={(e) => setInviteDepartmentId(e.target.value)}
                      disabled={!member?.permissions?.canInviteMembers || inviting}
                      className={inputClass()}
                    >
                      <option value="" className="bg-[var(--background)] text-[var(--foreground)]">
                        Choose a department
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
                    {inviting ? pg.sending : pg.sendInvite}
                  </button>
                </div>
              </div>

              <div className={cardClass()}>
                <div className="text-base font-bold text-[var(--foreground)]">{pg.currentMembers}</div>
                <div className="mt-1 text-sm text-[var(--foreground-muted)]">
                  {pg.deptWarning}
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
                                      {item.departmentName ?? t.pages.common.unassigned}
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
                                    {pg.changeRole}
                                  </button>
                                )}

                                {!isOwner && supportsDepartment ? (
                                  <button
                                    type="button"
                                    onClick={() => handleStartDepartmentAssign(item.userId, item.departmentId)}
                                    disabled={!member?.permissions?.canInviteMembers}
                                    className={actionGhostClass()}
                                  >
                                    {pg.assignDept}
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
                                  {removingMemberId === item.userId ? pg.removing : pg.remove}
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
                                    {updatingMemberId === item.userId ? t.pages.common.saving : pg.saveRole}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setEditingMemberId(null)}
                                    disabled={updatingMemberId === item.userId}
                                    className={actionGhostClass()}
                                  >
                                    {t.pages.common.cancel}
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
                                    Choose a department
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
                                    {updatingMemberId === item.userId ? t.pages.common.saving : pg.saveDept}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setAssigningMemberId(null)}
                                    disabled={updatingMemberId === item.userId}
                                    className={actionGhostClass()}
                                  >
                                    {t.pages.common.cancel}
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
                    {pg.noMembers}
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