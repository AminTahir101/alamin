// app/api/o/[slug]/kpis/[kpiId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };

type OrgRow = { id: string; slug: string; name: string };
type CycleRow = { id: string; year: number; quarter: number; status: string };

type PatchBody = Partial<{
  title: string;
  department_id: string;
  current_value: number;
  target_value: number;
  weight: number;
  direction: "increase" | "decrease";
  is_active: boolean;
  notes: string;
}>;

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

async function requireOrgMember(admin: ReturnType<typeof supabaseAdmin>, userId: string, slug: string): Promise<OrgRow> {
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .select("id,slug,name")
    .eq("slug", slug)
    .maybeSingle<OrgRow>();

  if (orgErr) throw new Error(orgErr.message);
  if (!org) throw new Error(`Organization not found for slug: ${slug}`);

  const { data: mem, error: memErr } = await admin
    .from("organization_members")
    .select("org_id")
    .eq("org_id", org.id)
    .eq("user_id", userId)
    .maybeSingle<{ org_id: string }>();

  if (memErr) throw new Error(memErr.message);
  if (!mem) throw new Error("Forbidden: not a member of this organization");

  return org;
}

async function getActiveCycle(admin: ReturnType<typeof supabaseAdmin>, orgId: string): Promise<CycleRow | null> {
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

export async function PATCH(req: NextRequest, ctx: Ctx<{ slug: string; kpiId: string }>) {
  try {
    const { slug, kpiId } = await ctx.params;
    const user = await requireUser(req);
    const admin = supabaseAdmin();
    const org = await requireOrgMember(admin, user.id, slug);

    const cycle = await getActiveCycle(admin, org.id);
    if (!cycle) throw new Error("No active cycle.");

    const body = (await req.json()) as PatchBody;

    // Load KPI (ensure belongs to org + active cycle)
    const { data: existing, error: exErr } = await admin
      .from("kpis")
      .select("id,department_id,title,current_value,target_value,weight,is_active,direction,cycle_id")
      .eq("id", kpiId)
      .eq("org_id", org.id)
      .maybeSingle<{
        id: string;
        cycle_id: string;
        department_id: string;
        title: string;
        current_value: number;
        target_value: number;
        weight: number;
        is_active: boolean;
        direction: "increase" | "decrease";
      }>();

    if (exErr) throw new Error(exErr.message);
    if (!existing) throw new Error("KPI not found");

    // Only allow editing KPIs in the active cycle
    if (existing.cycle_id !== cycle.id) throw new Error("KPI is not in the active cycle");

    const update: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) update.title = body.title.trim();
    if (typeof body.department_id === "string" && body.department_id.trim()) update.department_id = body.department_id.trim();
    if (typeof body.direction === "string") update.direction = body.direction;
    if (typeof body.is_active === "boolean") update.is_active = body.is_active;

    if (typeof body.current_value !== "undefined") {
      const v = Number(body.current_value);
      if (!Number.isFinite(v)) throw new Error("current_value is invalid");
      update.current_value = v;
    }
    if (typeof body.target_value !== "undefined") {
      const v = Number(body.target_value);
      if (!Number.isFinite(v)) throw new Error("target_value is invalid");
      update.target_value = v;
    }
    if (typeof body.weight !== "undefined") {
      const v = Number(body.weight);
      if (!Number.isFinite(v) || v <= 0) throw new Error("weight is invalid");
      update.weight = v;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: true, updated: false });
    }

    update.updated_at = new Date().toISOString();

    const { error: upErr } = await admin
      .from("kpis")
      .update(update)
      .eq("id", existing.id)
      .eq("org_id", org.id);

    if (upErr) throw new Error(upErr.message);

    // Optional history write
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const newCurrent = typeof update.current_value === "number" ? (update.current_value as number) : existing.current_value;
    const newTarget = typeof update.target_value === "number" ? (update.target_value as number) : existing.target_value;
    const newWeight = typeof update.weight === "number" ? (update.weight as number) : existing.weight;

    if (notes) {
      await admin.from("kpi_values_history").insert({
        org_id: org.id,
        cycle_id: cycle.id,
        kpi_id: existing.id,
        value: newCurrent,
        target_value: newTarget,
        weight: newWeight,
        notes,
        created_by: user.id,
      });
    }

    return NextResponse.json({ ok: true, updated: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to update KPI";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx<{ slug: string; kpiId: string }>) {
  try {
    const { slug, kpiId } = await ctx.params;
    const user = await requireUser(req);
    const admin = supabaseAdmin();
    const org = await requireOrgMember(admin, user.id, slug);

    const cycle = await getActiveCycle(admin, org.id);
    if (!cycle) throw new Error("No active cycle.");

    // Soft delete: is_active = false (only)
    const { error } = await admin
      .from("kpis")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", kpiId)
      .eq("org_id", org.id)
      .eq("cycle_id", cycle.id);

    if (error) throw new Error(error.message);

    // Optional history
    await admin.from("kpi_values_history").insert({
      org_id: org.id,
      cycle_id: cycle.id,
      kpi_id: kpiId,
      value: null,
      notes: "soft delete (is_active=false)",
      created_by: user.id,
    });

    return NextResponse.json({ ok: true, deleted: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to delete KPI";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}