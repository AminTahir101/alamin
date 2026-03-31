// app/api/o/[slug]/settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };

type Role =
  | "owner"
  | "admin"
  | "manager"
  | "dept_head"
  | "finance"
  | "member"
  | "employee";

type OrgRow = {
  id: string;
  slug: string;
  name: string;
};

type CycleRow = {
  id: string;
  year: number;
  quarter: number;
  status: string;
};

type DepartmentRow = {
  id: string;
  name: string;
};

type OrgMemberRow = {
  org_id: string;
  user_id: string;
  role: Role;
  department_id?: string | null;
};

const INVITABLE_ROLES: Role[] = ["admin", "manager", "dept_head", "finance", "member", "employee"];

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function supabaseAdmin() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

async function requireUser(req: NextRequest): Promise<User> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!token) throw new Error("Missing Authorization Bearer token");

  const sb = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user;
}

async function requireOrgMember(
  admin: ReturnType<typeof supabaseAdmin>,
  userId: string,
  slug: string
): Promise<{ org: OrgRow; membership: Record<string, unknown> }> {
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .select("id,slug,name")
    .eq("slug", slug)
    .maybeSingle<OrgRow>();

  if (orgErr) throw new Error(orgErr.message);
  if (!org) throw new Error(`Organization not found for slug: ${slug}`);

  const { data: mem, error: memErr } = await admin
    .from("organization_members")
    .select("*")
    .eq("org_id", org.id)
    .eq("user_id", userId)
    .maybeSingle<Record<string, unknown>>();

  if (memErr) throw new Error(memErr.message);
  if (!mem) throw new Error("Forbidden: not a member of this organization");

  return { org, membership: mem };
}

function membershipRole(membership: Record<string, unknown>): Role {
  return String(membership.role ?? "member").trim().toLowerCase() as Role;
}

function roleLevel(role: string) {
  switch (role) {
    case "owner":
      return 100;
    case "admin":
      return 90;
    case "manager":
      return 70;
    case "dept_head":
      return 60;
    case "finance":
      return 50;
    case "member":
      return 30;
    case "employee":
      return 10;
    default:
      return 0;
  }
}

function canManageOrg(role: string) {
  return roleLevel(role) >= 90;
}

function canManageKPIs(role: string) {
  return roleLevel(role) >= 70;
}

function canViewFinance(role: string) {
  return role === "finance" || roleLevel(role) >= 90;
}

function canInviteMembers(role: string) {
  return role === "owner";
}

function roleSupportsDepartment(role: string) {
  return role === "dept_head" || role === "employee";
}

async function safeJson<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

async function countIfTableExists(admin: ReturnType<typeof supabaseAdmin>, table: string, orgId: string) {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  if (error) {
    const msg = error.message || "";
    const missingTable =
      msg.includes("Could not find the table") ||
      (msg.includes("relation") && msg.includes("does not exist"));

    if (missingTable) return 0;
    throw new Error(error.message);
  }

  return Number(count ?? 0);
}

async function activeCycleIfExists(admin: ReturnType<typeof supabaseAdmin>, orgId: string) {
  const { data, error } = await admin
    .from("cycles")
    .select("id,year,quarter,status")
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("year", { ascending: false })
    .order("quarter", { ascending: false })
    .limit(1)
    .maybeSingle<CycleRow>();

  if (error) {
    const msg = error.message || "";
    const missingTable =
      msg.includes("Could not find the table") ||
      (msg.includes("relation") && msg.includes("does not exist"));

    if (missingTable) return null;
    throw new Error(error.message);
  }

  return data ?? null;
}

async function getDepartments(admin: ReturnType<typeof supabaseAdmin>, orgId: string) {
  const { data, error } = await admin
    .from("departments")
    .select("id,name")
    .eq("org_id", orgId)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as DepartmentRow[];
}

async function getMembersWithEmails(admin: ReturnType<typeof supabaseAdmin>, orgId: string) {
  const [membersRes, departments] = await Promise.all([
    admin
      .from("organization_members")
      .select("org_id,user_id,role,department_id")
      .eq("org_id", orgId),
    getDepartments(admin, orgId),
  ]);

  if (membersRes.error) throw new Error(membersRes.error.message);

  const deptMap = new Map(departments.map((d) => [d.id, d.name]));

  const rows = (membersRes.data ?? []) as OrgMemberRow[];

  const members = await Promise.all(
    rows.map(async (row) => {
      const userResult = await admin.auth.admin.getUserById(row.user_id);
      return {
        userId: row.user_id,
        email: userResult.data.user?.email ?? null,
        role: row.role,
        departmentId: row.department_id ?? null,
        departmentName: row.department_id ? deptMap.get(row.department_id) ?? null : null,
      };
    })
  );

  return members.sort((a, b) => {
    const roleDiff = roleLevel(b.role) - roleLevel(a.role);
    if (roleDiff !== 0) return roleDiff;
    return String(a.email ?? a.userId).localeCompare(String(b.email ?? b.userId));
  });
}

