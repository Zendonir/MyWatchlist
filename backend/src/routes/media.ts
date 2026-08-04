import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { importMovie, importTvShow } from "../services/mediaImport";
import { maybeMarkShowWatched } from "../lib/showStatus";
import { getShowSchedule } from "../lib/showSchedule";

export const mediaRouter = Router();

// An episode counts as "newly available" (rather than part of the show's
// initial import) once it shows up noticeably later than the show itself
// was added - i.e. added by a later metadata refresh, not the first batch.
const NEW_EPISODE_MARGIN_MS = 60 * 60 * 1000;

function hasNewUnwatchedEpisodes(item: { addedAt: Date; episodes: { watched: boolean; discoveredAt: Date }[] }) {
  const threshold = item.addedAt.getTime() + NEW_EPISODE_MARGIN_MS;
  return item.episodes.some((e) => !e.watched && e.discoveredAt.getTime() > threshold);
}

/** Adds the derived fields the UI needs on top of the stored row. */
function decorate<T extends { mediaType: string; addedAt: Date; episodes: any[] }>(item: T) {
  const isShow = item.mediaType === "tv";
  return {
    ...item,
    hasNewEpisodes: isShow && hasNewUnwatchedEpisodes(item),
    ...(isShow ? getShowSchedule(item.episodes) : { nextEpisode: null, seasonFinaleDate: null }),
  };
}

mediaRouter.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;

  const items = await prisma.mediaItem.findMany({
    where: {
      userId,
      ...(type ? { mediaType: type } : {}),
      ...(status ? { status } : {}),
    },
    include: { episodes: { orderBy: [{ seasonNumber: "asc" }, { episodeNumber: "asc" }] } },
    orderBy: { updatedAt: "desc" },
  });

  res.json(items.map(decorate));
});

mediaRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  const item = await prisma.mediaItem.findFirst({
    where: { id, userId: req.session.userId! },
    include: { episodes: { orderBy: [{ seasonNumber: "asc" }, { episodeNumber: "asc" }] } },
  });
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(decorate(item));
});

const addSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(["movie", "tv"]),
});

mediaRouter.post("/", async (req, res) => {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const userId = req.session.userId!;
  const { tmdbId, mediaType } = parsed.data;

  const existing = await prisma.mediaItem.findUnique({
    where: { userId_mediaType_tmdbId: { userId, mediaType, tmdbId } },
  });
  if (existing) return res.status(409).json({ error: "Already in watchlist", item: existing });

  try {
    if (mediaType === "movie") {
      const item = await importMovie(userId, tmdbId);
      return res.status(201).json(item);
    }

    const item = await importTvShow(userId, tmdbId);
    const full = await prisma.mediaItem.findUnique({
      where: { id: item.id },
      include: { episodes: { orderBy: [{ seasonNumber: "asc" }, { episodeNumber: "asc" }] } },
    });
    res.status(201).json(full);
  } catch (err: any) {
    res.status(502).json({ error: "Failed to fetch metadata", detail: String(err?.message ?? err) });
  }
});

const updateSchema = z.object({
  status: z.enum(["watchlist", "watching", "watched", "dropped"]).optional(),
  userRating: z.number().min(0).max(10).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  watched: z.boolean().optional(),
});

mediaRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.watched === true) data.watchedAt = new Date();
  if (parsed.data.watched === false) data.watchedAt = null;

  const { count } = await prisma.mediaItem.updateMany({
    where: { id, userId: req.session.userId! },
    data,
  });
  if (count === 0) return res.status(404).json({ error: "Not found" });

  const item = await prisma.mediaItem.findUnique({ where: { id } });
  res.json(item);
});

mediaRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  await prisma.mediaItem.deleteMany({ where: { id, userId: req.session.userId! } });
  res.json({ ok: true });
});

const episodeUpdateSchema = z.object({ watched: z.boolean() });

