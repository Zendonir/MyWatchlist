import { Router } from "express";
import { prisma } from "../db";
import { runKodiSync, testKodiConnection } from "../services/kodiSync";
import { runMetadataRefresh } from "../services/metadataRefresh";
import { requireAdmin } from "../middleware/auth";
import { kodiConfigured, tmdbConfigured } from "../env";

export const syncRouter = Router();

syncRouter.get("/status", async (_req, res) => {
  const [lastKodiSync, lastMetadataRefresh] = await Promise.all([
    prisma.syncLog.findFirst({ where: { source: "kodi" }, orderBy: { startedAt: "desc" } }),
    prisma.syncLog.findFirst({ where: { source: "metadata" }, orderBy: { startedAt: "desc" } }),
  ]);
  res.json({ kodiConfigured, tmdbConfigured, lastSync: lastKodiSync, lastMetadataRefresh });
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
