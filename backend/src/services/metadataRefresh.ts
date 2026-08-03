import { prisma } from "../db";
import { tmdbConfigured } from "../env";
import * as tmdb from "./tmdb";
import { episodeCreateData, tvStatusFields } from "./mediaImport";

/**
 * Refreshes tracked shows against TMDB: adds episodes for seasons that
 * weren't there yet (newly aired episodes), and fills in poster/backdrop/
 * overview for anything that's missing it (e.g. a Kodi-imported item TMDB
 * had no artwork for at import time, or genuinely never had any).
 */
export async function runMetadataRefresh(): Promise<{ episodesAdded: number; itemsRefreshed: number }> {
  if (!tmdbConfigured) {
    throw new Error("TMDB is not configured");
  }

  const log = await prisma.syncLog.create({ data: { source: "metadata", status: "running" } });
  let episodesAdded = 0;
  let itemsRefreshed = 0;

  try {
    const shows = await prisma.mediaItem.findMany({
      where: { mediaType: "tv" },
      include: { episodes: true },
    });

    for (const show of shows) {
      try {
        const details = await tmdb.getTvDetails(show.tmdbId);
        const known = new Set(show.episodes.map((e) => `${e.seasonNumber}.${e.episodeNumber}`));

        for (const season of details.seasons) {
          if (season.season_number === 0) continue; // skip "specials"
          const seasonDetails = await tmdb.getSeasonDetails(show.tmdbId, season.season_number);
          const newEpisodes = seasonDetails.episodes.filter(
            (ep) => !known.has(`${ep.season_number}.${ep.episode_number}`)
          );
          if (newEpisodes.length === 0) continue;

          await prisma.episode.createMany({
            data: newEpisodes.map((ep) => episodeCreateData(show.id, ep)),
          });
          episodesAdded += newEpisodes.length;
        }

        // Production status is refreshed unconditionally, not just when
        // missing: a show moves from "Returning Series" to "Ended" over time,
        // and a stale value is worse than no value here.
        await prisma.mediaItem.update({
          where: { id: show.id },
          data: {
            posterPath: show.posterPath ?? details.poster_path,
            backdropPath: show.backdropPath ?? details.backdrop_path,
            overview: show.overview ?? details.overview,
            ...tvStatusFields(details),
          },
        });

        itemsRefreshed += 1;
      } catch {
        continue; // TMDB lookup failed for this show - try again next time
      }
    }

    // All movies, not just ones missing artwork: isAnime defaults to false, so
    // there's no way to tell "not anime" from "never classified", and items
    // imported before that field existed need a pass to get categorised.
    const movies = await prisma.mediaItem.findMany({ where: { mediaType: "movie" } });
    for (const movie of movies) {
      try {
        const details = await tmdb.getMovieDetails(movie.tmdbId);
        await prisma.mediaItem.update({
          where: { id: movie.id },
          data: {
            posterPath: movie.posterPath ?? details.poster_path,
            backdropPath: movie.backdropPath ?? details.backdrop_path,
            overview: movie.overview ?? details.overview,
            isAnime: tmdb.looksLikeAnime(details),
          },
        });
        itemsRefreshed += 1;
      } catch {
        continue;
      }
    }

    await prisma.syncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), status: "success", itemsUpdated: episodesAdded + itemsRefreshed },
    });
    return { episodesAdded, itemsRefreshed };
  } catch (err: any) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), status: "error", message: String(err?.message ?? err) },
    });
    throw err;
  }
}
