import nodemailer, { Transporter } from "nodemailer";
import { env, emailConfigured } from "../env";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!emailConfigured) {
    throw new Error("Email is not configured (set SMTP_HOST and SMTP_FROM)");
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER && env.SMTP_PASSWORD ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

export async function sendMail(opts: { to: string; subject: string; html: string; text: string }) {
  await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}
