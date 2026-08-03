export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const resp = await fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "MyWatchlist",
      ...(options.headers ?? {}),
    },
  });

  if (!resp.ok) {
    let message = resp.statusText;
    try {
      const body = await resp.json();
      message = body.error ?? message;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new ApiError(resp.status, message);
  }

  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export interface User {
  id: number;
  username: string;
  role: string;
}

export interface Episode {
  id: number;
  mediaItemId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  overview: string | null;
  stillPath: string | null;
  voteAverage: number | null;
  airDate: string | null;
  watched: boolean;
  watchedAt: string | null;
  discoveredAt: string;
}

export interface MediaItem {
  id: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  status: "watchlist" | "watching" | "watched" | "dropped";
  userRating: number | null;
  notes: string | null;
  watched: boolean;
  watchedAt: string | null;
  episodes: Episode[];
  hasNewEpisodes?: boolean;
}

export interface SearchResult {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  overview?: string;
  posterUrl: string | null;
  releaseDate: string | null;
}

// Artwork is served through our own backend rather than hitting
// image.tmdb.org from the page - see backend/src/routes/images.ts for why
// (cross-origin images break inside the installed iOS PWA).
export function posterUrl(path: string | null, size: "w200" | "w342" | "w500" = "w342") {
  if (!path) return null;
  return `/api/images/${size}${path}`;
}

export function stillUrl(path: string | null, size: "w185" | "w300" = "w300") {
  if (!path) return null;
  return `/api/images/${size}${path}`;
}
