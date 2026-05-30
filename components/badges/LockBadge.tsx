'use client';

interface LockBadgeProps {
  size?: number;
  label?: string;
  tooltip?: string;
}

export function LockBadge({ size = 28, label, tooltip }: LockBadgeProps) {
  const gold = '#c4a35a';
  const px = `${size}px`;
  const iconSize = Math.round(size * 0.72);

  return (
    <div
      className="absolute top-1 right-1 z-10 flex items-center justify-center group/lockbadge"
      style={{
        width: px,
        height: px,
        backgroundColor: `${gold}33`,
        boxShadow: `0 0 8px ${gold}55`,
      }}
      aria-label={label}
      role="img"
    >
      <img
        src="/images/icons/padlock.svg"
        alt=""
        draggable={false}
        style={{
          width: iconSize,
          height: iconSize,
          objectFit: 'contain',
          display: 'block',
          filter: `drop-shadow(0 0 2px ${gold}88)`,
        }}
      />

      {tooltip && (
        <div
          className="absolute top-full right-0 mt-1 px-2 py-1 text-[10px] whitespace-nowrap pointer-events-none z-20 opacity-0 group-hover/lockbadge:opacity-100"
          style={{
            transition: 'opacity 220ms ease-out',
            backgroundColor: '#111111',
            color: gold,
            boxShadow: `0 4px 12px rgba(0,0,0,0.6)`,
          }}
        >
          {tooltip}
        </div>
      )}
    </div>
  );
}
