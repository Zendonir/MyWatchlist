import mysql, { Pool } from "mysql2/promise";
import { prisma } from "../db";
import { env, kodiConfigured } from "../env";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!kodiConfigured) {
    throw new Error("Kodi database is not configured (set KODI_DB_HOST/USER/PASSWORD/NAME)");
  }
  if (!pool) {
    pool = mysql.createPool({
      host: env.KODI_DB_HOST,
      port: env.KODI_DB_PORT,
      user: env.KODI_DB_USER,
      password: env.KODI_DB_PASSWORD,
      database: env.KODI_DB_NAME,
      connectionLimit: 2,
      // The app only ever runs SELECTs against this database. Use a
      // MySQL user with read-only GRANTs on the Kodi video DB - see README.
    });
  }
  return pool;
}

interface KodiMovieRow {
  idMovie: number;
  playCount: number | null;
  tmdbId: string | null;
}

interface KodiEpisodeRow {
  idEpisode: number;
  season: number;
  episode: number;
  playCount: number | null;
  showTmdbId: string | null;
}

/**
 * These queries rely on two parts of the Kodi video library schema:
 *  - `uniqueid`: a stable table (present since Kodi 17 / schema ~90) mapping
 *    media_id + media_type -> external id (imdb/tmdb/tvdb). This is how we
 *    match Kodi's library entries to TMDB ids without guessing at scraper-
 *    specific column numbers.
 *  - `episode_view` / base tables for playCount and season/episode numbers,
 *    which Kodi maintains as part of its own schema and keeps stable across
 *    versions for these fields.
 *
 * If your Kodi version uses a materially different schema, run
 * `SHOW COLUMNS FROM movie_view` / `episode_view` against your Kodi DB and
 * adjust the queries below accordingly.
 */
async function fetchWatchedMovies(): Promise<KodiMovieRow[]> {
  const [rows] = await getPool().query(
    `SELECT m.idMovie AS idMovie, f.playCount AS playCount, u.value AS tmdbId
     FROM movie m
     JOIN files f ON f.idFile = m.idFile
     LEFT JOIN uniqueid u ON u.media_id = m.idMovie AND u.media_type = 'movie' AND u.type = 'tmdb'
     WHERE f.playCount > 0`
  );
  return rows as KodiMovieRow[];
}

async function fetchWatchedEpisodes(): Promise<KodiEpisodeRow[]> {
  // Column names are validated against /^c[0-9]{1,2}$/ in env.ts, so this
  // interpolation cannot introduce injectable SQL.
  const seasonCol = env.KODI_EPISODE_SEASON_COLUMN;
  const episodeCol = env.KODI_EPISODE_NUMBER_COLUMN;
  const [rows] = await getPool().query(
    `SELECT e.idEpisode AS idEpisode, ev.${seasonCol} AS season, ev.${episodeCol} AS episode,
            f.playCount AS playCount, u.value AS showTmdbId
     FROM episode e
     JOIN episode_view ev ON ev.idEpisode = e.idEpisode
     JOIN files f ON f.idFile = e.idFile
     JOIN tvshow tv ON tv.idShow = e.idShow
     LEFT JOIN uniqueid u ON u.media_id = tv.idShow AND u.media_type = 'tvshow' AND u.type = 'tmdb'
     WHERE f.playCount > 0`
  );
  return rows as KodiEpisodeRow[];
}

export async function testKodiConnection(): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    await conn.query("SELECT 1");
  } finally {
    conn.release();
  }
}

export async function runKodiSync(): Promise<{ itemsUpdated: number }> {
  const log = await prisma.syncLog.create({ data: { source: "kodi", status: "running" } });
  let itemsUpdated = 0;

  try {
    const movieRows = await fetchWatchedMovies();
    for (const row of movieRows) {
      if (!row.tmdbId) continue;
      const tmdbId = Number(row.tmdbId);
      if (!Number.isFinite(tmdbId)) continue;

      const result = await prisma.mediaItem.updateMany({
        where: { mediaType: "movie", tmdbId, watched: false },
        data: { watched: true, watchedAt: new Date(), status: "watched", kodiId: row.idMovie },
      });
      itemsUpdated += result.count;
    }

    const episodeRows = await fetchWatchedEpisodes();
    for (const row of episodeRows) {
      if (!row.showTmdbId) continue;
      const showTmdbId = Number(row.showTmdbId);
      if (!Number.isFinite(showTmdbId)) continue;

      const mediaItem = await prisma.mediaItem.findUnique({
        where: { mediaType_tmdbId: { mediaType: "tv", tmdbId: showTmdbId } },
      });
      if (!mediaItem) continue;

      const episode = await prisma.episode.findUnique({
        where: {
          mediaItemId_seasonNumber_episodeNumber: {
            mediaItemId: mediaItem.id,
            seasonNumber: row.season,
            episodeNumber: row.episode,
          },
        },
      });
      if (!episode || episode.watched) continue;

      await prisma.episode.update({
        where: { id: episode.id },
        data: { watched: true, watchedAt: new Date() },
      });
      itemsUpdated += 1;
    }

    // Mark a show as "watched" once every known episode has been watched.
    const showsWithEpisodes = await prisma.mediaItem.findMany({
      where: { mediaType: "tv", status: { not: "watched" } },
      include: { episodes: true },
    });
    for (const show of showsWithEpisodes) {
      if (show.episodes.length > 0 && show.episodes.every((e) => e.watched)) {
        await prisma.mediaItem.update({ where: { id: show.id }, data: { status: "watched" } });
      }
    }

    await prisma.syncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), status: "success", itemsUpdated },
    });
    return { itemsUpdated };
  } catch (err: any) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), status: "error", message: String(err?.message ?? err) },
    });
    throw err;
  }
}
