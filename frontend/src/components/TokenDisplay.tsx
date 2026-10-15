import './TokenDisplay.css';

interface TokenDisplayProps {
  amount: number | string;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  className?: string;
}

export default function TokenDisplay({ 
  amount, 
  size = 'medium',
  showLabel = false,
  className = ''
}: TokenDisplayProps) {
  const formattedAmount = typeof amount === 'number' ? amount.toLocaleString() : amount;
  
  return (
    <div className={`token-display token-display-${size} ${className}`}>
      <img 
        src="/coin.png" 
        alt="Token" 
        className="token-coin-icon"
        onError={(e) => {
          // Fallback to emoji if image not found
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          if (!target.nextElementSibling) {
            const fallback = document.createElement('span');
            fallback.className = 'token-coin-fallback';
            fallback.textContent = '🪙';
            target.parentElement?.insertBefore(fallback, target);
          }
        }}
      />
      <span className="token-amount">{formattedAmount}</span>
      {showLabel && <span className="token-label-text">tokens</span>}
    </div>
  );
}
