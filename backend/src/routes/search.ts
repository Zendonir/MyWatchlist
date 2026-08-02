import { Router } from "express";
import { z } from "zod";
import * as tmdb from "../services/tmdb";
import { tmdbConfigured } from "../env";

export const searchRouter = Router();

const querySchema = z.object({
  q: z.string().min(1).max(200),
  type: z.enum(["movie", "tv", "multi"]).default("multi"),
});

searchRouter.get("/", async (req, res) => {
  if (!tmdbConfigured) {
    return res.status(503).json({ error: "TMDB is not configured on the server" });
  }
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Missing or invalid query" });
  }
  const { q, type } = parsed.data;

  try {
    const data =
      type === "movie" ? await tmdb.searchMovies(q) : type === "tv" ? await tmdb.searchTv(q) : await tmdb.searchMulti(q);

    const results = data.results
      .filter((r) => r.media_type !== "person")
      .map((r) => ({
        tmdbId: r.id,
        mediaType: r.media_type ?? (type === "movie" ? "movie" : "tv"),
        title: r.title ?? r.name ?? "Unknown",
        overview: r.overview,
        posterUrl: tmdb.tmdbImageUrl(r.poster_path, "w200"),
        releaseDate: r.release_date ?? r.first_air_date ?? null,
      }));

    res.json({ results });
  } catch (err: any) {
    res.status(502).json({ error: "TMDB request failed", detail: String(err?.message ?? err) });
  }
});
