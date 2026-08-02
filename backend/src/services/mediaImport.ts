import { prisma } from "../db";
import * as tmdb from "./tmdb";

export async function importMovie(tmdbId: number) {
  const details = await tmdb.getMovieDetails(tmdbId);
  return prisma.mediaItem.create({
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
}

export async function importTvShow(tmdbId: number) {
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

  return item;
}
