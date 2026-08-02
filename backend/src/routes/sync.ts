import { Router } from "express";
import { prisma } from "../db";
import { runKodiSync, testKodiConnection } from "../services/kodiSync";
import { requireAdmin } from "../middleware/auth";
import { kodiConfigured } from "../env";

export const syncRouter = Router();

syncRouter.get("/status", async (_req, res) => {
  const lastLog = await prisma.syncLog.findFirst({ orderBy: { startedAt: "desc" } });
  res.json({ kodiConfigured, lastSync: lastLog });
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
    await testKodiConnection();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(502).json({ error: "Connection failed", detail: String(err?.message ?? err) });
  }
});
