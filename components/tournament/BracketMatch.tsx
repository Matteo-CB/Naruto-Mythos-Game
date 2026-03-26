'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import type { TournamentMatch } from '@/stores/tournamentStore';

interface Props {
  match: TournamentMatch;
  index: number;
}

export function BracketMatch({ match, index }: Props) {
  const t = useTranslations('tournament');

  const isActive = match.status === 'in_progress';
  const isReady = match.status === 'ready';
  const isComplete = match.status === 'completed' || match.status === 'forfeit';

  const borderColor = isActive ? '#4a9eff' : isReady ? '#c4a35a' : isComplete ? '#333' : '#222';

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="flex flex-col"
      style={{
        backgroundColor: '#111',
        border: `2px solid ${borderColor}`,
        minWidth: 160,
        position: 'relative',
      }}
    >
      {isActive && (
        <motion.div
          className="absolute inset-0"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ repeat: Infinity, duration: 2 }}
          style={{ border: '2px solid #4a9eff', pointerEvents: 'none' }}
        />
      )}

      {/* Player 1 */}
      <div
        className="flex items-center justify-between px-3 py-2 text-xs"
        style={{
          color: match.winnerId === match.player1Id && match.winnerId ? '#c4a35a' : '#ccc',
          borderBottom: '1px solid #222',
          fontWeight: match.winnerId === match.player1Id ? 700 : 400,
        }}
      >
        <span className="truncate max-w-[120px]">
          {match.player1Username || (match.isBye ? '' : t('tbd'))}
        </span>
        {match.winnerId === match.player1Id && <span style={{ color: '#c4a35a' }}>W</span>}
      </div>

      {/* Player 2 */}
      <div
        className="flex items-center justify-between px-3 py-2 text-xs"
        style={{
          color: match.winnerId === match.player2Id && match.winnerId ? '#c4a35a' : '#ccc',
          fontWeight: match.winnerId === match.player2Id ? 700 : 400,
        }}
      >
        <span className="truncate max-w-[120px]">
          {match.player2Username || (match.isBye ? t('bye') : t('tbd'))}
        </span>
        {match.winnerId === match.player2Id && <span style={{ color: '#c4a35a' }}>W</span>}
      </div>

      {/* Status badge */}
      {isActive && match.roomCode && (
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] uppercase tracking-wider cursor-pointer"
          style={{ color: '#4a9eff' }}>
          {t('spectate')}
        </div>
      )}
      {match.gameId && isComplete && (
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] uppercase tracking-wider" style={{ color: '#555' }}>
          {t('viewReplay')}
        </div>
      )}
    </motion.div>
  );
}
