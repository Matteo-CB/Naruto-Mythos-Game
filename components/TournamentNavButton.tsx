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

const MENU_ACCENT = 'var(--t-accent)';

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

  type Unit = { value: string; suffix: string };
  let units: Unit[];
  if (days > 0) {
    units = [
      { value: String(days), suffix: 'd' },
      { value: hours.toString().padStart(2, '0'), suffix: 'h' },
      { value: mins.toString().padStart(2, '0'), suffix: 'm' },
    ];
  } else if (hours > 0) {
    units = [
      { value: String(hours), suffix: 'h' },
      { value: mins.toString().padStart(2, '0'), suffix: 'm' },
      { value: secs.toString().padStart(2, '0'), suffix: 's' },
    ];
  } else {
    units = [
      { value: mins.toString().padStart(2, '0'), suffix: 'm' },
      { value: secs.toString().padStart(2, '0'), suffix: 's' },
    ];
  }

  return (
    <span
      className="select-none inline-flex items-center justify-center"
      style={{
        fontFamily: 'Nevanta, system-ui, sans-serif',
        fontSize: '12px',
        fontWeight: 700,
        letterSpacing: '0.02em',
        color: accentColor,
        backgroundColor: 'rgba(10, 10, 12, 0.62)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        border: `1px solid ${accentColor}`,
        borderRadius: '4px',
        padding: '4px 10px',
        gap: '7px',
        minWidth: '92px',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        boxShadow: `0 4px 12px var(--t-shadow), 0 0 0 1px var(--t-shadow), 0 0 14px ${accentColor}33`,
      }}
    >
      {units.map((u, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '1px' }}>
          <span>{u.value}</span>
          <span style={{ fontSize: '9px', opacity: 0.7, fontWeight: 600 }}>{u.suffix}</span>
        </span>
      ))}
    </span>
  );
}

export function TournamentNavButton({ status, label, primary = false, delay = 0, nextStartAt }: Props) {
  const t = useTranslations('home');
  const isActive = status !== 'none';

  const variant = (() => {
    if (status === 'in_progress') return 'gold';
    if (status === 'needs_deck') return 'gold';
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

  const accent = MENU_ACCENT;
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
              fontFamily: 'Nevanta, system-ui, sans-serif',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: accent,
              backgroundColor: 'rgba(10, 10, 12, 0.62)',
              backdropFilter: 'blur(3px)',
              WebkitBackdropFilter: 'blur(3px)',
              border: `1px solid ${accent}`,
              borderRadius: '4px',
              padding: '4px 10px',
              textTransform: 'uppercase',
              boxShadow: `0 4px 12px var(--t-shadow), 0 0 0 1px var(--t-shadow), 0 0 14px ${accent}33`,
            }}
          >
            {t('tournamentBadgeInProgress')}
          </span>
        ) : undefined
      }
    />
  );
}
