'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { BoosterInventoryEntry } from '@/lib/hooks/useBoosterInventory';
import { BOOSTER_FALLBACK_IMAGE, getSetNumber, getSetName } from '@/lib/data/sets/registry';

function handleBoosterError(e: React.SyntheticEvent<HTMLImageElement>) {
  const t = e.currentTarget;
  if (!t.src.endsWith(BOOSTER_FALLBACK_IMAGE)) t.src = BOOSTER_FALLBACK_IMAGE;
}

interface BoosterSetTileProps {
  entry: BoosterInventoryEntry;
  locale: string;
  countLabel: string;
  perBoosterLabel: string;
  openLabel: string;
  comingSoonLabel: string;
  onOpen: () => void;
  disabled?: boolean;
}

export function BoosterSetTile({
  entry,
  locale,
  countLabel,
  perBoosterLabel,
  openLabel,
  comingSoonLabel,
  onOpen,
  disabled,
}: BoosterSetTileProps) {
  const reduceMotion = useReducedMotion();
  const [hovering, setHovering] = useState(false);
  const isComingSoon = entry.status === 'coming_soon';
  const canOpen = !isComingSoon && entry.count > 0 && !disabled;
  const name = getSetName(entry.setId, locale);
  const subtitle = perBoosterLabel;
  const tilt = !reduceMotion && hovering && !isComingSoon ? 4 : 0;
  const setNumber = getSetNumber(entry.setId);
  const setNumberLabel = setNumber != null ? `N° ${String(setNumber).padStart(2, '0')}` : null;

  return (
    <div
      className="relative flex flex-col items-stretch"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        backgroundColor: '#111111',
        padding: 20,
        boxShadow: hovering ? '0 16px 40px rgba(0,0,0,0.55)' : '0 12px 32px rgba(0,0,0,0.4)',
        width: 280,
        flex: '0 0 280px',
        transition: 'box-shadow 220ms ease-out',
      }}
    >
      {setNumberLabel && (
        <div
          className="font-display absolute text-[10px] uppercase tracking-[0.25em] pointer-events-none"
          style={{ top: 10, left: 14, color: isComingSoon ? '#5a5a5a' : '#c4a35a', opacity: isComingSoon ? 0.7 : 0.92 }}
        >
          {setNumberLabel}
        </div>
      )}
      <div className="relative flex items-center justify-center" style={{ height: 280, perspective: 1200 }}>
        {reduceMotion ? (
          <img
            src={entry.boosterImage || BOOSTER_FALLBACK_IMAGE}
            onError={handleBoosterError}
            alt={name}
            style={{ maxWidth: 220, maxHeight: 280, opacity: isComingSoon ? 0.4 : 1 }}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <motion.img
            src={entry.boosterImage || BOOSTER_FALLBACK_IMAGE}
            onError={handleBoosterError}
            alt={name}
            style={{ maxWidth: 220, maxHeight: 280, opacity: isComingSoon ? 0.4 : 1, transformStyle: 'preserve-3d' }}
            loading="lazy"
            decoding="async"
            animate={{ y: [0, -4, 0], rotateY: tilt }}
            transition={{ y: { duration: 3.4, repeat: Infinity, ease: 'easeInOut' }, rotateY: { duration: 0.22, ease: 'easeOut' } }}
          />
        )}
      </div>

      <div
        className="font-display uppercase tracking-wider mt-3"
        style={{ color: '#e8e8e8', fontSize: 22, letterSpacing: '0.12em' }}
      >
        {name}
      </div>
      <div className="font-body" style={{ color: '#777', fontSize: 13, marginTop: 4 }}>
        {subtitle}
      </div>
      <div
        className="font-display uppercase tracking-wider mt-3"
        style={{
          color: entry.count > 0 ? '#c4a35a' : '#777',
          fontSize: 14,
          letterSpacing: '0.12em',
        }}
      >
        {countLabel}
      </div>

      <button
        type="button"
        onClick={onOpen}
        disabled={!canOpen}
        className="mt-4 py-3 font-display uppercase tracking-wider transition-all"
        style={{
          backgroundColor: canOpen ? '#c4a35a1f' : '#1a1a1a',
          color: canOpen ? '#c4a35a' : '#555',
          fontSize: 14,
          letterSpacing: '0.18em',
          cursor: canOpen ? 'pointer' : 'not-allowed',
          opacity: canOpen ? 1 : 0.6,
          boxShadow: canOpen ? '0 0 12px #c4a35a33' : 'none',
        }}
      >
        {isComingSoon ? comingSoonLabel : openLabel}
      </button>
    </div>
  );
}
