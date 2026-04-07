import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

function env(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

export function supabaseAdmin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

export async function requireAdminUserFromBearer(authHeader: string | null): Promise<User> {
  const auth = authHeader ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!token) {
    throw new Error("Missing Authorization Bearer token");
  }

  const client = createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );

  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    throw new Error("Unauthorized");
  }

  const allowedEmails = (process.env.ADMIN_ALLOWED_EMAILS ?? "admin@alamin-ai.com")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const email = String(data.user.email ?? "").trim().toLowerCase();

  if (!email || !allowedEmails.includes(email)) {
    throw new Error("Forbidden");
  }

  return data.user;
}

export function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}