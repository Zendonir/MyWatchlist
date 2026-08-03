import { useEffect, useMemo, useState } from "react";
import { api, MediaItem, posterUrl } from "../api/client";
import MediaCard from "../components/MediaCard";
import MediaListRow from "../components/MediaListRow";

const STATUS_TABS = [
  { key: "watchlist", label: "Vormerkliste" },
  { key: "watching", label: "Schaue ich" },
  { key: "watched", label: "Gesehen" },
] as const;

const CATEGORIES = [
  { key: "all", label: "Alle" },
  { key: "movie", label: "Filme" },
  { key: "tv", label: "Serien" },
  { key: "anime", label: "Anime" },
] as const;

type Category = (typeof CATEGORIES)[number]["key"];
type ViewMode = "grid" | "list";

const VIEW_STORAGE_KEY = "mywatchlist.view";

/** Anime is its own bucket, so it's excluded from the plain movie/series ones. */
function matchesCategory(item: MediaItem, category: Category) {
  switch (category) {
    case "movie":
      return item.mediaType === "movie" && !item.isAnime;
    case "tv":
      return item.mediaType === "tv" && !item.isAnime;
    case "anime":
      return item.isAnime;
    default:
      return true;
  }
}

export default function Dashboard() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]["key"]>("watchlist");
  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_STORAGE_KEY) as ViewMode) || "grid"
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<MediaItem[]>("/media")
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        i.status === tab &&
        matchesCategory(i, category) &&
        (needle === "" || i.title.toLowerCase().includes(needle))
    );
  }, [items, tab, category, query]);

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Meine Watchlist</h1>
        <button
          className="view-toggle"
          onClick={() => setView(view === "grid" ? "list" : "grid")}
          aria-label={view === "grid" ? "Zur Listenansicht wechseln" : "Zur Posteransicht wechseln"}
          title={view === "grid" ? "Listenansicht" : "Posteransicht"}
        >
          {view === "grid" ? "☰" : "▦"}
        </button>
      </div>

      <input
        className="filter-input"
        type="search"
        placeholder="Titel filtern…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="tabs">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            className={"tabs__item" + (category === c.key ? " tabs__item--active" : "")}
            onClick={() => setCategory(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="tabs">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            className={"tabs__item" + (tab === t.key ? " tabs__item--active" : "")}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="centered-message">Lädt…</div>}

      {!loading && filtered.length === 0 && (
        <div className="centered-message">
          {query.trim() ? "Keine Treffer für diesen Filter." : "Nichts hier. Füge etwas über die Suche hinzu."}
        </div>
      )}

      {!loading && filtered.length > 0 && view === "list" && (
        <div className="list-view">
          {filtered.map((item) => (
            <MediaListRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {!loading && filtered.length > 0 && view === "grid" && (
        <div className="media-grid">
          {filtered.map((item) => {
            const watchedEpisodes = item.episodes.filter((e) => e.watched).length;
            const subtitle =
              item.mediaType === "tv" && item.episodes.length > 0
                ? `${watchedEpisodes}/${item.episodes.length} Folgen`
                : item.releaseDate?.slice(0, 4);
            return (
              <MediaCard
                key={item.id}
                id={item.id}
                title={item.title}
                posterUrl={posterUrl(item.posterPath)}
                subtitle={subtitle}
                badge={item.isAnime ? "Anime" : item.mediaType === "tv" ? "Serie" : "Film"}
                showNewBadge={item.hasNewEpisodes}
                showKodiBadge={item.kodiId != null}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
