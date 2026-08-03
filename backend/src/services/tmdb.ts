import { env, tmdbConfigured } from "../env";

const BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

class TmdbError extends Error {}

async function tmdbFetch<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  if (!tmdbConfigured) {
    throw new TmdbError("TMDB is not configured (set TMDB_API_KEY or TMDB_ACCESS_TOKEN)");
  }

  const url = new URL(BASE_URL + path);
  url.searchParams.set("language", "de-DE");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (env.TMDB_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${env.TMDB_ACCESS_TOKEN}`;
  } else if (env.TMDB_API_KEY) {
    url.searchParams.set("api_key", env.TMDB_API_KEY);
  }

  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    throw new TmdbError(`TMDB request failed (${resp.status}): ${path}`);
  }
  return (await resp.json()) as T;
}

export interface TmdbSearchResult {
  id: number;
  media_type?: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
}

export function tmdbImageUrl(path: string | null | undefined, size: "w200" | "w342" | "w500" | "original" = "w500") {
  if (!path) return null;
  return `${IMAGE_BASE_URL}/${size}${path}`;
}

export function searchMulti(query: string) {
  return tmdbFetch<{ results: TmdbSearchResult[] }>("/search/multi", { query, include_adult: "false" });
}

export function searchMovies(query: string) {
  return tmdbFetch<{ results: TmdbSearchResult[] }>("/search/movie", { query, include_adult: "false" });
}

export function searchTv(query: string) {
  return tmdbFetch<{ results: TmdbSearchResult[] }>("/search/tv", { query, include_adult: "false" });
}

export interface TmdbMovieDetails {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  runtime: number | null;
  genres: { id: number; name: string }[];
  vote_average: number;
  original_language: string;
}

export function getMovieDetails(id: number) {
  return tmdbFetch<TmdbMovieDetails>(`/movie/${id}`);
}

export interface TmdbTvDetails {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  genres: { id: number; name: string }[];
  vote_average: number;
  number_of_seasons: number;
  seasons: { season_number: number; episode_count: number; name: string }[];
  external_ids?: { tvdb_id?: number };
  // "Returning Series" | "Ended" | "Canceled" | "In Production" | "Planned" | "Pilot"
  status: string;
  in_production: boolean;
  last_air_date: string | null;
  origin_country: string[];
  original_language: string;
}

const ANIMATION_GENRE_ID = 16;

/**
 * TMDB has no "anime" media type, so classify the usual way: animated *and*
 * Japanese in origin. Live-action Japanese shows and western animation both
 * correctly fall outside this.
 */
export function looksLikeAnime(details: {
  genres: { id: number }[];
  original_language: string;
  origin_country?: string[];
}) {
  const isAnimated = details.genres.some((g) => g.id === ANIMATION_GENRE_ID);
  const isJapanese = details.original_language === "ja" || (details.origin_country ?? []).includes("JP");
  return isAnimated && isJapanese;
}

export async function getTvDetails(id: number) {
  const details = await tmdbFetch<TmdbTvDetails>(`/tv/${id}`, { append_to_response: "external_ids" });
  return details;
}

export interface TmdbEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  vote_average: number;
  air_date: string | null;
}

export function getSeasonDetails(tvId: number, seasonNumber: number) {
  return tmdbFetch<{ episodes: TmdbEpisode[] }>(`/tv/${tvId}/season/${seasonNumber}`);
}
