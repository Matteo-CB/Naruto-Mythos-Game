'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTrainingStore } from '@/stores/trainingStore';

/**
 * Edge Token coin-flip driven by requestAnimationFrame for absolute
 * 60fps smoothness. Zero React re-renders during the spin.
 * Only the result phase uses React state.
 */

const TOKEN_SIZE = 150;
const SPIN_DURATION_MS = 2800;
const RESULT_HOLD_MS = 2000;
const REVOLUTIONS = 7;

// Custom easing: fast start, smooth deceleration, micro-bounces at end
function easeOutCoinFlip(t: number): number {
  if (t < 0.72) {
    // Main spin: fast then decelerate (modified ease-out cubic)
    const p = t / 0.72;
    return p * (2 - p) * 0.72;
  }
  if (t < 0.82) {
    // First bounce overshoot
    const p = (t - 0.72) / 0.10;
    return 0.72 + 0.28 * (1 + Math.sin(p * Math.PI) * 0.012);
  }
  if (t < 0.91) {
    // Second micro bounce
    const p = (t - 0.82) / 0.09;
    return 0.72 + 0.28 * (1 - Math.sin(p * Math.PI) * 0.005);
  }
  // Settle
  const p = (t - 0.91) / 0.09;
  return 0.72 + 0.28 * (1 + (1 - p) * 0.001);
}

// Vertical arc: coin goes up then comes down with small bounces
function arcOffset(t: number): number {
  if (t < 0.72) {
    // Parabolic arc: peak at t=0.3 of the spin portion
    const p = t / 0.72;
    const arc = Math.sin(p * Math.PI);
    return -arc * 22;
  }
  if (t < 0.80) {
    // First bounce
    const p = (t - 0.72) / 0.08;
    return -Math.sin(p * Math.PI) * 5;
  }
  if (t < 0.88) {
    // Second bounce
    const p = (t - 0.80) / 0.08;
    return -Math.sin(p * Math.PI) * 2;
  }
  return 0;
}

// Wobble after landing
function wobble(t: number): { z: number; x: number } {
  if (t < 0.72) return { z: 0, x: 0 };
  if (t < 0.82) {
    const p = (t - 0.72) / 0.10;
    return { z: Math.sin(p * Math.PI) * 2.5, x: -Math.sin(p * Math.PI) * 2 };
  }
  if (t < 0.91) {
    const p = (t - 0.82) / 0.09;
    return { z: -Math.sin(p * Math.PI) * 1, x: Math.sin(p * Math.PI) * 0.8 };
  }
  if (t < 0.97) {
    const p = (t - 0.91) / 0.06;
    return { z: Math.sin(p * Math.PI) * 0.3, x: -Math.sin(p * Math.PI) * 0.2 };
  }
  return { z: 0, x: 0 };
}

// Shadow scale from arc height
function shadowScale(t: number): { scale: number; opacity: number } {
  const h = Math.abs(arcOffset(t));
  const maxH = 22;
  const norm = h / maxH;
  return {
    scale: 1 - norm * 0.45,
    opacity: 0.35 - norm * 0.2,
  };
}

type Phase = 'idle' | 'animating' | 'result' | 'done';

