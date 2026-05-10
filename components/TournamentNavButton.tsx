'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { HomeMenuButton } from './HomeMenuButton';

export type TournamentMenuStatus =
  | 'none'
  | 'available'
  | 'registered'
  | 'needs_deck'
  | 'in_progress';

interface Props {
  status: TournamentMenuStatus;
  index: number;
  label: string;
  primary?: boolean;
  delay?: number;
}

/**
 * Mapping the tournament state to a single Japanese character used as a hanko (signature stamp).
 *
 *   開 (kai)   = "open"      → tournament accepting registrations
 *   入 (nyuu)  = "entered"   → user is registered
 *   急 (kyuu)  = "urgent"    → user must select a deck
 *   戦 (sen)   = "battle"    → tournament currently in progress
 *
 * Static once placed. No pulse, no glow.
 */
const STAMP: Record<TournamentMenuStatus, { kanji: string; color: string } | null> = {
  none: null,
  available:    { kanji: '開', color: '#c4a35a' },
  registered:   { kanji: '入', color: '#c4a35a' },
  needs_deck:   { kanji: '急', color: '#b33e3e' },
  in_progress:  { kanji: '戦', color: '#3b82f6' },
};

/**
 * Hanko stamp rendered as an SVG square with the kanji centered.
 *
 * Authenticity: a turbulence + displacement filter is applied to the whole stamp,
 * which roughens the edges so the box and the glyph look like ink absorbed
 * unevenly into porous paper. This is what makes it stop looking like a generic
 * UI badge.
 */
function HankoStamp({ kanji, color }: { kanji: string; color: string }) {
  const filterId = useId();
  return (
    <motion.svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      initial={{ scale: 1.3, rotate: -16, opacity: 0 }}
      animate={{ scale: 1, rotate: -7, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.05 }}
      className="select-none"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          {/* Generate noise */}
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
          {/* Displace the source pixels by the noise — gives ink-bleed irregularity */}
          <feDisplacementMap in="SourceGraphic" scale="1.6" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`}>
        {/* Outer ink ring (square) */}
        <rect
          x="2"
          y="2"
          width="28"
          height="28"
          fill="none"
          stroke={color}
          strokeWidth="2.2"
        />
        {/* Inner soft fill, slightly translucent to read like ink soaking the paper */}
        <rect
          x="4"
          y="4"
          width="24"
          height="24"
          fill={color}
          opacity="0.10"
        />
        {/* Centered kanji */}
        <text
          x="16"
          y="22"
          textAnchor="middle"
          fontFamily='"NJNaruto", "Noto Serif JP", serif'
          fontWeight="900"
          fontSize="18"
          fill={color}
        >
          {kanji}
        </text>
      </g>
    </motion.svg>
  );
}

export function TournamentNavButton({ status, index, label, primary = false, delay = 0 }: Props) {
  const t = useTranslations('home');
  const stamp = STAMP[status];
  const isActive = stamp !== null;

  const variant = (() => {
    if (status === 'in_progress') return 'blue';
    if (status === 'needs_deck') return 'red';
    if (status === 'registered' || status === 'available') return 'gold';
    return primary ? 'primary' : 'muted';
  })() as Parameters<typeof HomeMenuButton>[0]['variant'];

  // Caption changes based on status — gives the user instant context for "why is this lit?"
  const caption: string = (() => {
    switch (status) {
      case 'available':   return t('tournamentCaptionAvailable');
      case 'registered':  return t('tournamentCaptionRegistered');
      case 'needs_deck':  return t('tournamentCaptionNeedsDeck');
      case 'in_progress': return t('tournamentCaptionInProgress');
      default:            return t('tournamentCaptionDefault');
    }
  })();

  const stampLabel: string | undefined = (() => {
    switch (status) {
      case 'available':   return t('tournamentBadgeAvailable');
      case 'registered':  return t('tournamentBadgeRegistered');
      case 'needs_deck':  return t('tournamentBadgeNeedsDeck');
      case 'in_progress': return t('tournamentBadgeInProgress');
      default: return undefined;
    }
  })();

  return (
    <HomeMenuButton
      href="/tournaments"
      index={index}
      label={label}
      caption={caption}
      variant={variant}
      delay={delay}
      active={isActive}
      rightSlot={
        stamp ? (
          <span aria-label={stampLabel} title={stampLabel}>
            <HankoStamp kanji={stamp.kanji} color={stamp.color} />
          </span>
        ) : undefined
      }
    />
  );
}
