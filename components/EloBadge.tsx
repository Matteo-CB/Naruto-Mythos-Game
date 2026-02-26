'use client';

import { useTranslations } from 'next-intl';

interface EloBadgeProps {
  elo: number;
  size?: 'sm' | 'md' | 'lg';
  showElo?: boolean;
}

interface RankTier {
  key: string;
  minElo: number;
  color: string;
  bgColor: string;
  borderColor: string;
  glowColor: string;
  symbol: string;
}

const RANK_TIERS: RankTier[] = [
  {
    key: 'academyStudent',
    minElo: 0,
    color: '#888888',
    bgColor: 'rgba(136, 136, 136, 0.08)',
    borderColor: 'rgba(136, 136, 136, 0.25)',
    glowColor: 'rgba(136, 136, 136, 0.15)',
    symbol: '\u2022',
  },
  {
    key: 'genin',
    minElo: 450,
    color: '#3E8B3E',
    bgColor: 'rgba(62, 139, 62, 0.08)',
    borderColor: 'rgba(62, 139, 62, 0.3)',
    glowColor: 'rgba(62, 139, 62, 0.15)',
    symbol: '\u25C6',
  },
  {
    key: 'chunin',
    minElo: 550,
    color: '#B37E3E',
    bgColor: 'rgba(179, 126, 62, 0.08)',
    borderColor: 'rgba(179, 126, 62, 0.3)',
    glowColor: 'rgba(179, 126, 62, 0.15)',
    symbol: '\u25C6\u25C6',
  },
  {
    key: 'specialJonin',
    minElo: 650,
    color: '#5A7ABB',
    bgColor: 'rgba(90, 122, 187, 0.08)',
    borderColor: 'rgba(90, 122, 187, 0.3)',
    glowColor: 'rgba(90, 122, 187, 0.15)',
    symbol: '\u2726',
  },
  {
    key: 'eliteJonin',
    minElo: 750,
    color: '#5865F2',
    bgColor: 'rgba(88, 101, 242, 0.08)',
    borderColor: 'rgba(88, 101, 242, 0.3)',
    glowColor: 'rgba(88, 101, 242, 0.2)',
    symbol: '\u2726\u2726',
  },
  {
    key: 'legendarySannin',
    minElo: 900,
    color: '#9B59B6',
    bgColor: 'rgba(155, 89, 182, 0.1)',
    borderColor: 'rgba(155, 89, 182, 0.35)',
    glowColor: 'rgba(155, 89, 182, 0.25)',
    symbol: '\u2605',
  },
  {
    key: 'kage',
    minElo: 1050,
    color: '#C4A35A',
    bgColor: 'rgba(196, 163, 90, 0.1)',
    borderColor: 'rgba(196, 163, 90, 0.4)',
    glowColor: 'rgba(196, 163, 90, 0.3)',
    symbol: '\u2605\u2605',
  },
  {
    key: 'sageOfSixPaths',
    minElo: 1200,
    color: '#FFD700',
    bgColor: 'rgba(255, 215, 0, 0.1)',
    borderColor: 'rgba(255, 215, 0, 0.5)',
    glowColor: 'rgba(255, 215, 0, 0.35)',
    symbol: '\u2605\u2605\u2605',
  },
];

function getRankTier(elo: number): RankTier {
  let matched = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (elo >= tier.minElo) matched = tier;
  }
  return matched;
}

export function EloBadge({ elo, size = 'md', showElo = true }: EloBadgeProps) {
  const t = useTranslations('profile');
  const tier = getRankTier(elo);

  const sizes = {
    sm: { padding: '2px 8px', fontSize: '10px', symbolSize: '10px', gap: '4px' },
    md: { padding: '4px 12px', fontSize: '12px', symbolSize: '12px', gap: '6px' },
    lg: { padding: '6px 16px', fontSize: '14px', symbolSize: '14px', gap: '8px' },
  };

  const s = sizes[size];

  return (
    <div
      className="inline-flex items-center rounded-full"
      style={{
        padding: s.padding,
        backgroundColor: tier.bgColor,
        border: `1px solid ${tier.borderColor}`,
        boxShadow: `0 0 12px ${tier.glowColor}, inset 0 1px 0 rgba(255,255,255,0.05)`,
        gap: s.gap,
      }}
    >
      <span
        style={{
          color: tier.color,
          fontSize: s.symbolSize,
          lineHeight: 1,
          letterSpacing: '1px',
        }}
      >
        {tier.symbol}
      </span>
      <span
        className="font-semibold uppercase tracking-wider"
        style={{
          color: tier.color,
          fontSize: s.fontSize,
          lineHeight: 1,
          textShadow: `0 0 8px ${tier.glowColor}`,
        }}
      >
        {t(`rankNames.${tier.key}`)}
      </span>
      {showElo && (
        <span
          className="tabular-nums"
          style={{
            color: tier.color,
            fontSize: s.fontSize,
            lineHeight: 1,
            opacity: 0.7,
          }}
        >
          {elo}
        </span>
      )}
    </div>
  );
}

/**
 * Larger, more detailed badge for profile pages.
 * Includes decorative border pattern and rank description.
 */
export function EloBadgeLarge({ elo }: { elo: number }) {
  const t = useTranslations('profile');
  const tier = getRankTier(elo);

  return (
    <div
      className="relative flex flex-col items-center rounded-lg overflow-hidden"
      style={{
        backgroundColor: tier.bgColor,
        border: `1px solid ${tier.borderColor}`,
        boxShadow: `0 0 20px ${tier.glowColor}, 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)`,
        padding: '16px 24px',
        minWidth: '180px',
      }}
    >
      {/* Top decorative line */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${tier.color}, transparent)`,
          opacity: 0.5,
        }}
      />

      {/* Symbol */}
      <span
        style={{
          color: tier.color,
          fontSize: '20px',
          lineHeight: 1,
          letterSpacing: '3px',
          textShadow: `0 0 12px ${tier.glowColor}`,
          marginBottom: '8px',
        }}
      >
        {tier.symbol}
      </span>

      {/* Rank Name */}
      <span
        className="font-bold uppercase tracking-widest text-center"
        style={{
          color: tier.color,
          fontSize: '13px',
          lineHeight: 1,
          textShadow: `0 0 10px ${tier.glowColor}`,
        }}
      >
        {t(`rankNames.${tier.key}`)}
      </span>

      {/* ELO value */}
      <span
        className="tabular-nums font-bold mt-2"
        style={{
          color: tier.color,
          fontSize: '22px',
          lineHeight: 1,
          textShadow: `0 0 15px ${tier.glowColor}`,
        }}
      >
        {elo}
      </span>

      <span
        className="text-xs uppercase tracking-wider mt-1"
        style={{ color: tier.color, opacity: 0.5 }}
      >
        ELO
      </span>

      {/* Bottom decorative line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${tier.color}, transparent)`,
          opacity: 0.5,
        }}
      />
    </div>
  );
}
