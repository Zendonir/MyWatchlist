import { useState } from "react";
import { Link } from "react-router-dom";

interface Props {
  id?: number;
  title: string;
  posterUrl: string | null;
  subtitle?: string;
  badge?: string;
  showNewBadge?: boolean;
  onClick?: () => void;
}

export default function MediaCard({ id, title, posterUrl, subtitle, badge, showNewBadge, onClick }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = posterUrl && !imageFailed;

  const content = (
    <div className="media-card">
      <div className="media-card__poster">
        {showImage ? (
          <img src={posterUrl} alt="" loading="lazy" crossOrigin="anonymous" onError={() => setImageFailed(true)} />
        ) : (
          <div className="media-card__poster--placeholder">🎬</div>
        )}
        {badge && <span className="media-card__badge">{badge}</span>}
        {showNewBadge && <span className="media-card__new-badge">Neu</span>}
      </div>
      <div className="media-card__title">{title}</div>
      {subtitle && <div className="media-card__subtitle">{subtitle}</div>}
    </div>
  );

  if (onClick) {
    return (
      <button className="media-card__link" onClick={onClick}>
        {content}
      </button>
    );
  }

  return (
    <Link className="media-card__link" to={`/media/${id}`}>
      {content}
    </Link>
  );
}
