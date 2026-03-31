import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type AnalyzeBody = { orgSlug?: string };

type BrainOutput = {
  summary: string;
  score: number;
  label: "On track" | "At risk" | "Off track";
  okrs: Array<{ title: string; owner: string; metric: string; target: string }>;
  risks: Array<{ level: "high" | "medium" | "low"; title: string; detail: string }>;
  actions: Array<{ title: string; owner: string; due: string }>;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function err(status: number, message: string, extra?: Record<string, unknown>) {
  return json({ ok: false, error: message, ...(extra ?? {}) }, status);
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] ?? null;
}

function getProjectRef(supabaseUrl: string): string | null {
  try {
    const host = new URL(supabaseUrl).hostname; // "<ref>.supabase.co"
    const ref = host.split(".")[0];
    return ref || null;
  } catch {
    return null;
  }
}

export async function GET() {
  return json({
    ok: true,
    route: "/api/brain/analyze",
    methods: ["POST"],
    hint: "POST JSON { orgSlug } + Authorization: Bearer <access_token>",
  });
}

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  const projectRef = getProjectRef(supabaseUrl);

  if (!supabaseUrl || !anonKey) {
    return err(500, "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY", { projectRef });
  }
  if (!serviceRoleKey) {
    return err(500, "Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local and restart dev server.", {
      projectRef,
    });
  }

  const token = bearer(req);
  if (!token) return err(401, "Missing Authorization: Bearer <token>", { projectRef });

  let body: AnalyzeBody;
  try {
    body = (await req.json()) as AnalyzeBody;
  } catch {
    return err(400, "Body must be valid JSON", { projectRef });
  }

  // Normalize slug (prevents case/whitespace mismatch)
  const orgSlug = (body.orgSlug ?? "").trim().toLowerCase();

  // Validate token -> get user id
  const authed = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await authed.auth.getUser();
  if (userErr || !userData.user) {
    return err(401, "Invalid/expired access token", {
      projectRef,
      detail: userErr?.message ?? null,
    });
  }
  const userId = userData.user.id;

  // Admin client (bypasses RLS)
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Find org (case-insensitive match)
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .select("id, slug, name")
    .ilike("slug", orgSlug)
    .maybeSingle();

  if (orgErr) return err(500, "Failed to load organization", { projectRef, detail: orgErr.message });

  if (!org) {
    // Definitive debug fingerprint: count + newest rows (service role bypasses RLS)
    const [{ count: orgCount, error: countErr }, { data: recent, error: recentErr }] = await Promise.all([
      admin.from("organizations").select("*", { count: "exact", head: true }),
      admin
        .from("organizations")
        .select("id, slug, name, created_at, created_by")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    return err(404, `Organization not found for slug: ${orgSlug}`, {
      projectRef,
      supabaseUrl,
      orgCount: countErr ? null : orgCount,
      recent: recentErr ? null : recent,
      note:
        "If orgCount is 0 here but you see rows in SQL editor, you are on a different DB branch/project than this API env.",
    });
  }

  // Membership check (your table has NO id column)
  const { data: member, error: memErr } = await admin
    .from("organization_members")
    .select("org_id")
    .eq("org_id", org.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (memErr) return err(500, "Failed to check membership", { projectRef, detail: memErr.message });
  if (!member) {
    return err(403, "You are not a member of this organization", {
      projectRef,
      orgId: org.id,
      orgSlug: org.slug,
      userId,
    });
  }

  const output: BrainOutput = {
    summary: `Placeholder brain output for ${org.name}.`,
    score: 77,
    label: "At risk",
    okrs: [],
    risks: [],
    actions: [],
  };

  const { data: run, error: runErr } = await admin
    .from("brain_runs")
    .insert({
      org_id: org.id,
      created_by: userId,
      output,
      score: output.score,
      label: output.label,
    })
    .select("id, org_id, created_at, score, output")
    .single();

  if (runErr) return err(500, "Failed to insert brain run", { projectRef, detail: runErr.message });

  return json({ ok: true, projectRef, run });
}