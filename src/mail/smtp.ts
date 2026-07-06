import nodemailer from "nodemailer";

let cached: nodemailer.Transporter | null = null;

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_URL ||
      (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  );
}

function getTransport(): nodemailer.Transporter {
  if (cached) return cached;
  if (process.env.SMTP_URL) {
    cached = nodemailer.createTransport(process.env.SMTP_URL);
    return cached;
  }
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error("SMTP not configured");
  }
  cached = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  });
  return cached;
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ sent: boolean; skipped?: boolean }> {
  if (!isSmtpConfigured()) {
    return { sent: false, skipped: true };
  }
  const from =
    process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "TTE <noreply@localhost>";
  await getTransport().sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html ?? `<pre>${escapeHtml(input.text)}</pre>`,
  });
  return { sent: true };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
