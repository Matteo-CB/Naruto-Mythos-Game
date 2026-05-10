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
  label: string;
  primary?: boolean;
  delay?: number;
}

const STAMP: Record<TournamentMenuStatus, { kanji: string; color: string } | null> = {
  none: null,
  available:    { kanji: '開', color: '#c4a35a' },
  registered:   { kanji: '入', color: '#c4a35a' },
  needs_deck:   { kanji: '急', color: '#b33e3e' },
  in_progress:  { kanji: '戦', color: '#3b82f6' },
};

/**
 * Hanko stamp animated like real calligraphy on a sheet of paper.
 *
 * Sequence (plays once on mount, then perfectly still):
 *   1. The square frame draws itself counter-clockwise (stroke-dashoffset).
 *   2. A diagonal "ink wash" reveals the kanji from upper-left to lower-right,
 *      simulating a brush moving across the paper.
 *   3. The whole stamp settles with a tiny scale (1.06 → 1) and slight rotation
 *      (-12° → -7°), as if the stamp is being pressed onto the paper.
 *
 * No loop, no pulse, no glow afterwards.
 */
function HankoStamp({ kanji, color, statusKey }: { kanji: string; color: string; statusKey: string }) {
  const filterId = useId();
  const maskId = useId();

  return (
    <motion.svg
      key={statusKey}
      width="28"
      height="28"
      viewBox="0 0 32 32"
      initial={{ scale: 1.18, rotate: -12, opacity: 0 }}
      animate={{ scale: 1, rotate: -7, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.1 }}
      className="select-none"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="1.4" />
        </filter>
        <mask id={maskId}>
          <rect x="0" y="0" width="32" height="32" fill="black" />
          <motion.rect
            y="0"
            width="40"
            height="32"
            fill="white"
            initial={{ x: -34 }}
            animate={{ x: 0 }}
            transition={{ duration: 0.55, ease: [0.4, 0.0, 0.2, 1], delay: 0.45 }}
          />
        </mask>
      </defs>
      <g filter={`url(#${filterId})`}>
        {/* Soft ink fill, faint, fades in slightly behind the kanji */}
        <motion.rect
          x="4"
          y="4"
          width="24"
          height="24"
          fill={color}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.10 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        />
        {/* Frame drawn around the perimeter, draws itself */}
        <motion.rect
          x="2"
          y="2"
          width="28"
          height="28"
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeDasharray="112"
          initial={{ strokeDashoffset: 112 }}
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.05 }}
        />
        {/* Kanji painted in via a left-to-right ink-wash mask */}
        <g mask={`url(#${maskId})`}>
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
      </g>
    </motion.svg>
  );
}

export function TournamentNavButton({ status, label, primary = false, delay = 0 }: Props) {
  const t = useTranslations('home');
  const stamp = STAMP[status];

  const variant = (() => {
    if (status === 'in_progress') return 'blue';
    if (status === 'needs_deck') return 'red';
    if (status === 'registered' || status === 'available') return 'gold';
    return primary ? 'primary' : 'muted';
  })() as Parameters<typeof HomeMenuButton>[0]['variant'];

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
      label={label}
      variant={variant}
      delay={delay}
      rightSlot={
        stamp ? (
          <span aria-label={stampLabel} title={stampLabel}>
            <HankoStamp kanji={stamp.kanji} color={stamp.color} statusKey={status} />
          </span>
        ) : undefined
      }
    />
  );
}
