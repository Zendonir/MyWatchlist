import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth";
import { getSettings, saveSettings, clearSettings } from "../services/smtp";

export const smtpRouter = Router();

smtpRouter.get("/", requireAdmin, async (_req, res) => {
  const settings = await getSettings();
  if (!settings) return res.json({ configured: false });
  res.json({
    configured: true,
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    user: settings.user,
    from: settings.from,
    passwordSet: Boolean(settings.password),
  });
});

const saveSchema = z.object({
  host: z.string().min(1).max(200),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().max(200).optional(),
  // Omit/blank to keep the currently stored password (see services/smtp.ts).
  password: z.string().max(500).optional(),
  from: z.string().min(1).max(200),
});

smtpRouter.put("/", requireAdmin, async (req, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const { host, port, secure, user, password, from } = parsed.data;

  await saveSettings({
    host,
    port,
    secure,
    user: user || null,
    password: password ? password : undefined,
    from,
    updatedByUserId: req.session.userId!,
  });
  res.json({ ok: true });
});

smtpRouter.delete("/", requireAdmin, async (_req, res) => {
  await clearSettings();
  res.json({ ok: true });
});
