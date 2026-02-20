'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';

export function PlayerStatsBar() {
  const t = useTranslations();
  const visibleState = useGameStore((s) => s.visibleState);
  const playerDisplayNames = useGameStore((s) => s.playerDisplayNames);

  if (!visibleState) return null;

  const {
    turn,
    phase,
    edgeHolder,
    myPlayer,
    myState,
  } = visibleState;

  const hasEdge = edgeHolder === myPlayer;
  const playerName = myPlayer === 'player1' ? playerDisplayNames.player1 : playerDisplayNames.player2;

  const phaseKeys: Record<string, string> = {
    setup: 'game.phase.start',
    mulligan: 'game.phase.mulligan',
    start: 'game.phase.start',
    action: 'game.phase.action',
    mission: 'game.phase.mission',
    end: 'game.phase.end',
    gameOver: 'game.phase.gameOver',
  };

  return (
    <div
      className="flex items-center gap-2 px-3 py-1 w-full"
      style={{
        backgroundColor: 'rgba(8, 8, 12, 0.8)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid rgba(196, 163, 90, 0.15)',
      }}
    >
      {/* Player name */}
      <span className="text-xs font-semibold shrink-0" style={{ color: '#c4a35a' }}>
        {playerName}
      </span>

      {/* Edge token */}
      <div className="flex items-center gap-1 shrink-0" title={t('game.edge')}>
        <div
          className="rounded-full"
          style={{
            width: 8,
            height: 8,
            backgroundColor: hasEdge ? '#c4a35a' : 'rgba(255, 255, 255, 0.1)',
            boxShadow: hasEdge ? '0 0 6px rgba(196, 163, 90, 0.6)' : 'none',
          }}
        />
        <span className="text-[10px]" style={{ color: hasEdge ? '#c4a35a' : '#555555' }}>
          Edge
        </span>
      </div>

      {/* Turn + Phase */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px]" style={{ color: '#888888' }}>
          {t('game.turnLabel')}
        </span>
        <span className="text-xs font-bold tabular-nums" style={{ color: '#c4a35a' }}>
          {turn}
        </span>
        <span className="text-[10px]" style={{ color: '#555555' }}>/4</span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: 'rgba(196, 163, 90, 0.1)',
            color: '#c4a35a',
            border: '1px solid rgba(196, 163, 90, 0.2)',
          }}
        >
          {phaseKeys[phase] ? t(phaseKeys[phase]) : phase}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Chakra */}
      <StatPill label={t('game.chakra')} value={myState.chakra} color="#c4a35a" />

      {/* Score */}
      <StatPill label={t('game.score')} value={myState.missionPoints} color="#e0e0e0" />
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
