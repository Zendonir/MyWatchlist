import { env, tvdbConfigured } from "../env";

const BASE_URL = "https://api4.thetvdb.com/v4";

class TvdbError extends Error {}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (!tvdbConfigured) {
    throw new TvdbError("TVDB is not configured (set TVDB_API_KEY)");
  }
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const resp = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: env.TVDB_API_KEY }),
  });
  if (!resp.ok) {
    throw new TvdbError(`TVDB login failed (${resp.status})`);
  }
  const body = (await resp.json()) as { data: { token: string } };
  // Tokens are valid ~1 month; refresh well before that to be safe.
  cachedToken = { token: body.data.token, expiresAt: Date.now() + 20 * 24 * 60 * 60 * 1000 };
  return cachedToken.token;
}

async function tvdbFetch<T>(path: string): Promise<T> {
  const token = await getToken();
  const resp = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!resp.ok) {
    throw new TvdbError(`TVDB request failed (${resp.status}): ${path}`);
  }
  return (await resp.json()) as T;
}

export interface TvdbSearchResult {
  tvdb_id: string;
  name: string;
  overview?: string;
  image_url?: string;
  year?: string;
  type: string;
}

export function searchSeries(query: string) {
  return tvdbFetch<{ data: TvdbSearchResult[] }>(`/search?query=${encodeURIComponent(query)}&type=series`);
}

export function getSeriesExtended(id: number) {
  return tvdbFetch<{ data: any }>(`/series/${id}/extended`);
}
