interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`skeleton ${className}`.trim()} aria-hidden="true" />;
}

export function SkeletonCard() {
  return <Skeleton className="skeleton-card" />;
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="character-grid-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
