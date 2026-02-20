'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';

export function OpponentStatsBar() {
  const t = useTranslations();
  const visibleState = useGameStore((s) => s.visibleState);
  const playerDisplayNames = useGameStore((s) => s.playerDisplayNames);

  if (!visibleState) return null;

  const {
    edgeHolder,
    myPlayer,
    opponentState,
    activePlayer,
  } = visibleState;

  const opponentPlayer = myPlayer === 'player1' ? 'player2' : 'player1';
  const hasEdge = edgeHolder === opponentPlayer;
  const isOpponentTurn = activePlayer === opponentPlayer;
  const opponentName = opponentPlayer === 'player1' ? playerDisplayNames.player1 : playerDisplayNames.player2;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1 w-full"
      style={{
        backgroundColor: 'rgba(8, 8, 12, 0.8)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(179, 62, 62, 0.15)',
      }}
    >
      {/* Opponent name */}
      <span className="text-xs font-semibold shrink-0" style={{ color: '#b33e3e' }}>
        {opponentName}
      </span>

      {/* Edge token */}
      <div className="flex items-center gap-1 shrink-0" title={t('game.edge')}>
        <div
          className="rounded-full"
          style={{
            width: 8,
            height: 8,
            backgroundColor: hasEdge ? '#b33e3e' : 'rgba(255, 255, 255, 0.1)',
            boxShadow: hasEdge ? '0 0 6px rgba(179, 62, 62, 0.6)' : 'none',
          }}
        />
        <span className="text-[10px]" style={{ color: hasEdge ? '#b33e3e' : '#555555' }}>
          Edge
        </span>
      </div>

      {/* Active turn indicator */}
      {isOpponentTurn && (
        <motion.span
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
          style={{
            backgroundColor: 'rgba(179, 62, 62, 0.15)',
            color: '#b33e3e',
            border: '1px solid rgba(179, 62, 62, 0.25)',
          }}
        >
          {t('game.opponentTurn')}
        </motion.span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Chakra */}
      <StatPill label={t('game.chakra')} value={opponentState.chakra} color="#b33e3e" />

      {/* Score */}
      <StatPill label={t('game.score')} value={opponentState.missionPoints} color="#e0e0e0" />
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5 rounded"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <span className="text-[10px]" style={{ color: '#666666' }}>{label}</span>
      <motion.span
        key={value}
        initial={{ scale: 1.3, opacity: 0.7 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-xs tabular-nums font-bold"
        style={{ color }}
      >
        {value}
      </motion.span>
    </div>
  );
}
