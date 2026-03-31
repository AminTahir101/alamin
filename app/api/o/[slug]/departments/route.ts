// app/api/o/[slug]/departments/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  canManageOrgRole,
  requireAccessScope,
  supabaseAdmin,
} from "@/lib/server/accessScope";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };

type DepartmentRow = {
  id: string;
  name: string;
};

async function safeJson<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

function normalizeName(name: string) {
  return name.replace(/\s+/g, " ").trim();
}

async function countIfTableExists(
  admin: ReturnType<typeof supabaseAdmin>,
  table: string,
  column: string,
  value: string
) {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);

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

export async function GET(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();

    let query = admin
      .from("departments")
      .select("id,name")
      .eq("org_id", scope.org.id)
      .order("name", { ascending: true });

    if (scope.mode !== "org" && scope.departmentId) {
      query = query.eq("id", scope.departmentId);
    }

    if (scope.mode !== "org" && !scope.departmentId) {
      return NextResponse.json({
        ok: true,
        departments: [],
        canManage: false,
        visibility: scope.mode,
        role: scope.role,
      });
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      departments: (data ?? []) as DepartmentRow[],
      canManage: canManageOrgRole(scope.role),
      visibility: scope.mode,
      role: scope.role,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load departments";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();

    if (!canManageOrgRole(scope.role)) {
      return NextResponse.json(
        { ok: false, error: "Only org admins can create departments" },
        { status: 403 }
      );
    }

    const body = await safeJson<{ name?: string }>(req);
    const name = normalizeName(String(body.name ?? ""));

    if (!name) {
      return NextResponse.json({ ok: false, error: "Department name is required" }, { status: 400 });
    }

    const { data: existing, error: existingErr } = await admin
      .from("departments")
      .select("id,name")
      .eq("org_id", scope.org.id)
      .ilike("name", name)
      .maybeSingle<DepartmentRow>();

    if (existingErr) throw new Error(existingErr.message);
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "A department with this name already exists" },
        { status: 409 }
      );
    }

    const { data: created, error: createErr } = await admin
      .from("departments")
      .insert({
        org_id: scope.org.id,
        name,
        created_by: scope.user.id,
      })
      .select("id,name")
      .single<DepartmentRow>();

    if (createErr) throw new Error(createErr.message);

    return NextResponse.json({
      ok: true,
      department: created,
      message: "Department created successfully",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create department";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx<{ slug: string }>) {
  try {
    const { slug } = await ctx.params;
    const scope = await requireAccessScope(req, slug);
    const admin = supabaseAdmin();

    if (!canManageOrgRole(scope.role)) {
      return NextResponse.json(
        { ok: false, error: "Only org admins can delete departments" },
        { status: 403 }
      );
    }

    const body = await safeJson<{ departmentId?: string }>(req);
    const departmentId = String(body.departmentId ?? "").trim();

    if (!departmentId) {
      return NextResponse.json({ ok: false, error: "departmentId is required" }, { status: 400 });
    }

    const { data: department, error: deptErr } = await admin
      .from("departments")
      .select("id,name")
      .eq("id", departmentId)
      .eq("org_id", scope.org.id)
      .maybeSingle<DepartmentRow>();

    if (deptErr) throw new Error(deptErr.message);
    if (!department) {
      return NextResponse.json({ ok: false, error: "Department not found" }, { status: 404 });
    }

    const [kpiCount, objectiveCount, memberCount] = await Promise.all([
      countIfTableExists(admin, "kpis", "department_id", department.id),
      countIfTableExists(admin, "objectives", "department_id", department.id),
      countIfTableExists(admin, "organization_members", "department_id", department.id),
    ]);

    if (kpiCount > 0 || objectiveCount > 0 || memberCount > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot delete "${department.name}" because it is linked to ${kpiCount} KPI(s), ${objectiveCount} objective(s), and ${memberCount} member assignment(s). Remove or reassign them first.`,
        },
        { status: 409 }
      );
    }

    const { error: deleteErr } = await admin
      .from("departments")
      .delete()
      .eq("id", department.id)
      .eq("org_id", scope.org.id);

    if (deleteErr) throw new Error(deleteErr.message);

    return NextResponse.json({
      ok: true,
      deletedId: department.id,
      message: "Department deleted successfully",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to delete department";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}