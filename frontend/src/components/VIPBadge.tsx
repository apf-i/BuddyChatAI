import { FaCrown } from 'react-icons/fa';
import './VIPBadge.css';

interface VIPBadgeProps {
  isVIP?: boolean;
  size?: 'small' | 'medium';
}

export default function VIPBadge({ isVIP = false, size = 'medium' }: VIPBadgeProps) {
  if (!isVIP) return null;

  return (
    <span className={`vip-badge-inline vip-badge-${size}`} title="VIP Member - 50% off chat costs">
      <FaCrown className="vip-crown-inline" />
      <span className="vip-text-inline">VIP</span>
    </span>
  );
}
