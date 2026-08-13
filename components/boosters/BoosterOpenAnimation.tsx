'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { compareBySetOrder } from '@/lib/cards/order';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { CardData } from '@/lib/engine/types';
import type { BoosterCard } from '@/lib/sealed/boosterGenerator';
import { CardReveal } from '@/components/sealed/CardReveal';

interface BoosterOpenAnimationProps {
  cards: CardData[];
  duplicateCardIds: ReadonlyArray<string>;
  onClose: () => void;
  setLabel: string;
  boosterImage?: string;
}

type Stage = 'ready' | 'shaking' | 'opening' | 'revealing' | 'done';

const RARITY_ORDER: Record<string, number> = { C: 0, UC: 1, R: 2, RA: 3, S: 4, SV: 4, M: 5, MV: 5, L: 6 };

export function BoosterOpenAnimation({ cards, duplicateCardIds, onClose, setLabel, boosterImage }: BoosterOpenAnimationProps) {
  const t = useTranslations('boosters');
  const [stage, setStage] = useState<Stage>('ready');
  const revealedCountRef = useRef(0);
  const isTransitioningRef = useRef(false);

  const duplicateSet = useMemo(() => new Set(duplicateCardIds), [duplicateCardIds]);

  const sortedCards: BoosterCard[] = useMemo(() => {
    return [...cards]
      .sort((a, b) => (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0)
        || compareBySetOrder(a, b))
      .map((c, i) => ({
        ...c,
        sealedInstanceId: `${c.cardId}-${i}`,
        isHolo: c.isHolo === true || c.rarity === 'M' || c.rarity === 'MV' || c.rarity === 'S' || c.rarity === 'SV' || c.rarity === 'L',
      }));
  }, [cards]);

  const handleBoosterTap = useCallback(() => {
    if (stage !== 'ready') return;
    setStage('shaking');
    setTimeout(() => {
      setStage('opening');
      setTimeout(() => {
        revealedCountRef.current = 0;
        isTransitioningRef.current = false;
        setStage('revealing');
      }, 800);
    }, 600);
  }, [stage]);

  useEffect(() => {
    if (stage !== 'ready') return;
    const id = setTimeout(() => {
      handleBoosterTap();
    }, 5000);
    return () => clearTimeout(id);
  }, [stage, handleBoosterTap]);

  const handleCardRevealed = useCallback(() => {
    if (isTransitioningRef.current) return;
    revealedCountRef.current += 1;
    if (revealedCountRef.current >= sortedCards.length) {
      isTransitioningRef.current = true;
      setTimeout(() => setStage('done'), 600);
    }
  }, [sortedCards.length]);

  return (
    <div
      className="fixed inset-0 z-55 flex flex-col items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={t('animation.aria')}
      style={{ backgroundColor: 'var(--t-bg)' }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 text-xs text-[var(--t-muted)] hover:text-[var(--t-text)] underline z-50"
      >
        {t('animation.skip')}
      </button>

      <motion.div
        className="absolute top-4 left-1/2 -translate-x-1/2 z-50 font-display uppercase tracking-wider"
        style={{ color: 'var(--t-accent)', fontSize: 11, letterSpacing: '0.18em' }}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {setLabel}
      </motion.div>

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={`particle-${i}`}
            className="absolute rounded-full"
            style={{
              width: Math.random() * 4 + 2,
              height: Math.random() * 4 + 2,
              backgroundColor: 'var(--t-accent)',
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0, 0.3, 0],
            }}
            transition={{
              duration: Math.random() * 3 + 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {(stage === 'ready' || stage === 'shaking') && (
          <motion.div
            key="booster"
            className="relative cursor-pointer flex items-center justify-center"
            initial={{ y: 200, opacity: 0, rotate: -5 }}
            animate={{
              y: 0,
              opacity: 1,
              rotate: stage === 'shaking' ? [0, -3, 3, -5, 5, -3, 3, 0] : [0, 1, 0, -1, 0],
              scale: stage === 'shaking' ? [1, 1.02, 0.98, 1.04, 0.96, 1] : 1,
            }}
            exit={{ scale: 1.2, opacity: 0 }}
            transition={{
              y: { type: 'spring', stiffness: 120, damping: 15 },
              rotate: {
                duration: stage === 'shaking' ? 0.6 : 3,
                repeat: stage === 'shaking' ? 0 : Infinity,
                ease: 'easeInOut',
              },
              scale: { duration: stage === 'shaking' ? 0.6 : 1 },
            }}
            onClick={handleBoosterTap}
            data-gp="true"
            role="button"
            tabIndex={-1}
          >
            <img
              src={boosterImage || '/images/booster-unknown.webp'}
              alt=""
              style={{ width: '240px', height: 'auto', display: 'block' }}
              onError={(e) => {
                const t = e.currentTarget as HTMLImageElement;
                if (!t.src.endsWith('/images/booster-unknown.webp')) t.src = '/images/booster-unknown.webp';
              }}
            />
            {stage === 'ready' && (
              <motion.div
                className="absolute -bottom-12 left-0 right-0 text-center pointer-events-none"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--t-accent)' }}>
                  {t('animation.tapToOpen')}
                </span>
              </motion.div>
            )}
          </motion.div>
        )}

        {stage === 'revealing' && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-wrap justify-center gap-3 max-w-2xl px-4"
          >
            {sortedCards.map((card, i) => (
              <div key={card.sealedInstanceId} className="relative">
                <CardReveal
                  card={card}
                  index={i}
                  onRevealed={handleCardRevealed}
                  autoReveal
                  delay={i * 300 + 200}
                />
                {!duplicateSet.has(card.cardId) && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: (i * 0.3) + 1.2, duration: 0.3 }}
                    className="absolute top-1 right-1 px-1.5 py-0.5 pointer-events-none"
                    style={{
                      backgroundColor: 'var(--t-accent)1f',
                      color: 'var(--t-accent)',
                      fontSize: 9,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {t('animation.newUnlock')}
                  </motion.div>
                )}
              </div>
            ))}
          </motion.div>
        )}

        {stage === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32 }}
            className="flex flex-col items-center gap-6"
          >
            <div className="flex flex-wrap justify-center gap-3 max-w-2xl px-4">
              {sortedCards.map((card, i) => (
                <div key={card.sealedInstanceId} className="relative">
                  <CardReveal
                    card={card}
                    index={i}
                    onRevealed={() => {}}
                    autoReveal
                    delay={0}
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className="px-8 py-3 font-display uppercase tracking-wider"
              style={{
                backgroundColor: 'var(--t-accent)1f',
                color: 'var(--t-accent)',
                fontSize: 14,
                letterSpacing: '0.22em',
                boxShadow: '0 0 18px var(--t-accent)44',
              }}
            >
              {t('animation.continue')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
