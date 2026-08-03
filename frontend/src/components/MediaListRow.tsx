import { useState } from "react";
import { Link } from "react-router-dom";
import { MediaItem, posterUrl, seriesStatusLabel, formatDate } from "../api/client";

export default function MediaListRow({ item }: { item: MediaItem }) {
  const [imageFailed, setImageFailed] = useState(false);
  const poster = !imageFailed ? posterUrl(item.posterPath, "w200") : null;

  const watchedEpisodes = item.episodes.filter((e) => e.watched).length;
  const progress =
    item.mediaType === "tv" && item.episodes.length > 0
      ? `${watchedEpisodes}/${item.episodes.length} Folgen`
      : null;

  const statusLabel = item.mediaType === "tv" ? seriesStatusLabel(item.tmdbStatus) : null;
  const nextAir = formatDate(item.nextEpisode?.airDate);
  const finale = formatDate(item.seasonFinaleDate);

  return (
    <Link className="list-row" to={`/media/${item.id}`}>
      <div className="list-row__poster">
        {poster ? (
          <img src={poster} alt="" loading="lazy" onError={() => setImageFailed(true)} />
        ) : (
          <div className="list-row__poster--placeholder">🎬</div>
        )}
      </div>

      <div className="list-row__info">
        <div className="list-row__title">
          {item.title}
          {item.hasNewEpisodes && <span className="list-row__new">Neu</span>}
          {item.kodiId != null && (
            <span className="list-row__kodi" title="Aus Kodi synchronisiert">
              Kodi
            </span>
          )}
        </div>

        <div className="list-row__meta">
          {[item.releaseDate?.slice(0, 4), progress, statusLabel].filter(Boolean).join(" · ")}
        </div>

        {nextAir && (
          <div className="list-row__air">
            Nächste Folge: {nextAir}
            {finale && finale !== nextAir && <> · Staffelende: {finale}</>}
          </div>
        )}
      </div>
    </Link>
  );
}
