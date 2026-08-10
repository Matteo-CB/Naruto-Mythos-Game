'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';

interface TopPlayer {
  id: string;
  username: string;
  evolvingElo: number;
  wins: number;
  losses: number;
  draws: number;
}

const GOLD = 'var(--t-accent)';
const PANEL_BG = 'var(--t-panel)';
const BORDER = 'var(--t-border)';
const TEXT_LIGHT = 'var(--t-text)';
const TEXT_DIM = 'var(--t-muted)';

function rankAccent(rank: number): string {
  if (rank === 1) return '#e8c870';
  if (rank === 2) return '#b8b8b8';
  if (rank === 3) return '#b88060';
  return '#5a4a2a';
}

export function EvolvingTop5() {
  const t = useTranslations();
  const [players, setPlayers] = useState<TopPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/leaderboard?type=evolving&limit=5')
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((data: { users?: TopPlayer[] }) => {
        if (cancelled) return;
        setPlayers(Array.isArray(data.users) ? data.users : []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setPlayers([]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full"
      style={{
        backgroundColor: PANEL_BG,
        border: `1px solid ${BORDER}`,
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: GOLD, boxShadow: '0 0 6px var(--t-accent-glow)' }}
          />
          <h2
            className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.22em]"
            style={{ color: GOLD }}
          >
            {t('evolving.lobby.topPlayersTitle')}
          </h2>
        </div>
        <Link
          href={'/leaderboard?type=evolving' as '/leaderboard'}
          className="text-[9px] uppercase tracking-wider transition-colors"
          style={{ color: TEXT_DIM }}
        >
          {t('evolving.lobby.viewAll')}
        </Link>
      </div>

      <div className="px-3 py-2">
        {loading && (
          <div className="text-[10px] italic py-3 text-center" style={{ color: TEXT_DIM }}>
            {t('common.loading')}
          </div>
        )}
        {!loading && players.length === 0 && (
          <div className="text-[10px] italic py-3 text-center" style={{ color: TEXT_DIM }}>
            {t('evolving.lobby.noTopPlayers')}
          </div>
        )}
        {!loading && players.length > 0 && (
          <ol className="flex flex-col">
            {players.map((p, i) => {
              const rank = i + 1;
              const accent = rankAccent(rank);
              const totalGames = p.wins + p.losses + p.draws;
              const winRate = totalGames > 0 ? Math.round((p.wins / totalGames) * 100) : 0;
              return (
                <motion.li
                  key={p.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 + i * 0.04 }}
                  className="flex items-center gap-2 py-1.5 px-1"
                  style={{ borderTop: i === 0 ? 'none' : `1px solid ${BORDER}` }}
                >
                  <span
                    className="shrink-0 inline-flex items-center justify-center text-[10px] font-bold tabular-nums"
                    style={{
                      color: accent,
                      border: `1px solid ${accent}`,
                      backgroundColor: 'rgba(0,0,0,0.3)',
                      width: '22px',
                      height: '22px',
                      borderRadius: '3px',
                    }}
                  >
                    {rank}
                  </span>
                  <Link
                    href={`/profile/${p.username}` as '/profile/[username]'}
                    className="flex-1 min-w-0 text-xs truncate transition-colors"
                    style={{ color: TEXT_LIGHT }}
                  >
                    {p.username}
                  </Link>
                  <span
                    className="hidden sm:inline text-[9px] tabular-nums"
                    style={{ color: TEXT_DIM }}
                  >
                    {p.wins}W / {p.losses}L
                    {totalGames > 0 ? ` · ${winRate}%` : ''}
                  </span>
                  <span
                    className="shrink-0 text-[11px] font-bold tabular-nums"
                    style={{ color: GOLD }}
                  >
                    {p.evolvingElo}
                  </span>
                </motion.li>
              );
            })}
          </ol>
        )}
      </div>
    </motion.div>
  );
}
