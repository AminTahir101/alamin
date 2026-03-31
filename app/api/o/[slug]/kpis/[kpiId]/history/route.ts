// app/api/o/[slug]/kpis/[kpiId]/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Ctx<P extends Record<string, string>> = { params: Promise<P> };

type OrgRow = { id: string; slug: string; name: string };
type CycleRow = { id: string; year: number; quarter: number; status: string };

type HistoryRow = {
  id: string;
  created_at: string;
  value: number | null;
  target_value: number | null;
  weight: number | null;
  notes: string | null;
};

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

export async function GET(req: NextRequest, ctx: Ctx<{ slug: string; kpiId: string }>) {
  try {
    const { slug, kpiId } = await ctx.params;
    const user = await requireUser(req);
    const admin = supabaseAdmin();
    const org = await requireOrgMember(admin, user.id, slug);

    const cycle = await getActiveCycle(admin, org.id);
    if (!cycle) return NextResponse.json({ ok: true, cycle: null, history: [] });

    const { data, error } = await admin
      .from("kpi_values_history")
      .select("id,created_at,value,target_value,weight,notes")
      .eq("org_id", org.id)
      .eq("cycle_id", cycle.id)
      .eq("kpi_id", kpiId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, cycle, history: (data ?? []) as HistoryRow[] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load KPI history";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}