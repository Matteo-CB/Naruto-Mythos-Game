'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { PanelFrame } from './PopupPrimitives';

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
    <PanelFrame accentColor="rgba(196, 163, 90, 0.25)" padding="10px 12px">
      <div className="flex flex-col gap-2">
        <span
          className="text-xs uppercase tracking-wider text-center"
          style={{ color: '#888888' }}
        >
          {t('game.board.missionPoints')}
        </span>
        <div className="flex items-center justify-between gap-4">
          <ScoreEntry label={playerLabel} score={playerScore} color="#c4a35a" />
          <div
            style={{
              width: '1px',
              height: '28px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
            }}
          />
          <ScoreEntry label={opponentLabel} score={opponentScore} color="#b33e3e" />
        </div>
      </div>
    </PanelFrame>
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
          style={{ color, fontFamily: "'NJNaruto', Arial, sans-serif" }}
        >
          {score}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
