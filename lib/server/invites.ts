// lib/server/invites.ts
//
// Shared invite + membership helpers used across onboarding, settings, and
// admin routes. This is the single source of truth for how invites are sent
// and how memberships are created for invited users.
//
// Key decisions encoded here:
//   - Metadata on the auth user always includes `invited_to_org_slug` so the
//     /auth page's auto-routing can find the correct workspace.
//   - Existing auth users are treated as "find and reuse" not "skip" — they
//     get a membership row in the new org automatically.
//   - Membership creation is idempotent: if a row already exists, we leave it
//     alone rather than error.

import type { SupabaseClient, User } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type Role =
  | "owner"
  | "admin"
  | "manager"
  | "dept_head"
  | "finance"
  | "member"
  | "employee";

export type InviteRequest = {
  email: string;
  role: Role;
  departmentId?: string | null;
};

export type InviteContext = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  invitedBy: string;
  redirectTo: string;
};

export type InviteOutcome =
  | {
      email: string;
      status: "invited_and_membership_created";
      user_id: string;
    }
  | {
      email: string;
      status: "existing_user_added_to_org";
      user_id: string;
    }
  | {
      email: string;
      status: "existing_member";
      user_id: string;
    }
  | {
      email: string;
      status: "failed";
      error: string;
    };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function cleanEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

/**
 * Find a Supabase auth user by email. Paginated because the admin listUsers
 * API returns max ~200 users per page.
 */
export async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<User | null> {
  const target = cleanEmail(email);
  if (!target) return null;

  const perPage = 200;
  let page = 1;

  while (page <= 50) {
    // hard safety ceiling
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);

    const users = data.users ?? [];
    const found = users.find(
      (u) => cleanEmail(u.email) === target,
    );
    if (found) return found;

    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}

/**
 * Check if an existing membership row exists for a given user + org.
 */
async function hasMembership(
  admin: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return !!data;
}

/**
 * Insert a membership row. Handles the legacy `created_by` column that may or
 * may not exist in the schema cache (from the existing settings route pattern).
 */
async function insertMembershipRow(
  admin: SupabaseClient,
  payload: {
    org_id: string;
    user_id: string;
    role: Role;
    created_by: string;
    department_id?: string | null;
  },
): Promise<void> {
  const firstTry = await admin.from("organization_members").insert(payload);

  if (!firstTry.error) return;

  const msg = firstTry.error.message || "";
  const missingCreatedBy =
    msg.includes("created_by") &&
    (msg.includes("Could not find the") ||
      msg.includes("column") ||
      msg.includes("schema cache"));

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

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point: invite or add a user with membership
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Invite a user (or find existing) and create their membership for the given
 * org + role + department. Idempotent — safe to call multiple times.
 *
 * Metadata is written to the auth user so that when they click the invite
 * email and log in, the /auth page's auto-routing can find the right workspace.
 */
export async function inviteOrAddMember(
  admin: SupabaseClient,
  request: InviteRequest,
  ctx: InviteContext,
): Promise<InviteOutcome> {
  const email = cleanEmail(request.email);
  if (!email) {
    return {
      email: request.email,
      status: "failed",
      error: "Empty email",
    };
  }

  try {
    // Step 1: Does the auth user already exist?
    const existing = await findAuthUserByEmail(admin, email);

    if (existing) {
      // Check if they already have a membership in this org
      const alreadyMember = await hasMembership(admin, ctx.orgId, existing.id);
      if (alreadyMember) {
        return {
          email,
          status: "existing_member",
          user_id: existing.id,
        };
      }

      // Add them to this org as a member
      await insertMembershipRow(admin, {
        org_id: ctx.orgId,
        user_id: existing.id,
        role: request.role,
        department_id: request.departmentId ?? null,
        created_by: ctx.invitedBy,
      });

      return {
        email,
        status: "existing_user_added_to_org",
        user_id: existing.id,
      };
    }

    // Step 2: Fresh invite — send them an email
    const inviteResult = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: ctx.redirectTo,
      data: {
        // CANONICAL metadata keys — used by /auth auto-routing and /accept-invite.
        invited_to_org_slug: ctx.orgSlug,
        invited_to_org_id: ctx.orgId,
        invited_to_org_name: ctx.orgName,
        invited_role: request.role,
        invited_to_department_id: request.departmentId ?? null,
        invited_by: ctx.invitedBy,
      },
    });

    if (inviteResult.error || !inviteResult.data.user) {
      return {
        email,
        status: "failed",
        error: inviteResult.error?.message || "Failed to send invite",
      };
    }

    // Step 3: Create their membership row immediately so when they accept
    // the invite and log in, /auth finds their org and routes correctly.
    await insertMembershipRow(admin, {
      org_id: ctx.orgId,
      user_id: inviteResult.data.user.id,
      role: request.role,
      department_id: request.departmentId ?? null,
      created_by: ctx.invitedBy,
    });

    return {
      email,
      status: "invited_and_membership_created",
      user_id: inviteResult.data.user.id,
    };
  } catch (error: unknown) {
    return {
      email,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown invite error",
    };
  }
}

/**
 * Bulk-invite version. Used by onboarding where multiple department heads are
 * invited in one submission.
 */
export async function inviteOrAddMembers(
  admin: SupabaseClient,
  requests: InviteRequest[],
  ctx: InviteContext,
): Promise<InviteOutcome[]> {
  const outcomes: InviteOutcome[] = [];

  // Deduplicate by email (last entry wins if there are conflicts)
  const byEmail = new Map<string, InviteRequest>();
  for (const r of requests) {
    const e = cleanEmail(r.email);
    if (!e) continue;
    byEmail.set(e, r);
  }

  for (const request of byEmail.values()) {
    const outcome = await inviteOrAddMember(admin, request, ctx);
    outcomes.push(outcome);
  }

  return outcomes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary helper for API responses
// ─────────────────────────────────────────────────────────────────────────────

export function summarizeOutcomes(outcomes: InviteOutcome[]): {
  invited: string[];
  existing_added: string[];
  existing_member: string[];
  failed: Array<{ email: string; error: string }>;
} {
  const invited: string[] = [];
  const existing_added: string[] = [];
  const existing_member: string[] = [];
  const failed: Array<{ email: string; error: string }> = [];

  for (const o of outcomes) {
    switch (o.status) {
      case "invited_and_membership_created":
        invited.push(o.email);
        break;
      case "existing_user_added_to_org":
        existing_added.push(o.email);
        break;
      case "existing_member":
        existing_member.push(o.email);
        break;
      case "failed":
        failed.push({ email: o.email, error: o.error });
        break;
    }
  }

  return { invited, existing_added, existing_member, failed };
}
