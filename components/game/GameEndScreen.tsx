'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useSocketStore } from '@/lib/socket/client';

export function GameEndScreen() {
  const t = useTranslations();
  const gameOver = useGameStore((s) => s.gameOver);
  const winner = useGameStore((s) => s.winner);
  const visibleState = useGameStore((s) => s.visibleState);
  const isOnlineGame = useGameStore((s) => s.isOnlineGame);
  const resetGame = useGameStore((s) => s.resetGame);
  const gameResult = useSocketStore((s) => s.gameResult);

  if (!gameOver || !visibleState) return null;

  const isRanked = isOnlineGame && gameResult?.isRanked;
  const eloDelta = gameResult?.eloDelta;

  const myPlayer = visibleState.myPlayer;
  const playerWon = winner === myPlayer;
  const isDraw = winner === null;

  const myScore = visibleState.myState.missionPoints;
  const oppScore = visibleState.opponentState.missionPoints;

  let headingText: string;
  let headingColor: string;
  if (isDraw) {
    headingText = t('game.end.draw');
    headingColor = '#888888';
  } else if (playerWon) {
    headingText = t('game.end.victory');
    headingColor = '#c4a35a';
  } else {
    headingText = t('game.end.defeat');
    headingColor = '#b33e3e';
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}
      >
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            type: 'spring',
            stiffness: 150,
            damping: 15,
            delay: 0.2,
          }}
          className="flex flex-col items-center gap-8 rounded-xl p-12"
          style={{
            backgroundColor: 'rgba(8, 8, 12, 0.92)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 16px 64px rgba(0, 0, 0, 0.7)',
            minWidth: '420px',
          }}
        >
          {/* Dramatic heading */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="flex flex-col items-center gap-2"
          >
            <motion.span
              className="text-5xl font-bold tracking-widest uppercase"
              style={{ color: headingColor }}
              animate={{
                textShadow: [
                  `0 0 20px ${headingColor}40`,
                  `0 0 40px ${headingColor}60`,
                  `0 0 20px ${headingColor}40`,
                ],
              }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              {headingText}
            </motion.span>
            <motion.div
              className="h-px w-32"
              style={{ backgroundColor: headingColor }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
            />
          </motion.div>

          {/* Score comparison */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex items-center gap-8"
          >
            {/* Player score */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm" style={{ color: '#888888' }}>
                {t('game.you')}
              </span>
              <motion.span
                className="text-4xl font-bold tabular-nums"
                style={{ color: '#c4a35a' }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.0, type: 'spring', stiffness: 200 }}
              >
                {myScore}
              </motion.span>
              <span className="text-xs" style={{ color: '#888888' }}>
                {t('game.score')}
              </span>
            </div>

            {/* Separator */}
            <div className="flex flex-col items-center gap-1">
              <span
                className="text-2xl font-bold"
                style={{ color: '#333333' }}
              >
                -
              </span>
            </div>

            {/* Opponent score */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm" style={{ color: '#888888' }}>
                {t('game.opponent')}
              </span>
              <motion.span
                className="text-4xl font-bold tabular-nums"
                style={{ color: '#b33e3e' }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.2, type: 'spring', stiffness: 200 }}
              >
                {oppScore}
              </motion.span>
              <span className="text-xs" style={{ color: '#888888' }}>
                {t('game.score')}
              </span>
            </div>
          </motion.div>

          {/* Edge token winner note */}
          {isDraw && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
              className="text-xs"
              style={{ color: '#888888' }}
            >
              {t('game.end.tieBreaker')}
            </motion.span>
          )}

          {/* ELO change for ranked matches */}
          {isRanked && eloDelta != null && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4 }}
              className="flex flex-col items-center gap-1"
            >
              <span className="text-xs uppercase tracking-wider" style={{ color: '#888888' }}>
                {t('game.end.rankedMatch')}
              </span>
              <span
                className="text-lg font-bold tabular-nums"
                style={{ color: eloDelta >= 0 ? '#4a9e4a' : '#b33e3e' }}
              >
                {eloDelta >= 0 ? '+' : ''}{eloDelta} ELO
              </span>
            </motion.div>
          )}

          {/* Play Again button */}
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={resetGame}
            className="px-8 py-3 rounded-lg text-sm font-medium uppercase tracking-wider cursor-pointer"
            style={{
              backgroundColor: '#c4a35a',
              color: '#0a0a0a',
              border: '1px solid #c4a35a',
              boxShadow: '0 4px 16px rgba(196, 163, 90, 0.3)',
            }}
          >
            {t('game.end.playAgain')}
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
