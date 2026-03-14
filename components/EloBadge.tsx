'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';

export const PLACEMENT_MATCHES_REQUIRED = 5;

export function isPlaced(user: { wins: number; losses: number; draws: number }): boolean {
  return user.wins + user.losses + user.draws >= PLACEMENT_MATCHES_REQUIRED;
}

interface EloBadgeProps {
  elo: number;
  size?: 'sm' | 'md' | 'lg';
  showElo?: boolean;
  totalGames?: number;
}

export interface RankTier {
  key: string;
  minElo: number;
  color: string;
  bgColor: string;
  borderColor: string;
  glowColor: string;
  symbol: string;
  image: string;
}

export const RANK_TIERS: RankTier[] = [
  {
    key: 'academyStudent',
    minElo: 0,
    color: '#888888',
    bgColor: 'rgba(136, 136, 136, 0.08)',
    borderColor: 'rgba(136, 136, 136, 0.25)',
    glowColor: 'rgba(136, 136, 136, 0.15)',
    symbol: '\u2022',
    image: '/images/leagues/academy-student.webp',
  },
  {
    key: 'genin',
    minElo: 450,
    color: '#3E8B3E',
    bgColor: 'rgba(62, 139, 62, 0.08)',
    borderColor: 'rgba(62, 139, 62, 0.3)',
    glowColor: 'rgba(62, 139, 62, 0.15)',
    symbol: '\u25C6',
    image: '/images/leagues/genin.webp',
  },
  {
    key: 'chunin',
    minElo: 550,
    color: '#B37E3E',
    bgColor: 'rgba(179, 126, 62, 0.08)',
    borderColor: 'rgba(179, 126, 62, 0.3)',
    glowColor: 'rgba(179, 126, 62, 0.15)',
    symbol: '\u25C6\u25C6',
    image: '/images/leagues/chunin.webp',
  },
  {
    key: 'specialJonin',
    minElo: 650,
    color: '#5A7ABB',
    bgColor: 'rgba(90, 122, 187, 0.08)',
    borderColor: 'rgba(90, 122, 187, 0.3)',
    glowColor: 'rgba(90, 122, 187, 0.15)',
    symbol: '\u2726',
    image: '/images/leagues/special-jonin.webp',
  },
  {
    key: 'eliteJonin',
    minElo: 750,
    color: '#5865F2',
    bgColor: 'rgba(88, 101, 242, 0.08)',
    borderColor: 'rgba(88, 101, 242, 0.3)',
    glowColor: 'rgba(88, 101, 242, 0.2)',
    symbol: '\u2726\u2726',
    image: '/images/leagues/elite-jonin.webp',
  },
  {
    key: 'legendarySannin',
    minElo: 900,
    color: '#9B59B6',
    bgColor: 'rgba(155, 89, 182, 0.1)',
    borderColor: 'rgba(155, 89, 182, 0.35)',
    glowColor: 'rgba(155, 89, 182, 0.25)',
    symbol: '\u2605',
    image: '/images/leagues/legendary-sannin.webp',
  },
  {
    key: 'kage',
    minElo: 1050,
    color: '#C4A35A',
    bgColor: 'rgba(196, 163, 90, 0.1)',
    borderColor: 'rgba(196, 163, 90, 0.4)',
    glowColor: 'rgba(196, 163, 90, 0.3)',
    symbol: '\u2605\u2605',
    image: '/images/leagues/kage.webp',
  },
  {
    key: 'sageOfSixPaths',
    minElo: 1200,
    color: '#FFD700',
    bgColor: 'rgba(255, 215, 0, 0.1)',
    borderColor: 'rgba(255, 215, 0, 0.5)',
    glowColor: 'rgba(255, 215, 0, 0.35)',
    symbol: '\u2605\u2605\u2605',
    image: '/images/leagues/sage-of-six-paths.webp',
  },
];

export function getRankTier(elo: number): RankTier {
  let matched = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (elo >= tier.minElo) matched = tier;
  }
  return matched;
}

