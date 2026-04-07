import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type DemoRequestBody = {
  fullName?: string;
  companyName?: string;
  workEmail?: string;
  employeeCount?: number | string | null;
  phone?: string;
  message?: string;
};

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function supabaseAdmin() {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

function isOrganizationEmail(email: string) {
  const value = email.trim().toLowerCase();
  if (!value.includes("@")) return false;

  const blockedDomains = new Set([
    "gmail.com",
    "googlemail.com",
    "hotmail.com",
    "outlook.com",
    "live.com",
    "yahoo.com",
    "icloud.com",
    "me.com",
    "msn.com",
    "aol.com",
    "proton.me",
    "protonmail.com",
  ]);

  const domain = value.split("@")[1] ?? "";
  return domain.length > 0 && !blockedDomains.has(domain);
}

function toEmployeeCount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

async function sendAdminNotification(payload: {
  fullName: string;
  companyName: string;
  workEmail: string;
  employeeCount: number | null;
  phone: string;
  message: string;
}) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";
  const reportsFromEmail = process.env.REPORTS_FROM_EMAIL?.trim() || "";
  const demoInbox = process.env.DEMO_REQUESTS_TO_EMAIL?.trim() || "admin@alamin-ai.com";

  if (!resendApiKey || !reportsFromEmail) {
    return { skipped: true };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: reportsFromEmail,
      to: [demoInbox],
      subject: `New demo request from ${payload.companyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
          <h2 style="margin-bottom: 16px;">New ALAMIN demo request</h2>
          <p><strong>Name:</strong> ${escapeHtml(payload.fullName)}</p>
          <p><strong>Company:</strong> ${escapeHtml(payload.companyName)}</p>
          <p><strong>Work email:</strong> ${escapeHtml(payload.workEmail)}</p>
          <p><strong>Employee count:</strong> ${payload.employeeCount ?? "Not provided"}</p>
          <p><strong>Phone:</strong> ${escapeHtml(payload.phone || "Not provided")}</p>
          <p><strong>Message:</strong><br/>${escapeHtml(payload.message || "Not provided").replace(/\n/g, "<br/>")}</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || "Failed to send admin notification");
  }

  return { skipped: false };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DemoRequestBody;

    const fullName = String(body.fullName ?? "").trim();
    const companyName = String(body.companyName ?? "").trim();
    const workEmail = String(body.workEmail ?? "").trim().toLowerCase();
    const employeeCount = toEmployeeCount(body.employeeCount);
    const phone = String(body.phone ?? "").trim();
    const message = String(body.message ?? "").trim();

    if (!fullName) {
      return NextResponse.json(
        { ok: false, error: "Full name is required." },
        { status: 400 }
      );
    }

    if (!companyName) {
      return NextResponse.json(
        { ok: false, error: "Company name is required." },
        { status: 400 }
      );
    }

    if (!workEmail) {
      return NextResponse.json(
        { ok: false, error: "Work email is required." },
        { status: 400 }
      );
    }

    if (!isOrganizationEmail(workEmail)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Use a company email only. Personal email domains are not allowed.",
        },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();

    const { error } = await admin.from("demo_requests").insert({
      full_name: fullName,
      company_name: companyName,
      work_email: workEmail,
      employee_count: employeeCount,
      phone,
      message,
      status: "new",
      source: "landing_page",
    });

    if (error) {
      throw new Error(error.message);
    }

    try {
      await sendAdminNotification({
        fullName,
        companyName,
        workEmail,
        employeeCount,
        phone,
        message,
      });
    } catch (emailErr) {
      console.error("Demo request email notification failed:", emailErr);
    }

    return NextResponse.json({
      ok: true,
      message: "Demo request submitted successfully.",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: getErrorMessage(err, "Failed to submit demo request."),
      },
      { status: 400 }
    );
  }
}