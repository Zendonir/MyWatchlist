import mysql, { Pool } from "mysql2/promise";
import { prisma } from "../db";
import { env, kodiConfigured } from "../env";
import { importMovie, importTvShow } from "./mediaImport";
import { maybeMarkShowWatched } from "../lib/showStatus";

let pool: Pool | null = null;

/**
 * No fixed database is attached to this pool - Kodi's video DB name carries a
 * schema version suffix that changes across Kodi upgrades (see
 * resolveKodiDbName), so every query below qualifies its tables with the
 * database name resolved at call time instead of relying on a pool default.
 */
function getPool(): Pool {
  if (!kodiConfigured) {
    throw new Error("Kodi database is not configured (set KODI_DB_HOST/USER/PASSWORD)");
  }
  if (!pool) {
    pool = mysql.createPool({
      host: env.KODI_DB_HOST,
      port: env.KODI_DB_PORT,
      user: env.KODI_DB_USER,
      password: env.KODI_DB_PASSWORD,
      connectionLimit: 2,
      // The app only ever runs SELECTs against this database. Use a
      // MySQL user with read-only GRANTs on the Kodi video DB(s) - see README.
    });
  }
  return pool;
}

/**
 * Kodi names its video library database "<prefix><schema version>" (e.g.
 * MyVideos116, MyVideos121, ...) and bumps the number on schema upgrades,
 * often leaving the previous database behind on the MySQL server. Rather
 * than requiring an exact name, KODI_DB_NAME_PREFIX only supplies the
 * prefix - we look at every database on the server matching "<prefix><N>"
 * and use whichever has the highest N, i.e. whatever Kodi is actually using.
 */
