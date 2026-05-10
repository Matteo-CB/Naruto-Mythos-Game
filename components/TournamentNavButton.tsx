'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useId, useRef, useCallback } from 'react';
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
}

const STAMP: Record<TournamentMenuStatus, { kanji: string } | null> = {
  none: null,
  available:    { kanji: '開' },
  registered:   { kanji: '入' },
  needs_deck:   { kanji: '急' },
  in_progress:  { kanji: '戦' },
};

/**
 * Hanko stamp painted in calligraphy on first appear.
 * The kanji uses the .holo-kanji class so its strokes shimmer through the rainbow foil.
 */
function HankoStamp({ kanji, statusKey }: { kanji: string; statusKey: string }) {
  const filterId = useId();
  const maskId = useId();
  const gradientId = useId();

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
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#ff7773" />
          <stop offset="20%"  stopColor="#ffed5f" />
          <stop offset="40%"  stopColor="#a8ff5f" />
          <stop offset="60%"  stopColor="#83fff7" />
          <stop offset="80%"  stopColor="#7894ff" />
          <stop offset="100%" stopColor="#d875ff" />
        </linearGradient>
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
        <motion.rect
          x="4"
          y="4"
          width="24"
          height="24"
          fill={`url(#${gradientId})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.18 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        />
        <motion.rect
          x="2"
          y="2"
          width="28"
          height="28"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="2.4"
          strokeDasharray="112"
          initial={{ strokeDashoffset: 112 }}
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.05 }}
        />
        <g mask={`url(#${maskId})`}>
          <text
            x="16"
            y="22"
            textAnchor="middle"
            fontFamily='"NJNaruto", "Noto Serif JP", serif'
            fontWeight="900"
            fontSize="18"
            fill={`url(#${gradientId})`}
            style={{
              filter: 'drop-shadow(0 0 1.5px rgba(255, 255, 255, 0.5))',
            }}
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
  const isActive = stamp !== null;

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

  // Track the cursor over the button so the foil iridescence shifts
  // with the mouse position (CSS vars --posx and --posy are read by
  // the holographic gradient overlay defined in styles/holo-menu.css).
  const rafRef = useRef<number | null>(null);
  const handleMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!isActive) return;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      target.style.setProperty('--posx', `${px}%`);
      target.style.setProperty('--posy', `${py}%`);
    });
  }, [isActive]);
  const handleLeave = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!isActive) return;
    const target = e.currentTarget as HTMLElement;
    target.style.setProperty('--posx', '50%');
    target.style.setProperty('--posy', '50%');
  }, [isActive]);

  return (
    <HomeMenuButton
      href="/tournaments"
      label={label}
      variant={variant}
      delay={delay}
      innerClassName={isActive ? 'holo-menu-foil' : ''}
      innerData={{ 'data-foil': isActive ? 'on' : undefined }}
      onMouseMoveExtra={handleMove}
      onMouseLeaveExtra={handleLeave}
      rightSlot={
        stamp ? (
          <span aria-label={stampLabel} title={stampLabel}>
            <HankoStamp kanji={stamp.kanji} statusKey={status} />
          </span>
        ) : undefined
      }
    />
  );
}
