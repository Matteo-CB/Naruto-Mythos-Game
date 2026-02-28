'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
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
  const [revealedCount, setRevealedCount] = useState(0);
  const [collectedCards, setCollectedCards] = useState<BoosterCard[]>([]);

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
        setStage('revealing');
        setRevealedCount(0);
      }, 800);
    }, 600);
  }, [stage]);

  const handleCardRevealed = useCallback(() => {
    setRevealedCount((prev) => {
      const next = prev + 1;
      if (next >= sortedCards.length) {
        // All cards revealed, wait a moment then collect
        setTimeout(() => {
          setCollectedCards((prev) => [...prev, ...sortedCards]);
          setStage('collected');

          // Move to next booster or finish
          setTimeout(() => {
            if (currentIndex + 1 < totalBoosters) {
              setCurrentIndex((prev) => prev + 1);
              setStage('ready');
              setRevealedCount(0);
            } else {
              // All boosters opened
              onComplete([...collectedCards, ...sortedCards]);
            }
          }, 600);
        }, 400);
      }
      return next;
    });
  }, [sortedCards, currentIndex, totalBoosters, collectedCards, onComplete]);

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
            className="relative cursor-pointer"
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
                ease: stage === 'shaking' ? 'easeInOut' : 'easeInOut',
              },
              scale: { duration: stage === 'shaking' ? 0.6 : 1 },
            }}
            onClick={handleBoosterTap}
            style={{ width: '220px', height: '310px' }}
          >
            <Image
              src="/images/booster.webp"
              alt="Booster Pack"
              fill
              className="object-contain"
              sizes="220px"
              priority
            />

            {/* Pulsing aura */}
            <motion.div
              className="absolute inset-0 pointer-events-none"
              animate={{
                boxShadow: [
                  '0 0 20px rgba(196, 163, 90, 0.2)',
                  '0 0 40px rgba(196, 163, 90, 0.4)',
                  '0 0 20px rgba(196, 163, 90, 0.2)',
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{ borderRadius: '12px' }}
            />

            {/* Tap hint */}
            {stage === 'ready' && (
              <motion.div
                className="absolute -bottom-10 left-0 right-0 text-center"
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

        {/* Opening flash */}
        {stage === 'opening' && (
          <motion.div
            key="opening-flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 0.8, times: [0, 0.2, 0.6, 1] }}
            className="fixed inset-0 z-50 pointer-events-none"
            style={{ backgroundColor: '#c4a35a' }}
          />
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
                key={card.draftInstanceId}
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