async function resolveKodiDbName(): Promise<string> {
  const prefix = env.KODI_DB_NAME_PREFIX;
  const conn = await mysql.createConnection({
    host: env.KODI_DB_HOST,
    port: env.KODI_DB_PORT,
    user: env.KODI_DB_USER,
    password: env.KODI_DB_PASSWORD,
  });
  try {
    const [rows] = await conn.query(
      "SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA WHERE SCHEMA_NAME REGEXP ?",
      [`^${prefix}[0-9]+$`]
    );
    const names = (rows as { name: string }[]).map((r) => r.name);
    if (names.length === 0) {
      throw new Error(
        `No Kodi database found matching prefix "${prefix}" (expected something like "${prefix}121")`
      );
    }
    // Names matched `^prefix[0-9]+$` above, so the suffix is a plain integer.
    names.sort((a, b) => Number(b.slice(prefix.length)) - Number(a.slice(prefix.length)));
    return names[0];
  } finally {
    await conn.end();
  }
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
 *
 * `dbName` comes from resolveKodiDbName(), which only ever returns strings
 * matching /^[A-Za-z0-9_]+[0-9]+$/, so interpolating it as a quoted
 * identifier below can't introduce injectable SQL.
 */
async function fetchWatchedMovies(dbName: string): Promise<KodiMovieRow[]> {
  const [rows] = await getPool().query(
    `SELECT m.idMovie AS idMovie, f.playCount AS playCount, u.value AS tmdbId
     FROM \`${dbName}\`.movie m
     JOIN \`${dbName}\`.files f ON f.idFile = m.idFile
     LEFT JOIN \`${dbName}\`.uniqueid u ON u.media_id = m.idMovie AND u.media_type = 'movie' AND u.type = 'tmdb'
     WHERE f.playCount > 0`
  );
  return rows as KodiMovieRow[];
}

async function fetchWatchedEpisodes(dbName: string): Promise<KodiEpisodeRow[]> {
  // Column names are validated against /^c[0-9]{1,2}$/ in env.ts, so this
  // interpolation cannot introduce injectable SQL.
  const seasonCol = env.KODI_EPISODE_SEASON_COLUMN;
  const episodeCol = env.KODI_EPISODE_NUMBER_COLUMN;
  // Kodi's episode_view exposes season/episode via its generic cXX content
  // columns, which are TEXT in the schema regardless of what they hold - cast
  // them to integers here so mysql2 returns real numbers, not "1"-style
  // strings (which Prisma's typed where-clauses reject).
  const [rows] = await getPool().query(
    `SELECT e.idEpisode AS idEpisode,
            CAST(ev.${seasonCol} AS UNSIGNED) AS season,
            CAST(ev.${episodeCol} AS UNSIGNED) AS episode,
            f.playCount AS playCount, u.value AS showTmdbId
     FROM \`${dbName}\`.episode e
     JOIN \`${dbName}\`.episode_view ev ON ev.idEpisode = e.idEpisode
     JOIN \`${dbName}\`.files f ON f.idFile = e.idFile
     JOIN \`${dbName}\`.tvshow tv ON tv.idShow = e.idShow
     LEFT JOIN \`${dbName}\`.uniqueid u ON u.media_id = tv.idShow AND u.media_type = 'tvshow' AND u.type = 'tmdb'
     WHERE f.playCount > 0`
  );
  return rows as KodiEpisodeRow[];
}

/**
 * Kodi is a shared household library, not a per-user account - only one
 * user "owns" it. That's the earliest-created admin account, i.e. whoever
 * the app was originally set up for; friends added later (who have no Kodi
 * of their own) are never touched by this sync and only ever add things to
 * their list manually.
 */
async function getKodiOwnerUserId(): Promise<number> {
  const owner = await prisma.user.findFirst({ where: { role: "admin" }, orderBy: { id: "asc" } });
  if (!owner) throw new Error("No admin user exists yet to own Kodi-synced items");
  return owner.id;
}

export async function testKodiConnection(): Promise<{ dbName: string }> {
  const dbName = await resolveKodiDbName();
  const conn = await getPool().getConnection();
  try {
    await conn.query(`SELECT 1 FROM \`${dbName}\`.movie LIMIT 1`);
  } finally {
    conn.release();
  }
  return { dbName };
}

export async function runKodiSync(): Promise<{ itemsUpdated: number; dbName: string }> {
  const log = await prisma.syncLog.create({ data: { source: "kodi", status: "running" } });
  let itemsUpdated = 0;

  try {
    const dbName = await resolveKodiDbName();
    const userId = await getKodiOwnerUserId();

    const movieRows = await fetchWatchedMovies(dbName);
    for (const row of movieRows) {
      if (!row.tmdbId) continue;
      const tmdbId = Number(row.tmdbId);
      if (!Number.isFinite(tmdbId)) continue;

      let mediaItem = await prisma.mediaItem.findUnique({
        where: { userId_mediaType_tmdbId: { userId, mediaType: "movie", tmdbId } },
      });
      if (!mediaItem) {
        try {
          mediaItem = await importMovie(userId, tmdbId);
        } catch {
          continue; // TMDB lookup failed - try again on the next sync
        }
      }
      if (mediaItem.watched) continue;

      await prisma.mediaItem.update({
        where: { id: mediaItem.id },
        data: { watched: true, watchedAt: new Date(), status: "watched", kodiId: row.idMovie },
      });
      itemsUpdated += 1;
    }

    // Group episodes by show so a missing show is only imported once.
    const episodeRows = await fetchWatchedEpisodes(dbName);
    const episodesByShow = new Map<number, KodiEpisodeRow[]>();
    for (const row of episodeRows) {
      if (!row.showTmdbId) continue;
      const showTmdbId = Number(row.showTmdbId);
      if (!Number.isFinite(showTmdbId)) continue;
      const rows = episodesByShow.get(showTmdbId) ?? [];
      rows.push(row);
      episodesByShow.set(showTmdbId, rows);
    }

    for (const [showTmdbId, rows] of episodesByShow) {
      let mediaItem = await prisma.mediaItem.findUnique({
        where: { userId_mediaType_tmdbId: { userId, mediaType: "tv", tmdbId: showTmdbId } },
      });
      if (!mediaItem) {
        try {
          mediaItem = await importTvShow(userId, showTmdbId);
        } catch {
          continue; // TMDB lookup failed - try again on the next sync
        }
      }

      for (const row of rows) {
        const seasonNumber = Number(row.season);
        const episodeNumber = Number(row.episode);
        if (!Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) continue;

        const episode = await prisma.episode.findUnique({
          where: {
            mediaItemId_seasonNumber_episodeNumber: {
              mediaItemId: mediaItem.id,
              seasonNumber,
              episodeNumber,
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

      await maybeMarkShowWatched(mediaItem.id);
    }

    await prisma.syncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), status: "success", itemsUpdated, message: `db=${dbName}` },
    });
    return { itemsUpdated, dbName };
  } catch (err: any) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), status: "error", message: String(err?.message ?? err) },
    });
    throw err;
  }
}
