// lib/server/accessScope.ts
import { createClient, type User } from "@supabase/supabase-js";

export type OrgRole =
  | "owner"
  | "admin"
  | "manager"
  | "dept_head"
  | "finance"
  | "member"
  | "employee";

export type OrgRow = {
  id: string;
  slug: string;
  name: string;
};

export type MembershipRow = {
  org_id: string;
  user_id: string;
  role: OrgRole;
  department_id?: string | null;
};

export type AccessScope = {
  org: OrgRow;
  user: User;
  membership: MembershipRow;
  role: OrgRole;
  canViewAll: boolean;
  departmentId: string | null;
  userId: string;
  mode: "org" | "department" | "employee";
};

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export function supabaseAdmin() {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false },
    }
  );
}

export async function requireUserFromRequest(req: Request): Promise<User> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!token) throw new Error("Missing Authorization Bearer token");

  const sb = createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );

  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) throw new Error("Unauthorized");

  return data.user;
}

export function roleLevel(role: string) {
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

export function canViewAllRole(role: string) {
  return role === "owner" || role === "admin" || role === "manager";
}

export function canManageOrgRole(role: string) {
  return role === "owner" || role === "admin";
}

export function canManageWorkRole(role: string) {
  return role === "owner" || role === "admin" || role === "manager";
}

export async function requireAccessScope(
  req: Request,
  slug: string
): Promise<AccessScope> {
  const admin = supabaseAdmin();
  const user = await requireUserFromRequest(req);

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .select("id,slug,name")
    .eq("slug", slug)
    .maybeSingle<OrgRow>();

  if (orgErr) throw new Error(orgErr.message);
  if (!org) throw new Error(`Organization not found for slug: ${slug}`);

  const { data: membership, error: memErr } = await admin
    .from("organization_members")
    .select("org_id,user_id,role,department_id")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle<MembershipRow>();

  if (memErr) throw new Error(memErr.message);
  if (!membership) throw new Error("Forbidden: not a member of this organization");

  const role = String(membership.role ?? "member").trim().toLowerCase() as OrgRole;
  const departmentId = membership.department_id ?? null;

  if (canViewAllRole(role)) {
    return {
      org,
      user,
      membership,
      role,
      canViewAll: true,
      departmentId,
      userId: user.id,
      mode: "org",
    };
  }

  if (role === "dept_head") {
    return {
      org,
      user,
      membership,
      role,
      canViewAll: false,
      departmentId,
      userId: user.id,
      mode: "department",
    };
  }

  if (role === "employee") {
    return {
      org,
      user,
      membership,
      role,
      canViewAll: false,
      departmentId,
      userId: user.id,
      mode: "employee",
    };
  }

  return {
    org,
    user,
    membership,
    role,
    canViewAll: false,
    departmentId,
    userId: user.id,
    mode: "department",
  };
}