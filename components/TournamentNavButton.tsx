'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { HomeMenuButton } from './HomeMenuButton';
import '@/styles/holo-menu.css';

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

const ACCENT: Record<TournamentMenuStatus, string> = {
  none: '#c4a35a',
  available: '#c4a35a',
  registered: '#c4a35a',
  needs_deck: '#b33e3e',
  in_progress: '#3b82f6',
};

/**
 * Eye-catching but tasteful countdown. Inter Display 600, tabular numerals,
 * sat inside a faint pill in the status accent color. The colon between
 * units pulses like a real clock display.
 *
 * Format adapts to the remaining duration:
 *   > 24h  → "Xd  Yh"
 *   > 1h   → "Xh : Ym"
 *   < 1h   → "MM : SS"
 *   = 0    → returns null (caller handles)
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

  let parts: { left: string; right: string; suffixLeft: string; suffixRight: string };
  if (days > 0) {
    parts = { left: String(days), right: String(hours), suffixLeft: 'd', suffixRight: 'h' };
  } else if (hours > 0) {
    parts = { left: String(hours), right: mins.toString().padStart(2, '0'), suffixLeft: 'h', suffixRight: 'm' };
  } else {
    parts = { left: mins.toString().padStart(2, '0'), right: secs.toString().padStart(2, '0'), suffixLeft: '', suffixRight: '' };
  }

  return (
    <span
      className="select-none inline-flex items-center"
      style={{
        fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
        fontSize: '12px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        color: accentColor,
        backgroundColor: `${accentColor}14`,
        border: `1px solid ${accentColor}33`,
        borderRadius: '4px',
        padding: '3px 8px',
        gap: '2px',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        textShadow: `0 0 8px ${accentColor}33`,
      }}
    >
      <span>{parts.left}</span>
      {parts.suffixLeft && <span style={{ fontSize: '10px', opacity: 0.7, marginRight: '3px' }}>{parts.suffixLeft}</span>}
      <span className="holo-clock-colon" style={{ marginInline: '1px' }}>:</span>
      <span>{parts.right}</span>
      {parts.suffixRight && <span style={{ fontSize: '10px', opacity: 0.7 }}>{parts.suffixRight}</span>}
    </span>
  );
}

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
      innerClassName={isActive ? 'holo-menu-foil' : ''}
      innerStyle={isActive ? { '--foil': accent } : undefined}
      rightSlot={
        showCountdown ? (
          <span aria-label={ariaLabel} title={ariaLabel}>
            <TournamentCountdown targetIso={nextStartAt!} accentColor={accent} />
          </span>
        ) : showLive ? (
          <span
            aria-label={ariaLabel}
            title={ariaLabel}
            className="select-none inline-flex items-center"
            style={{
              fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: accent,
              backgroundColor: `${accent}14`,
              border: `1px solid ${accent}33`,
              borderRadius: '4px',
              padding: '3px 8px',
              textTransform: 'uppercase',
              textShadow: `0 0 8px ${accent}33`,
            }}
          >
            {t('tournamentBadgeInProgress')}
          </span>
        ) : undefined
      }
    />
  );
}
