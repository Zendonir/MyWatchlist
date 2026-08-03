import { prisma } from "../db";
import * as tmdb from "./tmdb";

export function episodeCreateData(mediaItemId: number, ep: tmdb.TmdbEpisode) {
  return {
    mediaItemId,
    seasonNumber: ep.season_number,
    episodeNumber: ep.episode_number,
    title: ep.name,
    overview: ep.overview || null,
    stillPath: ep.still_path,
    voteAverage: ep.vote_average || null,
    airDate: ep.air_date,
  };
}

export async function importMovie(userId: number, tmdbId: number) {
  const details = await tmdb.getMovieDetails(tmdbId);
  return prisma.mediaItem.create({
    data: {
      userId,
      mediaType: "movie",
      tmdbId: details.id,
      title: details.title,
      originalTitle: details.original_title,
      overview: details.overview,
      posterPath: details.poster_path,
      backdropPath: details.backdrop_path,
      releaseDate: details.release_date,
      isAnime: tmdb.looksLikeAnime(details),
    },
  });
}

/** Fields kept in sync with TMDB on every metadata refresh, not just at import. */
export function tvStatusFields(details: tmdb.TmdbTvDetails) {
  return {
    tmdbStatus: details.status,
    inProduction: details.in_production,
    lastAirDate: details.last_air_date,
    isAnime: tmdb.looksLikeAnime(details),
  };
}

export async function importTvShow(userId: number, tmdbId: number) {
  const details = await tmdb.getTvDetails(tmdbId);
  const item = await prisma.mediaItem.create({
    data: {
      userId,
      mediaType: "tv",
      tmdbId: details.id,
      tvdbId: details.external_ids?.tvdb_id ?? undefined,
      title: details.name,
      originalTitle: details.original_name,
      overview: details.overview,
      posterPath: details.poster_path,
      backdropPath: details.backdrop_path,
      releaseDate: details.first_air_date,
      ...tvStatusFields(details),
    },
  });

  for (const season of details.seasons) {
    if (season.season_number === 0) continue; // skip "specials"
    const seasonDetails = await tmdb.getSeasonDetails(tmdbId, season.season_number);
    // SQLite's createMany doesn't support skipDuplicates, but season/episode
    // numbers from TMDB are unique per show, so plain inserts are safe here.
    await prisma.episode.createMany({
      data: seasonDetails.episodes.map((ep) => episodeCreateData(item.id, ep)),
    });
  }

  return item;
}
