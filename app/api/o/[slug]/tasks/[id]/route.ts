import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };
type UpdateBody = {
  jtbd_cluster_id?: string | null;
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  assigned_to_user_id?: string | null;
  due_date?: string | null;
  visible_to_department?: boolean;
};
const TASK_STATUSES = new Set(["todo", "in_progress", "blocked", "done", "cancelled"]);
const TASK_PRIORITIES = new Set(["low", "medium", "high", "critical"]);
const normalizeTaskStatus = (v?: string | null) => { const c = String(v ?? "todo").trim().toLowerCase(); return TASK_STATUSES.has(c) ? c : "todo"; };
const normalizeTaskPriority = (v?: string | null) => { const c = String(v ?? "medium").trim().toLowerCase(); return TASK_PRIORITIES.has(c) ? c : "medium"; };

export async function PATCH(req: NextRequest, ctx: Ctx<{ slug: string; id: string }>) {
  try {
    const { slug, id } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();
    const { data: existing, error: existingErr } = await admin.from("tasks").select("id,org_id,department_id,assigned_to_user_id").eq("id", id).eq("org_id", scope.org.id).maybeSingle<{id:string; org_id:string; department_id?:string|null; assigned_to_user_id?:string|null}>();
    if (existingErr) throw new Error(existingErr.message);
    if (!existing) return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });
    if (scope.role === "employee" && existing.assigned_to_user_id !== scope.userId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    if (scope.mode === "department" && existing.department_id && existing.department_id !== scope.departmentId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    const body = (await req.json()) as UpdateBody;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.jtbd_cluster_id !== undefined && scope.role !== "employee") patch.jtbd_cluster_id = body.jtbd_cluster_id ? String(body.jtbd_cluster_id).trim() : null;
    if (body.title !== undefined) patch.title = String(body.title ?? "").trim();
    if (body.description !== undefined) patch.description = body.description ? String(body.description).trim() : null;
    if (body.status !== undefined) patch.status = normalizeTaskStatus(body.status);
    if (body.priority !== undefined && scope.role !== "employee") patch.priority = normalizeTaskPriority(body.priority);
    if (body.assigned_to_user_id !== undefined && scope.role !== "employee") patch.assigned_to_user_id = body.assigned_to_user_id ? String(body.assigned_to_user_id).trim() : null;
    if (body.due_date !== undefined && scope.role !== "employee") patch.due_date = body.due_date ? String(body.due_date).trim() : null;
    if (body.visible_to_department !== undefined && scope.role !== "employee") patch.visible_to_department = Boolean(body.visible_to_department);
    if (patch.status === "done") patch.completed_at = new Date().toISOString();
    if (patch.status === "in_progress") patch.started_at = new Date().toISOString();
    const { error } = await admin.from("tasks").update(patch).eq("id", id).eq("org_id", scope.org.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to update task";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx<{ slug: string; id: string }>) {
  try {
    const { slug, id } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    if (scope.role === "employee") return NextResponse.json({ ok: false, error: "You do not have permission to delete tasks" }, { status: 403 });
    const admin = supabaseAdmin();
    const { error } = await admin.from("tasks").delete().eq("id", id).eq("org_id", scope.org.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to delete task";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
