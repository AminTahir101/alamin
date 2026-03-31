import { NextRequest, NextResponse } from "next/server";
import {
  requireAccessScope,
  supabaseAdmin,
} from "@/lib/server/accessScope";

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

type DepartmentRow = {
  id: string;
  name: string;
};

type MemberRow = {
  user_id: string;
  role: Role;
  department_id?: string | null;
};

type CycleRow = {
  id: string;
  year: number;
  quarter: number;
  status: string;
};

type JtbRow = {
  id: string;
  org_id: string;
  cycle_id?: string | null;
  department_id?: string | null;
  objective_id?: string | null;
  kpi_id?: string | null;
  title: string;
  description?: string | null;
  status: "draft" | "in_progress" | "blocked" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
  owner_user_id?: string | null;
  created_by?: string | null;
  assigned_by_user_id?: string | null;
  visible_to_department?: boolean;
  ai_generated?: boolean;
  ai_prompt?: string | null;
  ai_output?: unknown;
  due_date?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

type JtbCommentRow = {
  id: string;
  jtb_id: string;
  user_id?: string | null;
  comment: string;
  created_at: string;
};

type JtbDependencyRow = {
  id: string;
  jtb_id: string;
  depends_on_jtb_id: string;
};

type CreateBody = {
  title: string;
  description?: string;
  department_id?: string | null;
  objective_id?: string | null;
  kpi_id?: string | null;
  owner_user_id?: string | null;
  status?: JtbRow["status"];
  priority?: JtbRow["priority"];
  due_date?: string | null;
  visible_to_department?: boolean;
  ai_generated?: boolean;
  ai_prompt?: string | null;
  ai_output?: unknown;
};

type UpdateBody = {
  id: string;
  title?: string;
  description?: string | null;
  owner_user_id?: string | null;
  status?: JtbRow["status"];
  priority?: JtbRow["priority"];
  due_date?: string | null;
  visible_to_department?: boolean;
};

function canManageDepartmentWork(role: string) {
  return role === "owner" || role === "admin" || role === "manager" || role === "dept_head";
}

async function getActiveCycle(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string
): Promise<CycleRow | null> {
  const { data, error } = await admin
    .from("quarterly_cycles")
    .select("id,year,quarter,status")
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("year", { ascending: false })
    .order("quarter", { ascending: false })
    .maybeSingle<CycleRow>();

  if (error) throw new Error(error.message);
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

async function getAssignableMembers(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  departmentId?: string | null
) {
  let query = admin
    .from("organization_members")
    .select("user_id,role,department_id")
    .eq("org_id", orgId);

  if (departmentId) {
    query = query.eq("department_id", departmentId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as MemberRow[];

  const members = await Promise.all(
    rows.map(async (row) => {
      const authUser = await admin.auth.admin.getUserById(row.user_id);
      return {
        userId: row.user_id,
        role: row.role,
        departmentId: row.department_id ?? null,
        email: authUser.data.user?.email ?? null,
      };
    })
  );

  return members.sort((a, b) =>
    String(a.email ?? a.userId).localeCompare(String(b.email ?? b.userId))
  );
}

async function getObjectives(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  cycleId?: string | null,
  departmentId?: string | null
) {
  let query = admin
    .from("objectives")
    .select("id,title,department_id")
    .eq("org_id", orgId)
    .order("title", { ascending: true });

  if (cycleId) query = query.eq("cycle_id", cycleId);
  if (departmentId) query = query.eq("department_id", departmentId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []) as Array<{ id: string; title: string; department_id?: string | null }>;
}

async function getKpis(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  cycleId?: string | null,
  departmentId?: string | null
) {
  let query = admin
    .from("kpis")
    .select("id,title,department_id")
    .eq("org_id", orgId)
    .order("title", { ascending: true });

  if (cycleId) query = query.eq("cycle_id", cycleId);
  if (departmentId) query = query.eq("department_id", departmentId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []) as Array<{ id: string; title: string; department_id?: string | null }>;
}

async function getJobs(
  admin: ReturnType<typeof supabaseAdmin>,
  params: {
    orgId: string;
    mode: "org" | "department" | "employee";
    departmentId: string | null;
    userId: string;
  }
) {
  let query = admin
    .from("jobs_to_be_done")
    .select("*")
    .eq("org_id", params.orgId)
    .order("created_at", { ascending: false });

  if (params.mode === "department") {
    if (!params.departmentId) return [] as JtbRow[];
    query = query.eq("department_id", params.departmentId);
  }

  if (params.mode === "employee") {
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as JtbRow[];
    return rows.filter(
      (row) =>
        row.owner_user_id === params.userId ||
        (row.visible_to_department === true && row.department_id === params.departmentId)
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as JtbRow[];
}

async function getCommentsForJobs(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  jobIds: string[]
) {
  if (!jobIds.length) return [] as JtbCommentRow[];

  const { data, error } = await admin
    .from("jtb_comments")
    .select("*")
    .eq("org_id", orgId)
    .in("jtb_id", jobIds)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as JtbCommentRow[];
}

async function getDependenciesForJobs(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  jobIds: string[]
) {
  if (!jobIds.length) return [] as JtbDependencyRow[];

  const { data, error } = await admin
    .from("jtb_dependencies")
    .select("*")
    .eq("org_id", orgId)
    .in("jtb_id", jobIds);

  if (error) throw new Error(error.message);
  return (data ?? []) as JtbDependencyRow[];
}

async function ensureDepartmentBelongsToOrg(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  departmentId: string
) {
  const { data, error } = await admin
    .from("departments")
    .select("id")
    .eq("org_id", orgId)
    .eq("id", departmentId)
    .maybeSingle<{ id: string }>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invalid department");
}

async function ensureUserBelongsToOrg(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  userId: string
) {
  const { data, error } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle<{ user_id: string }>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Assigned user is not a member of this organization");
}

async function ensureUserBelongsToDepartment(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  userId: string,
  departmentId: string
) {
  const { data, error } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("department_id", departmentId)
    .maybeSingle<{ user_id: string }>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Assigned user is not in this department");
}

async function ensureObjectiveBelongsToScope(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  objectiveId: string,
  departmentId?: string | null
) {
  let query = admin
    .from("objectives")
    .select("id")
    .eq("org_id", orgId)
    .eq("id", objectiveId);

  if (departmentId) query = query.eq("department_id", departmentId);

  const { data, error } = await query.maybeSingle<{ id: string }>();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Objective not found in this scope");
}

async function ensureKpiBelongsToScope(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  kpiId: string,
  departmentId?: string | null
) {
  let query = admin
    .from("kpis")
    .select("id")
    .eq("org_id", orgId)
    .eq("id", kpiId);

  if (departmentId) query = query.eq("department_id", departmentId);

  const { data, error } = await query.maybeSingle<{ id: string }>();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("KPI not found in this scope");
}

async function writeActivity(
  admin: ReturnType<typeof supabaseAdmin>,
  payload: {
    org_id: string;
    jtb_id: string;
    user_id?: string | null;
    action: string;
    payload?: unknown;
  }
) {
  const { error } = await admin.from("jtb_activity_log").insert(payload);
  if (error) throw new Error(error.message);
}

export async function GET(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();

    const cycle = await getActiveCycle(admin, scope.org.id);

    const departmentScope =
      scope.mode === "org" ? null : scope.departmentId ?? null;

    const [departments, assignableMembers, objectives, kpis, jobs] = await Promise.all([
      getDepartments(admin, scope.org.id),
      getAssignableMembers(admin, scope.org.id, departmentScope),
      getObjectives(admin, scope.org.id, cycle?.id ?? null, departmentScope),
      getKpis(admin, scope.org.id, cycle?.id ?? null, departmentScope),
      getJobs(admin, {
        orgId: scope.org.id,
        mode: scope.mode,
        departmentId: scope.departmentId,
        userId: scope.userId,
      }),
    ]);

    const jobIds = jobs.map((job) => job.id);

    const [comments, dependencies] = await Promise.all([
      getCommentsForJobs(admin, scope.org.id, jobIds),
      getDependenciesForJobs(admin, scope.org.id, jobIds),
    ]);

    const deptMap = new Map(departments.map((d) => [d.id, d.name]));
    const memberMap = new Map(assignableMembers.map((m) => [m.userId, m]));
    const objectiveMap = new Map(objectives.map((o) => [o.id, o.title]));
    const kpiMap = new Map(kpis.map((k) => [k.id, k.title]));

    const commentsByJob = new Map<string, JtbCommentRow[]>();
    for (const comment of comments) {
      const list = commentsByJob.get(comment.jtb_id) ?? [];
      list.push(comment);
      commentsByJob.set(comment.jtb_id, list);
    }

    const depsByJob = new Map<string, string[]>();
    for (const dep of dependencies) {
      const list = depsByJob.get(dep.jtb_id) ?? [];
      list.push(dep.depends_on_jtb_id);
      depsByJob.set(dep.jtb_id, list);
    }

    return NextResponse.json({
      ok: true,
      cycle,
      role: scope.role,
      visibility: scope.mode,
      canManage: canManageDepartmentWork(scope.role),
      departments,
      assignableMembers,
      objectives,
      kpis,
      jobs: jobs.map((job) => ({
        ...job,
        department_name: job.department_id ? deptMap.get(job.department_id) ?? null : null,
        owner_email: job.owner_user_id ? memberMap.get(job.owner_user_id)?.email ?? null : null,
        objective_title: job.objective_id ? objectiveMap.get(job.objective_id) ?? null : null,
        kpi_title: job.kpi_id ? kpiMap.get(job.kpi_id) ?? null : null,
        comment_count: commentsByJob.get(job.id)?.length ?? 0,
        dependency_ids: depsByJob.get(job.id) ?? [],
        is_assigned_to_me: job.owner_user_id === scope.userId,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load JTBD";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();

    if (!canManageDepartmentWork(scope.role)) {
      return NextResponse.json(
        { ok: false, error: "You do not have permission to create JTBD items" },
        { status: 403 }
      );
    }

    const body = (await req.json()) as CreateBody;
    const cycle = await getActiveCycle(admin, scope.org.id);

    const title = String(body.title ?? "").trim();
    const description = String(body.description ?? "").trim() || null;
    const requestedDepartmentId = String(body.department_id ?? "").trim() || null;
    const departmentId = scope.mode === "department" ? scope.departmentId : requestedDepartmentId;
    const objectiveId = String(body.objective_id ?? "").trim() || null;
    const kpiId = String(body.kpi_id ?? "").trim() || null;
    const ownerUserId = String(body.owner_user_id ?? "").trim() || null;
    const status = (String(body.status ?? "draft").trim() as JtbRow["status"]) || "draft";
    const priority = (String(body.priority ?? "medium").trim() as JtbRow["priority"]) || "medium";
    const dueDate = String(body.due_date ?? "").trim() || null;
    const visibleToDepartment = Boolean(body.visible_to_department);
    const aiGenerated = Boolean(body.ai_generated);
    const aiPrompt = String(body.ai_prompt ?? "").trim() || null;
    const aiOutput = body.ai_output ?? null;

    if (!title) {
      return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });
    }

    if (departmentId) {
      await ensureDepartmentBelongsToOrg(admin, scope.org.id, departmentId);
    }

    if (ownerUserId) {
      await ensureUserBelongsToOrg(admin, scope.org.id, ownerUserId);
      if (departmentId) {
        await ensureUserBelongsToDepartment(admin, scope.org.id, ownerUserId, departmentId);
      }
    }

    if (objectiveId) {
      await ensureObjectiveBelongsToScope(admin, scope.org.id, objectiveId, departmentId);
    }

    if (kpiId) {
      await ensureKpiBelongsToScope(admin, scope.org.id, kpiId, departmentId);
    }

    const insertPayload = {
      org_id: scope.org.id,
      cycle_id: cycle?.id ?? null,
      department_id: departmentId,
      objective_id: objectiveId,
      kpi_id: kpiId,
      title,
      description,
      status,
      priority,
      owner_user_id: ownerUserId,
      created_by: scope.user.id,
      assigned_by_user_id: ownerUserId ? scope.user.id : null,
      visible_to_department: visibleToDepartment,
      ai_generated: aiGenerated,
      ai_prompt: aiPrompt,
      ai_output: aiOutput,
      due_date: dueDate,
      completed_at: status === "done" ? new Date().toISOString() : null,
    };

    const { data, error } = await admin
      .from("jobs_to_be_done")
      .insert(insertPayload)
      .select("*")
      .single<JtbRow>();

    if (error) throw new Error(error.message);

    await writeActivity(admin, {
      org_id: scope.org.id,
      jtb_id: data.id,
      user_id: scope.user.id,
      action: "created",
      payload: {
        owner_user_id: ownerUserId,
        department_id: departmentId,
        objective_id: objectiveId,
        kpi_id: kpiId,
      },
    });

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create JTBD item";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();

    const body = (await req.json()) as UpdateBody;
    const id = String(body.id ?? "").trim();

    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }

    const { data: existing, error: existingErr } = await admin
      .from("jobs_to_be_done")
      .select("*")
      .eq("org_id", scope.org.id)
      .eq("id", id)
      .maybeSingle<JtbRow>();

    if (existingErr) throw new Error(existingErr.message);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "JTBD item not found" }, { status: 404 });
    }

    const canManage = canManageDepartmentWork(scope.role);
    const isOwner = existing.owner_user_id === scope.userId;

    if (!canManage && !isOwner) {
      return NextResponse.json(
        { ok: false, error: "You do not have permission to update this item" },
        { status: 403 }
      );
    }

    const nextTitle = body.title !== undefined ? String(body.title).trim() : existing.title;
    const nextDescription =
      body.description !== undefined ? String(body.description ?? "").trim() || null : existing.description ?? null;
    const nextOwnerUserId =
      body.owner_user_id !== undefined
        ? String(body.owner_user_id ?? "").trim() || null
        : existing.owner_user_id ?? null;
    const nextStatus =
      body.status !== undefined ? body.status : existing.status;
    const nextPriority =
      body.priority !== undefined ? body.priority : existing.priority;
    const nextDueDate =
      body.due_date !== undefined ? String(body.due_date ?? "").trim() || null : existing.due_date ?? null;
    const nextVisible =
      body.visible_to_department !== undefined
        ? Boolean(body.visible_to_department)
        : Boolean(existing.visible_to_department);

    if (!nextTitle) {
      return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });
    }

    if (nextOwnerUserId) {
      await ensureUserBelongsToOrg(admin, scope.org.id, nextOwnerUserId);
      if (existing.department_id) {
        await ensureUserBelongsToDepartment(admin, scope.org.id, nextOwnerUserId, existing.department_id);
      }
    }

    const updatePayload = {
      title: nextTitle,
      description: nextDescription,
      owner_user_id: nextOwnerUserId,
      status: nextStatus,
      priority: nextPriority,
      due_date: nextDueDate,
      visible_to_department: nextVisible,
      assigned_by_user_id:
        nextOwnerUserId && nextOwnerUserId !== existing.owner_user_id
          ? scope.user.id
          : existing.assigned_by_user_id,
      completed_at:
        nextStatus === "done"
          ? existing.completed_at ?? new Date().toISOString()
          : null,
    };

    const { error: updateErr } = await admin
      .from("jobs_to_be_done")
      .update(updatePayload)
      .eq("org_id", scope.org.id)
      .eq("id", id);

    if (updateErr) throw new Error(updateErr.message);

    await writeActivity(admin, {
      org_id: scope.org.id,
      jtb_id: id,
      user_id: scope.user.id,
      action: "updated",
      payload: updatePayload,
    });

    return NextResponse.json({ ok: true, id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to update JTBD item";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}