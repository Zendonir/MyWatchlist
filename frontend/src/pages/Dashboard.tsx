import { useEffect, useMemo, useState } from "react";
import { api, MediaItem, posterUrl } from "../api/client";
import MediaCard from "../components/MediaCard";

const TABS = [
  { key: "watchlist", label: "Vormerkliste" },
  { key: "watching", label: "Schaue ich" },
  { key: "watched", label: "Gesehen" },
] as const;

export default function Dashboard() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("watchlist");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<MediaItem[]>("/media")
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => items.filter((i) => i.status === tab), [items, tab]);

  return (
    <div className="page">
      <h1 className="page__title">Meine Watchlist</h1>

      <div className="tabs">
        {TABS.map((t) => (
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
        <div className="centered-message">Nichts hier. Füge etwas über die Suche hinzu.</div>
      )}

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
              badge={item.mediaType === "tv" ? "Serie" : "Film"}
              showNewBadge={item.hasNewEpisodes}
            />
          );
        })}
      </div>
    </div>
  );
}
