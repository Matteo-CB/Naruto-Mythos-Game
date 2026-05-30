'use client';

interface VariantLockedBannerProps {
  title: string;
  description: string;
}

export function VariantLockedBanner({ title, description }: VariantLockedBannerProps) {
  const gold = '#c4a35a';
  return (
    <div
      className="mt-4 p-3 text-sm"
      style={{
        backgroundColor: `${gold}1f`,
        color: gold,
        boxShadow: `0 0 12px ${gold}22`,
      }}
    >
      <div className="font-bold uppercase tracking-wider text-xs mb-1">{title}</div>
      <div className="font-body" style={{ color: '#e8d9a8' }}>
        {description}
      </div>
    </div>
  );
}
