import { NextRequest, NextResponse } from "next/server";
import { canManageWorkRole, requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };

type UpdateBody = {
  title?: string;
  description?: string | null;
  department_id?: string | null;
  owner_user_id?: string | null;
  status?: string;
  progress?: number;
  parent_objective_id?: string | null;
  linked_kpi_ids?: string[];
};

const OBJECTIVE_STATUSES = new Set([
  "draft",
  "active",
  "on_track",
  "at_risk",
  "off_track",
  "completed",
  "cancelled",
]);

function normalizeStatus(value?: string | null) {
  const candidate = String(value ?? "draft").trim().toLowerCase();
  return OBJECTIVE_STATUSES.has(candidate) ? candidate : "draft";
}

function normalizeProgress(value?: number | null) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

async function replaceObjectiveKpis(admin: ReturnType<typeof supabaseAdmin>, orgId: string, objectiveId: string, userId: string, linkedKpiIds: string[]) {
  const uniqueIds = Array.from(new Set(linkedKpiIds.filter(Boolean)));
  const { error: deleteErr } = await admin.from("objective_kpis").delete().eq("org_id", orgId).eq("objective_id", objectiveId);
  if (deleteErr) throw new Error(deleteErr.message);

  if (!uniqueIds.length) return;

  const rows = uniqueIds.map((kpiId) => ({
    org_id: orgId,
    objective_id: objectiveId,
    kpi_id: kpiId,
    created_by: userId,
  }));

  const { error: insertErr } = await admin.from("objective_kpis").insert(rows);
  if (insertErr) throw new Error(insertErr.message);
}

export async function PATCH(req: NextRequest, ctx: Ctx<{ slug: string; id: string }>) {
  try {
    const { slug, id } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();

    if (!(canManageWorkRole(scope.role) || scope.role === "dept_head")) {
      return NextResponse.json({ ok: false, error: "You do not have permission to update objectives" }, { status: 403 });
    }

    const { data: existing, error: existingErr } = await admin
      .from("objectives")
      .select("id,department_id,owner_user_id")
      .eq("id", id)
      .eq("org_id", scope.org.id)
      .maybeSingle();

    if (existingErr) throw new Error(existingErr.message);
    if (!existing) return NextResponse.json({ ok: false, error: "Objective not found" }, { status: 404 });

    if (scope.mode === "department" && existing.department_id && existing.department_id !== scope.departmentId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as UpdateBody;
    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = String(body.title ?? "").trim();
    if (body.description !== undefined) patch.description = body.description ? String(body.description).trim() : null;
    if (body.department_id !== undefined) patch.department_id = body.department_id ? String(body.department_id).trim() : null;
    if (body.owner_user_id !== undefined) patch.owner_user_id = body.owner_user_id ? String(body.owner_user_id).trim() : null;
    if (body.status !== undefined) patch.status = normalizeStatus(body.status);
    if (body.progress !== undefined) patch.progress = normalizeProgress(body.progress);
    if (body.parent_objective_id !== undefined) patch.parent_objective_id = body.parent_objective_id ? String(body.parent_objective_id).trim() : null;
    patch.updated_at = new Date().toISOString();

    const { error: updateErr } = await admin.from("objectives").update(patch).eq("id", id).eq("org_id", scope.org.id);
    if (updateErr) throw new Error(updateErr.message);

    if (Array.isArray(body.linked_kpi_ids)) {
      await replaceObjectiveKpis(admin, scope.org.id, id, scope.userId, body.linked_kpi_ids);
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to update objective";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx<{ slug: string; id: string }>) {
  try {
    const { slug, id } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();

    if (!(canManageWorkRole(scope.role) || scope.role === "dept_head")) {
      return NextResponse.json({ ok: false, error: "You do not have permission to delete objectives" }, { status: 403 });
    }

    const { error } = await admin.from("objectives").delete().eq("id", id).eq("org_id", scope.org.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to delete objective";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
