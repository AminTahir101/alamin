import { NextRequest, NextResponse } from "next/server";
import { requireAccessScope, supabaseAdmin } from "@/lib/server/accessScope";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };

type JobRow = {
  id: string;
  org_id: string;
  department_id?: string | null;
  owner_user_id?: string | null;
  visible_to_department?: boolean;
};

function canSeeJob(
  scope: Awaited<ReturnType<typeof requireAccessScope>>,
  job: JobRow
) {
  if (scope.mode === "org") return true;
  if (scope.mode === "department") return job.department_id === scope.departmentId;
  return (
    job.owner_user_id === scope.userId ||
    (job.visible_to_department === true && job.department_id === scope.departmentId)
  );
}

export async function GET(req: NextRequest, ctx: Ctx<{ slug: string; id: string }>) {
  try {
    const { slug, id } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();

    const { data: job, error: jobErr } = await admin
      .from("jobs_to_be_done")
      .select("id,org_id,department_id,owner_user_id,visible_to_department")
      .eq("org_id", scope.org.id)
      .eq("id", id)
      .maybeSingle<JobRow>();

    if (jobErr) throw new Error(jobErr.message);
    if (!job) {
      return NextResponse.json({ ok: false, error: "JTBD item not found" }, { status: 404 });
    }

    if (!canSeeJob(scope, job)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await admin
      .from("jtb_comments")
      .select("*")
      .eq("org_id", scope.org.id)
      .eq("jtb_id", id)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, comments: data ?? [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load comments";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx<{ slug: string; id: string }>) {
  try {
    const { slug, id } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();
    const body = (await req.json()) as { comment?: string };
    const comment = String(body.comment ?? "").trim();

    if (!comment) {
      return NextResponse.json({ ok: false, error: "comment is required" }, { status: 400 });
    }

    const { data: job, error: jobErr } = await admin
      .from("jobs_to_be_done")
      .select("id,org_id,department_id,owner_user_id,visible_to_department")
      .eq("org_id", scope.org.id)
      .eq("id", id)
      .maybeSingle<JobRow>();

    if (jobErr) throw new Error(jobErr.message);
    if (!job) {
      return NextResponse.json({ ok: false, error: "JTBD item not found" }, { status: 404 });
    }

    if (!canSeeJob(scope, job)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { error } = await admin.from("jtb_comments").insert({
      org_id: scope.org.id,
      jtb_id: id,
      user_id: scope.user.id,
      comment,
    });

    if (error) throw new Error(error.message);

    await admin.from("jtb_activity_log").insert({
      org_id: scope.org.id,
      jtb_id: id,
      user_id: scope.user.id,
      action: "comment_added",
      payload: { comment },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to add comment";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}