import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type CreateOrganizationBody = {
  name: string;
  slug?: string;
  ownerEmail?: string;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
};

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function supabaseAdmin() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function requireAuthenticatedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    throw new Error("Missing Authorization Bearer token");
  }

  const client = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    throw new Error("Unauthorized");
  }

  return data.user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json()) as CreateOrganizationBody;

    const name = String(body.name ?? "").trim();
    const slug = normalizeSlug(String(body.slug ?? name));
    const ownerEmail = String(body.ownerEmail ?? "").trim().toLowerCase();

    if (!name) {
      return NextResponse.json({ ok: false, error: "Organization name is required" }, { status: 400 });
    }

    if (!slug) {
      return NextResponse.json({ ok: false, error: "Valid organization slug is required" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    const { data: existingOrg, error: existingOrgError } = await admin
      .from("organizations")
      .select("id,slug")
      .eq("slug", slug)
      .maybeSingle<{ id: string; slug: string }>();

    if (existingOrgError) {
      throw new Error(existingOrgError.message);
    }

    if (existingOrg) {
      return NextResponse.json({ ok: false, error: "Organization slug already exists" }, { status: 409 });
    }

    const { data: createdOrg, error: createOrgError } = await admin
      .from("organizations")
      .insert({
        name,
        slug,
      })
      .select("id,name,slug")
      .single<OrganizationRow>();

    if (createOrgError || !createdOrg) {
      throw new Error(createOrgError?.message || "Failed to create organization");
    }

    let ownerUserId = user.id;

    if (ownerEmail) {
      const { data: userLookup, error: userLookupError } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (userLookupError) {
        throw new Error(userLookupError.message);
      }

      const matchedUser = userLookup.users.find(
        (item) => String(item.email ?? "").trim().toLowerCase() === ownerEmail
      );

      if (!matchedUser) {
        return NextResponse.json(
          {
            ok: false,
            error: "Owner email was not found in auth users",
          },
          { status: 404 }
        );
      }

      ownerUserId = matchedUser.id;
    }

    const { error: memberInsertError } = await admin
      .from("organization_members")
      .insert({
        org_id: createdOrg.id,
        user_id: ownerUserId,
        role: "owner",
      });

    if (memberInsertError) {
      throw new Error(memberInsertError.message);
    }

    const { error: subscriptionInsertError } = await admin
      .from("organization_subscriptions")
      .insert({
        org_id: createdOrg.id,
        plan_code: "core",
        status: "active",
        seats: 25,
        starts_at: new Date().toISOString(),
      });

    if (subscriptionInsertError) {
      throw new Error(subscriptionInsertError.message);
    }

    return NextResponse.json({
      ok: true,
      organization: createdOrg,
      ownerUserId,
      message: "Organization created successfully",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create organization";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}