import { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  to?: string;
  className?: string;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  children,
  to,
  className = '',
  ...props
}: ButtonProps) {
  const classes = `btn-ui btn-ui-${variant} ${size !== 'md' ? `btn-ui-${size}` : ''} ${className}`.trim();

  if (to) {
    return (
      <Link to={to} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  );
}
