// app/api/auth/orgs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";

export const runtime = "nodejs";

type OrgRow = {
  id: string;
  slug: string;
  name: string;
};

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function supabaseAdmin() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireUser(req: NextRequest): Promise<User> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Missing Authorization Bearer token");

  const sb = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const admin = supabaseAdmin();

    const { data: memberships, error: memErr } = await admin
      .from("organization_members")
      .select("org_id")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (memErr) throw new Error(memErr.message);

    const orgIds = (memberships ?? [])
      .map((m) => String((m as { org_id?: string }).org_id ?? "").trim())
      .filter(Boolean);

    if (!orgIds.length) {
      return NextResponse.json({
        ok: true,
        orgs: [],
      });
    }

    const { data: orgs, error: orgErr } = await admin
      .from("organizations")
      .select("id,slug,name")
      .in("id", orgIds)
      .order("name", { ascending: true });

    if (orgErr) throw new Error(orgErr.message);

    const cleanedOrgs = (orgs ?? []) as OrgRow[];

    return NextResponse.json({
      ok: true,
      orgs: cleanedOrgs,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load organizations";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}