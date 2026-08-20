'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import { useGameScale } from './GameScaleContext';
import { portraitImagePath } from '@/lib/utils/imagePath';
import { getCardById } from '@/lib/data/cardIndex';
import { getCardName } from '@/lib/utils/cardLocale';
import { CardArtFallback } from '@/components/cards/CardArtFallback';
import { ChakraIcon, PowerIcon, CHAKRA_COLOR, POWER_COLOR } from '@/components/icons/GameIcons';
import { Z_GAME_OVERLAY } from '@/lib/ui/zIndex';
import type { CharacterCard, PublicReveal } from '@/lib/engine/types';

const DUREE_AFFICHAGE_MS = 8000;

export function PublicRevealOverlay() {
  const t = useTranslations();
  const locale = useLocale();
  const dims = useGameScale();
  const visibleState = useGameStore((s) => s.visibleState);
  const zoomCard = useUIStore((s) => s.zoomCard);

  const revelation = visibleState?.publicReveal ?? null;
  const monCamp = visibleState?.myPlayer ?? null;

  const [affichee, setAffichee] = useState<PublicReveal | null>(null);
  const dernierIdVu = useRef<string | null>(null);
  const initialise = useRef(false);

  useEffect(() => {
    if (!initialise.current) {
      initialise.current = true;
      dernierIdVu.current = revelation?.id ?? null;
      return;
    }
    if (!revelation || revelation.id === dernierIdVu.current) return;
    dernierIdVu.current = revelation.id;
    if (monCamp && revelation.player === monCamp && !revelation.montrerALaSource) return;
    setAffichee(revelation);
  }, [revelation, monCamp]);

  useEffect(() => {
    if (!affichee) return;
    const minuteur = setTimeout(() => setAffichee(null), DUREE_AFFICHAGE_MS);
    return () => clearTimeout(minuteur);
  }, [affichee]);

  if (!affichee) return null;

  const source = affichee.sourceCardId ? getCardById(affichee.sourceCardId) : null;
  const nomSource = source ? getCardName(source, locale) : '';
  const largeur = dims.previewMed.w;
  const hauteur = dims.previewMed.h;

  return (
    <AnimatePresence>
      <motion.div
        key={affichee.id}
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -18 }}
        transition={{ type: 'spring', stiffness: 180, damping: 20 }}
        onClick={() => setAffichee(null)}
        className="fixed left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 px-5 py-4 cursor-pointer"
        style={{
          top: '12%',
          zIndex: Z_GAME_OVERLAY,
          backgroundColor: 'var(--t-surface)',
          boxShadow: '0 12px 40px var(--t-shadow)',
          maxWidth: '92vw',
        }}
      >
        <span
          className="font-display text-[11px] uppercase tracking-[0.22em] text-center"
          style={{ color: 'var(--t-accent)' }}
        >
          {t('game.publicReveal.title', { card: nomSource })}
        </span>

        <div className="flex flex-wrap gap-2 justify-center">
          {affichee.cards.map((carte, idx) => {
            const complete = carte.id ? getCardById(carte.id) : null;
            const chemin = portraitImagePath(complete ?? carte);
            return (
              <motion.div
                key={`${affichee.id}-${idx}`}
                initial={{ scale: 0.4, rotateY: 180, opacity: 0 }}
                animate={{ scale: 1, rotateY: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 130, damping: 15, delay: idx * 0.09 }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (complete) zoomCard(complete as unknown as CharacterCard);
                }}
                className="relative"
                style={{
                  width: largeur + 'px',
                  height: hauteur + 'px',
                  overflow: 'hidden',
                  boxShadow: carte.isMatch
                    ? '0 0 16px var(--t-accent-glow), 0 4px 16px var(--t-shadow)'
                    : '0 4px 16px var(--t-shadow)',
                }}
              >
                {chemin ? (
                  <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url('${chemin}')` }} />
                ) : (
                  <CardArtFallback card={carte} style={{ borderRadius: 0 }} />
                )}
                <div
                  className="absolute inset-x-0 bottom-0 px-1.5 py-1 text-center"
                  style={{ backgroundColor: 'var(--t-art-scrim)' }}
                >
                  <div className="text-[10px] font-bold" style={{ color: 'var(--t-text)' }}>
                    {complete ? getCardName(complete, locale) : carte.name_fr}
                  </div>
                </div>
                <div
                  className="absolute top-1 left-1 h-5 px-1 flex items-center justify-center text-[9px] font-bold"
                  style={{ backgroundColor: 'var(--t-art-scrim)', color: CHAKRA_COLOR, gap: '2px' }}
                >
                  <ChakraIcon size={9} color={CHAKRA_COLOR} />
                  {carte.chakra}
                </div>
                <div
                  className="absolute top-1 right-1 h-5 px-1 flex items-center justify-center text-[9px] font-bold"
                  style={{ backgroundColor: 'var(--t-art-scrim)', color: POWER_COLOR, gap: '2px' }}
                >
                  <PowerIcon size={9} color={POWER_COLOR} />
                  {carte.power}
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
