// app/api/o/[slug]/onboarding/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type OnboardingBody = {
  companyName: string;
  orgSlug: string;
  year: number;
  quarter: number;
  departments: Array<{ name: string }>;
  kpis: Array<{
    title: string;
    departmentName: string;
    unit?: string; // UI-only
    target: number;
    current: number;
    weight?: number;
    direction?: string;
    is_active?: boolean;
    notes?: string;
  }>;
};

type SbErrorLike = { message?: string; code?: string; details?: string | null; hint?: string | null };

type OnboardingResponse = {
  ok: boolean;
  org?: { id: string; slug: string; name: string };
  cycle?: { id: string; year: number; quarter: number; status: string } | null;
  created?: { departments: number; kpis: number; history: number };
  error?: string;
  detail?: unknown;
  debug?: {
    pathname?: string | null;
    paramSlug?: string | null;
    derivedSlug?: string | null;
  };
};

function json(data: OnboardingResponse, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
function err(status: number, message: string, detail?: unknown, debug?: OnboardingResponse["debug"]) {
  return json({ ok: false, error: message, detail, debug }, status);
}
function bearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] ?? null;
}
function clean(v: unknown): string {
  return String(v ?? "").trim();
}
function norm(v: unknown): string {
  return clean(v).toLowerCase();
}

/**
 * Expected path: /api/o/:slug/onboarding
 */
function slugFromUrl(req: NextRequest): string | null {
  try {
    const parts = req.nextUrl.pathname.split("/").filter(Boolean);
    const oIdx = parts.indexOf("o");
    if (oIdx === -1) return null;

    const maybeSlug = parts[oIdx + 1] ?? "";
    const maybeTail = parts[oIdx + 2] ?? "";
    if (!maybeSlug) return null;
    if (maybeTail !== "onboarding") return null;

    return decodeURIComponent(maybeSlug).trim();
  } catch {
    return null;
  }
}

function env() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!supabaseUrl || !anonKey) {
    return { ok: false as const, status: 500, error: "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY" };
  }
  if (!serviceRoleKey) {
    return { ok: false as const, status: 500, error: "Missing SUPABASE_SERVICE_ROLE_KEY" };
  }
  return { ok: true as const, supabaseUrl, anonKey, serviceRoleKey };
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}
function toIsoDateUTC(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function quarterDates(year: number, quarter: number): { starts_on: string; ends_on: string } {
  const startMonth0 = (quarter - 1) * 3;
  const starts = new Date(Date.UTC(year, startMonth0, 1));
  const firstOfNext = new Date(Date.UTC(year, startMonth0 + 3, 1));
  const ends = new Date(firstOfNext.getTime() - 24 * 60 * 60 * 1000);
  return { starts_on: toIsoDateUTC(starts), ends_on: toIsoDateUTC(ends) };
}

type CleanKpi = {
  title: string;
  departmentName: string; // original for error messages
  departmentNameNorm: string;
  target_value: number;
  current_value: number;
  weight: number;
  is_active: boolean;
  notes: string;
};

function sbErr(e: unknown): SbErrorLike {
  const x = e as SbErrorLike | null;
  return { message: x?.message, code: x?.code, details: x?.details ?? null, hint: x?.hint ?? null };
}

async function getSlug(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const p = await context.params;
  const paramSlug = clean(p?.slug);
  const derivedSlug = slugFromUrl(req) ?? "";
  const slug = (paramSlug || derivedSlug).trim();
  return { slug, paramSlug, derivedSlug };
}

export async function GET(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug, paramSlug, derivedSlug } = await getSlug(req, context);

  if (!slug) {
    return err(
      400,
      "slug is required",
      "Call this as /api/o/:slug/onboarding",
      { paramSlug: paramSlug || null, derivedSlug: derivedSlug || null, pathname: req.nextUrl.pathname }
    );
  }

  return json({ ok: true, detail: { route: "onboarding", slug } }, 200);
}

