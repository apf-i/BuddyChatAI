import { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'accent' | 'gold';
  className?: string;
}

export default function Badge({ children, variant = 'accent', className = '' }: BadgeProps) {
  return <span className={`badge badge-${variant} ${className}`.trim()}>{children}</span>;
}
