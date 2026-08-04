import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { requireAdmin } from "../middleware/auth";

export const usersRouter = Router();

// Open to any authenticated user, not just admins: picking watch buddies
// needs to see who else has an account. Name/email/role/createdAt aren't
// sensitive within a private, invite-only household app.
usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { id: "asc" },
  });
  res.json(users);
});

const createUserSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(200),
  role: z.enum(["admin", "user"]).default("user"),
});

usersRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const { email, name, password, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Diese E-Mail-Adresse wird bereits verwendet" });

  const passwordHash = await bcrypt.hash(password, 12);
  // Admin picked this password on the user's behalf, so force a self-service
  // change on first login rather than letting them keep it indefinitely.
  const user = await prisma.user.create({
    data: { email, name, passwordHash, role, mustChangePassword: true },
  });
  res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

const resetPasswordSchema = z.object({
  password: z.string().min(8).max(200),
});

usersRouter.patch("/:id/reset-password", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const result = await prisma.user
    .update({ where: { id }, data: { passwordHash, mustChangePassword: true } })
    .catch(() => null);
  if (!result) return res.status(404).json({ error: "User not found" });
  res.json({ ok: true });
});

usersRouter.delete("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  if (id === req.session.userId) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }
  await prisma.user.delete({ where: { id } }).catch(() => null);
  res.json({ ok: true });
});
