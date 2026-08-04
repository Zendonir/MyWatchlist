import mysql, { Pool } from "mysql2/promise";
import { prisma } from "../db";
import { env, kodiConfigured } from "../env";
import { importMovie, importTvShow } from "./mediaImport";
import { syncShowWatchedStatus } from "../lib/showStatus";

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

interface KodiShowRow {
  idShow: number;
  tmdbId: string | null;
}

interface KodiEpisodeRow {
  idEpisode: number;
  idShow: number;
  season: number;
  episode: number;
  playCount: number | null;
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
 * None of these filter on playCount - the whole Kodi library is fetched
 * every run (not just watched items), so runKodiSync can both import
 * anything not yet tracked and detect items that got un-watched or removed
 * from Kodi entirely since the last run.
 *
 * If your Kodi version uses a materially different schema, run
 * `SHOW COLUMNS FROM movie_view` / `episode_view` against your Kodi DB and
 * adjust the queries below accordingly.
 *
 * `dbName` comes from resolveKodiDbName(), which only ever returns strings
 * matching /^[A-Za-z0-9_]+[0-9]+$/, so interpolating it as a quoted
 * identifier below can't introduce injectable SQL.
 */
async function fetchAllMovies(dbName: string): Promise<KodiMovieRow[]> {
  const [rows] = await getPool().query(
    `SELECT m.idMovie AS idMovie, f.playCount AS playCount, u.value AS tmdbId
     FROM \`${dbName}\`.movie m
     JOIN \`${dbName}\`.files f ON f.idFile = m.idFile
     LEFT JOIN \`${dbName}\`.uniqueid u ON u.media_id = m.idMovie AND u.media_type = 'movie' AND u.type = 'tmdb'`
  );
  return rows as KodiMovieRow[];
}

async function fetchAllShows(dbName: string): Promise<KodiShowRow[]> {
  const [rows] = await getPool().query(
    `SELECT tv.idShow AS idShow, u.value AS tmdbId
     FROM \`${dbName}\`.tvshow tv
     LEFT JOIN \`${dbName}\`.uniqueid u ON u.media_id = tv.idShow AND u.media_type = 'tvshow' AND u.type = 'tmdb'`
  );
  return rows as KodiShowRow[];
}

async function fetchAllEpisodes(dbName: string): Promise<KodiEpisodeRow[]> {
  // Column names are validated against /^c[0-9]{1,2}$/ in env.ts, so this
  // interpolation cannot introduce injectable SQL.
  const seasonCol = env.KODI_EPISODE_SEASON_COLUMN;
  const episodeCol = env.KODI_EPISODE_NUMBER_COLUMN;
  // Kodi's episode_view exposes season/episode via its generic cXX content
  // columns, which are TEXT in the schema regardless of what they hold - cast
  // them to integers here so mysql2 returns real numbers, not "1"-style
  // strings (which Prisma's typed where-clauses reject).
  const [rows] = await getPool().query(
    `SELECT e.idEpisode AS idEpisode, e.idShow AS idShow,
            CAST(ev.${seasonCol} AS UNSIGNED) AS season,
            CAST(ev.${episodeCol} AS UNSIGNED) AS episode,
            f.playCount AS playCount
     FROM \`${dbName}\`.episode e
     JOIN \`${dbName}\`.episode_view ev ON ev.idEpisode = e.idEpisode
     JOIN \`${dbName}\`.files f ON f.idFile = e.idFile`
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

    // ---- Movies ----
    const movieRows = await fetchAllMovies(dbName);
    const currentKodiMovieIds = new Set<number>();

    for (const row of movieRows) {
      if (!row.tmdbId) continue;
      const tmdbId = Number(row.tmdbId);
      if (!Number.isFinite(tmdbId)) continue;
      currentKodiMovieIds.add(row.idMovie);

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

      const isWatched = (row.playCount ?? 0) > 0;
      const needsUpdate = mediaItem.watched !== isWatched || mediaItem.kodiId !== row.idMovie;
      if (needsUpdate) {
        await prisma.mediaItem.update({
          where: { id: mediaItem.id },
          data: {
            watched: isWatched,
            watchedAt: isWatched ? new Date() : null,
            // Only auto-flip the "watched" status either way - a
            // deliberately-set "watching"/"dropped" status is left alone.
            status: isWatched ? "watched" : mediaItem.status === "watched" ? "watchlist" : mediaItem.status,
            kodiId: row.idMovie,
          },
        });
        itemsUpdated += 1;
      }
    }

    // Movies that used to be Kodi-owned but no longer appear in Kodi's
    // library at all get removed here too. Guarded against wiping
    // everything if this run's fetch came back suspiciously empty (a
    // transient connection/query glitch, not a genuinely emptied library).
    if (movieRows.length > 0) {
      const kodiOwnedMovies = await prisma.mediaItem.findMany({
        where: { userId, mediaType: "movie", kodiId: { not: null } },
      });
      for (const item of kodiOwnedMovies) {
        if (item.kodiId !== null && !currentKodiMovieIds.has(item.kodiId)) {
          await prisma.mediaItem.delete({ where: { id: item.id } });
          itemsUpdated += 1;
        }
      }
    }

    // ---- TV shows + episodes ----
    const showRows = await fetchAllShows(dbName);
    const episodeRows = await fetchAllEpisodes(dbName);

    const episodesByShowId = new Map<number, KodiEpisodeRow[]>();
    for (const row of episodeRows) {
      const rows = episodesByShowId.get(row.idShow) ?? [];
      rows.push(row);
      episodesByShowId.set(row.idShow, rows);
    }

    const currentKodiShowIds = new Set<number>();

    for (const showRow of showRows) {
      if (!showRow.tmdbId) continue;
      const tmdbId = Number(showRow.tmdbId);
      if (!Number.isFinite(tmdbId)) continue;
      currentKodiShowIds.add(showRow.idShow);

      let mediaItem = await prisma.mediaItem.findUnique({
        where: { userId_mediaType_tmdbId: { userId, mediaType: "tv", tmdbId } },
      });
      if (!mediaItem) {
        try {
          mediaItem = await importTvShow(userId, tmdbId);
        } catch {
          continue; // TMDB lookup failed - try again on the next sync
        }
      }
      if (mediaItem.kodiId !== showRow.idShow) {
        mediaItem = await prisma.mediaItem.update({
          where: { id: mediaItem.id },
          data: { kodiId: showRow.idShow },
        });
      }

      const rows = episodesByShowId.get(showRow.idShow) ?? [];
      const watchedPairs = new Set(
        rows.filter((r) => (r.playCount ?? 0) > 0).map((r) => `${r.season}.${r.episode}`)
      );

      // Compare against every episode already known for this show (imported
      // from TMDB, not just ones Kodi currently has) so an episode that's
      // been unwatched - or whose file was removed from Kodi entirely - also
      // loses its watched mark here, not just newly-watched ones gaining it.
      const knownEpisodes = await prisma.episode.findMany({ where: { mediaItemId: mediaItem.id } });
      for (const ep of knownEpisodes) {
        const isWatchedInKodi = watchedPairs.has(`${ep.seasonNumber}.${ep.episodeNumber}`);
        if (ep.watched !== isWatchedInKodi) {
          await prisma.episode.update({
            where: { id: ep.id },
            data: { watched: isWatchedInKodi, watchedAt: isWatchedInKodi ? new Date() : null },
          });
          itemsUpdated += 1;
        }
      }

      await syncShowWatchedStatus(mediaItem.id);
    }

    // Same removal safety guard as movies above.
    if (showRows.length > 0) {
      const kodiOwnedShows = await prisma.mediaItem.findMany({
        where: { userId, mediaType: "tv", kodiId: { not: null } },
      });
      for (const item of kodiOwnedShows) {
        if (item.kodiId !== null && !currentKodiShowIds.has(item.kodiId)) {
          await prisma.mediaItem.delete({ where: { id: item.id } }); // cascades to its episodes
          itemsUpdated += 1;
        }
      }
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
