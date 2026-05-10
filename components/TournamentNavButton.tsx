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

/**
 * Hanko stamp: 開 (open) / 入 (registered) / 急 (urgent: deck needed) / 戦 (in progress).
 * Rendered with a feTurbulence + feDisplacementMap filter so the ink looks
 * absorbed into porous paper, not flat. Static once placed.
 */
const STAMP: Record<TournamentMenuStatus, { kanji: string; color: string } | null> = {
  none: null,
  available:    { kanji: '開', color: '#c4a35a' },
  registered:   { kanji: '入', color: '#c4a35a' },
  needs_deck:   { kanji: '急', color: '#b33e3e' },
  in_progress:  { kanji: '戦', color: '#3b82f6' },
};

function HankoStamp({ kanji, color }: { kanji: string; color: string }) {
  const filterId = useId();
  return (
    <motion.svg
      width="26"
      height="26"
      viewBox="0 0 32 32"
      initial={{ scale: 1.3, rotate: -16, opacity: 0 }}
      animate={{ scale: 1, rotate: -7, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.05 }}
      className="select-none"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="1.6" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`}>
        <rect x="2" y="2" width="28" height="28" fill="none" stroke={color} strokeWidth="2.2" />
        <rect x="4" y="4" width="24" height="24" fill={color} opacity="0.10" />
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
            <HankoStamp kanji={stamp.kanji} color={stamp.color} />
          </span>
        ) : undefined
      }
    />
  );
}
