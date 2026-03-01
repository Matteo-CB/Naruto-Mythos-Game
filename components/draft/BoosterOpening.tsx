'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { BoosterPack, BoosterCard } from '@/lib/draft/boosterGenerator';
import { CardReveal } from './CardReveal';

interface BoosterOpeningProps {
  boosters: BoosterPack[];
  onComplete: (allCards: BoosterCard[]) => void;
}

type Stage = 'ready' | 'shaking' | 'opening' | 'revealing' | 'collected';

export function BoosterOpening({ boosters, onComplete }: BoosterOpeningProps) {
  const t = useTranslations('draft');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stage, setStage] = useState<Stage>('ready');
  const [collectedCards, setCollectedCards] = useState<BoosterCard[]>([]);

  // Track how many cards have been revealed for the current booster
  const revealedCountRef = useRef(0);
  const isTransitioningRef = useRef(false);
  const collectedCardsRef = useRef<BoosterCard[]>([]);

  const currentBooster = boosters[currentIndex];
  const totalBoosters = boosters.length;

  // Sort cards for reveal: common first, then UC, R, RA, MMS, S, M, L
  const sortedCards = currentBooster
    ? [...currentBooster.cards].sort((a, b) => {
        const order: Record<string, number> = { C: 0, UC: 1, R: 2, RA: 3, MMS: 4, S: 5, SV: 5, M: 6, MV: 6, L: 7 };
        return (order[a.rarity] ?? 0) - (order[b.rarity] ?? 0);
      })
    : [];

  const handleBoosterTap = useCallback(() => {
    if (stage !== 'ready') return;
    setStage('shaking');

    // Shake for 600ms then open
    setTimeout(() => {
      setStage('opening');
      // Opening animation lasts 800ms
      setTimeout(() => {
        revealedCountRef.current = 0;
        isTransitioningRef.current = false;
        setStage('revealing');
      }, 800);
    }, 600);
  }, [stage]);

  const handleCardRevealed = useCallback(() => {
    // Prevent duplicate calls during transition
    if (isTransitioningRef.current) return;

    revealedCountRef.current += 1;

    if (revealedCountRef.current >= sortedCards.length) {
      // All cards revealed — lock to prevent more calls
      isTransitioningRef.current = true;

      setTimeout(() => {
        const newCollected = [...collectedCardsRef.current, ...sortedCards];
        collectedCardsRef.current = newCollected;
        setCollectedCards(newCollected);
        setStage('collected');

        // Move to next booster or finish
        setTimeout(() => {
          if (currentIndex + 1 < totalBoosters) {
            setCurrentIndex((prev) => prev + 1);
            revealedCountRef.current = 0;
            isTransitioningRef.current = false;
            setStage('ready');
          } else {
            // All boosters opened
            onComplete(newCollected);
          }
        }, 600);
      }, 400);
    }
  }, [sortedCards, currentIndex, totalBoosters, onComplete]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Booster counter */}
      <motion.div
        className="absolute top-4 left-1/2 -translate-x-1/2 z-50"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="text-sm font-bold uppercase tracking-wider" style={{ color: '#c4a35a' }}>
          {t('boosterCount', { current: currentIndex + 1, total: totalBoosters })}
        </span>
      </motion.div>

      {/* Background particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={`particle-${i}`}
            className="absolute rounded-full"
            style={{
              width: Math.random() * 4 + 2,
              height: Math.random() * 4 + 2,
              backgroundColor: '#c4a35a',
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
        {/* Booster display */}
        {(stage === 'ready' || stage === 'shaking') && (
          <motion.div
            key={`booster-${currentIndex}`}
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
          >
            {/* Booster image — displayed naturally, no cropping */}
            <img
              src="/images/booster.webp"
              alt={t('boosterPack')}
              style={{
                width: '240px',
                height: 'auto',
                display: 'block',
              }}
            />

            {/* Tap hint */}
            {stage === 'ready' && (
              <motion.div
                className="absolute -bottom-12 left-0 right-0 text-center"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <span className="text-xs uppercase tracking-wider" style={{ color: '#c4a35a' }}>
                  {t('openBooster')}
                </span>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Card reveal grid */}
        {stage === 'revealing' && (
          <motion.div
            key={`reveal-${currentIndex}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-wrap justify-center gap-3 max-w-xl px-4"
          >
            {sortedCards.map((card, i) => (
              <CardReveal
                key={`${currentIndex}-${card.draftInstanceId}`}
                card={card}
                index={i}
                onRevealed={handleCardRevealed}
                autoReveal
                delay={i * 300 + 200}
              />
            ))}
          </motion.div>
        )}

        {/* Collected animation */}
        {stage === 'collected' && (
          <motion.div
            key={`collected-${currentIndex}`}
            initial={{ opacity: 1, scale: 1 }}
            animate={{ opacity: 0, scale: 0.5, y: 100 }}
            transition={{ duration: 0.5 }}
            className="flex flex-wrap justify-center gap-3 max-w-xl px-4"
          >
            {sortedCards.map((card) => (
              <div
                key={card.draftInstanceId}
                style={{ width: '120px', height: '168px', backgroundColor: '#1a1a1a', borderRadius: '8px' }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collected cards counter */}
      {collectedCards.length > 0 && (
        <motion.div
          className="absolute bottom-6 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <span className="text-xs" style={{ color: '#888888' }}>
            {t('cardsCollected')}: {collectedCards.length}
          </span>
        </motion.div>
      )}
    </div>
  );
}
