import { Link } from "react-router-dom";

interface Props {
  id?: number;
  title: string;
  posterUrl: string | null;
  subtitle?: string;
  badge?: string;
  onClick?: () => void;
}

export default function MediaCard({ id, title, posterUrl, subtitle, badge, onClick }: Props) {
  const content = (
    <div className="media-card">
      <div className="media-card__poster">
        {posterUrl ? <img src={posterUrl} alt="" loading="lazy" /> : <div className="media-card__poster--placeholder">🎬</div>}
        {badge && <span className="media-card__badge">{badge}</span>}
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
