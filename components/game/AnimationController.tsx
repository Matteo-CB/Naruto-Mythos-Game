'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useGameScale } from './GameScaleContext';
import { playSound, setVolume, setMuted } from '@/lib/sound/SoundManager';
import { playCardFlight, playDrawFlight, installSkipListener, type MotionEventData } from '@/lib/motion/choreographer';

type AnimationType =
  | 'card-play'
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
  | 'card-draw'
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
      return 3000;
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

function CardRevealAnimation({ data }: { data: Record<string, unknown> }) {
  const t = useTranslations();
  const dims = useGameScale();
  const cardName = (data.cardName as string) || 'Card';
  const cardImage = data.cardImage as string | null;

  return (
    <motion.div
      key="card-reveal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
    >
      <div className="flex flex-col items-center gap-3" style={{ perspective: '800px' }}>
        
        <motion.div
          className="relative overflow-hidden"
          style={{
            width: dims.animBoard.w + 'px',
            height: dims.animBoard.h + 'px',
            transformStyle: 'preserve-3d',
          }}
          initial={{ rotateY: 180, scale: 0.9 }}
          animate={{ rotateY: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
        >
          
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              backfaceVisibility: 'hidden',
              boxShadow: '0 8px 40px rgba(179, 62, 62, 0.4), 0 0 20px rgba(179, 62, 62, 0.2)',
              border: '2px solid rgba(179, 62, 62, 0.5)',
            }}
          >
            {cardImage ? (
              <img
                src={cardImage}
                alt={cardName}
                className="w-full h-full"
                style={{ objectFit: 'cover', opacity: 0, transition: 'opacity 0.12s ease' }}
                draggable={false}
                onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '1'; }}
              />
            ) : (
              <img
                src="/images/card-back.webp"
                alt={cardName}
                className="w-full h-full"
                style={{ objectFit: 'cover', opacity: 0.5 }}
                draggable={false}
              />
            )}
          </div>
          
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              border: '2px solid #333333',
            }}
          >
            <img
              src="/images/card-back.webp"
              alt={t('a11y.cardBack')}
              className="w-full h-full"
              style={{ objectFit: 'cover' }}
              draggable={false}
            />
          </div>
          <motion.div
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              width: '34%',
              backgroundColor: 'rgba(255, 250, 235, 0.25)',
              filter: 'blur(10px)',
              transform: 'skewX(-18deg)',
              backfaceVisibility: 'hidden',
            }}
            initial={{ left: '-45%' }}
            animate={{ left: '130%' }}
            transition={{ delay: 0.55, duration: 0.5, ease: 'easeInOut' }}
          />
        </motion.div>

        <motion.div
          className="absolute"
          style={{
            width: dims.animBoard.w + 'px',
            height: dims.animBoard.h + 'px',
            boxShadow: '0 0 30px rgba(179, 62, 62, 0.5)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.8, 0] }}
          transition={{ duration: 0.7, times: [0, 0.5, 1] }}
        />

        <motion.div
          className="flex flex-col items-center gap-1 px-6 py-2"
          style={{
            backgroundColor: 'rgba(10, 10, 10, 0.9)',
            }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <span
            className="text-[10px] font-medium uppercase tracking-wider"
            style={{ color: '#b33e3e' }}
          >
            {t('game.anim.revealed')}
          </span>
          <span className="text-sm font-bold" style={{ color: '#e0e0e0' }}>
            {cardName}
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
}

function CardDefeatAnimation({ data }: { data: Record<string, unknown> }) {
  const t = useTranslations();
  const cardName = (data.cardName as string) || 'Card';

  return (
    <motion.div
      key="card-defeat"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
    >
      <motion.div
        className="px-10 py-6 flex flex-col items-center gap-2"
        style={{
          backgroundColor: 'rgba(10, 10, 10, 0.9)',
          boxShadow: '0 0 30px rgba(179, 62, 62, 0.3)',
        }}
        initial={{ scale: 1.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.5, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 18 }}
      >
        <motion.span
          className="text-sm font-medium uppercase tracking-wider"
          style={{ color: '#b33e3e' }}
          animate={{
            opacity: [1, 0.5, 1],
          }}
          transition={{ repeat: 1, duration: 0.4 }}
        >
          {t('game.anim.defeated')}
        </motion.span>
        <motion.span
          className="text-2xl font-bold"
          style={{ color: '#b33e3e' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.6] }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          {cardName}
        </motion.span>
        
        <div className="relative w-32 h-1 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute"
              style={{
                width: '4px',
                height: '4px',
                backgroundColor: '#b33e3e',
                left: `${i * 20}%`,
              }}
              initial={{ y: 0, opacity: 1 }}
              animate={{ y: -20 - Math.random() * 15, opacity: 0, x: (Math.random() - 0.5) * 30 }}
              transition={{ delay: 0.3 + i * 0.05, duration: 0.5 }}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function CardHideAnimation({ data }: { data: Record<string, unknown> }) {
  const t = useTranslations();
  const cardName = (data.cardName as string) || 'Card';

  return (
    <motion.div
      key="card-hide"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
    >
      <motion.div
        className="px-8 py-5 flex flex-col items-center gap-2"
        style={{
          backgroundColor: 'rgba(10, 10, 10, 0.9)',
          border: '1px solid #333333',
          boxShadow: '0 8px 40px rgba(0, 0, 0, 0.7)',
        }}
        initial={{ rotateY: 0 }}
        animate={{ rotateY: 180 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <span
          className="text-sm font-medium uppercase tracking-wider"
          style={{ color: '#888888' }}
        >
          {t('game.anim.hidden')}
        </span>
        <span
          className="text-xl font-bold"
          style={{ color: '#555555' }}
        >
          {cardName}
        </span>
      </motion.div>
    </motion.div>
  );
}

function CardMoveAnimation({ data }: { data: Record<string, unknown> }) {
  const t = useTranslations();
  const cardName = (data.cardName as string) || 'Card';
  const fromMission = (data.fromMission as string) || '';
  const toMission = (data.toMission as string) || '';

  return (
    <motion.div
      key="card-move"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
    >
      <motion.div
        className="px-8 py-5 flex flex-col items-center gap-2"
        style={{
          backgroundColor: 'rgba(10, 10, 10, 0.9)',
          border: '1px solid #333333',
          boxShadow: '0 8px 40px rgba(0, 0, 0, 0.7)',
        }}
        initial={{ x: -30, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 30, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <span
          className="text-sm font-medium uppercase tracking-wider"
          style={{ color: '#888888' }}
        >
          {t('game.anim.moved')}
        </span>
        <span
          className="text-xl font-bold"
          style={{ color: '#e0e0e0' }}
        >
          {cardName}
        </span>
        {fromMission && toMission && (
          <span className="text-xs" style={{ color: '#555555' }}>
            {fromMission} &rarr; {toMission}
          </span>
        )}
      </motion.div>
    </motion.div>
  );
}

function CardUpgradeAnimation({ data }: { data: Record<string, unknown> }) {
  const t = useTranslations();
  const dims = useGameScale();
  const cardName = (data.cardName as string) || 'Card';
  const previousName = (data.previousName as string) || '';
  const cardImage = data.cardImage as string | null;

  return (
    <motion.div
      key="card-upgrade"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
    >
      <div className="flex flex-col items-center gap-3">
        
        <motion.div
          className="overflow-hidden"
          style={{
            width: dims.animBoard.w + 'px',
            height: dims.animBoard.h + 'px',
            border: '2px solid rgba(62, 139, 62, 0.6)',
          }}
          initial={{ y: 180, scale: 0.6, opacity: 0, rotate: -5 }}
          animate={{
            y: 0,
            scale: 1,
            opacity: 1,
            rotate: 0,
            boxShadow: '0 8px 50px rgba(62, 139, 62, 0.5), 0 0 30px rgba(62, 139, 62, 0.3)',
          }}
          transition={{ type: 'spring', stiffness: 140, damping: 14 }}
        >
          {cardImage ? (
            <img
              src={cardImage}
              alt={cardName}
              className="w-full h-full"
              style={{ objectFit: 'cover', opacity: 0, transition: 'opacity 0.12s ease' }}
              draggable={false}
              onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '1'; }}
            />
          ) : (
            <img
              src="/images/card-back.webp"
              alt={cardName}
              className="w-full h-full"
              style={{ objectFit: 'cover', opacity: 0.5 }}
              draggable={false}
            />
          )}
        </motion.div>

        <motion.div
          className="flex flex-col items-center gap-1 px-6 py-2"
          style={{
            backgroundColor: 'rgba(10, 10, 10, 0.9)',
            }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <motion.span
            className="text-[11px] font-bold uppercase tracking-widest"
            style={{ color: '#5cb85c', letterSpacing: '0.2em' }}
            animate={{ textShadow: ['0 0 4px rgba(92, 184, 92, 0.3)', '0 0 10px rgba(92, 184, 92, 0.6)', '0 0 4px rgba(92, 184, 92, 0.3)'] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            {t('game.anim.upgrade')}
          </motion.span>
          {previousName && (
            <motion.span
              className="text-[10px]"
              style={{ color: '#666666' }}
              initial={{ opacity: 1 }}
              animate={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.35, duration: 0.3 }}
            >
              {previousName}
            </motion.span>
          )}
          <span className="text-sm font-bold" style={{ color: '#5cb85c' }}>
            {cardName}
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
}

function PowerTokenAnimation({ data }: { data: Record<string, unknown> }) {
  const t = useTranslations();
  const amount = (data.amount as number) || 0;
  const cardName = (data.cardName as string) || '';

  return (
    <motion.div
      key="power-token"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
    >
      <motion.div
        className="flex flex-col items-center gap-2"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -15, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 250, damping: 18 }}
      >
        <motion.div
          className="px-7 py-3.5 flex items-center gap-3"
          style={{
            backgroundColor: 'rgba(196, 163, 90, 0.12)',
            border: '2px solid #c4a35a',
          }}
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{
            scale: [0.3, 1.2, 1],
            opacity: 1,
            boxShadow: [
              '0 0 10px rgba(196, 163, 90, 0.2)',
              '0 0 30px rgba(196, 163, 90, 0.5)',
              '0 0 20px rgba(196, 163, 90, 0.3)',
            ],
          }}
          transition={{ duration: 0.5, times: [0, 0.55, 1] }}
        >
          <span
            className="text-4xl font-bold tabular-nums"
            style={{ color: '#f0d890', textShadow: '0 0 8px rgba(196, 163, 90, 0.5)' }}
          >
            +{amount}
          </span>
          <span
            className="text-sm font-bold uppercase tracking-wider"
            style={{ color: '#c4a35a' }}
          >
            {t('game.anim.power')}
          </span>
        </motion.div>
        {cardName && (
          <motion.span
            className="text-xs"
            style={{ color: '#888888' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            {cardName}
          </motion.span>
        )}
      </motion.div>
    </motion.div>
  );
}

function ChakraGainAnimation({ data }: { data: Record<string, unknown> }) {
  const t = useTranslations();
  const amount = (data.amount as number) || 0;
  const player = (data.player as string) || '';

  return (
    <motion.div
      key="chakra-gain"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
    >
      <motion.div
        className="flex flex-col items-center gap-1"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -20, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 16 }}
      >
        <motion.span
          className="text-4xl font-bold tabular-nums"
          style={{ color: '#6a6abb' }}
          initial={{ scale: 0.5 }}
          animate={{ scale: [0.5, 1.1, 1] }}
          transition={{ duration: 0.4, times: [0, 0.6, 1] }}
        >
          +{amount}
        </motion.span>
        <span
          className="text-sm font-medium uppercase tracking-wider"
          style={{ color: '#6a6abb' }}
        >
          {t('game.anim.chakra')}
        </span>
        {player && (
          <span className="text-xs" style={{ color: '#555555' }}>
            {player}
          </span>
        )}
      </motion.div>
    </motion.div>
  );
}

function MissionScoreAnimation({ data }: { data: Record<string, unknown> }) {
  const t = useTranslations();
  const missionName = (data.missionName as string) || 'Mission';
  const points = (data.points as number) || 0;
  const winner = (data.winner as string) || '';

  return (
    <motion.div
      key="mission-score"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
    >
      <motion.div
        className="flex flex-col items-center gap-3 px-10 py-8"
        style={{
          backgroundColor: 'rgba(10, 10, 10, 0.95)',
          border: '2px solid #c4a35a',
          boxShadow: '0 0 40px rgba(196, 163, 90, 0.3)',
        }}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 150, damping: 14, delay: 0.1 }}
      >
        <motion.span
          className="text-sm font-medium uppercase tracking-wider"
          style={{ color: '#c4a35a' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {t('game.anim.missionWon')}
        </motion.span>
        <motion.span
          className="text-xl font-bold"
          style={{ color: '#e0e0e0' }}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          {missionName}
        </motion.span>
        <motion.div
          className="flex items-center gap-2"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, type: 'spring' }}
        >
          <span
            className="text-3xl font-bold tabular-nums"
            style={{ color: '#c4a35a' }}
          >
            +{points}
          </span>
          <span
            className="text-xs uppercase"
            style={{ color: '#888888' }}
          >
            {t('game.anim.points')}
          </span>
        </motion.div>
        {winner && (
          <motion.span
            className="text-xs"
            style={{ color: '#555555' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {winner}
          </motion.span>
        )}
      </motion.div>
    </motion.div>
  );
}

function EdgeTransferAnimation({ data }: { data: Record<string, unknown> }) {
  const t = useTranslations();
  const toPlayer = (data.toPlayer as string) || '';

  return (
    <motion.div
      key="edge-transfer"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
    >
      <motion.div
        className="flex flex-col items-center gap-2 px-8 py-5"
        style={{
          backgroundColor: 'rgba(10, 10, 10, 0.9)',
          boxShadow: '0 0 20px rgba(196, 163, 90, 0.2)',
        }}
        initial={{ x: toPlayer === 'player1' ? 60 : -60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 16 }}
      >
        <motion.span
          className="text-sm font-medium uppercase tracking-wider"
          style={{ color: '#c4a35a' }}
          animate={{
            textShadow: [
              '0 0 8px rgba(196, 163, 90, 0.4)',
              '0 0 16px rgba(196, 163, 90, 0.6)',
              '0 0 8px rgba(196, 163, 90, 0.4)',
            ],
          }}
          transition={{ repeat: 1, duration: 0.5 }}
        >
          {t('game.edge')}
        </motion.span>
        <motion.div
          className="h-px w-16"
          style={{ backgroundColor: '#c4a35a' }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        />
        <span className="text-xs" style={{ color: '#888888' }}>
          {toPlayer === 'player1' ? t('game.anim.player1') : t('game.anim.player2')}
        </span>
      </motion.div>
    </motion.div>
  );
}

function TurnTransitionAnimation({ data }: { data: Record<string, unknown> }) {
  const t = useTranslations();
  const turn = (data.turn as number) || 1;

  return (
    <motion.div
      key="turn-transition"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: 3, times: [0, 0.13, 0.73, 1], ease: 'easeInOut' }}
      className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
    >
      <motion.div
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{
          scale: [0.3, 1, 1, 0.3],
          opacity: [0, 1, 1, 0],
        }}
        transition={{ duration: 3, times: [0, 0.13, 0.73, 1], ease: 'easeInOut' }}
        className="flex flex-col items-center gap-2"
      >
        <motion.span
          className="text-5xl font-bold tracking-widest uppercase"
          style={{ color: '#c4a35a' }}
          initial={{ letterSpacing: '0.5em', opacity: 0 }}
          animate={{
            letterSpacing: ['0.5em', '0.2em', '0.2em', '0.5em'],
            opacity: [0, 1, 1, 0],
          }}
          transition={{ duration: 3, times: [0, 0.13, 0.73, 1], ease: 'easeInOut' }}
        >
          {t('game.turn', { turn })}
        </motion.span>
        <motion.div
          className="h-px w-48"
          style={{ backgroundColor: '#c4a35a' }}
          initial={{ scaleX: 0, opacity: 1 }}
          animate={{
            scaleX: [0, 1, 1, 0],
            opacity: [1, 1, 1, 0],
          }}
          transition={{ duration: 3, times: [0, 0.15, 0.73, 1], ease: 'easeInOut' }}
        />
      </motion.div>
    </motion.div>
  );
}

function renderAnimation(anim: AnimationEvent) {
  switch (anim.type) {
    case 'card-reveal':
      return <CardRevealAnimation key={anim.id} data={anim.data} />;
    case 'card-defeat':
      return <CardDefeatAnimation key={anim.id} data={anim.data} />;
    case 'card-hide':
      return <CardHideAnimation key={anim.id} data={anim.data} />;
    case 'card-move':
      return <CardMoveAnimation key={anim.id} data={anim.data} />;
    case 'card-upgrade':
      return <CardUpgradeAnimation key={anim.id} data={anim.data} />;
    case 'power-token':
      return <PowerTokenAnimation key={anim.id} data={anim.data} />;
    case 'chakra-gain':
      return <ChakraGainAnimation key={anim.id} data={anim.data} />;
    case 'mission-score':
      return <MissionScoreAnimation key={anim.id} data={anim.data} />;
    case 'edge-transfer':
      return <EdgeTransferAnimation key={anim.id} data={anim.data} />;
    case 'turn-transition':
      return <TurnTransitionAnimation key={anim.id} data={anim.data} />;
    case 'game-end':
      
      return null;
    default:
      return null;
  }
}

const MOTION_TYPES: ReadonlySet<string> = new Set(['card-play', 'card-draw']);

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
      const run = type === 'card-play'
        ? playCardFlight(data, { isMyAction })
        : playDrawFlight(data, { isMyAction });
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        completeAnimation(currentAnim.id);
      };
      run.then(finish).catch(finish);
      const safety = setTimeout(finish, 4000);
      if (type === 'card-draw') playSound('mulligan');
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
      case 'card-move':
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
