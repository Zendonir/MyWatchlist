import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { runKodiSync, testKodiConnection } from "../services/kodiSync";
import { runMetadataRefresh } from "../services/metadataRefresh";
import { sendMail } from "../services/email";
import { buildDigestEmail } from "../services/notifications";
import { requireAdmin } from "../middleware/auth";
import { kodiConfigured, tmdbConfigured, emailConfigured } from "../env";

export const syncRouter = Router();

syncRouter.get("/status", async (_req, res) => {
  const [lastKodiSync, lastMetadataRefresh] = await Promise.all([
    prisma.syncLog.findFirst({ where: { source: "kodi" }, orderBy: { startedAt: "desc" } }),
    prisma.syncLog.findFirst({ where: { source: "metadata" }, orderBy: { startedAt: "desc" } }),
  ]);
  res.json({ kodiConfigured, tmdbConfigured, emailConfigured, lastSync: lastKodiSync, lastMetadataRefresh });
});

syncRouter.post("/kodi", requireAdmin, async (_req, res) => {
  if (!kodiConfigured) {
    return res.status(503).json({ error: "Kodi database is not configured" });
  }
  try {
    const result = await runKodiSync();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(502).json({ error: "Kodi sync failed", detail: String(err?.message ?? err) });
  }
});

syncRouter.get("/kodi/test", requireAdmin, async (_req, res) => {
  if (!kodiConfigured) {
    return res.status(503).json({ error: "Kodi database is not configured" });
  }
  try {
    const result = await testKodiConnection();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(502).json({ error: "Connection failed", detail: String(err?.message ?? err) });
  }
});

syncRouter.post("/metadata", requireAdmin, async (_req, res) => {
  if (!tmdbConfigured) {
    return res.status(503).json({ error: "TMDB is not configured" });
  }
  try {
    const result = await runMetadataRefresh();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(502).json({ error: "Metadata refresh failed", detail: String(err?.message ?? err) });
  }
});

const testEmailSchema = z.object({
  to: z.string().email().optional(),
  kind: z.enum(["simple", "digest"]).default("simple"),
});

// Lets an admin verify SMTP actually works, and preview exactly what the
// daily digest email looks like, without waiting for a real metadata run to
// produce one.
syncRouter.post("/test-email", requireAdmin, async (req, res) => {
  if (!emailConfigured) {
    return res.status(503).json({ error: "E-Mail ist nicht konfiguriert" });
  }
  const parsed = testEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  let to = parsed.data.to;
  if (!to) {
    const me = await prisma.user.findUnique({ where: { id: req.session.userId! } });
    to = me?.email;
  }
  if (!to) {
    return res.status(400).json({ error: "Keine E-Mail-Adresse angegeben oder im eigenen Konto hinterlegt" });
  }

  const content =
    parsed.data.kind === "digest"
      ? buildDigestEmail({
          newEpisodes: [
            { title: "Fairy Tail", count: 3 },
            { title: "Black Lagoon", count: 1 },
          ],
          completed: ["Guilty Crown"],
          example: true,
        })
      : {
          subject: "MyWatchlist - Test-E-Mail",
          text: "Das ist eine Test-E-Mail von MyWatchlist. Wenn du das liest, funktioniert dein E-Mail-Versand.",
          html: "<p>Das ist eine Test-E-Mail von MyWatchlist. Wenn du das liest, funktioniert dein E-Mail-Versand.</p>",
        };

  try {
    await sendMail({ to, ...content });
    res.json({ ok: true, sentTo: to });
  } catch (err: any) {
    console.error("Test email failed:", err);
    res.status(502).json({ error: "Versand fehlgeschlagen", detail: String(err?.message ?? err) });
  }
});
