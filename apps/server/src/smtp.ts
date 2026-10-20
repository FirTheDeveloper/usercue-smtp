import nodemailer from "nodemailer";
import { env } from "./env";

export interface SmtpCredentials {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
}

export function smtpCredentials(): SmtpCredentials | null {
  const host = env.smtpHost.trim();
  const from = env.smtpFrom.trim();
  if (!host || !from) return null;

  return {
    host,
    port: env.smtpPort,
    user: env.smtpUser,
    pass: env.smtpPass,
    from,
    secure: env.smtpSecure,
  };
}

export function smtpConfigured(): boolean {
  return smtpCredentials() !== null;
}

export async function sendSmtpEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; error?: string }> {
  const credentials = smtpCredentials();
  if (!credentials) return { sent: false, error: "SMTP email is not configured" };

  try {
    const transporter = nodemailer.createTransport({
      host: credentials.host,
      port: credentials.port,
      secure: credentials.secure,
      auth:
        credentials.user || credentials.pass
          ? { user: credentials.user, pass: credentials.pass }
          : undefined,
    });
    await transporter.sendMail({
      from: credentials.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send the email";
    return { sent: false, error: message };
  }
}
