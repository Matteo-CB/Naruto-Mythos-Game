'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { TournamentMatch } from '@/stores/tournamentStore';
import { PlayerNameLink } from '@/components/social/PlayerNameLink';

interface Props {
  match: TournamentMatch;
  index: number;
}

function useCountdown(deadline: string | null | undefined): number | null {
  const [remaining, setRemaining] = useState<number | null>(() => {
    if (!deadline) return null;
    return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
  });
  useEffect(() => {
    if (!deadline) { setRemaining(null); return; }
    const tick = () => {
      const secs = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
      setRemaining(secs);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);
  return remaining;
}

export function BracketMatch({ match, index }: Props) {
  const t = useTranslations('tournament');

  const isActive = match.status === 'in_progress';
  const isReady = match.status === 'ready';
  const isComplete = match.status === 'completed' || match.status === 'forfeit';

  const remaining = useCountdown(match.absenceDeadline ?? null);

  const borderColor = isActive ? 'var(--t-accent-bright)' : isReady ? 'var(--t-accent)' : isComplete ? 'var(--t-border-strong)' : 'var(--t-border)';

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="flex flex-col"
      style={{
        backgroundColor: 'var(--t-panel)',
        border: `2px solid ${borderColor}`,
        minWidth: 160,
        position: 'relative',
      }}
    >
      {isActive && (
        <motion.div
          className="absolute inset-0"
          animate={{
            boxShadow: [
              '0 0 0px rgba(232, 196, 119, 0)',
              '0 0 16px rgba(232, 196, 119, 0.5)',
              '0 0 0px rgba(232, 196, 119, 0)',
            ],
          }}
          transition={{ repeat: Infinity, duration: 2 }}
          style={{ pointerEvents: 'none' }}
        />
      )}

      <div
        className="flex items-center justify-between px-3 py-2 text-xs"
        style={{
          color: match.winnerId === match.player1Id && match.winnerId ? 'var(--t-accent)' : 'var(--t-text)',
          borderBottom: '1px solid var(--t-border)',
          fontWeight: match.winnerId === match.player1Id ? 700 : 400,
        }}
      >
        <PlayerNameLink username={match.player1Username} className="truncate max-w-[120px]">
          {match.player1Username || (match.isBye ? '' : t('tbd'))}
        </PlayerNameLink>
        {match.winnerId === match.player1Id && <span style={{ color: 'var(--t-accent)' }}>W</span>}
      </div>

      <div
        className="flex items-center justify-between px-3 py-2 text-xs"
        style={{
          color: match.winnerId === match.player2Id && match.winnerId ? 'var(--t-accent)' : 'var(--t-text)',
          fontWeight: match.winnerId === match.player2Id ? 700 : 400,
        }}
      >
        <PlayerNameLink username={match.player2Username} className="truncate max-w-[120px]">
          {match.player2Username || (match.isBye ? t('bye') : t('tbd'))}
        </PlayerNameLink>
        {match.winnerId === match.player2Id && <span style={{ color: 'var(--t-accent)' }}>W</span>}
      </div>

      {((match.player1GameWins ?? 0) > 0 || (match.player2GameWins ?? 0) > 0) && (
        <div
          className="px-2 py-0.5 text-center text-[10px] font-bold tabular-nums uppercase tracking-wider"
          style={{ backgroundColor: 'var(--t-accent-tint)', color: 'var(--t-accent)' }}
        >
          {t('seriesScore', { p1: String(match.player1GameWins ?? 0), p2: String(match.player2GameWins ?? 0) })}
        </div>
      )}

      {isReady && remaining !== null && remaining > 0 && (
        <div
          className="px-2 py-1 flex items-center justify-center gap-1 text-[10px] tabular-nums"
          style={{
            backgroundColor: remaining <= 60 ? 'rgba(204, 68, 68, 0.12)' : 'var(--t-accent-tint)',
            borderTop: `1px solid ${remaining <= 60 ? 'var(--t-danger)' : 'var(--t-accent)'}33`,
            color: remaining <= 60 ? 'var(--t-danger)' : 'var(--t-accent)',
          }}
        >
          <span style={{ opacity: 0.7 }}>⏱</span>
          <span>{Math.floor(remaining / 60)}:{(remaining % 60).toString().padStart(2, '0')}</span>
        </div>
      )}

      {isActive && match.roomCode && (
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] uppercase tracking-wider cursor-pointer"
          style={{ color: '#4a9eff' }}>
          {t('spectate')}
        </div>
      )}
      {match.gameId && isComplete && (
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] uppercase tracking-wider" style={{ color: 'var(--t-dim)' }}>
          {t('viewReplay')}
        </div>
      )}
    </motion.div>
  );
}
