import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import * as tmdb from "../services/tmdb";

export const mediaRouter = Router();

mediaRouter.get("/", async (req, res) => {
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;

  const items = await prisma.mediaItem.findMany({
    where: {
      ...(type ? { mediaType: type } : {}),
      ...(status ? { status } : {}),
    },
    include: { episodes: { orderBy: [{ seasonNumber: "asc" }, { episodeNumber: "asc" }] } },
    orderBy: { updatedAt: "desc" },
  });
  res.json(items);
});

mediaRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  const item = await prisma.mediaItem.findUnique({
    where: { id },
    include: { episodes: { orderBy: [{ seasonNumber: "asc" }, { episodeNumber: "asc" }] } },
  });
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
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
  const { tmdbId, mediaType } = parsed.data;

  const existing = await prisma.mediaItem.findUnique({
    where: { mediaType_tmdbId: { mediaType, tmdbId } },
  });
  if (existing) return res.status(409).json({ error: "Already in watchlist", item: existing });

  try {
    if (mediaType === "movie") {
      const details = await tmdb.getMovieDetails(tmdbId);
      const item = await prisma.mediaItem.create({
        data: {
          mediaType: "movie",
          tmdbId: details.id,
          title: details.title,
          originalTitle: details.original_title,
          overview: details.overview,
          posterPath: details.poster_path,
          backdropPath: details.backdrop_path,
          releaseDate: details.release_date,
        },
      });
      return res.status(201).json(item);
    }

    const details = await tmdb.getTvDetails(tmdbId);
    const item = await prisma.mediaItem.create({
      data: {
        mediaType: "tv",
        tmdbId: details.id,
        tvdbId: details.external_ids?.tvdb_id ?? undefined,
        title: details.name,
        originalTitle: details.original_name,
        overview: details.overview,
        posterPath: details.poster_path,
        backdropPath: details.backdrop_path,
        releaseDate: details.first_air_date,
      },
    });

    for (const season of details.seasons) {
      if (season.season_number === 0) continue; // skip "specials"
      const seasonDetails = await tmdb.getSeasonDetails(tmdbId, season.season_number);
      // SQLite's createMany doesn't support skipDuplicates, but season/episode
      // numbers from TMDB are unique per show, so plain inserts are safe here.
      await prisma.episode.createMany({
        data: seasonDetails.episodes.map((ep) => ({
          mediaItemId: item.id,
          seasonNumber: ep.season_number,
          episodeNumber: ep.episode_number,
          title: ep.name,
          airDate: ep.air_date,
        })),
      });
    }

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

  try {
    const item = await prisma.mediaItem.update({ where: { id }, data });
    res.json(item);
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

mediaRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  await prisma.mediaItem.delete({ where: { id } }).catch(() => null);
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

  const episode = await prisma.episode.findFirst({ where: { id: episodeId, mediaItemId } });
  if (!episode) return res.status(404).json({ error: "Not found" });

  const updated = await prisma.episode.update({
    where: { id: episodeId },
    data: { watched: parsed.data.watched, watchedAt: parsed.data.watched ? new Date() : null },
  });

  const allEpisodes = await prisma.episode.findMany({ where: { mediaItemId } });
  if (allEpisodes.length > 0 && allEpisodes.every((e) => e.watched)) {
    await prisma.mediaItem.update({ where: { id: mediaItemId }, data: { status: "watched" } });
  }

  res.json(updated);
});
