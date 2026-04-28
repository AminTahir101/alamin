import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type DemoRequestBody = {
  fullName?: string;
  companyName?: string;
  workEmail?: string;
  jobTitle?: string;
  companySize?: string;
  country?: string;
  notes?: string;
};

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
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
    "gmail.com", "googlemail.com", "hotmail.com", "outlook.com",
    "live.com", "yahoo.com", "icloud.com", "me.com", "msn.com",
    "aol.com", "proton.me", "protonmail.com",
  ]);
  const domain = value.split("@")[1] ?? "";
  return domain.length > 0 && !blockedDomains.has(domain);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safe(value: string | undefined | null, fallback = "Not provided") {
  const v = String(value ?? "").trim();
  return v.length > 0 ? escapeHtml(v) : fallback;
}

async function sendAdminNotification(payload: {
  fullName: string;
  companyName: string;
  workEmail: string;
  jobTitle: string;
  companySize: string;
  country: string;
  notes: string;
}) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";
  const reportsFromEmail = process.env.REPORTS_FROM_EMAIL?.trim() || "";
  const demoInbox = process.env.DEMO_REQUESTS_TO_EMAIL?.trim() || "admin@alamin-ai.com";

  if (!resendApiKey || !reportsFromEmail) return { skipped: true };

  const row = (label: string, value: string) =>
    `<tr>
      <td style="padding:8px 12px;font-weight:600;color:#555;white-space:nowrap;vertical-align:top;width:160px;">${label}</td>
      <td style="padding:8px 12px;color:#111;">${value}</td>
    </tr>`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="background:#18181b;padding:24px 28px;">
        <div style="font-size:20px;font-weight:700;color:#fff;">ALAMIN</div>
        <div style="font-size:13px;color:#a1a1aa;margin-top:2px;">New demo request</div>
      </div>
      <div style="padding:28px;">
        <h2 style="margin:0 0 20px;font-size:18px;color:#18181b;">
          ${safe(payload.fullName)} from ${safe(payload.companyName)} wants a demo
        </h2>
        <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
          ${row("Full name", safe(payload.fullName))}
          ${row("Job title", safe(payload.jobTitle))}
          ${row("Work email", `<a href="mailto:${escapeHtml(payload.workEmail)}" style="color:#6d28d9;">${escapeHtml(payload.workEmail)}</a>`)}
          ${row("Company", safe(payload.companyName))}
          ${row("Company size", safe(payload.companySize))}
          ${row("Country", safe(payload.country))}
          ${row("What they're solving", safe(payload.notes).replace(/\n/g, "<br/>"))}
        </table>
        <div style="margin-top:24px;">
          <a href="mailto:${escapeHtml(payload.workEmail)}?subject=Re: ALAMIN demo request"
            style="display:inline-block;padding:10px 22px;background:#18181b;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
            Reply to ${safe(payload.fullName)}
          </a>
        </div>
        <div style="margin-top:24px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;">
          Submitted via alamin-ai.com/demo
        </div>
      </div>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: reportsFromEmail,
      to: [demoInbox],
      subject: `New demo request from ${payload.companyName} — ${payload.fullName}`,
      html,
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || "Failed to send admin notification");
  }

  return { skipped: false };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DemoRequestBody;

    const fullName    = String(body.fullName    ?? "").trim();
    const companyName = String(body.companyName ?? "").trim();
    const workEmail   = String(body.workEmail   ?? "").trim().toLowerCase();
    const jobTitle    = String(body.jobTitle    ?? "").trim();
    const companySize = String(body.companySize ?? "").trim();
    const country     = String(body.country     ?? "").trim();
    const notes       = String(body.notes       ?? "").trim();

    if (!fullName)    return NextResponse.json({ ok: false, error: "Full name is required." }, { status: 400 });
    if (!companyName) return NextResponse.json({ ok: false, error: "Company name is required." }, { status: 400 });
    if (!workEmail)   return NextResponse.json({ ok: false, error: "Work email is required." }, { status: 400 });
    if (!jobTitle)    return NextResponse.json({ ok: false, error: "Job title is required." }, { status: 400 });

    if (!isOrganizationEmail(workEmail)) {
      return NextResponse.json(
        { ok: false, error: "Use a company email only. Personal email domains are not allowed." },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();
    const { error } = await admin.from("demo_requests").insert({
      full_name:    fullName,
      company_name: companyName,
      work_email:   workEmail,
      job_title:    jobTitle,
      company_size: companySize,
      country,
      message:      notes,
      status: "new",
      source: "landing_page",
    });

    if (error) throw new Error(error.message);

    try {
      await sendAdminNotification({ fullName, companyName, workEmail, jobTitle, companySize, country, notes });
    } catch (emailErr) {
      console.error("Demo notification failed:", emailErr);
    }

    return NextResponse.json({ ok: true, message: "Demo request submitted successfully." });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(err, "Failed to submit demo request.") },
      { status: 400 }
    );
  }
}
