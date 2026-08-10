'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { LeaderboardModeSwitch, type LeaderboardMode } from './LeaderboardModeSwitch';

interface MyStats {
  elo: number;
  evolvingElo: number | null;
  wins: number;
  losses: number;
  evolvingWins: number | null;
  evolvingLosses: number | null;
  consecutiveWinsRanked: number | null;
  consecutiveWinsEvolving: number | null;
}

interface MyStatsPanelProps {
  username: string;
  mode: LeaderboardMode;
  onModeChange: (m: LeaderboardMode) => void;
}

export function MyStatsPanel({ username, mode, onModeChange }: MyStatsPanelProps) {
  const t = useTranslations();
  const [stats, setStats] = useState<MyStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!username) return;
    let aborted = false;
    setStats(null);
    setError(false);
    const safeName = encodeURIComponent(username);
    fetch(`/api/profile/${safeName}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('http')))
      .then((data: MyStats & { error?: string }) => {
        if (aborted) return;
        if (data && !data.error && typeof data.elo === 'number') {
          setStats(data);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (!aborted) setError(true);
      });
    return () => { aborted = true; };
  }, [username]);

  const elo = stats ? (mode === 'evolving' ? (stats.evolvingElo ?? 500) : stats.elo) : 0;
  const w = stats ? (mode === 'evolving' ? (stats.evolvingWins ?? 0) : stats.wins) : 0;
  const l = stats ? (mode === 'evolving' ? (stats.evolvingLosses ?? 0) : stats.losses) : 0;
  const total = w + l;
  const winRate = total > 0 ? Math.round((w / total) * 100) : 0;
  const winStreak = stats
    ? (mode === 'evolving' ? (stats.consecutiveWinsEvolving ?? 0) : (stats.consecutiveWinsRanked ?? 0))
    : 0;

  return (
    <section
      className="w-full"
      style={{
        backgroundColor: 'rgba(15, 15, 20, 0.78)',
        boxShadow: '0 12px 32px var(--t-shadow)',
      }}
    >
      <header
        className="flex items-center justify-between px-3 py-2.5"
        style={{ boxShadow: 'inset 0 -1px 0 var(--t-divider)' }}
      >
        <h2
          className="text-[11px] font-bold uppercase"
          style={{ color: 'var(--t-accent)', letterSpacing: '0.22em' }}
        >
          {t('online.myStats.title')}
        </h2>
        <LeaderboardModeSwitch value={mode} onChange={onModeChange} size="sm" layoutId="mystats-pill" />
      </header>

      <div className="px-4 py-4 relative">
        <AnimatePresence mode="wait">
          {error && (
            <div className="px-2 py-3 text-center">
              <span className="text-[10px]" style={{ color: 'var(--t-dim)' }}>{t('common.error')}</span>
            </div>
          )}
          {!error && (
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col gap-3"
            >
              <div className="flex items-end justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase" style={{ color: 'var(--t-dim)', letterSpacing: '0.18em' }}>
                    {t('online.myStats.eloLabel')}
                  </span>
                  <span
                    className="text-3xl font-bold tabular-nums"
                    style={{ color: 'var(--t-accent)', lineHeight: 1.05, letterSpacing: '0.02em' }}
                  >
                    {stats ? elo : '...'}
                  </span>
                </div>
                {stats && (
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] uppercase" style={{ color: 'var(--t-dim)', letterSpacing: '0.18em' }}>
                      {t('online.myStats.streakWin')}
                    </span>
                    <span
                      className="text-base font-bold tabular-nums"
                      style={{ color: winStreak > 0 ? '#8ad88a' : 'var(--t-muted)', lineHeight: 1 }}
                    >
                      {winStreak}
                    </span>
                  </div>
                )}
              </div>

              <div
                className="grid grid-cols-2 gap-2 pt-2"
                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}
              >
                <StatCell label={t('online.myStats.wins')} value={stats ? w : '...'} color="#8ad88a" />
                <StatCell label={t('online.myStats.losses')} value={stats ? l : '...'} color="#d88a8a" />
              </div>

              {stats && total > 0 && (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[9px] uppercase" style={{ color: 'var(--t-dim)', letterSpacing: '0.18em' }}>
                    {t('online.myStats.winRate')}
                  </span>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--t-text)' }}>
                    {winRate}%
                  </span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function StatCell({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="flex flex-col items-center py-2">
      <span
        className="text-lg font-bold tabular-nums"
        style={{ color, lineHeight: 1 }}
      >
        {value}
      </span>
      <span
        className="text-[8px] uppercase mt-1"
        style={{ color: 'var(--t-dim)', letterSpacing: '0.18em' }}
      >
        {label}
      </span>
    </div>
  );
}