export async function POST(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug, paramSlug, derivedSlug } = await getSlug(req, context);

  if (!slug) {
    return err(
      400,
      "slug is required",
      "This route must be called as /api/o/:slug/onboarding",
      { paramSlug: paramSlug || null, derivedSlug: derivedSlug || null, pathname: req.nextUrl.pathname }
    );
  }

  const e = env();
  if (!e.ok) return err(e.status, e.error);

  const token = bearer(req);
  if (!token) return err(401, "Missing Authorization: Bearer <token>");

  // Validate token -> userId (anon client)
  const authed = createClient(e.supabaseUrl, e.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await authed.auth.getUser();
  if (userErr || !userData.user) return err(401, "Invalid/expired access token", userErr?.message ?? null);

  const userId = userData.user.id;
  if (!userId) return err(401, "No userId extracted from token");

  let body: OnboardingBody;
  try {
    body = (await req.json()) as OnboardingBody;
  } catch {
    return err(400, "Invalid JSON body");
  }

  if (clean(body.orgSlug) !== slug) return err(400, "Body orgSlug must match URL slug");
  if (!clean(body.companyName)) return err(400, "companyName is required");

  const year = Number(body.year);
  const quarter = Number(body.quarter);
  if (!Number.isFinite(year) || year < 2000) return err(400, "year is invalid");
  if (![1, 2, 3, 4].includes(quarter)) return err(400, "quarter must be 1-4");

  // Normalize departments, compare case-insensitive
  const deptOriginal = (body.departments || []).map((d) => clean(d.name)).filter(Boolean);
  if (!deptOriginal.length) return err(400, "At least 1 department is required");

  const deptNormToOriginal = new Map<string, string>();
  for (const d of deptOriginal) {
    const dn = norm(d);
    if (!dn) continue;
    if (!deptNormToOriginal.has(dn)) deptNormToOriginal.set(dn, d);
  }
  const deptSetNorm = new Set<string>(Array.from(deptNormToOriginal.keys()));
  if (!deptSetNorm.size) return err(400, "At least 1 department is required");

  const kpis: CleanKpi[] = (body.kpis || [])
    .map((k) => {
      const title = clean(k.title);
      const departmentName = clean(k.departmentName);
      return {
        title,
        departmentName,
        departmentNameNorm: norm(departmentName),
        target_value: Number(k.target),
        current_value: Number(k.current),
        weight: k.weight == null ? 1 : Number(k.weight),
        is_active: k.is_active == null ? true : Boolean(k.is_active),
        notes: clean(k.notes),
      };
    })
    .filter((k) => k.title && k.departmentNameNorm);

  if (!kpis.length) return err(400, "At least 1 KPI is required");

  for (const k of kpis) {
    if (!deptSetNorm.has(k.departmentNameNorm)) {
      return err(400, `KPI "${k.title}" department "${k.departmentName}" is not in departments list`);
    }
    if (!Number.isFinite(k.target_value)) return err(400, `KPI "${k.title}" target is invalid`);
    if (!Number.isFinite(k.current_value)) return err(400, `KPI "${k.title}" current is invalid`);
    if (!Number.isFinite(k.weight) || k.weight <= 0) return err(400, `KPI "${k.title}" weight must be > 0`);
  }

  // Admin client (service role bypasses RLS)
  const admin = createClient(e.supabaseUrl, e.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Create org if missing; otherwise update name ONLY
  const { data: existingOrg, error: existingOrgErr } = await admin
    .from("organizations")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle<{ id: string; slug: string; name: string }>();

  if (existingOrgErr) return err(500, "Failed to read organization", sbErr(existingOrgErr));

  let org: { id: string; slug: string; name: string } | null = null;

  if (!existingOrg) {
    const ins = await admin
      .from("organizations")
      .insert({ slug, name: clean(body.companyName), created_by: userId })
      .select("id, slug, name")
      .single();

    if (ins.error) return err(500, "Failed to create organization", sbErr(ins.error));
    org = ins.data;
  } else {
    const upd = await admin
      .from("organizations")
      .update({ name: clean(body.companyName) })
      .eq("id", existingOrg.id)
      .select("id, slug, name")
      .single();

    if (upd.error) return err(500, "Failed to update organization", sbErr(upd.error));
    org = upd.data;
  }

  if (!org) return err(500, "Organization upsert returned null");

  // 2) Membership
  await admin.from("organization_members").upsert(
    { org_id: org.id, user_id: userId, role: "owner" },
    { onConflict: "org_id,user_id" }
  );

  // 3) Active cycle
  const { starts_on, ends_on } = quarterDates(year, quarter);
  await admin.from("quarterly_cycles").update({ status: "inactive" }).eq("org_id", org.id);

  const cycleUpsert = await admin
    .from("quarterly_cycles")
    .upsert(
      { org_id: org.id, year, quarter, starts_on, ends_on, status: "active", created_by: userId },
      { onConflict: "org_id,year,quarter" }
    )
    .select("id, year, quarter, status")
    .single();

  if (cycleUpsert.error) return err(500, "Failed to upsert quarterly cycle", sbErr(cycleUpsert.error));
  const cycle = cycleUpsert.data;

  // 4) Upsert departments (canonical/original names)
  const deptRows = Array.from(deptNormToOriginal.values()).map((name) => ({ org_id: org.id, name, created_by: userId }));
  const deptUpsert = await admin.from("departments").upsert(deptRows, { onConflict: "org_id,name" }).select("id, name");
  if (deptUpsert.error) return err(500, "Failed to upsert departments", sbErr(deptUpsert.error));

  const deptIdByNameNorm = new Map<string, string>();
  for (const d of deptUpsert.data || []) deptIdByNameNorm.set(norm(d.name), d.id);

  // 5) Upsert KPIs
  const kpiRows = kpis.map((k) => ({
    org_id: org.id,
    cycle_id: cycle.id,
    title: k.title,
    department_id: deptIdByNameNorm.get(k.departmentNameNorm) ?? null,
    target_value: k.target_value,
    current_value: k.current_value,
    weight: k.weight,
    is_active: k.is_active,
    created_by: userId,
  }));

  if (kpiRows.some((r) => !r.department_id)) return err(400, "Some KPIs reference a department that could not be resolved");

  const kpiUpsert = await admin
    .from("kpis")
    .upsert(kpiRows, { onConflict: "org_id,cycle_id,title" })
    .select("id, title, current_value, target_value");

  if (kpiUpsert.error) return err(500, "Failed to upsert kpis", sbErr(kpiUpsert.error));

  const kpiByTitle = new Map<string, { id: string; current_value: number; target_value: number }>();
  for (const row of kpiUpsert.data || []) {
    kpiByTitle.set(row.title, {
      id: row.id,
      current_value: Number(row.current_value),
      target_value: Number(row.target_value),
    });
  }

  // 6) Insert KPI values history
  const nowIso = new Date().toISOString();
  const historyRows = kpis.map((k) => {
    const saved = kpiByTitle.get(k.title);
    return {
      org_id: org.id,
      kpi_id: saved?.id ?? null,
      cycle_id: cycle.id,
      recorded_at: nowIso,
      current_value: saved ? saved.current_value : k.current_value,
      target_value: saved ? saved.target_value : k.target_value,
      source: "manual",
      notes: k.notes || null,
      recorded_by: userId,
    };
  });

  if (historyRows.some((r) => !r.kpi_id)) return err(500, "Some KPI ids were not found after KPI upsert");

  const historyInsert = await admin.from("kpi_values_history").insert(historyRows);
  if (historyInsert.error) return err(500, "Failed to insert KPI values history", sbErr(historyInsert.error));

  return json({
    ok: true,
    org,
    cycle,
    created: { departments: deptRows.length, kpis: kpiRows.length, history: historyRows.length },
  });
}