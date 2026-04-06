import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type DepartmentHeadInput = {
  departmentName: string;
  headName: string;
  headEmail: string;
};

type OnboardingBody = {
  companyName: string;
  orgSlug: string;
  year: number;
  quarter: number;
  departments: Array<{ name: string }>;
  kpis: Array<{
    title: string;
    departmentName: string;
    unit: string;
    target: number;
    current: number;
  }>;
  personal?: {
    firstName: string;
    lastName: string;
    email: string;
  };
  company?: {
    registrationNumber?: string;
    industry?: string;
    country?: string;
    employeeCount?: number | null;
  };
  aiSetup?: {
    mainStrategy?: string;
    departmentHeads?: DepartmentHeadInput[];
  };
};

type OrgRow = {
  id: string;
  slug: string;
  name: string;
  settings?: Record<string, unknown> | null;
};

type CycleRow = {
  id: string;
  year: number;
  quarter: number;
  status: string;
};

type DepartmentRow = {
  id: string;
  name: string;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-+/g, "-");
}

function quarterDates(year: number, quarter: number) {
  const q = Math.max(1, Math.min(4, quarter));
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0));

  const toDate = (d: Date) => d.toISOString().slice(0, 10);

  return {
    starts_on: toDate(start),
    ends_on: toDate(end),
    name: `Q${q} ${year}`,
  };
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function mergeJson(
  base: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>
) {
  return {
    ...(base ?? {}),
    ...patch,
  };
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await context.params;
    const routeSlug = normalizeSlug(rawSlug);

    if (!routeSlug) {
      return json({ ok: false, error: "slug is required" }, 400);
    }

    const body = (await req.json()) as OnboardingBody;

    const companyName = cleanText(body.companyName);
    const bodySlug = normalizeSlug(body.orgSlug);
    const orgSlug = bodySlug || routeSlug;
    const year = toFiniteNumber(body.year, 0);
    const quarter = toFiniteNumber(body.quarter, 0);

    if (!companyName) {
      return json({ ok: false, error: "companyName is required" }, 400);
    }

    if (!orgSlug) {
      return json({ ok: false, error: "orgSlug is required" }, 400);
    }

    if (orgSlug !== routeSlug) {
      return json({ ok: false, error: "Route slug and body orgSlug do not match" }, 400);
    }

    if (year < 2000 || year > 2100) {
      return json({ ok: false, error: "year is invalid" }, 400);
    }

    if (![1, 2, 3, 4].includes(quarter)) {
      return json({ ok: false, error: "quarter must be 1 to 4" }, 400);
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

    if (!token) {
      return json({ ok: false, error: "Missing bearer token" }, 401);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json(
        {
          ok: false,
          error:
            "Missing Supabase env. Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY",
        },
        500
      );
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const createdBy = user.id;

    const personal = {
      firstName: cleanText(body.personal?.firstName),
      lastName: cleanText(body.personal?.lastName),
      email: cleanEmail(body.personal?.email) || cleanEmail(user.email),
    };

    const company = {
      registrationNumber: cleanText(body.company?.registrationNumber),
      industry: cleanText(body.company?.industry),
      country: cleanText(body.company?.country) || "Saudi Arabia",
      employeeCount:
        body.company?.employeeCount === null || body.company?.employeeCount === undefined
          ? null
          : toFiniteNumber(body.company.employeeCount, 0),
    };

    const aiSetup = {
      mainStrategy: cleanText(body.aiSetup?.mainStrategy),
      departmentHeads: Array.isArray(body.aiSetup?.departmentHeads)
        ? body.aiSetup!.departmentHeads.map((item) => ({
            departmentName: cleanText(item.departmentName),
            headName: cleanText(item.headName),
            headEmail: cleanEmail(item.headEmail),
          }))
        : [],
    };

    const departmentNames = dedupeStrings(
      Array.isArray(body.departments) ? body.departments.map((d) => cleanText(d.name)) : []
    );

    if (!departmentNames.length) {
      return json({ ok: false, error: "At least one department is required" }, 400);
    }

    const kpis = Array.isArray(body.kpis) ? body.kpis : [];

    for (const kpi of kpis) {
      const title = cleanText(kpi.title);
      const departmentName = cleanText(kpi.departmentName);
      const unit = cleanText(kpi.unit);

      if (!title) {
        return json({ ok: false, error: "Each KPI must have a title" }, 400);
      }
      if (!departmentName) {
        return json({ ok: false, error: `KPI "${title}" is missing departmentName` }, 400);
      }
      if (!departmentNames.includes(departmentName)) {
        return json(
          {
            ok: false,
            error: `KPI "${title}" references department "${departmentName}" which does not exist in departments`,
          },
          400
        );
      }
      if (!unit) {
        return json({ ok: false, error: `KPI "${title}" is missing unit` }, 400);
      }
      if (!Number.isFinite(Number(kpi.target)) || !Number.isFinite(Number(kpi.current))) {
        return json({ ok: false, error: `KPI "${title}" has invalid target/current values` }, 400);
      }
    }

    const { starts_on, ends_on, name: cycleName } = quarterDates(year, quarter);

    // 1) Organization: create or update
    const { data: existingOrg, error: existingOrgError } = await supabaseAdmin
      .from("organizations")
      .select("id, slug, name, settings")
      .eq("slug", orgSlug)
      .maybeSingle<OrgRow>();

    if (existingOrgError) {
      return json(
        {
          ok: false,
          error: "Failed to load organization",
          detail: existingOrgError.message,
        },
        500
      );
    }

    let orgId = existingOrg?.id ?? "";
    const onboardingSettings = {
      onboarding: {
        completed: true,
        completed_at: new Date().toISOString(),
        personal,
        company,
        aiSetup: {
          mainStrategy: aiSetup.mainStrategy,
          departmentHeads: aiSetup.departmentHeads,
        },
      },
    };

    if (!existingOrg) {
      const { data: insertedOrg, error: insertOrgError } = await supabaseAdmin
        .from("organizations")
        .insert({
          name: companyName,
          slug: orgSlug,
          created_by: createdBy,
          cr_number: company.registrationNumber || null,
          industry: company.industry || null,
          employee_count: company.employeeCount,
          country: company.country || "Saudi Arabia",
          description: aiSetup.mainStrategy || null,
          settings: onboardingSettings,
        })
        .select("id, slug, name, settings")
        .single<OrgRow>();

      if (insertOrgError || !insertedOrg) {
        return json(
          {
            ok: false,
            error: "Failed to create organization",
            detail: insertOrgError?.message,
          },
          500
        );
      }

      orgId = insertedOrg.id;
    } else {
      orgId = existingOrg.id;

      const { error: updateOrgError } = await supabaseAdmin
        .from("organizations")
        .update({
          name: companyName,
          cr_number: company.registrationNumber || null,
          industry: company.industry || null,
          employee_count: company.employeeCount,
          country: company.country || "Saudi Arabia",
          description: aiSetup.mainStrategy || null,
          settings: mergeJson(existingOrg.settings ?? {}, onboardingSettings),
          updated_at: new Date().toISOString(),
        })
        .eq("id", orgId);

      if (updateOrgError) {
        return json(
          {
            ok: false,
            error: "Failed to update organization",
            detail: updateOrgError.message,
          },
          500
        );
      }
    }

    // 2) Ensure owner membership
    const { data: existingMembership, error: membershipLookupError } = await supabaseAdmin
      .from("organization_members")
      .select("org_id, user_id, role")
      .eq("org_id", orgId)
      .eq("user_id", createdBy)
      .maybeSingle();

    if (membershipLookupError) {
      return json(
        {
          ok: false,
          error: "Failed to load organization membership",
          detail: membershipLookupError.message,
        },
        500
      );
    }

    if (!existingMembership) {
      const { error: insertMembershipError } = await supabaseAdmin
        .from("organization_members")
        .insert({
          org_id: orgId,
          user_id: createdBy,
          role: "owner",
          title: personal.firstName || personal.lastName
            ? `${personal.firstName} ${personal.lastName}`.trim()
            : "Owner",
          joined_at: new Date().toISOString(),
          is_active: true,
        });

      if (insertMembershipError) {
        return json(
          {
            ok: false,
            error: "Failed to create organization membership",
            detail: insertMembershipError.message,
          },
          500
        );
      }
    }

    // 3) Cycle: create or update
    const { data: existingCycle, error: cycleLookupError } = await supabaseAdmin
      .from("quarterly_cycles")
      .select("id, year, quarter, status")
      .eq("org_id", orgId)
      .eq("year", year)
      .eq("quarter", quarter)
      .maybeSingle<CycleRow>();

    if (cycleLookupError) {
      return json(
        {
          ok: false,
          error: "Failed to load cycle",
          detail: cycleLookupError.message,
        },
        500
      );
    }

    let cycleId = existingCycle?.id ?? "";

    if (!existingCycle) {
      const { data: insertedCycle, error: insertCycleError } = await supabaseAdmin
        .from("quarterly_cycles")
        .insert({
          org_id: orgId,
          year,
          quarter,
          starts_on,
          ends_on,
          status: "active",
          name: cycleName,
          created_by: createdBy,
        })
        .select("id, year, quarter, status")
        .single<CycleRow>();

      if (insertCycleError || !insertedCycle) {
        return json(
          {
            ok: false,
            error: "Failed to create cycle",
            detail: insertCycleError?.message,
          },
          500
        );
      }

      cycleId = insertedCycle.id;
    } else {
      cycleId = existingCycle.id;

      const { error: updateCycleError } = await supabaseAdmin
        .from("quarterly_cycles")
        .update({
          starts_on,
          ends_on,
          status: "active",
          name: cycleName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cycleId);

      if (updateCycleError) {
        return json(
          {
            ok: false,
            error: "Failed to update cycle",
            detail: updateCycleError.message,
          },
          500
        );
      }
    }

    // 4) Departments: insert missing ones
    const { data: existingDepartments, error: departmentsLookupError } = await supabaseAdmin
      .from("departments")
      .select("id, name")
      .eq("org_id", orgId)
      .returns<DepartmentRow[]>();

    if (departmentsLookupError) {
      return json(
        {
          ok: false,
          error: "Failed to load departments",
          detail: departmentsLookupError.message,
        },
        500
      );
    }

    const existingDepartmentMap = new Map(
      (existingDepartments ?? []).map((d) => [d.name.toLowerCase(), d])
    );

    const missingDepartments = departmentNames.filter(
      (name) => !existingDepartmentMap.has(name.toLowerCase())
    );

    if (missingDepartments.length > 0) {
      const { error: insertDepartmentsError } = await supabaseAdmin.from("departments").insert(
        missingDepartments.map((name) => ({
          org_id: orgId,
          name,
          created_by: createdBy,
          description: null,
        }))
      );

      if (insertDepartmentsError) {
        return json(
          {
            ok: false,
            error: "Failed to create departments",
            detail: insertDepartmentsError.message,
          },
          500
        );
      }
    }

    const { data: allDepartments, error: allDepartmentsError } = await supabaseAdmin
      .from("departments")
      .select("id, name")
      .eq("org_id", orgId)
      .returns<DepartmentRow[]>();

    if (allDepartmentsError) {
      return json(
        {
          ok: false,
          error: "Failed to reload departments",
          detail: allDepartmentsError.message,
        },
        500
      );
    }

    const departmentMap = new Map(
      (allDepartments ?? []).map((d) => [d.name.toLowerCase(), d.id])
    );

    // 5) KPIs: insert if missing by same title + department + cycle
    if (kpis.length > 0) {
      const departmentIds = Array.from(new Set(kpis.map((k) => departmentMap.get(k.departmentName.toLowerCase())).filter(Boolean))) as string[];

      const { data: existingKpis, error: existingKpisError } = await supabaseAdmin
        .from("kpis")
        .select("id, title, department_id, cycle_id")
        .eq("org_id", orgId)
        .eq("cycle_id", cycleId)
        .in("department_id", departmentIds);

      if (existingKpisError) {
        return json(
          {
            ok: false,
            error: "Failed to load existing KPIs",
            detail: existingKpisError.message,
          },
          500
        );
      }

      const existingKpiKey = new Set(
        (existingKpis ?? []).map(
          (row: { title: string; department_id: string; cycle_id: string }) =>
            `${row.title.toLowerCase()}::${row.department_id}::${row.cycle_id}`
        )
      );

      const kpisToInsert = kpis
        .map((kpi) => {
          const departmentId = departmentMap.get(kpi.departmentName.toLowerCase());

          if (!departmentId) return null;

          const title = cleanText(kpi.title);
          const unit = cleanText(kpi.unit);
          const targetValue = Number(kpi.target);
          const currentValue = Number(kpi.current);
          const key = `${title.toLowerCase()}::${departmentId}::${cycleId}`;

          if (existingKpiKey.has(key)) {
            return null;
          }

          return {
            org_id: orgId,
            cycle_id: cycleId,
            department_id: departmentId,
            title,
            unit: unit || null,
            target_value: targetValue,
            current_value: currentValue,
            baseline_value: currentValue,
            measurement_type: "number",
            direction: "increase",
            frequency: "monthly",
            source: "manual",
            created_by: createdBy,
            description: null,
          };
        })
        .filter(Boolean);

      if (kpisToInsert.length > 0) {
        const { error: insertKpisError } = await supabaseAdmin
          .from("kpis")
          .insert(kpisToInsert);

        if (insertKpisError) {
          return json(
            {
              ok: false,
              error: "Failed to create KPIs",
              detail: insertKpisError.message,
            },
            500
          );
        }
      }

      // 6) KPI history snapshots
      const { data: insertedOrExistingKpis, error: refreshedKpisError } = await supabaseAdmin
        .from("kpis")
        .select("id, title, department_id, target_value, current_value")
        .eq("org_id", orgId)
        .eq("cycle_id", cycleId);

      if (refreshedKpisError) {
        return json(
          {
            ok: false,
            error: "Failed to reload KPIs",
            detail: refreshedKpisError.message,
          },
          500
        );
      }

      const refreshedKpiMap = new Map(
        (insertedOrExistingKpis ?? []).map(
          (row: { id: string; title: string; department_id: string }) =>
            [`${row.title.toLowerCase()}::${row.department_id}`, row.id]
        )
      );

      const historyRows = kpis
        .map((kpi) => {
          const departmentId = departmentMap.get(kpi.departmentName.toLowerCase());
          if (!departmentId) return null;

          const kpiId = refreshedKpiMap.get(`${cleanText(kpi.title).toLowerCase()}::${departmentId}`);
          if (!kpiId) return null;

          return {
            org_id: orgId,
            kpi_id: kpiId,
            cycle_id: cycleId,
            current_value: Number(kpi.current),
            target_value: Number(kpi.target),
            source: "manual",
            notes: "Seeded during onboarding",
            recorded_by: createdBy,
          };
        })
        .filter(Boolean);

      if (historyRows.length > 0) {
        const { error: historyInsertError } = await supabaseAdmin
          .from("kpi_values_history")
          .insert(historyRows);

        if (historyInsertError) {
          return json(
            {
              ok: false,
              error: "Failed to create KPI history",
              detail: historyInsertError.message,
            },
            500
          );
        }
      }
    }

    return json({
      ok: true,
      org: {
        id: orgId,
        slug: orgSlug,
        name: companyName,
      },
      cycle: {
        id: cycleId,
        year,
        quarter,
        name: cycleName,
      },
      departments: departmentNames,
      kpiCount: kpis.length,
      persisted: {
        personal,
        company,
        aiSetup: {
          mainStrategy: aiSetup.mainStrategy,
          departmentHeads: aiSetup.departmentHeads,
        },
      },
      note:
        "Company fields were stored directly on organizations. Main strategy and department head metadata were stored in organizations.settings.onboarding because the current schema does not have dedicated relational columns for head name/head email.",
    });
  } catch (err: unknown) {
    return json(
      {
        ok: false,
        error: "Failed to submit onboarding",
        detail: getErrorMessage(err, "Unknown error"),
      },
      500
    );
  }
}