async function findAuthUserByEmail(admin: ReturnType<typeof supabaseAdmin>, email: string) {
  let page = 1;
  const perPage = 200;
  const target = email.trim().toLowerCase();

  while (true) {
    const result = await admin.auth.admin.listUsers({ page, perPage });
    if (result.error) throw new Error(result.error.message);

    const users = result.data.users ?? [];
    const found = users.find((u) => String(u.email ?? "").trim().toLowerCase() === target);
    if (found) return found;

    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}

async function findOrInviteUserByEmail(
  admin: ReturnType<typeof supabaseAdmin>,
  email: string,
  origin: string
) {
  const existing = await findAuthUserByEmail(admin, email);
  if (existing) return existing;

  const invited = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth`,
  });

  if (invited.error || !invited.data.user) {
    throw new Error(invited.error?.message || "Failed to invite user");
  }

  return invited.data.user;
}

async function validateDepartmentIfNeeded(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  role: Role,
  departmentId: string | null
) {
  if (!roleSupportsDepartment(role)) return;

  if (!departmentId) {
    throw new Error("Department is required for Department Head and Employee");
  }

  const { data, error } = await admin
    .from("departments")
    .select("id")
    .eq("org_id", orgId)
    .eq("id", departmentId)
    .maybeSingle<{ id: string }>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Selected department not found");
}

async function insertMembership(
  admin: ReturnType<typeof supabaseAdmin>,
  payload: {
    org_id: string;
    user_id: string;
    role: Role;
    created_by: string;
    department_id?: string | null;
  }
) {
  const firstTry = await admin.from("organization_members").insert(payload);

  if (!firstTry.error) return;

  const msg = firstTry.error.message || "";
  const missingCreatedBy =
    msg.includes("created_by") &&
    (msg.includes("Could not find the") || msg.includes("column") || msg.includes("schema cache"));

  if (!missingCreatedBy) {
    throw new Error(firstTry.error.message);
  }

  const secondTry = await admin.from("organization_members").insert({
    org_id: payload.org_id,
    user_id: payload.user_id,
    role: payload.role,
    department_id: payload.department_id ?? null,
  });

  if (secondTry.error) throw new Error(secondTry.error.message);
}

async function updateMemberRole(
  admin: ReturnType<typeof supabaseAdmin>,
  payload: {
    org_id: string;
    user_id: string;
    role: Role;
  }
) {
  const updatePayload: { role: Role; department_id?: string | null } = { role: payload.role };

  if (!roleSupportsDepartment(payload.role)) {
    updatePayload.department_id = null;
  }

  const { error } = await admin
    .from("organization_members")
    .update(updatePayload)
    .eq("org_id", payload.org_id)
    .eq("user_id", payload.user_id);

  if (error) throw new Error(error.message);
}

async function updateMemberDepartment(
  admin: ReturnType<typeof supabaseAdmin>,
  payload: {
    org_id: string;
    user_id: string;
    department_id: string | null;
  }
) {
  const { error } = await admin
    .from("organization_members")
    .update({ department_id: payload.department_id })
    .eq("org_id", payload.org_id)
    .eq("user_id", payload.user_id);

  if (error) throw new Error(error.message);
}

async function deleteMembership(
  admin: ReturnType<typeof supabaseAdmin>,
  payload: {
    org_id: string;
    user_id: string;
  }
) {
  const { error } = await admin
    .from("organization_members")
    .delete()
    .eq("org_id", payload.org_id)
    .eq("user_id", payload.user_id);

  if (error) throw new Error(error.message);
}

async function getOwnerCount(admin: ReturnType<typeof supabaseAdmin>, orgId: string) {
  const { count, error } = await admin
    .from("organization_members")
    .select("user_id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("role", "owner");

  if (error) throw new Error(error.message);
  return Number(count ?? 0);
}

async function buildSettingsPayload(
  admin: ReturnType<typeof supabaseAdmin>,
  org: OrgRow,
  user: User,
  currentRole: Role
) {
  const [departments, kpis,, activeCycle, members] = await Promise.all([
    getDepartments(admin, org.id),
    countIfTableExists(admin, "departments", org.id),
    countIfTableExists(admin, "kpis", org.id),
    activeCycleIfExists(admin, org.id),
    getMembersWithEmails(admin, org.id),
  ]);

  const objectiveCount = await countIfTableExists(admin, "objectives", org.id);

  return {
    ok: true,
    org,
    member: {
      userId: user.id,
      email: user.email ?? null,
      role: currentRole,
      permissions: {
        canManageOrg: canManageOrg(currentRole),
        canManageKPIs: canManageKPIs(currentRole),
        canViewFinance: canViewFinance(currentRole),
        canInviteMembers: canInviteMembers(currentRole),
      },
    },
    workspace: {
      departments: departments.length,
      kpis,
      objectives: objectiveCount,
      activeCycle,
    },
    departments,
    members,
  };
}

export async function GET(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const user = await requireUser(req);
    const admin = supabaseAdmin();
    const { org, membership } = await requireOrgMember(admin, user.id, slug);
    const currentRole = membershipRole(membership);

    return NextResponse.json(await buildSettingsPayload(admin, org, user, currentRole));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load settings";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const user = await requireUser(req);
    const admin = supabaseAdmin();
    const { org, membership } = await requireOrgMember(admin, user.id, slug);
    const currentRole = membershipRole(membership);

    if (!canInviteMembers(currentRole)) {
      return NextResponse.json({ ok: false, error: "Only the owner can add members" }, { status: 403 });
    }

    const body = await safeJson<{ email?: string; role?: Role; departmentId?: string | null }>(req);
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "").trim().toLowerCase() as Role;
    const departmentId = String(body.departmentId ?? "").trim() || null;

    if (!email) {
      return NextResponse.json({ ok: false, error: "Email is required" }, { status: 400 });
    }

    if (!INVITABLE_ROLES.includes(role)) {
      return NextResponse.json({ ok: false, error: "Invalid role selected" }, { status: 400 });
    }

    await validateDepartmentIfNeeded(admin, org.id, role, departmentId);

    const authUser = await findOrInviteUserByEmail(admin, email, req.nextUrl.origin);

    const { data: existingMembership, error: existingErr } = await admin
      .from("organization_members")
      .select("user_id,role")
      .eq("org_id", org.id)
      .eq("user_id", authUser.id)
      .maybeSingle<OrgMemberRow>();

    if (existingErr) throw new Error(existingErr.message);

    if (existingMembership) {
      return NextResponse.json(
        { ok: false, error: "This user is already a member of the organization" },
        { status: 409 }
      );
    }

    await insertMembership(admin, {
      org_id: org.id,
      user_id: authUser.id,
      role,
      created_by: user.id,
      department_id: roleSupportsDepartment(role) ? departmentId : null,
    });

    return NextResponse.json({
      ...(await buildSettingsPayload(admin, org, user, currentRole)),
      message: "Member added successfully",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to add member";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const user = await requireUser(req);
    const admin = supabaseAdmin();
    const { org, membership } = await requireOrgMember(admin, user.id, slug);
    const currentRole = membershipRole(membership);

    const body = await safeJson<{
      action?: "update_org" | "update_member_role" | "update_member_department";
      organizationName?: string;
      targetUserId?: string;
      role?: Role;
      departmentId?: string | null;
    }>(req);

    const action = String(body.action ?? "update_org").trim();

    if (action === "update_member_role") {
      if (!canInviteMembers(currentRole)) {
        return NextResponse.json({ ok: false, error: "Only the owner can change roles" }, { status: 403 });
      }

      const targetUserId = String(body.targetUserId ?? "").trim();
      const nextRole = String(body.role ?? "").trim().toLowerCase() as Role;

      if (!targetUserId) {
        return NextResponse.json({ ok: false, error: "targetUserId is required" }, { status: 400 });
      }

      if (!INVITABLE_ROLES.includes(nextRole)) {
        return NextResponse.json({ ok: false, error: "Invalid role selected" }, { status: 400 });
      }

      const { data: targetMembership, error: targetErr } = await admin
        .from("organization_members")
        .select("org_id,user_id,role,department_id")
        .eq("org_id", org.id)
        .eq("user_id", targetUserId)
        .maybeSingle<OrgMemberRow>();

      if (targetErr) throw new Error(targetErr.message);
      if (!targetMembership) {
        return NextResponse.json({ ok: false, error: "Target member not found" }, { status: 404 });
      }

      if (targetMembership.role === "owner") {
        return NextResponse.json(
          { ok: false, error: "Owner role cannot be changed from this screen" },
          { status: 409 }
        );
      }

      await updateMemberRole(admin, {
        org_id: org.id,
        user_id: targetUserId,
        role: nextRole,
      });

      return NextResponse.json({
        ...(await buildSettingsPayload(admin, org, user, currentRole)),
        message: "Member role updated successfully",
      });
    }

    if (action === "update_member_department") {
      if (!canInviteMembers(currentRole)) {
        return NextResponse.json(
          { ok: false, error: "Only the owner can assign departments" },
          { status: 403 }
        );
      }

      const targetUserId = String(body.targetUserId ?? "").trim();
      const departmentId = String(body.departmentId ?? "").trim() || null;

      if (!targetUserId) {
        return NextResponse.json({ ok: false, error: "targetUserId is required" }, { status: 400 });
      }

      const { data: targetMembership, error: targetErr } = await admin
        .from("organization_members")
        .select("org_id,user_id,role,department_id")
        .eq("org_id", org.id)
        .eq("user_id", targetUserId)
        .maybeSingle<OrgMemberRow>();

      if (targetErr) throw new Error(targetErr.message);
      if (!targetMembership) {
        return NextResponse.json({ ok: false, error: "Target member not found" }, { status: 404 });
      }

      if (!roleSupportsDepartment(targetMembership.role)) {
        return NextResponse.json(
          { ok: false, error: "Only dept_head and employee can be assigned to a department" },
          { status: 409 }
        );
      }

      await validateDepartmentIfNeeded(admin, org.id, targetMembership.role, departmentId);

      await updateMemberDepartment(admin, {
        org_id: org.id,
        user_id: targetUserId,
        department_id: departmentId,
      });

      return NextResponse.json({
        ...(await buildSettingsPayload(admin, org, user, currentRole)),
        message: departmentId ? "Department assigned successfully" : "Department assignment cleared",
      });
    }

    if (!canManageOrg(currentRole)) {
      return NextResponse.json({ ok: false, error: "Only org admins can update settings" }, { status: 403 });
    }

    const organizationName = String(body.organizationName ?? "").trim().replace(/\s+/g, " ");

    if (!organizationName) {
      return NextResponse.json({ ok: false, error: "Organization name is required" }, { status: 400 });
    }

    const { data: updatedOrg, error: updateErr } = await admin
      .from("organizations")
      .update({ name: organizationName })
      .eq("id", org.id)
      .select("id,slug,name")
      .single<OrgRow>();

    if (updateErr) throw new Error(updateErr.message);

    return NextResponse.json({
      ...(await buildSettingsPayload(admin, updatedOrg, user, currentRole)),
      message: "Organization settings updated",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to update settings";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const user = await requireUser(req);
    const admin = supabaseAdmin();
    const { org, membership } = await requireOrgMember(admin, user.id, slug);
    const currentRole = membershipRole(membership);

    if (!canInviteMembers(currentRole)) {
      return NextResponse.json({ ok: false, error: "Only the owner can remove members" }, { status: 403 });
    }

    const body = await safeJson<{ targetUserId?: string }>(req);
    const targetUserId = String(body.targetUserId ?? "").trim();

    if (!targetUserId) {
      return NextResponse.json({ ok: false, error: "targetUserId is required" }, { status: 400 });
    }

    if (targetUserId === user.id) {
      return NextResponse.json(
        { ok: false, error: "You cannot remove yourself from the organization" },
        { status: 409 }
      );
    }

    const { data: targetMembership, error: targetErr } = await admin
      .from("organization_members")
      .select("org_id,user_id,role")
      .eq("org_id", org.id)
      .eq("user_id", targetUserId)
      .maybeSingle<OrgMemberRow>();

    if (targetErr) throw new Error(targetErr.message);
    if (!targetMembership) {
      return NextResponse.json({ ok: false, error: "Target member not found" }, { status: 404 });
    }

    if (targetMembership.role === "owner") {
      const ownerCount = await getOwnerCount(admin, org.id);
      if (ownerCount <= 1) {
        return NextResponse.json(
          { ok: false, error: "You cannot remove the last owner from the organization" },
          { status: 409 }
        );
      }
    }

    if (targetMembership.role === "owner") {
      return NextResponse.json(
        { ok: false, error: "Owner cannot be removed from this screen" },
        { status: 409 }
      );
    }

    await deleteMembership(admin, {
      org_id: org.id,
      user_id: targetUserId,
    });

    return NextResponse.json({
      ...(await buildSettingsPayload(admin, org, user, currentRole)),
      message: "Member removed successfully",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to remove member";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}