export function EdgeCoinFlip() {
  const t = useTranslations();
  const visibleState = useGameStore((s) => s.visibleState);
  const isSandboxMode = useGameStore((s) => s.isSandboxMode);
  const isHotseatGame = useGameStore((s) => s.isHotseatGame);
  const isTrainingMode = useTrainingStore((s) => s.isTrainingMode);
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled);

  const [phase, setPhase] = useState<Phase>('idle');
  const [hasTriggered, setHasTriggered] = useState(false);

  // Refs for direct DOM manipulation (no React re-renders)
  const coinRef = useRef<HTMLDivElement>(null);
  const arcRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const isMulliganPhase = visibleState?.phase === 'mulligan';
  const playerHasEdge = visibleState
    ? visibleState.edgeHolder === visibleState.myPlayer
    : false;

  const landAngle = playerHasEdge ? 0 : 180;
  const totalDeg = 360 * REVOLUTIONS + landAngle;
  const accentColor = playerHasEdge ? '#c4a35a' : '#b33e3e';
  const accentRgb = playerHasEdge ? '196,163,90' : '179,62,62';

  // The core animation loop: runs at native refresh rate
  const animate = useCallback((timestamp: number) => {
    if (!startTimeRef.current) startTimeRef.current = timestamp;
    const elapsed = timestamp - startTimeRef.current;
    const progress = Math.min(elapsed / SPIN_DURATION_MS, 1);

    // Compute current rotation
    const easedProgress = easeOutCoinFlip(progress);
    const currentDeg = easedProgress * totalDeg;

    // Compute wobble
    const w = wobble(progress);

    // Compute vertical offset
    const yOffset = arcOffset(progress);

    // Compute shadow
    const s = shadowScale(progress);

    // Apply transforms directly to DOM (no React re-render)
    if (coinRef.current) {
      coinRef.current.style.transform =
        `rotateY(${currentDeg}deg) rotateZ(${w.z}deg) rotateX(${w.x}deg)`;
    }
    if (arcRef.current) {
      arcRef.current.style.transform = `translateY(${yOffset}px)`;
    }
    if (shadowRef.current) {
      shadowRef.current.style.transform = `translateX(-50%) scale(${s.scale})`;
      shadowRef.current.style.opacity = `${s.opacity}`;
    }

    if (progress < 1) {
      rafRef.current = requestAnimationFrame(animate);
    } else {
      // Animation complete, snap to final position
      if (coinRef.current) {
        coinRef.current.style.transform =
          `rotateY(${totalDeg}deg) rotateZ(0deg) rotateX(0deg)`;
      }
      if (arcRef.current) {
        arcRef.current.style.transform = 'translateY(0px)';
      }
      if (shadowRef.current) {
        shadowRef.current.style.transform = 'translateX(-50%) scale(1)';
        shadowRef.current.style.opacity = '0.35';
      }
      // Transition to result (only React state change during the whole flip)
      setPhase('result');
    }
  }, [totalDeg]);

  // Trigger
  useEffect(() => {
    if (!isMulliganPhase || hasTriggered || isSandboxMode || isHotseatGame || isTrainingMode) return;
    setHasTriggered(true);
    if (!animationsEnabled) {
      setPhase('result');
      const timer = setTimeout(() => setPhase('done'), 800);
      return () => clearTimeout(timer);
    }
    setPhase('animating');
  }, [isMulliganPhase, hasTriggered, isSandboxMode, isHotseatGame, isTrainingMode, animationsEnabled]);

  // Start rAF loop when animating
  useEffect(() => {
    if (phase !== 'animating') return;
    startTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, animate]);

  // Result -> done
  useEffect(() => {
    if (phase !== 'result') return;
    const timer = setTimeout(() => setPhase('done'), RESULT_HOLD_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const handleSkip = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setPhase('done');
  }, []);

  if (phase === 'idle' || phase === 'done' || isSandboxMode || isHotseatGame || isTrainingMode) return null;

  const isResult = phase === 'result';

  return (
    <AnimatePresence>
      <motion.div
        key="edge-coin-flip"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.95)' }}
        onClick={handleSkip}
      >
        {/* Soft ambient on result */}
        {isResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            style={{
              position: 'absolute',
              width: TOKEN_SIZE * 1.6,
              height: TOKEN_SIZE * 1.6,
              borderRadius: '50%',
              background: `radial-gradient(circle, rgba(${accentRgb},0.05) 0%, transparent 65%)`,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Coin area */}
        <div style={{ position: 'relative', width: TOKEN_SIZE, height: TOKEN_SIZE + 20 }}>
          {/* Arc wrapper (direct DOM via ref) */}
          <div
            ref={arcRef}
            style={{ width: TOKEN_SIZE, height: TOKEN_SIZE }}
          >
            {/* Perspective */}
            <div
              style={{
                width: '100%',
                height: '100%',
                perspective: '900px',
                perspectiveOrigin: '50% 48%',
              }}
            >
              {/* The coin (direct DOM via ref) */}
              <div
                ref={coinRef}
                style={{
                  width: '100%',
                  height: '100%',
                  transformStyle: 'preserve-3d',
                  position: 'relative',
                  willChange: 'transform',
                  transform: `rotateY(${isResult ? landAngle : 0}deg)`,
                }}
              >
                {/* ===== FACE ===== */}
                <div
                  className="absolute inset-0 rounded-full overflow-hidden"
                  style={{
                    backfaceVisibility: 'hidden',
                    boxShadow: isResult && playerHasEdge
                      ? `0 2px 10px rgba(0,0,0,0.35), 0 0 15px rgba(${accentRgb},0.12)`
                      : '0 2px 10px rgba(0,0,0,0.5)',
                    transition: 'box-shadow 0.5s ease',
                  }}
                >
                  <img
                    src="/images/naruto_token.png"
                    alt="Edge Token"
                    className="w-full h-full"
                    style={{ objectFit: 'cover', borderRadius: '50%' }}
                    draggable={false}
                  />
                  {/* Beveled rim */}
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.08), inset 0 -1px 1px rgba(0,0,0,0.12)',
                      pointerEvents: 'none',
                    }}
                  />
                </div>

                {/* ===== BACK (brushed dark metal) ===== */}
                <div
                  className="absolute inset-0 rounded-full overflow-hidden"
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    backgroundColor: '#0e0e14',
                    boxShadow: isResult && !playerHasEdge
                      ? `0 2px 10px rgba(0,0,0,0.35), 0 0 15px rgba(${accentRgb},0.1)`
                      : '0 2px 10px rgba(0,0,0,0.5)',
                    transition: 'box-shadow 0.5s ease',
                  }}
                >
                  {/* Beveled rim */}
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      border: '2px solid #1a1a22',
                      boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.04), inset 0 -1px 2px rgba(0,0,0,0.2)',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Brushed metal (fine radial lines) */}
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: `repeating-conic-gradient(
                        from 0deg,
                        rgba(255,255,255,0.015) 0deg,
                        transparent 1.2deg,
                        transparent 2.4deg
                      )`,
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Soft highlight spot */}
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: 'radial-gradient(ellipse at 40% 36%, rgba(255,255,255,0.03) 0%, transparent 50%)',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Inner vignette */}
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      boxShadow: 'inset 0 0 25px rgba(0,0,0,0.35)',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Ground shadow (direct DOM via ref) */}
          <div
            ref={shadowRef}
            style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              width: TOKEN_SIZE * 0.5,
              height: 6,
              backgroundColor: 'rgba(0,0,0,0.4)',
              filter: 'blur(5px)',
              borderRadius: '50%',
              transform: 'translateX(-50%) scale(1)',
              opacity: 0.35,
            }}
          />
        </div>

        {/* Result text */}
        <AnimatePresence>
          {isResult && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
              className="mt-7 flex flex-col items-center gap-2"
            >
              <motion.span
                className="text-lg font-bold uppercase tracking-[0.18em]"
                style={{ color: accentColor }}
                initial={{ letterSpacing: '0.4em', opacity: 0 }}
                animate={{ letterSpacing: '0.18em', opacity: 1 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
              >
                {playerHasEdge
                  ? t('game.edgeCoinFlip.youWin')
                  : t('game.edgeCoinFlip.opponentWins')}
              </motion.span>

              <motion.span
                className="font-body text-xs text-center max-w-xs"
                style={{ color: '#555' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.35, delay: 0.15 }}
              >
                {playerHasEdge
                  ? t('game.mulligan.youHaveEdge')
                  : t('game.mulligan.opponentHasEdge')}
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
