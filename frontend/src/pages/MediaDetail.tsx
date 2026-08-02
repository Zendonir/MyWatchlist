import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, MediaItem, Episode, posterUrl, stillUrl } from "../api/client";

const STATUS_OPTIONS = [
  { key: "watchlist", label: "Vormerkliste" },
  { key: "watching", label: "Schaue ich" },
  { key: "watched", label: "Gesehen" },
  { key: "dropped", label: "Abgebrochen" },
] as const;

export default function MediaDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<MediaItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [posterFailed, setPosterFailed] = useState(false);

  useEffect(() => {
    load();
  }, [id]);

  function load() {
    setLoading(true);
    api
      .get<MediaItem>(`/media/${id}`)
      .then(setItem)
      .finally(() => setLoading(false));
  }

  async function setStatus(status: string) {
    if (!item) return;
    const updated = await api.patch<MediaItem>(`/media/${item.id}`, { status });
    setItem({ ...item, ...updated });
  }

  async function toggleEpisode(episodeId: number, watched: boolean) {
    if (!item) return;
    await api.patch(`/media/${item.id}/episodes/${episodeId}`, { watched });
    load();
  }

  async function toggleSeason(seasonNumber: number, watched: boolean) {
    if (!item) return;
    await api.patch(`/media/${item.id}/seasons/${seasonNumber}`, { watched });
    load();
  }

  async function remove() {
    if (!item) return;
    if (!confirm(`"${item.title}" aus der Watchlist entfernen?`)) return;
    await api.delete(`/media/${item.id}`);
    navigate("/");
  }

  if (loading) return <div className="centered-message">Lädt…</div>;
  if (!item) return <div className="centered-message">Nicht gefunden</div>;

  const poster = !posterFailed ? posterUrl(item.posterPath, "w500") : null;
  const bySeason = groupBySeason(item.episodes);

  return (
    <div className="page detail-page">
      <div className="detail-header">
        {poster ? (
          <img className="detail-poster" src={poster} alt="" onError={() => setPosterFailed(true)} />
        ) : (
          <div className="detail-poster detail-poster--placeholder">🎬</div>
        )}
        <div>
          <h1 className="page__title">{item.title}</h1>
          <p className="detail-meta">{item.releaseDate?.slice(0, 4)}</p>
          <p className="detail-overview">{item.overview}</p>
        </div>
      </div>

      <div className="status-picker">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s.key}
            className={"status-picker__item" + (item.status === s.key ? " status-picker__item--active" : "")}
            onClick={() => setStatus(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {item.mediaType === "tv" && item.episodes.length > 0 && (
        <div className="episode-list">
          {Object.entries(bySeason).map(([season, episodes]) => {
            const seasonNumber = Number(season);
            const allWatched = episodes.every((e) => e.watched);
            return (
              <div key={season}>
                <div className="episode-list__season-header">
                  <h2 className="episode-list__season">Staffel {season}</h2>
                  <label className="season-mark-all">
                    <input
                      type="checkbox"
                      checked={allWatched}
                      onChange={(e) => toggleSeason(seasonNumber, e.target.checked)}
                    />
                    Staffel als gesehen markieren
                  </label>
                </div>
                {episodes.map((ep) => (
                  <EpisodeRow key={ep.id} episode={ep} onToggle={toggleEpisode} />
                ))}
              </div>
            );
          })}
        </div>
      )}

      <button className="danger-button" onClick={remove}>
        Aus Watchlist entfernen
      </button>
    </div>
  );
}

function EpisodeRow({ episode, onToggle }: { episode: Episode; onToggle: (id: number, watched: boolean) => void }) {
  const [stillFailed, setStillFailed] = useState(false);
  const still = !stillFailed ? stillUrl(episode.stillPath) : null;

  return (
    <label className="episode-row">
      <input
        type="checkbox"
        checked={episode.watched}
        onChange={(e) => onToggle(episode.id, e.target.checked)}
      />
      <div className="episode-row__still">
        {still ? (
          <img src={still} alt="" loading="lazy" onError={() => setStillFailed(true)} />
        ) : (
          <div className="episode-row__still--placeholder">📺</div>
        )}
      </div>
      <div className="episode-row__info">
        <div className="episode-row__title">
          {episode.episodeNumber}. {episode.title ?? "Folge " + episode.episodeNumber}
        </div>
        {episode.overview && <div className="episode-row__overview">{episode.overview}</div>}
      </div>
    </label>
  );
}

function groupBySeason(episodes: MediaItem["episodes"]) {
  const map: Record<number, MediaItem["episodes"]> = {};
  for (const ep of episodes) {
    map[ep.seasonNumber] = map[ep.seasonNumber] ?? [];
    map[ep.seasonNumber].push(ep);
  }
  return map;
}
