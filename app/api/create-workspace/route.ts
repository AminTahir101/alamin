// app/api/create-workspace/route.ts
//
// POST — Create a fresh workspace for an authenticated user who has no
// memberships. Creates the organization, adds the user as owner, and
// returns the slug to route to onboarding.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeSlug } from "@/lib/server/adminAccess";

export const runtime = "nodejs";

type Body = {
  name?: string;
  slug?: string;
};

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function supabaseAdmin() {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
}

async function readBearerUser(authHeader: string | null) {
  if (!authHeader?.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const anon = createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false } },
  );

  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await readBearerUser(req.headers.get("authorization"));
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const rawName = String(body.name ?? "").trim();
    if (!rawName || rawName.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Workspace name is required (at least 2 characters)" },
        { status: 400 },
      );
    }

    const rawSlug = body.slug ? normalizeSlug(body.slug) : normalizeSlug(rawName);
    if (!rawSlug || rawSlug.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Unable to derive a valid slug from that name" },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();

    // Check slug availability — if taken, try to uniqueify
    let finalSlug = rawSlug;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = attempt === 0 ? rawSlug : `${rawSlug}-${attempt + 1}`;
      const { data: existing } = await admin
        .from("organizations")
        .select("id")
        .eq("slug", candidate)
        .maybeSingle();

      if (!existing) {
        finalSlug = candidate;
        break;
      }
    }

    // Insert the organization
    const { data: inserted, error: insertErr } = await admin
      .from("organizations")
      .insert({
        name: rawName,
        slug: finalSlug,
        created_by: user.id,
      })
      .select("id, slug, name")
      .single<{ id: string; slug: string; name: string }>();

    if (insertErr || !inserted) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to create organization",
          detail: insertErr?.message,
        },
        { status: 500 },
      );
    }

    // Add the user as owner
    const { error: memberErr } = await admin
      .from("organization_members")
      .insert({
        org_id: inserted.id,
        user_id: user.id,
        role: "owner",
        is_active: true,
        joined_at: new Date().toISOString(),
      });

    if (memberErr) {
      // Roll back the org if membership insert fails
      await admin.from("organizations").delete().eq("id", inserted.id);
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to assign ownership",
          detail: memberErr.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      organization: {
        id: inserted.id,
        slug: inserted.slug,
        name: inserted.name,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to create workspace",
      },
      { status: 500 },
    );
  }
}
