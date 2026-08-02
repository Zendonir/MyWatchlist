import { FormEvent, useState } from "react";
import { api, ApiError, SearchResult } from "../api/client";
import MediaCard from "../components/MediaCard";

export default function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(query)}`);
      setResults(data.results);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Suche fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  async function addToWatchlist(result: SearchResult) {
    try {
      await api.post("/media", { tmdbId: result.tmdbId, mediaType: result.mediaType });
      setAddedIds((prev) => new Set(prev).add(result.tmdbId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setAddedIds((prev) => new Set(prev).add(result.tmdbId));
      } else {
        setError(err instanceof ApiError ? err.message : "Hinzufügen fehlgeschlagen");
      }
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">Suche</h1>
      <form className="search-bar" onSubmit={handleSubmit}>
        <input
          type="search"
          placeholder="Filme & Serien suchen…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <button type="submit" disabled={loading}>
          {loading ? "…" : "Suchen"}
        </button>
      </form>

      {error && <div className="form-error">{error}</div>}

      <div className="media-grid">
        {results.map((r) => {
          const isAdded = addedIds.has(r.tmdbId);
          return (
            <MediaCard
              key={`${r.mediaType}-${r.tmdbId}`}
              title={r.title}
              posterUrl={r.posterUrl}
              subtitle={r.releaseDate?.slice(0, 4)}
              badge={isAdded ? "✓ Hinzugefügt" : r.mediaType === "tv" ? "Serie" : "Film"}
              onClick={() => !isAdded && addToWatchlist(r)}
            />
          );
        })}
      </div>
    </div>
  );
}
