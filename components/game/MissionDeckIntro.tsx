'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTrainingStore } from '@/stores/trainingStore';

const RANK_LABELS = ['D', 'C', 'B', 'A'];
const RANK_BONUSES = ['+1', '+2', '+3', '+4'];

const STEP_DELAY_MS = 700;
const HOLD_AFTER_LAST_MS = 1400;

export function MissionDeckIntro() {
  const t = useTranslations();
  const visibleState = useGameStore((s) => s.visibleState);
  const isSandboxMode = useGameStore((s) => s.isSandboxMode);
  const isHotseatGame = useGameStore((s) => s.isHotseatGame);
  const isTrainingMode = useTrainingStore((s) => s.isTrainingMode);
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled);

  const coinFlipComplete = useUIStore((s) => s.coinFlipComplete);
  const missionDeckIntroComplete = useUIStore((s) => s.missionDeckIntroComplete);
  const setMissionDeckIntroComplete = useUIStore((s) => s.setMissionDeckIntroComplete);

  const [revealedCount, setRevealedCount] = useState(0);
  const [closing, setClosing] = useState(false);

  const isMulliganPhase = visibleState?.phase === 'mulligan';
  const playerHasEdge = visibleState ? visibleState.edgeHolder === visibleState.myPlayer : false;
  const gameMode = visibleState?.gameMode ?? 'casual';
  const isRanked = gameMode === 'ranked';

  const shouldShow =
    isMulliganPhase &&
    coinFlipComplete &&
    !missionDeckIntroComplete &&
    !closing;

  const skipModes = isSandboxMode || isHotseatGame || isTrainingMode || !animationsEnabled;

  useEffect(() => {
    if (isMulliganPhase && skipModes && !missionDeckIntroComplete) {
      setMissionDeckIntroComplete(true);
    }
  }, [isMulliganPhase, skipModes, missionDeckIntroComplete, setMissionDeckIntroComplete]);

  const finish = useCallback(() => {
    setClosing(true);
    setTimeout(() => setMissionDeckIntroComplete(true), 350);
  }, [setMissionDeckIntroComplete]);

  useEffect(() => {
    if (!shouldShow) return;
    if (revealedCount >= 4) {
      const id = setTimeout(finish, HOLD_AFTER_LAST_MS);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setRevealedCount((c) => c + 1), STEP_DELAY_MS);
    return () => clearTimeout(id);
  }, [shouldShow, revealedCount, finish]);

  useEffect(() => {
    if (!shouldShow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shouldShow, finish]);

  if (!shouldShow) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="mission-deck-intro"
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-sm"
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[480px] w-[1200px] rounded-full bg-[#c4a35a]/8 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-10 px-6">
          <div className="flex flex-col items-center gap-2">
            <motion.div
              initial={{ y: -12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="text-[10px] tracking-[0.45em] text-[#c4a35a]/70 font-semibold uppercase"
            >
              {t('game.missionDeckIntro.subtitle')}
            </motion.div>
            <motion.h2
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.45, ease: 'easeOut', delay: 0.1 }}
              className="text-2xl md:text-3xl font-semibold tracking-[0.2em] text-[#e8e8e8] uppercase"
            >
              {t('game.missionDeckIntro.title')}
            </motion.h2>
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ duration: 0.45, ease: 'easeOut', delay: 0.2 }}
              className="mt-1 h-[1px] w-32 origin-center bg-gradient-to-r from-transparent via-[#c4a35a]/60 to-transparent"
            />
          </div>

          <div className="flex flex-row items-end justify-center gap-3 md:gap-5">
            {RANK_LABELS.map((label, i) => {
              const fromEdge = isRanked ? i % 2 === 0 : null;
              const isPlayerSide = isRanked ? (fromEdge === playerHasEdge) : null;
              const accent = isRanked
                ? (fromEdge ? '#c4a35a' : '#9b8569')
                : '#a08550';
              const initialX = isRanked
                ? (isPlayerSide ? 320 : -320)
                : (i % 2 === 0 ? -260 : 260);
              const initialY = isRanked ? 0 : -160;
              const initialRotate = isRanked ? 0 : (i % 2 === 0 ? -25 : 25);
              const revealed = revealedCount > i;

              return (
                <div key={label} className="flex flex-col items-center gap-2">
                  <div className="relative h-[160px] w-[112px] md:h-[200px] md:w-[140px]">
                    <div
                      className="absolute inset-0 rounded-md border border-white/5"
                      style={{ background: 'rgba(20,18,15,0.4)' }}
                    />
                    <AnimatePresence>
                      {revealed && (
                        <motion.div
                          key="card"
                          initial={{
                            x: initialX,
                            y: initialY,
                            rotate: initialRotate,
                            opacity: 0,
                            scale: 0.7,
                          }}
                          animate={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
                          transition={{
                            type: 'spring',
                            stiffness: 220,
                            damping: 22,
                            mass: 0.9,
                          }}
                          className="absolute inset-0 rounded-md overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.7)]"
                          style={{
                            border: `1px solid ${accent}55`,
                            background:
                              'linear-gradient(135deg, #1a1610 0%, #14110b 50%, #0d0b07 100%)',
                          }}
                        >
                          <div
                            className="absolute inset-0 opacity-40"
                            style={{
                              background: `radial-gradient(circle at 50% 35%, ${accent}33 0%, transparent 65%)`,
                            }}
                          />
                          <div className="absolute inset-2 rounded border" style={{ borderColor: `${accent}33` }} />
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                            <div
                              className="text-3xl md:text-4xl font-semibold tracking-wider"
                              style={{ color: accent, textShadow: `0 0 12px ${accent}66` }}
                            >
                              {label}
                            </div>
                            <div className="text-[10px] tracking-[0.3em] text-white/50 uppercase">
                              {t('game.missionDeckIntro.rank')}
                            </div>
                            <div className="mt-1 text-[10px] text-white/40">{RANK_BONUSES[i]} {t('game.missionDeckIntro.points')}</div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {isRanked && (
                    <AnimatePresence>
                      {revealed && (
                        <motion.div
                          key="origin"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15 }}
                          className="text-[9px] tracking-[0.25em] uppercase font-semibold"
                          style={{ color: accent }}
                        >
                          {fromEdge
                            ? t('game.missionDeckIntro.fromEdge')
                            : t('game.missionDeckIntro.fromOther')}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}
                </div>
              );
            })}
          </div>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="max-w-[640px] text-center text-sm text-white/65 leading-relaxed"
          >
            {isRanked
              ? t('game.missionDeckIntro.rulesRanked')
              : t('game.missionDeckIntro.rulesCasual')}
          </motion.p>

          <motion.button
            type="button"
            onClick={finish}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-2 px-5 py-2 text-[11px] tracking-[0.3em] uppercase text-white/55 hover:text-[#c4a35a] transition-colors border border-white/10 hover:border-[#c4a35a]/40 rounded-sm"
          >
            {t('game.missionDeckIntro.skip')}
          </motion.button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
