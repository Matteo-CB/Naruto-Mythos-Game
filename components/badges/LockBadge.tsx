'use client';

interface LockBadgeProps {
  size?: number;
  label?: string;
  tooltip?: string;
}

export function LockBadge({ size = 28, label, tooltip }: LockBadgeProps) {
  const px = `${size}px`;
  const iconSize = Math.round(size * 0.72);

  return (
    <div
      className="absolute top-1 right-1 z-10 flex items-center justify-center group/lockbadge"
      style={{
        width: px,
        height: px,
        backgroundColor: 'var(--t-accent-tint)',
        boxShadow: '0 0 8px var(--t-accent-glow)',
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
          filter: 'drop-shadow(0 0 2px var(--t-accent-glow))',
        }}
      />

      {tooltip && (
        <div
          className="absolute top-full right-0 mt-1 px-2 py-1 text-[10px] whitespace-nowrap pointer-events-none z-20 opacity-0 group-hover/lockbadge:opacity-100"
          style={{
            transition: 'opacity 220ms ease-out',
            backgroundColor: 'var(--t-panel)',
            color: 'var(--t-accent)',
            boxShadow: '0 4px 12px var(--t-shadow)',
          }}
        >
          {tooltip}
        </div>
      )}
    </div>
  );
}
