'use client';

import { useTranslations } from 'next-intl';

interface RoleBadgeProps {
  role: 'admin';
  size?: 'sm' | 'md';
}

const BADGE_CONFIG = {
  admin: {
    symbol: '\u2756',         // ❖ diamond with four dots
    secondarySymbol: '\u2606', // ☆
    color: '#C4A35A',
    accentColor: '#b33e3e',
    bgColor: 'rgba(196, 163, 90, 0.08)',
    borderColor: 'rgba(196, 163, 90, 0.4)',
    glowColor: 'rgba(196, 163, 90, 0.3)',
    innerGlow: 'rgba(179, 62, 62, 0.15)',
  },
} as const;

export function RoleBadge({ role, size = 'sm' }: RoleBadgeProps) {
  const t = useTranslations('badges');
  const config = BADGE_CONFIG[role];

  const sizes = {
    sm: {
      fontSize: '9px',
      symbolSize: '8px',
      gap: '3px',
    },
    md: {
      fontSize: '11px',
      symbolSize: '11px',
      gap: '4px',
    },
  };

  const s = sizes[size];

  return (
    <div
      className="inline-flex items-center"
      style={{
        gap: s.gap,
      }}
    >
      <img
        src="/images/icons/admin-shield.svg"
        alt=""
        draggable={false}
        style={{
          width: s.symbolSize,
          height: s.symbolSize,
          display: 'block',
          filter: `drop-shadow(0 0 4px ${config.glowColor})`,
        }}
      />
      <span
        className="font-bold uppercase tracking-widest"
        style={{
          color: config.color,
          fontSize: s.fontSize,
          lineHeight: 1,
          textShadow: `0 0 8px ${config.glowColor}`,
          letterSpacing: '1.5px',
        }}
      >
        {t(role)}
      </span>
      <img
        src="/images/icons/admin-shield.svg"
        alt=""
        draggable={false}
        style={{
          width: s.symbolSize,
          height: s.symbolSize,
          display: 'block',
          filter: `drop-shadow(0 0 4px ${config.glowColor})`,
        }}
      />
    </div>
  );
}
