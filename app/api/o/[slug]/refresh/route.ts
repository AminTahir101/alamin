// app/api/o/[slug]/refresh/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type ApiResponse = {
  ok: boolean;
  refreshed?: boolean;
  org?: { id: string; slug: string; name: string } | null;
  cycle?: { id: string; year: number; quarter: number; status: string } | null;
  error?: string;
  detail?: unknown;
};

function json(data: ApiResponse, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function bearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] ?? null;
}

function env() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!supabaseUrl || !anonKey) {
    return { ok: false as const, error: "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY" };
  }
  if (!serviceRoleKey) {
    return { ok: false as const, error: "Missing SUPABASE_SERVICE_ROLE_KEY" };
  }
  return { ok: true as const, supabaseUrl, anonKey, serviceRoleKey };
}

export async function POST(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const p = await context.params;
  const slug = clean(p?.slug);

  if (!slug) return json({ ok: false, error: "slug is required" }, 400);

  const e = env();
  if (!e.ok) return json({ ok: false, error: e.error }, 500);

  const token = bearer(req);
  if (!token) return json({ ok: false, error: "Missing Authorization: Bearer <token>" }, 401);

  const authed = createClient(e.supabaseUrl, e.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await authed.auth.getUser();
  if (userErr || !userData.user) {
    return json({ ok: false, error: "Invalid/expired access token", detail: userErr?.message ?? null }, 401);
  }

  const admin = createClient(e.supabaseUrl, e.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle<{ id: string; slug: string; name: string }>();

  if (orgErr) return json({ ok: false, error: "Failed to read organization", detail: orgErr.message }, 500);
  if (!org) return json({ ok: false, error: `Organization not found for slug: ${slug}` }, 404);

  const { data: cycle, error: cycleErr } = await admin
    .from("quarterly_cycles")
    .select("id, year, quarter, status")
    .eq("org_id", org.id)
    .eq("status", "active")
    .order("year", { ascending: false })
    .order("quarter", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; year: number; quarter: number; status: string }>();

  if (cycleErr) return json({ ok: false, error: "Failed to load active cycle", detail: cycleErr.message }, 500);

  return json({
    ok: true,
    refreshed: true,
    org,
    cycle: cycle ?? null,
  });
}