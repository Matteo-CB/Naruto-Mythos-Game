'use client';

import { useEffect, useState } from 'react';
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
  /** ISO 8601 string of the closest upcoming tournament start, or null. */
  nextStartAt?: string | null;
}

/**
 * Beautiful and subtle countdown display.
 *
 * Format adapts to the remaining duration:
 *   > 1 day   → "Xd Yh"
 *   1h to 24h → "Xh Ym"
 *   < 1 hour  → "MM:SS"
 *   live (0)  → falls back to no render (handled outside)
 *
 * Visuals: NJNaruto display font, tabular-nums, soft drop-shadow in the
 * status accent color. No animation other than the natural per-second tick.
 */
function TournamentCountdown({ targetIso, accentColor }: { targetIso: string; accentColor: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const target = new Date(targetIso).getTime();
  const diff = Math.max(0, target - now);
  if (diff === 0) return null;

  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  let label: string;
  if (days > 0)        label = `${days}d ${hours}h`;
  else if (hours > 0)  label = `${hours}h ${mins.toString().padStart(2, '0')}m`;
  else                 label = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  return (
    <span
      className="select-none"
      style={{
        fontFamily: '"NJNaruto", "Noto Serif JP", "ui-monospace", monospace',
        fontSize: '12px',
        fontWeight: 700,
        letterSpacing: '0.08em',
        color: accentColor,
        textShadow: `0 0 8px ${accentColor}55, 0 0 1px ${accentColor}33`,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

const ACCENT: Record<TournamentMenuStatus, string> = {
  none: '#c4a35a',
  available: '#c4a35a',
  registered: '#c4a35a',
  needs_deck: '#b33e3e',
  in_progress: '#3b82f6',
};

export function TournamentNavButton({ status, label, primary = false, delay = 0, nextStartAt }: Props) {
  const t = useTranslations('home');
  const isActive = status !== 'none';

  const variant = (() => {
    if (status === 'in_progress') return 'blue';
    if (status === 'needs_deck') return 'red';
    if (status === 'registered' || status === 'available') return 'gold';
    return primary ? 'primary' : 'muted';
  })() as Parameters<typeof HomeMenuButton>[0]['variant'];

  const ariaLabel: string | undefined = (() => {
    switch (status) {
      case 'available':   return t('tournamentBadgeAvailable');
      case 'registered':  return t('tournamentBadgeRegistered');
      case 'needs_deck':  return t('tournamentBadgeNeedsDeck');
      case 'in_progress': return t('tournamentBadgeInProgress');
      default: return undefined;
    }
  })();

  const accent = ACCENT[status];
  const showCountdown = isActive && status !== 'in_progress' && !!nextStartAt;
  const showLive = status === 'in_progress';

  return (
    <HomeMenuButton
      href="/tournaments"
      label={label}
      variant={variant}
      delay={delay}
      rightSlot={
        showCountdown ? (
          <span aria-label={ariaLabel} title={ariaLabel}>
            <TournamentCountdown targetIso={nextStartAt!} accentColor={accent} />
          </span>
        ) : showLive ? (
          <span
            aria-label={ariaLabel}
            title={ariaLabel}
            className="select-none uppercase"
            style={{
              fontFamily: '"NJNaruto", "Noto Serif JP", serif',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: accent,
              textShadow: `0 0 8px ${accent}55`,
            }}
          >
            {t('tournamentBadgeInProgress')}
          </span>
        ) : undefined
      }
    />
  );
}
