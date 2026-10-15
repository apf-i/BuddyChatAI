import { Link } from 'react-router-dom';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
}

export default function SectionHeader({
  title,
  subtitle,
  actionLabel,
  actionTo,
  onAction,
}: SectionHeaderProps) {
  return (
    <div className="section-header">
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="section-subtitle">{subtitle}</p>}
      </div>
      {actionLabel && actionTo && (
        <Link to={actionTo} className="section-action-link">
          {actionLabel} →
        </Link>
      )}
      {actionLabel && onAction && !actionTo && (
        <button type="button" className="section-action-link" onClick={onAction}>
          {actionLabel} →
        </button>
      )}
    </div>
  );
}
