'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { getCardName } from '@/lib/utils/cardLocale';
import type { CardData } from '@/lib/engine/types';
import { VariantHoloOverlay } from '@/components/cards/VariantHoloOverlay';
import { normalizeImagePath , portraitImagePath } from '@/lib/utils/imagePath';

type Rarity = 'RA' | 'MV' | 'SV' | 'L';

interface BoosterRevealCardProps {
  card: CardData;
  isDuplicate: boolean;
  flipDelayMs: number;
  duplicateXp: number;
  finaleZoom?: boolean;
  finaleZoomDelayMs?: number;
  instantReveal?: boolean;
}

const RARITY_COLOR: Record<Rarity, string> = {
  RA: 'var(--t-accent)',
  MV: '#5fa3df',
  SV: '#9b59b6',
  L: 'var(--t-danger)',
};

export function BoosterRevealCard({
  card,
  isDuplicate,
  flipDelayMs,
  duplicateXp,
  finaleZoom = false,
  finaleZoomDelayMs = 0,
  instantReveal = false,
}: BoosterRevealCardProps) {
  const reduceMotion = useReducedMotion();
  const locale = useLocale();
  const tSuffix = useTranslations('cardMeta.raritySuffix');
  const [flipped, setFlipped] = useState(instantReveal);
  const [zooming, setZooming] = useState(false);
  const imgPath = portraitImagePath(card);
  const rarity = card.rarity as Rarity;
  const accent = RARITY_COLOR[rarity] ?? '#e8e8e8';

  useEffect(() => {
    if (instantReveal) {
      setFlipped(true);
      return;
    }
    const timer = setTimeout(() => setFlipped(true), flipDelayMs);
    return () => clearTimeout(timer);
  }, [flipDelayMs, instantReveal]);

  useEffect(() => {
    if (!finaleZoom || reduceMotion) return;
    const t = setTimeout(() => setZooming(true), finaleZoomDelayMs);
    return () => clearTimeout(t);
  }, [finaleZoom, finaleZoomDelayMs, reduceMotion]);

  const cardWidth = 160;
  const cardHeight = 220;

  return (
    <motion.div
      className="relative"
      style={{ width: cardWidth, height: cardHeight, perspective: 1200 }}
      animate={zooming && !reduceMotion ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={{ duration: 1.4, ease: [0.22, 0.61, 0.36, 1] }}
    >
      <motion.div
        animate={reduceMotion ? { opacity: flipped ? 1 : 0 } : { rotateY: flipped ? 0 : -180 }}
        transition={{ duration: instantReveal ? 0 : (reduceMotion ? 0.3 : 0.7), ease: [0.22, 0.61, 0.36, 1] }}
        style={{
          position: 'absolute',
          inset: 0,
          transformStyle: 'preserve-3d',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            backgroundColor: 'var(--t-bg)',
            boxShadow: '0 8px 24px var(--t-shadow)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: 56, height: 56, backgroundColor: `${accent}33`, boxShadow: `0 0 16px ${accent}55` }} />
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            backgroundColor: 'var(--t-panel)',
            overflow: 'hidden',
          }}
        >
          {imgPath ? (
            <img
              src={imgPath}
              alt={getCardName(card, locale)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              loading="eager"
              decoding="async"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--t-dim)', fontSize: 11 }}>
              {getCardName(card, locale)}
            </div>
          )}
          {flipped && <VariantHoloOverlay intensity="subtle" imageUrl={imgPath} />}
        </div>
      </motion.div>

      {flipped && (
        <motion.div
          className="font-display uppercase tracking-wider"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.6 }}
          style={{
            position: 'absolute',
            bottom: -22,
            left: 0,
            right: 0,
            textAlign: 'center',
            color: accent,
            fontSize: 10,
            letterSpacing: '0.18em',
            textShadow: `0 0 8px ${accent}66`,
          }}
        >
          {tSuffix.has(rarity) ? tSuffix(rarity) : rarity}
        </motion.div>
      )}

      {flipped && isDuplicate && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 0.85, scale: 1 }}
          transition={{ duration: 0.32, delay: 0.7 }}
          className="absolute top-1 left-1 px-1.5 py-0.5"
          style={{
            backgroundColor: 'var(--t-accent)1f',
            color: 'var(--t-accent)',
            fontSize: 9,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          +{duplicateXp} XP
        </motion.div>
      )}
    </motion.div>
  );
}
