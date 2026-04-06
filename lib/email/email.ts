import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string | string[];
  subject: string;
  html: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY");
  }

  if (!process.env.REPORTS_FROM_EMAIL) {
    throw new Error("Missing REPORTS_FROM_EMAIL");
  }

  const result = await resend.emails.send({
    from: process.env.REPORTS_FROM_EMAIL, // e.g. "ALAMIN <reports@alamin.ai>"
    to,
    subject,
    html,
  });

  return result;
}