mediaRouter.patch("/:id/episodes/:episodeId", async (req, res) => {
  const mediaItemId = Number(req.params.id);
  const episodeId = Number(req.params.episodeId);
  if (!Number.isInteger(mediaItemId) || !Number.isInteger(episodeId)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const parsed = episodeUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

  const episode = await prisma.episode.findFirst({
    where: { id: episodeId, mediaItemId, mediaItem: { userId: req.session.userId! } },
  });
  if (!episode) return res.status(404).json({ error: "Not found" });

  const updated = await prisma.episode.update({
    where: { id: episodeId },
    data: { watched: parsed.data.watched, watchedAt: parsed.data.watched ? new Date() : null },
  });

  await maybeMarkShowWatched(mediaItemId);

  res.json(updated);
});

const seasonUpdateSchema = z.object({ watched: z.boolean() });

mediaRouter.patch("/:id/seasons/:seasonNumber", async (req, res) => {
  const mediaItemId = Number(req.params.id);
  const seasonNumber = Number(req.params.seasonNumber);
  if (!Number.isInteger(mediaItemId) || !Number.isInteger(seasonNumber)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const parsed = seasonUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

  const { count } = await prisma.episode.updateMany({
    where: { mediaItemId, seasonNumber, mediaItem: { userId: req.session.userId! } },
    data: {
      watched: parsed.data.watched,
      watchedAt: parsed.data.watched ? new Date() : null,
    },
  });
  if (count === 0) return res.status(404).json({ error: "Season not found" });

  await maybeMarkShowWatched(mediaItemId);

  const episodes = await prisma.episode.findMany({
    where: { mediaItemId, seasonNumber },
    orderBy: { episodeNumber: "asc" },
  });
  res.json(episodes);
});

const buddiesSchema = z.object({ userIds: z.array(z.number().int().positive()).min(1) });

mediaRouter.get("/:id/buddies", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  const item = await prisma.mediaItem.findFirst({ where: { id, userId: req.session.userId! } });
  if (!item) return res.status(404).json({ error: "Not found" });

  const group = await prisma.watchGroup.findUnique({
    where: { mediaType_tmdbId: { mediaType: item.mediaType, tmdbId: item.tmdbId } },
    include: { members: { include: { user: { select: { id: true, name: true } } } } },
  });
  res.json(group?.members.map((m) => m.user) ?? []);
});

mediaRouter.post("/:id/buddies", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = buddiesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

  const userId = req.session.userId!;
  const item = await prisma.mediaItem.findFirst({ where: { id, userId } });
  if (!item) return res.status(404).json({ error: "Not found" });

  const buddyIds = [...new Set(parsed.data.userIds)].filter((uid) => uid !== userId);
  const buddies = await prisma.user.findMany({ where: { id: { in: buddyIds } } });

  const group = await prisma.watchGroup.upsert({
    where: { mediaType_tmdbId: { mediaType: item.mediaType, tmdbId: item.tmdbId } },
    update: {},
    create: { mediaType: item.mediaType, tmdbId: item.tmdbId },
  });

  await prisma.watchGroupMember.upsert({
    where: { watchGroupId_userId: { watchGroupId: group.id, userId } },
    update: {},
    create: { watchGroupId: group.id, userId },
  });

  for (const buddy of buddies) {
    await prisma.watchGroupMember.upsert({
      where: { watchGroupId_userId: { watchGroupId: group.id, userId: buddy.id } },
      update: {},
      create: { watchGroupId: group.id, userId: buddy.id },
    });

    const existing = await prisma.mediaItem.findUnique({
      where: { userId_mediaType_tmdbId: { userId: buddy.id, mediaType: item.mediaType, tmdbId: item.tmdbId } },
    });
    if (!existing) {
      try {
        if (item.mediaType === "movie") await importMovie(buddy.id, item.tmdbId);
        else await importTvShow(buddy.id, item.tmdbId);
      } catch {
        // TMDB lookup failed - the buddy just won't get it auto-added and
        // can add it manually; the group membership above still stands.
      }
    }
  }

  const updated = await prisma.watchGroup.findUnique({
    where: { id: group.id },
    include: { members: { include: { user: { select: { id: true, name: true } } } } },
  });
  res.json(updated?.members.map((m) => m.user) ?? []);
});

mediaRouter.delete("/:id/buddies/:userId", async (req, res) => {
  const id = Number(req.params.id);
  const buddyUserId = Number(req.params.userId);
  if (!Number.isInteger(id) || !Number.isInteger(buddyUserId)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const item = await prisma.mediaItem.findFirst({ where: { id, userId: req.session.userId! } });
  if (!item) return res.status(404).json({ error: "Not found" });

  const group = await prisma.watchGroup.findUnique({
    where: { mediaType_tmdbId: { mediaType: item.mediaType, tmdbId: item.tmdbId } },
  });
  if (group) {
    await prisma.watchGroupMember.deleteMany({ where: { watchGroupId: group.id, userId: buddyUserId } });
  }
  res.json({ ok: true });
});
