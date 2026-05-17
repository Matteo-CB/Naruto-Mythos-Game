'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { LeaderboardModeSwitch, type LeaderboardMode } from './LeaderboardModeSwitch';

interface LeaderboardUser {
  id: string;
  username: string;
  elo: number;
  evolvingElo: number | null;
  wins: number;
  losses: number;
  draws: number;
  evolvingWins: number | null;
  evolvingLosses: number | null;
  evolvingDraws: number | null;
}

interface LeaderboardPanelProps {
  mode: LeaderboardMode;
  onModeChange: (m: LeaderboardMode) => void;
  topCount?: number;
}

export function LeaderboardPanel({ mode, onModeChange, topCount = 5 }: LeaderboardPanelProps) {
  const t = useTranslations();
  const [users, setUsers] = useState<LeaderboardUser[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let aborted = false;
    setUsers(null);
    setError(false);
    const url = `/api/leaderboard?limit=${topCount}&type=${mode}`;
    fetch(url)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('http')))
      .then((data: { users: LeaderboardUser[] }) => {
        if (!aborted) setUsers(data.users ?? []);
      })
      .catch(() => {
        if (!aborted) setError(true);
      });
    return () => { aborted = true; };
  }, [mode, topCount]);

  return (
    <section
      className="w-full"
      style={{
        backgroundColor: 'rgba(15, 15, 20, 0.78)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
      }}
    >
      <header
        className="flex items-center justify-between px-3 py-2.5"
        style={{ boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.04)' }}
      >
        <h2
          className="text-[11px] font-bold uppercase"
          style={{ color: '#c4a35a', letterSpacing: '0.22em' }}
        >
          {t('online.leaderboard.title')}
        </h2>
        <LeaderboardModeSwitch value={mode} onChange={onModeChange} size="sm" />
      </header>

      <div className="px-2 py-2 min-h-[180px] relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col"
          >
            {users === null && !error && (
              <LeaderboardSkeleton rows={topCount} />
            )}
            {error && (
              <div className="px-3 py-6 text-center">
                <span className="text-[10px]" style={{ color: '#555' }}>
                  {t('common.error')}
                </span>
              </div>
            )}
            {users && users.length === 0 && (
              <div className="px-3 py-6 text-center">
                <span className="text-[10px]" style={{ color: '#555' }}>
                  {t('online.leaderboard.empty')}
                </span>
              </div>
            )}
            {users && users.length > 0 && users.map((u, i) => {
              const elo = mode === 'evolving' ? (u.evolvingElo ?? 500) : u.elo;
              const w = mode === 'evolving' ? (u.evolvingWins ?? 0) : u.wins;
              const l = mode === 'evolving' ? (u.evolvingLosses ?? 0) : u.losses;
              return (
                <Link
                  key={u.id}
                  href={`/profile/${u.username}`}
                  className="flex items-center gap-2 px-2.5 py-2 cursor-pointer no-select"
                  style={{
                    boxShadow: i < users.length - 1 ? 'inset 0 -1px 0 rgba(255,255,255,0.03)' : undefined,
                  }}
                >
                  <span
                    className="text-[11px] font-bold tabular-nums"
                    style={{ color: i === 0 ? '#c4a35a' : i === 1 ? '#aaa' : i === 2 ? '#8a6a3a' : '#555', minWidth: 18 }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="flex-1 text-[12px] truncate"
                    style={{ color: '#e8e8e8' }}
                  >
                    {u.username}
                  </span>
                  <span
                    className="text-[11px] font-bold tabular-nums"
                    style={{ color: '#c4a35a', minWidth: 42, textAlign: 'right' }}
                  >
                    {elo}
                  </span>
                  <span
                    className="text-[9px] tabular-nums hidden sm:inline"
                    style={{ color: '#444', minWidth: 52, textAlign: 'right' }}
                  >
                    {w}{t('online.leaderboard.winShort')} / {l}{t('online.leaderboard.lossShort')}
                  </span>
                </Link>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

function LeaderboardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      {Array.from({ length: rows }).map((_, i) => (
        <motion.div
          key={i}
          animate={{ opacity: [0.25, 0.45, 0.25] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.08 }}
          className="h-9 mx-2"
          style={{ backgroundColor: 'rgba(255,255,255,0.025)' }}
        />
      ))}
    </div>
  );
}
