'use client';

import { useTranslations } from 'next-intl';

interface RoleBadgeProps {
  role: 'admin' | 'tester';
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
  tester: {
    symbol: '\u2261',         // ≡ triple bar (testing)
    secondarySymbol: '\u25C8', // ◈
    color: '#00CED1',
    accentColor: '#20B2AA',
    bgColor: 'rgba(0, 206, 209, 0.06)',
    borderColor: 'rgba(0, 206, 209, 0.35)',
    glowColor: 'rgba(0, 206, 209, 0.25)',
    innerGlow: 'rgba(32, 178, 170, 0.12)',
  },
} as const;

export function RoleBadge({ role, size = 'sm' }: RoleBadgeProps) {
  const t = useTranslations('badges');
  const config = BADGE_CONFIG[role];

  const sizes = {
    sm: {
      padding: '1px 7px',
      fontSize: '9px',
      symbolSize: '8px',
      gap: '3px',
      borderWidth: '1px',
    },
    md: {
      padding: '3px 10px',
      fontSize: '11px',
      symbolSize: '11px',
      gap: '4px',
      borderWidth: '1px',
    },
  };

  const s = sizes[size];

  return (
    <div
      className="inline-flex items-center rounded-full"
      style={{
        padding: s.padding,
        backgroundColor: config.bgColor,
        border: `${s.borderWidth} solid ${config.borderColor}`,
        boxShadow: `0 0 10px ${config.glowColor}, 0 0 20px ${config.innerGlow}, inset 0 1px 0 rgba(255,255,255,0.04)`,
        gap: s.gap,
      }}
    >
      <span
        style={{
          color: config.color,
          fontSize: s.symbolSize,
          lineHeight: 1,
          textShadow: `0 0 6px ${config.glowColor}`,
        }}
      >
        {config.secondarySymbol}
      </span>
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
      <span
        style={{
          color: config.color,
          fontSize: s.symbolSize,
          lineHeight: 1,
          textShadow: `0 0 6px ${config.glowColor}`,
        }}
      >
        {config.symbol}
      </span>
    </div>
  );
}
