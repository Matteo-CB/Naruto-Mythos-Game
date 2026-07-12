'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useGameScale } from './GameScaleContext';
import { playSound, setVolume, setMuted } from '@/lib/sound/SoundManager';
import { playCardFlight, playRevealInPlace, playHideInPlace, playRelocate, playDefeatFlight, playUpgradeMerge, playEdgeTransfer, playTokenDelta, playMissionScore, playGameEndCinematic, installSkipListener, type MotionEventData } from '@/lib/motion/choreographer';

type AnimationType =
  | 'card-play'
  | 'card-relocate'
  | 'card-reveal'
  | 'card-defeat'
  | 'card-hide'
  | 'card-move'
  | 'card-upgrade'
  | 'power-token'
  | 'chakra-gain'
  | 'mission-score'
  | 'edge-transfer'
  | 'turn-transition'
  | 'card-deal'
  | 'game-end';

function getAnimationDuration(type: AnimationType): number {
  switch (type) {
    case 'card-play':
      return 900;
    case 'card-reveal':
      return 1200;
    case 'card-defeat':
      return 1100;
    case 'card-hide':
      return 800;
    case 'card-move':
      return 800;
    case 'card-upgrade':
      return 1000;
    case 'power-token':
      return 800;
    case 'chakra-gain':
      return 800;
    case 'mission-score':
      return 1200;
    case 'edge-transfer':
      return 900;
    case 'turn-transition':
      return 900;
    case 'card-deal':
      return 800;
    case 'game-end':
      
      return 200;
    default:
      return 800;
  }
}

interface AnimationEvent {
  id: string;
  type: AnimationType;
  data: Record<string, unknown>;
  timestamp: number;
}

function TurnTransitionAnimation({ data }: { data: Record<string, unknown> }) {
  const t = useTranslations();
  const turn = (data.turn as number) || 1;

  return (
    <motion.div
      key="turn-transition"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: 0.85, times: [0, 0.2, 0.75, 1], ease: 'easeInOut' }}
      className="fixed left-0 right-0 z-40 flex items-center justify-center pointer-events-none"
      style={{ top: '38%' }}
    >
      <motion.div
        initial={{ x: -60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center gap-4 px-10 py-3"
        style={{
          backgroundColor: 'rgba(8, 8, 12, 0.92)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 24px rgba(196,163,90,0.12)',
        }}
      >
        <span
          className="uppercase font-bold tracking-[0.4em] text-sm"
          style={{ color: '#c4a35a', fontFamily: 'var(--font-display)' }}
        >
          {t('game.turn', { turn })}
        </span>
      </motion.div>
    </motion.div>
  );
}
function renderAnimation(anim: AnimationEvent) {
  switch (anim.type) {
    case 'turn-transition':
      return <TurnTransitionAnimation key={anim.id} data={anim.data} />;
    case 'game-end':
      
      return null;
    default:
      return null;
  }
}

const MOTION_TYPES: ReadonlySet<string> = new Set(['card-play', 'card-reveal', 'card-hide', 'card-relocate', 'card-defeat', 'card-upgrade', 'edge-transfer', 'power-token', 'mission-score', 'game-end']);

export function AnimationController() {
  const animationQueue = useGameStore((s) => s.animationQueue);
  const completeAnimation = useGameStore((s) => s.completeAnimation);
  const setAnimating = useGameStore((s) => s.setAnimating);
  const humanPlayer = useGameStore((s) => s.humanPlayer);

  useEffect(() => installSkipListener(), []);
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const soundVolume = useSettingsStore((s) => s.soundVolume);

  useEffect(() => {
    setMuted(!soundEnabled);
    setVolume(soundVolume);
  }, [soundEnabled, soundVolume]);

  const logLength = useGameStore((s) => s.visibleState?.log.length ?? 0);
  const prevLogLenRef = useRef(0);
  useEffect(() => {
    const state = useGameStore.getState().visibleState;
    if (!state) return;
    const log = state.log;
    const prevLen = prevLogLenRef.current;
    if (log.length <= prevLen) {
      prevLogLenRef.current = log.length;
      return;
    }
    const newEntries = log.slice(prevLen);
    prevLogLenRef.current = log.length;

    let hasEffect = false;
    for (const entry of newEntries) {
      const a = entry.action;

      if (a.startsWith('EFFECT') || a === 'SCORE_RETURN' || a === 'POWERUP' || a === 'CHAKRA_STEAL') {
        hasEffect = true;
        break;
      }
    }
    if (hasEffect) {
      playSound('jutsu');
    }
  }, [logLength]);

  useEffect(() => {
    if (animationQueue.length > 0) {
      setAnimating(true);
    } else {
      setAnimating(false);
    }
  }, [animationQueue.length, setAnimating]);

  const currentAnim = animationQueue[0] as AnimationEvent | undefined;

  useEffect(() => {
    if (!currentAnim) return;
    const type = currentAnim.type as AnimationType;
    if (MOTION_TYPES.has(type)) {
      const data = currentAnim.data as MotionEventData;
      const isMyAction = data.player === humanPlayer;
      const run =
        type === 'card-play' ? playCardFlight(data, { isMyAction })
        : type === 'card-reveal' ? playRevealInPlace(data)
        : type === 'card-hide' ? playHideInPlace(data)
        : type === 'card-relocate' ? playRelocate(data)
        : type === 'card-defeat' ? playDefeatFlight(data)
        : type === 'card-upgrade' ? playUpgradeMerge(data)
        : type === 'edge-transfer' ? playEdgeTransfer()
        : type === 'mission-score' ? playMissionScore(data)
        : type === 'game-end' ? playGameEndCinematic(data, { isMyWin: data.winner ? data.winner === humanPlayer : null })
        : playTokenDelta(data);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        completeAnimation(currentAnim.id);
      };
      run.then(finish).catch(finish);
      const safety = setTimeout(finish, 4000);
      return () => clearTimeout(safety);
    }
    switch (type) {
      case 'turn-transition':
        playSound('newTurn');
        break;
      case 'card-deal':
        playSound('mulligan');
        break;
      case 'power-token':
      case 'card-relocate':
        playSound('jutsu');
        break;

    }
  }, [currentAnim?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!currentAnim) return;
    if (MOTION_TYPES.has(currentAnim.type)) return;
    const duration = animationsEnabled ? getAnimationDuration(currentAnim.type as AnimationType) : 0;
    const timer = setTimeout(() => {
      completeAnimation(currentAnim.id);
    }, duration);
    return () => clearTimeout(timer);
  }, [currentAnim, completeAnimation, animationsEnabled]);

  if (!currentAnim) return null;

  return (
    <AnimatePresence mode="wait">
      {renderAnimation(currentAnim)}
    </AnimatePresence>
  );
}
