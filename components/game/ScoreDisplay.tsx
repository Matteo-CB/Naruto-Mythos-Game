'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';

interface ScoreDisplayProps {
  playerScore: number;
  opponentScore: number;
  playerLabel: string;
  opponentLabel: string;
}

export function ScoreDisplay({
  playerScore,
  opponentScore,
  playerLabel,
  opponentLabel,
}: ScoreDisplayProps) {
  const t = useTranslations();
  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-3"
      style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}
    >
      <span
        className="text-xs uppercase tracking-wider text-center"
        style={{ color: '#888888' }}
      >
        {t('game.board.missionPoints')}
      </span>
      <div className="flex items-center justify-between gap-4">
        <ScoreEntry label={playerLabel} score={playerScore} color="#c4a35a" />
        <span style={{ color: '#888888' }} className="text-sm">{t('game.board.vs')}</span>
        <ScoreEntry label={opponentLabel} score={opponentScore} color="#b33e3e" />
      </div>
    </div>
  );
}

function ScoreEntry({
  label,
  score,
  color,
}: {
  label: string;
  score: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs" style={{ color: '#888888' }}>
        {label}
      </span>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={score}
          initial={{ scale: 1.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="text-2xl font-bold tabular-nums"
          style={{ color }}
        >
          {score}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
