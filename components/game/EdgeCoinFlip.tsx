'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * Edge Token coin-flip animation shown at game start (before mulligan).
 * The token spins like a coin toss, then lands on the winning side:
 * - Face (token image) = player has the edge
 * - Back (dark circle) = opponent has the edge
 *
 * Skipped in sandbox mode (solo v self).
 * Respects user animation preference — instant result when disabled.
 */

const SPIN_DURATION = 2.4; // seconds for the full spin sequence
const RESULT_HOLD = 1.6; // seconds to show final result before fading out
const TOKEN_SIZE = 140;

export function EdgeCoinFlip() {
  const t = useTranslations();
  const visibleState = useGameStore((s) => s.visibleState);
  const isSandboxMode = useGameStore((s) => s.isSandboxMode);
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled);

  const [phase, setPhase] = useState<'idle' | 'spinning' | 'result' | 'done'>('idle');
  const [hasTriggered, setHasTriggered] = useState(false);

  const isMulliganPhase = visibleState?.phase === 'mulligan';
  const playerHasEdge = visibleState
    ? visibleState.edgeHolder === visibleState.myPlayer
    : false;

  // Trigger the coin flip when we first enter mulligan phase
  useEffect(() => {
    if (!isMulliganPhase || hasTriggered || isSandboxMode) return;

    setHasTriggered(true);

    if (!animationsEnabled) {
      // Skip animation — show result briefly then done
      setPhase('result');
      const timer = setTimeout(() => setPhase('done'), 800);
      return () => clearTimeout(timer);
    }

    // Start spinning
    setPhase('spinning');
  }, [isMulliganPhase, hasTriggered, isSandboxMode, animationsEnabled]);

  // Transition from spinning to result
  useEffect(() => {
    if (phase !== 'spinning') return;
    const timer = setTimeout(() => setPhase('result'), SPIN_DURATION * 1000);
    return () => clearTimeout(timer);
  }, [phase]);

  // Transition from result to done
  useEffect(() => {
    if (phase !== 'result') return;
    const holdTime = animationsEnabled ? RESULT_HOLD * 1000 : 600;
    const timer = setTimeout(() => setPhase('done'), holdTime);
    return () => clearTimeout(timer);
  }, [phase, animationsEnabled]);

  const handleSkip = useCallback(() => {
    setPhase('done');
  }, []);

  if (phase === 'idle' || phase === 'done' || isSandboxMode) return null;

  return (
    <AnimatePresence>
      <motion.div
          key="edge-coin-flip"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.92)' }}
          onClick={handleSkip}
        >
          {/* Ambient glow behind the coin */}
          <motion.div
            className="absolute"
            style={{
              width: TOKEN_SIZE * 2.5,
              height: TOKEN_SIZE * 2.5,
              borderRadius: '50%',
              background: playerHasEdge
                ? 'radial-gradient(circle, rgba(196,163,90,0.15) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(179,62,62,0.12) 0%, transparent 70%)',
            }}
            animate={{
              scale: phase === 'result' ? [1, 1.3, 1.15] : 1,
              opacity: phase === 'result' ? 1 : 0.5,
            }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />

          {/* The coin */}
          <div
            className="relative"
            style={{
              width: TOKEN_SIZE,
              height: TOKEN_SIZE,
              perspective: '800px',
            }}
          >
            <motion.div
              className="absolute inset-0"
              style={{
                transformStyle: 'preserve-3d',
              }}
              animate={
                phase === 'spinning'
                  ? {
                      rotateX: [0, 360 * 6 + (playerHasEdge ? 0 : 180)],
                    }
                  : phase === 'result'
                    ? {
                        rotateX: playerHasEdge ? 0 : 180,
                      }
                    : {}
              }
              transition={
                phase === 'spinning'
                  ? {
                      duration: SPIN_DURATION,
                      ease: [0.2, 0.8, 0.3, 1],
                    }
                  : {
                      duration: 0,
                    }
              }
            >
              {/* Face side — token image */}
              <div
                className="absolute inset-0 rounded-full overflow-hidden"
                style={{
                  backfaceVisibility: 'hidden',
                  boxShadow: phase === 'result' && playerHasEdge
                    ? '0 0 40px rgba(196,163,90,0.5), 0 0 80px rgba(196,163,90,0.2)'
                    : '0 4px 20px rgba(0,0,0,0.6)',
                }}
              >
                <img
                  src="/images/naruto_token.png"
                  alt="Edge Token"
                  className="w-full h-full"
                  style={{ objectFit: 'cover' }}
                  draggable={false}
                />
              </div>

              {/* Back side — dark circle */}
              <div
                className="absolute inset-0 rounded-full flex items-center justify-center"
                style={{
                  backfaceVisibility: 'hidden',
                  transform: 'rotateX(180deg)',
                  backgroundColor: '#0e0e12',
                  border: '3px solid #2a2a32',
                  boxShadow: phase === 'result' && !playerHasEdge
                    ? '0 0 40px rgba(179,62,62,0.4), 0 0 80px rgba(179,62,62,0.15)'
                    : '0 4px 20px rgba(0,0,0,0.6)',
                }}
              >
                {/* Subtle inner ring pattern */}
                <div
                  className="rounded-full"
                  style={{
                    width: '75%',
                    height: '75%',
                    border: '2px solid #1a1a22',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    className="rounded-full"
                    style={{
                      width: '55%',
                      height: '55%',
                      border: '1px solid #1a1a22',
                    }}
                  />
                </div>
              </div>
            </motion.div>
          </div>

          {/* Result text */}
          <AnimatePresence>
            {phase === 'result' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mt-8 flex flex-col items-center gap-3"
              >
                <motion.span
                  className="text-lg font-bold uppercase tracking-[0.25em]"
                  style={{
                    color: playerHasEdge ? '#c4a35a' : '#b33e3e',
                  }}
                  initial={{ letterSpacing: '0.5em', opacity: 0 }}
                  animate={{ letterSpacing: '0.25em', opacity: 1 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                >
                  {playerHasEdge
                    ? t('game.edgeCoinFlip.youWin')
                    : t('game.edgeCoinFlip.opponentWins')}
                </motion.span>

                <motion.span
                  className="text-xs text-center max-w-xs"
                  style={{ color: '#777' }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.5 }}
                >
                  {playerHasEdge
                    ? t('game.mulligan.youHaveEdge')
                    : t('game.mulligan.opponentHasEdge')}
                </motion.span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Decorative particles on result */}
          {phase === 'result' && animationsEnabled && (
            <>
              {Array.from({ length: 12 }).map((_, i) => {
                const angle = (i / 12) * 360;
                const rad = (angle * Math.PI) / 180;
                const distance = 100 + Math.random() * 60;
                const accentColor = playerHasEdge ? '#c4a35a' : '#b33e3e';
                return (
                  <motion.div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                      width: 3 + Math.random() * 4,
                      height: 3 + Math.random() * 4,
                      backgroundColor: accentColor,
                      top: '50%',
                      left: '50%',
                    }}
                    initial={{
                      x: 0,
                      y: -TOKEN_SIZE / 2,
                      opacity: 0,
                      scale: 0,
                    }}
                    animate={{
                      x: Math.cos(rad) * distance,
                      y: Math.sin(rad) * distance - TOKEN_SIZE / 2,
                      opacity: [0, 0.8, 0],
                      scale: [0, 1.2, 0.3],
                    }}
                    transition={{
                      duration: 1.2,
                      delay: 0.1 + i * 0.04,
                      ease: 'easeOut',
                    }}
                  />
                );
              })}
            </>
          )}
        </motion.div>
    </AnimatePresence>
  );
}
