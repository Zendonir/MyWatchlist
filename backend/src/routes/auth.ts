import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { env, passwordResetConfigured } from "../env";
import { sendMail } from "../services/email";

export const authRouter = Router();

function toSafeUser(user: {
  id: number;
  email: string;
  name: string;
  role: string;
  mustChangePassword: boolean;
  notifyEmail: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    notifyEmail: user.notifyEmail,
  };
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later." },
});

const loginSchema = z.object({
  // Deliberately not validated as a strict email format: accounts upgraded
  // from the old username-based login had their username copied into this
  // field verbatim (see migration 20260804065526) and must still be able to
  // log in with it until they set a real address.
  email: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request" });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Constant-ish time: still hash something so email enumeration via
    // timing is not trivial.
    await bcrypt.compare(password, "$2a$12$invalidsaltinvalidsaltinvalidsaltinvalidsalt");
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: "Login failed" });
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.save((saveErr) => {
      if (saveErr) return res.status(500).json({ error: "Login failed" });
      res.json(toSafeUser(user));
    });
  });
});

authRouter.post("/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("mywatchlist.sid");
    res.json({ ok: true });
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.session.userId! } });
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  res.json(toSafeUser(user));
});

const updateMeSchema = z.object({
  email: z.string().email().max(200).optional(),
  name: z.string().min(1).max(100).optional(),
  notifyEmail: z.boolean().optional(),
});

authRouter.patch("/me", requireAuth, async (req, res) => {
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const { email, name, notifyEmail } = parsed.data;

  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== req.session.userId) {
      return res.status(409).json({ error: "Diese E-Mail-Adresse wird bereits verwendet" });
    }
  }

  const user = await prisma.user.update({
    where: { id: req.session.userId! },
    data: {
      ...(email !== undefined ? { email } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(notifyEmail !== undefined ? { notifyEmail } : {}),
    },
  });
  res.json(toSafeUser(user));
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.session.userId! } });
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Aktuelles Passwort ist falsch" });

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });
  res.json(toSafeUser(updated));
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const forgotPasswordSchema = z.object({
  email: z.string().min(1).max(200),
});

authRouter.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request" });
  }

  // Always respond the same way regardless of whether the account exists or
  // email is even configured - a differing response would let an attacker
  // enumerate valid accounts.
  const genericResponse = {
    ok: true,
    message: "Falls ein Konto mit dieser E-Mail-Adresse existiert, wurde eine E-Mail mit weiteren Schritten verschickt.",
  };

  if (!passwordResetConfigured) return res.json(genericResponse);

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });

    const resetUrl = `${env.APP_URL}/reset-password?token=${token}`;
    await sendMail({
      to: user.email,
      subject: "MyWatchlist - Passwort zurücksetzen",
      text: `Hallo ${user.name},\n\nüber diesen Link kannst du dein Passwort zurücksetzen (gültig für 1 Stunde):\n${resetUrl}\n\nWenn du das nicht angefordert hast, kannst du diese E-Mail ignorieren.`,
      html: `<p>Hallo ${user.name},</p><p>über diesen Link kannst du dein Passwort zurücksetzen (gültig für 1 Stunde):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Wenn du das nicht angefordert hast, kannst du diese E-Mail ignorieren.</p>`,
    }).catch((err) => console.error("Failed to send password reset email:", err));
  }

  res.json(genericResponse);
});

const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

authRouter.post("/reset-password", resetPasswordLimiter, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const { token, newPassword } = parsed.data;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return res.status(400).json({ error: "Link ist ungültig oder abgelaufen" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash, mustChangePassword: false },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  res.json({ ok: true });
});
