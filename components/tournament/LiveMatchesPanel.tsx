'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import type { TournamentMatch } from '@/stores/tournamentStore';

interface Props {
  matches: TournamentMatch[];
  currentRound: number;
  totalRounds: number;
  userId?: string | null;
  format?: string;
}

function Countdown({ deadline }: { deadline: string }) {
  const [remaining, setRemaining] = useState<number>(() =>
    Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000)),
  );
  useEffect(() => {
    const tick = () => setRemaining(
      Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000)),
    );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const urgent = remaining <= 60;
  return (
    <span
      className="text-[10px] tabular-nums font-bold"
      style={{ color: urgent ? '#cc4444' : '#c4a35a' }}
    >
      {mins}:{secs.toString().padStart(2, '0')}
    </span>
  );
}

function Elapsed({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState<number>(() =>
    Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)),
  );
  useEffect(() => {
    const tick = () => setElapsed(
      Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)),
    );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return (
    <span className="text-[10px] tabular-nums" style={{ color: '#60a5fa' }}>
      {mins}:{secs.toString().padStart(2, '0')}
    </span>
  );
}

export function LiveMatchesPanel({ matches, currentRound, totalRounds, userId, format }: Props) {
  const t = useTranslations('tournament');

  const live = matches.filter(
    (m) => m.round === currentRound && m.status !== 'pending' && !m.isBye,
  );
  const ready = live.filter((m) => m.status === 'ready');
  const inProgress = live.filter((m) => m.status === 'in_progress');
  const done = live.filter((m) => m.status === 'completed' || m.status === 'forfeit');
  const total = live.length;
  const completed = done.length;

  if (total === 0) return null;

  return (
    <div className="mb-6 p-4" style={{ backgroundColor: '#0d0d10', border: '1px solid rgba(196, 163, 90, 0.18)' }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: '#c4a35a' }}>
          {format ? `${t('round')} ${currentRound} / ${totalRounds}` : `${t('round')} ${currentRound}`}
        </h2>
        <span className="text-[11px] tabular-nums" style={{ color: '#888' }}>
          {completed} / {total}
        </span>
      </div>

      <div
        className="h-1 mb-3 overflow-hidden"
        style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
      >
        <motion.div
          className="h-full"
          style={{ backgroundColor: '#c4a35a' }}
          animate={{ width: total > 0 ? `${(completed / total) * 100}%` : '0%' }}
          transition={{ duration: 0.4 }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {inProgress.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-between px-3 py-2 text-xs"
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.06)',
                borderLeft: '3px solid #4a9eff',
              }}
            >
              <span style={{ color: '#e0e0e0' }}>
                <PlayerName name={m.player1Username} highlight={m.player1Id === userId} />
                <span className="mx-2" style={{ color: '#555' }}>vs</span>
                <PlayerName name={m.player2Username} highlight={m.player2Id === userId} />
              </span>
              <div className="flex items-center gap-2">
                {m.startedAt && <Elapsed startedAt={m.startedAt} />}
                <span className="text-[9px] uppercase tracking-wider" style={{ color: '#4a9eff' }}>
                  {t('swissStatusInProgress')}
                </span>
              </div>
            </motion.div>
          ))}

          {ready.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-between px-3 py-2 text-xs"
              style={{
                backgroundColor: 'rgba(196, 163, 90, 0.04)',
                borderLeft: '3px solid #c4a35a',
              }}
            >
              <span style={{ color: '#e0e0e0' }}>
                <PlayerName name={m.player1Username} highlight={m.player1Id === userId} />
                <span className="mx-2" style={{ color: '#555' }}>vs</span>
                <PlayerName name={m.player2Username} highlight={m.player2Id === userId} />
              </span>
              <div className="flex items-center gap-2">
                {m.absenceDeadline && <Countdown deadline={m.absenceDeadline} />}
                <span className="text-[9px] uppercase tracking-wider" style={{ color: '#c4a35a' }}>
                  {t('swissStatusReady')}
                </span>
              </div>
            </motion.div>
          ))}

          {done.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-between px-3 py-1.5 text-xs"
              style={{
                backgroundColor: 'rgba(74, 222, 128, 0.04)',
                borderLeft: '3px solid rgba(74, 222, 128, 0.3)',
                opacity: 0.75,
              }}
            >
              <span style={{ color: '#aaa' }}>
                <PlayerName name={m.player1Username} highlight={m.player1Id === userId} won={m.winnerId === m.player1Id} />
                <span className="mx-2" style={{ color: '#555' }}>vs</span>
                <PlayerName name={m.player2Username} highlight={m.player2Id === userId} won={m.winnerId === m.player2Id} />
              </span>
              <span className="text-[9px] uppercase tracking-wider" style={{ color: m.status === 'forfeit' ? '#f87171' : '#4ade80' }}>
                {m.status === 'forfeit' ? t('swissStatusForfeit') : t('swissStatusCompleted')}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PlayerName({ name, highlight, won }: { name?: string | null; highlight?: boolean; won?: boolean }) {
  return (
    <span
      style={{
        color: won ? '#c4a35a' : highlight ? '#e0e0e0' : '#bbb',
        fontWeight: won || highlight ? 700 : 400,
        textDecoration: highlight ? 'underline' : 'none',
        textUnderlineOffset: '3px',
      }}
    >
      {name ?? '?'}
    </span>
  );
}
