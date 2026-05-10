'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
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
 * Mapping the tournament state to a single Japanese character used as a hanko (signature stamp).
 *
 *   開 (kai)   = "open"      → tournament accepting registrations
 *   入 (nyuu)  = "entered"   → user is registered
 *   急 (kyuu)  = "urgent"    → user must select a deck
 *   戦 (sen)   = "battle"    → tournament currently in progress
 *
 * Static once placed. No pulse, no glow.
 */
const STAMP: Record<TournamentMenuStatus, { kanji: string; color: string; bg: string } | null> = {
  none: null,
  available:    { kanji: '開', color: '#c4a35a', bg: 'rgba(196,163,90,0.10)' },
  registered:   { kanji: '入', color: '#c4a35a', bg: 'rgba(196,163,90,0.18)' },
  needs_deck:   { kanji: '急', color: '#b33e3e', bg: 'rgba(179,62,62,0.18)' },
  in_progress:  { kanji: '戦', color: '#3b82f6', bg: 'rgba(59,130,246,0.18)' },
};

function HankoStamp({ kanji, color, bg }: { kanji: string; color: string; bg: string }) {
  return (
    <motion.span
      initial={{ scale: 1.25, rotate: -14, opacity: 0 }}
      animate={{ scale: 1, rotate: -8, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 360, damping: 22, delay: 0.05 }}
      className="inline-flex items-center justify-center select-none"
      style={{
        width: '28px',
        height: '28px',
        backgroundColor: bg,
        border: `1px solid ${color}`,
        color: color,
        fontFamily: '"NJNaruto", "Noto Serif JP", serif',
        fontWeight: 900,
        fontSize: '15px',
        lineHeight: 1,
        // Slight inset to feel like ink absorbed by paper, not a flat box
        boxShadow: `inset 0 0 4px ${color}33`,
      }}
    >
      {kanji}
    </motion.span>
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

  const ariaStatus: string | undefined = (() => {
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
          <span aria-label={ariaStatus} title={ariaStatus}>
            <HankoStamp kanji={stamp.kanji} color={stamp.color} bg={stamp.bg} />
          </span>
        ) : undefined
      }
    />
  );
}