export function EloBadge({ elo, size = 'md', showElo = true, totalGames }: EloBadgeProps) {
  const t = useTranslations('profile');
  const tier = getRankTier(elo);
  const unranked = totalGames !== undefined && totalGames < PLACEMENT_MATCHES_REQUIRED;

  const sizes = {
    sm: { padding: '2px 6px', fontSize: '10px', imgSize: 16, gap: '4px' },
    md: { padding: '4px 10px', fontSize: '12px', imgSize: 22, gap: '6px' },
    lg: { padding: '6px 14px', fontSize: '14px', imgSize: 28, gap: '8px' },
  };

  const s = sizes[size];

  const displayColor = unranked ? '#666666' : tier.color;
  const displayBg = unranked ? 'rgba(100, 100, 100, 0.08)' : tier.bgColor;
  const displayBorder = unranked ? 'rgba(100, 100, 100, 0.25)' : tier.borderColor;
  const displayGlow = unranked ? 'rgba(100, 100, 100, 0.1)' : tier.glowColor;

  return (
    <div
      className="inline-flex items-center rounded-full"
      style={{
        padding: s.padding,
        backgroundColor: displayBg,
        border: `1px solid ${displayBorder}`,
        boxShadow: `0 0 12px ${displayGlow}, inset 0 1px 0 rgba(255,255,255,0.05)`,
        gap: s.gap,
      }}
    >
      {unranked ? (
        <span
          style={{
            color: displayColor,
            fontSize: s.fontSize,
            lineHeight: 1,
            fontWeight: 700,
          }}
        >
          ?
        </span>
      ) : (
        <Image
          src={tier.image}
          alt=""
          width={s.imgSize}
          height={s.imgSize}
          unoptimized
          className="shrink-0"
          style={{ filter: `drop-shadow(0 0 4px ${tier.glowColor})` }}
        />
      )}
      <span
        className="font-semibold uppercase tracking-wider"
        style={{
          color: displayColor,
          fontSize: s.fontSize,
          lineHeight: 1,
          textShadow: unranked ? 'none' : `0 0 8px ${displayGlow}`,
        }}
      >
        {unranked ? t('rankNames.unranked') : t(`rankNames.${tier.key}`)}
      </span>
      {showElo && (
        <span
          className="tabular-nums"
          style={{
            color: displayColor,
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
 * Includes league image and rank description.
 */
export function EloBadgeLarge({ elo, totalGames }: { elo: number; totalGames?: number }) {
  const t = useTranslations('profile');
  const tier = getRankTier(elo);
  const unranked = totalGames !== undefined && totalGames < PLACEMENT_MATCHES_REQUIRED;

  const displayColor = unranked ? '#666666' : tier.color;
  const displayBg = unranked ? 'rgba(100, 100, 100, 0.08)' : tier.bgColor;
  const displayBorder = unranked ? 'rgba(100, 100, 100, 0.25)' : tier.borderColor;
  const displayGlow = unranked ? 'rgba(100, 100, 100, 0.1)' : tier.glowColor;

  return (
    <div
      className="relative flex flex-col items-center rounded-lg overflow-hidden"
      style={{
        backgroundColor: displayBg,
        border: `1px solid ${displayBorder}`,
        boxShadow: `0 0 20px ${displayGlow}, 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)`,
        padding: '16px 24px',
        minWidth: '180px',
      }}
    >
      {/* Top decorative line */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${displayColor}, transparent)`,
          opacity: 0.5,
        }}
      />

      {/* League image or unranked symbol */}
      {unranked ? (
        <span
          style={{
            color: displayColor,
            fontSize: '28px',
            lineHeight: 1,
            marginBottom: '8px',
            fontWeight: 700,
          }}
        >
          ?
        </span>
      ) : (
        <Image
          src={tier.image}
          alt=""
          width={56}
          height={56}
          unoptimized
          style={{
            filter: `drop-shadow(0 0 8px ${tier.glowColor})`,
            marginBottom: '8px',
          }}
        />
      )}

      {/* Rank Name */}
      <span
        className="font-bold uppercase tracking-widest text-center"
        style={{
          color: displayColor,
          fontSize: '13px',
          lineHeight: 1,
          textShadow: unranked ? 'none' : `0 0 10px ${displayGlow}`,
        }}
      >
        {unranked ? t('rankNames.unranked') : t(`rankNames.${tier.key}`)}
      </span>

      {/* ELO value */}
      <span
        className="tabular-nums font-bold mt-2"
        style={{
          color: displayColor,
          fontSize: '22px',
          lineHeight: 1,
          textShadow: unranked ? 'none' : `0 0 15px ${displayGlow}`,
        }}
      >
        {elo}
      </span>

      <span
        className="text-xs uppercase tracking-wider mt-1"
        style={{ color: displayColor, opacity: 0.5 }}
      >
        ELO
      </span>

      {/* Placement progress for unranked */}
      {unranked && totalGames !== undefined && (
        <div className="flex flex-col items-center mt-3 w-full">
          <span
            className="text-xs uppercase tracking-wider mb-1"
            style={{ color: '#999' }}
          >
            {t('rankNames.placement', { current: totalGames, total: PLACEMENT_MATCHES_REQUIRED })}
          </span>
          <div
            className="w-full rounded-full overflow-hidden"
            style={{ height: '4px', backgroundColor: 'rgba(255,255,255,0.08)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${(totalGames / PLACEMENT_MATCHES_REQUIRED) * 100}%`,
                backgroundColor: '#666',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Bottom decorative line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${displayColor}, transparent)`,
          opacity: 0.5,
        }}
      />
    </div>
  );
}
