import nodemailer from "nodemailer";
import { prisma } from "../db";

export function getSettings() {
  return prisma.smtpSettings.findUnique({ where: { id: 1 } });
}

export async function isEmailConfigured() {
  return (await getSettings()) !== null;
}

interface SaveInput {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  // Undefined = leave the stored password unchanged (so the admin doesn't
  // have to re-enter it just to tweak the host or "from" address).
  password: string | undefined;
  from: string;
  updatedByUserId: number;
}

export async function saveSettings(input: SaveInput) {
  const existing = await getSettings();
  const password = input.password !== undefined ? input.password : existing?.password ?? null;

  return prisma.smtpSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      host: input.host,
      port: input.port,
      secure: input.secure,
      user: input.user,
      password,
      from: input.from,
      updatedByUserId: input.updatedByUserId,
    },
    update: {
      host: input.host,
      port: input.port,
      secure: input.secure,
      user: input.user,
      password,
      from: input.from,
      updatedByUserId: input.updatedByUserId,
    },
  });
}

export async function clearSettings() {
  await prisma.smtpSettings.deleteMany({ where: { id: 1 } });
}

export async function sendMail(opts: { to: string; subject: string; text: string; html: string }) {
  const settings = await getSettings();
  if (!settings) {
    throw new Error("SMTP ist nicht konfiguriert - unter Settings einrichten");
  }

  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.user ? { user: settings.user, pass: settings.password ?? undefined } : undefined,
  });

  await transporter.sendMail({
    from: settings.from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}
