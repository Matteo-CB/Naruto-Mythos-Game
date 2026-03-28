'use client';

import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo } from 'react';
import type { TournamentMatch } from '@/stores/tournamentStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwissStandingEntry {
  userId: string;
  username: string;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  matchPoints: number;
  buchholz: number;
  buchholzExtended: number;
  seed: number;
  hadBye: boolean;
}

interface SwissStandingsProps {
  standings: SwissStandingEntry[];
  matches: TournamentMatch[];
  totalRounds: number;
  currentRound: number;
  winnerId?: string | null;
  winnerUsername?: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GOLD = '#c4a35a';
const SILVER = '#a8a8a8';
const BRONZE = '#cd7f32';
const MEDAL_COLORS = [GOLD, SILVER, BRONZE];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SwissStandings({
  standings,
  matches,
  totalRounds,
  currentRound,
  winnerId,
  winnerUsername,
}: SwissStandingsProps) {
  const t = useTranslations('tournament');

  // Past rounds that are fully collapsed by default
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());

  const toggleRound = (round: number) => {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  };

  // Derive current round matches and past round matches
  const currentRoundMatches = useMemo(
    () =>
      matches
        .filter((m) => m.round === currentRound)
        .sort((a, b) => a.matchIndex - b.matchIndex),
    [matches, currentRound],
  );

  const pastRounds = useMemo(() => {
    const rounds: { round: number; matches: TournamentMatch[] }[] = [];
    for (let r = 1; r < currentRound; r++) {
      const roundMatches = matches
        .filter((m) => m.round === r)
        .sort((a, b) => a.matchIndex - b.matchIndex);
      if (roundMatches.length > 0) {
        rounds.push({ round: r, matches: roundMatches });
      }
    }
    return rounds;
  }, [matches, currentRound]);

  const isCompleted = !!winnerId;

  return (
    <div className="flex flex-col gap-6">
      {/* Champion banner */}
      {isCompleted && winnerUsername && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="flex flex-col items-center py-6 px-4"
          style={{
            border: `2px solid ${GOLD}`,
            backgroundColor: 'rgba(196, 163, 90, 0.08)',
          }}
        >
          <span
            className="text-[10px] font-bold uppercase tracking-widest mb-2"
            style={{ color: GOLD }}
          >
            {t('champion')}
          </span>
          <motion.span
            className="text-lg font-bold tracking-wide"
            style={{ color: GOLD, fontFamily: 'var(--font-display)' }}
            animate={{
              textShadow: [
                '0 0 10px rgba(196,163,90,0.3)',
                '0 0 20px rgba(196,163,90,0.6)',
                '0 0 10px rgba(196,163,90,0.3)',
              ],
            }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            {winnerUsername}
          </motion.span>

          {/* Top 3 podium */}
          {standings.length >= 2 && (
            <div className="flex items-end gap-6 mt-4">
              {standings.slice(0, 3).map((s, i) => (
                <motion.div
                  key={s.userId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.15 }}
                  className="flex flex-col items-center"
                >
                  <span
                    className="text-xs font-bold"
                    style={{ color: MEDAL_COLORS[i] }}
                  >
                    #{i + 1}
                  </span>
                  <span className="text-xs mt-0.5" style={{ color: '#e0e0e0' }}>
                    {s.username}
                  </span>
                  <span className="text-[10px] mt-0.5" style={{ color: '#888' }}>
                    {s.wins}-{s.losses}{s.draws > 0 ? `-${s.draws}` : ''}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3
          className="text-sm font-bold uppercase tracking-widest"
          style={{ color: GOLD, fontFamily: 'var(--font-display)' }}
        >
          {t('swissStandings')}
        </h3>
        <span className="text-xs" style={{ color: '#888' }}>
          {t('swissRoundOf', { current: currentRound, total: totalRounds })}
        </span>
      </div>

      {/* Standings table */}
      <div
        className="overflow-x-auto"
        style={{ border: '1px solid #262626', backgroundColor: '#111' }}
      >
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #262626' }}>
              <th
                className="text-left px-3 py-2 font-medium uppercase tracking-wider"
                style={{ color: '#666', width: '40px' }}
              >
                {t('swissRank')}
              </th>
              <th
                className="text-left px-3 py-2 font-medium uppercase tracking-wider"
                style={{ color: '#666' }}
              >
                {t('swissPlayer')}
              </th>
              <th
                className="text-center px-3 py-2 font-medium uppercase tracking-wider"
                style={{ color: '#666', width: '70px' }}
              >
                {t('swissRecord')}
              </th>
              <th
                className="text-center px-3 py-2 font-medium uppercase tracking-wider"
                style={{ color: '#666', width: '50px' }}
              >
                {t('swissPoints')}
              </th>
              <th
                className="text-center px-3 py-2 font-medium uppercase tracking-wider"
                style={{ color: '#666', width: '55px' }}
              >
                {t('swissBuchholz')}
              </th>
              <th
                className="text-center px-3 py-2 font-medium uppercase tracking-wider"
                style={{ color: '#666', width: '55px' }}
              >
                {t('swissBuchholzExt')}
              </th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {standings.map((s, i) => {
                const medalColor = i < 3 ? MEDAL_COLORS[i] : undefined;
                const isWinner = s.userId === winnerId;

                return (
                  <motion.tr
                    key={s.userId}
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ delay: i * 0.03, duration: 0.25 }}
                    style={{
                      borderBottom: '1px solid #1a1a1a',
                      borderLeft: medalColor
                        ? `3px solid ${medalColor}`
                        : '3px solid transparent',
                      backgroundColor: isWinner
                        ? 'rgba(196, 163, 90, 0.06)'
                        : 'transparent',
                    }}
                  >
                    <td
                      className="px-3 py-2 font-bold"
                      style={{ color: medalColor ?? '#555' }}
                    >
                      {s.rank}
                    </td>
                    <td className="px-3 py-2" style={{ color: '#e0e0e0' }}>
                      <span
                        style={{
                          color: isWinner ? GOLD : '#e0e0e0',
                          fontWeight: isWinner ? 700 : 400,
                        }}
                      >
                        {s.username}
                      </span>
                      {s.hadBye && (
                        <span
                          className="ml-2 text-[9px] uppercase tracking-wider"
                          style={{ color: '#555' }}
                        >
                          {t('swissByeLabel')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center" style={{ color: '#ccc' }}>
                      {s.wins}-{s.losses}{s.draws > 0 ? `-${s.draws}` : ''}
                    </td>
                    <td
                      className="px-3 py-2 text-center font-bold"
                      style={{ color: GOLD }}
                    >
                      {s.matchPoints}
                    </td>
                    <td className="px-3 py-2 text-center" style={{ color: '#999' }}>
                      {s.buchholz}
                    </td>
                    <td className="px-3 py-2 text-center" style={{ color: '#777' }}>
                      {s.buchholzExtended}
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Current round pairings */}
      {!isCompleted && currentRoundMatches.length > 0 && (
        <div>
          <h4
            className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: GOLD, fontFamily: 'var(--font-display)' }}
          >
            {t('swissCurrentPairings')}
          </h4>
          <div className="flex flex-col gap-2">
            {currentRoundMatches.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between px-3 py-2"
                style={{
                  backgroundColor: '#111',
                  border: '1px solid #262626',
                }}
              >
                <div className="flex items-center gap-2 text-xs">
                  {m.isBye ? (
                    <span style={{ color: '#e0e0e0' }}>
                      {m.player1Username ?? m.player2Username}
                      <span className="ml-2" style={{ color: '#666' }}>
                        -- {t('swissByeLabel')}
                      </span>
                    </span>
                  ) : (
                    <span style={{ color: '#e0e0e0' }}>
                      <span
                        style={{
                          color:
                            m.winnerId === m.player1Id ? GOLD : '#e0e0e0',
                          fontWeight:
                            m.winnerId === m.player1Id ? 700 : 400,
                        }}
                      >
                        {m.player1Username ?? t('tbd')}
                      </span>
                      <span className="mx-2" style={{ color: '#555' }}>
                        vs
                      </span>
                      <span
                        style={{
                          color:
                            m.winnerId === m.player2Id ? GOLD : '#e0e0e0',
                          fontWeight:
                            m.winnerId === m.player2Id ? 700 : 400,
                        }}
                      >
                        {m.player2Username ?? t('tbd')}
                      </span>
                    </span>
                  )}
                </div>
                <MatchStatusBadge status={m.status} />
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Past rounds (collapsible) */}
      {pastRounds.length > 0 && (
        <div>
          <h4
            className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: '#888', fontFamily: 'var(--font-display)' }}
          >
            {t('swissPastRounds')}
          </h4>
          <div className="flex flex-col gap-2">
            {pastRounds.map(({ round, matches: roundMatches }) => (
              <div
                key={round}
                style={{
                  border: '1px solid #262626',
                  backgroundColor: '#111',
                }}
              >
                <button
                  onClick={() => toggleRound(round)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium uppercase tracking-wider cursor-pointer"
                  style={{
                    color: expandedRounds.has(round) ? GOLD : '#888',
                    backgroundColor: 'transparent',
                    border: 'none',
                  }}
                >
                  <span>
                    {t('round')} {round}
                  </span>
                  <span style={{ color: '#555' }}>
                    {expandedRounds.has(round) ? '−' : '+'}
                  </span>
                </button>
                <AnimatePresence>
                  {expandedRounds.has(round) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div
                        className="flex flex-col gap-1 px-3 pb-3"
                        style={{ borderTop: '1px solid #1a1a1a' }}
                      >
                        {roundMatches.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center justify-between py-1.5 text-xs"
                          >
                            {m.isBye ? (
                              <span style={{ color: '#ccc' }}>
                                {m.player1Username ?? m.player2Username}
                                <span className="ml-2" style={{ color: '#666' }}>
                                  -- {t('swissByeLabel')}
                                </span>
                              </span>
                            ) : (
                              <span style={{ color: '#ccc' }}>
                                <span
                                  style={{
                                    color:
                                      m.winnerId === m.player1Id
                                        ? GOLD
                                        : '#ccc',
                                    fontWeight:
                                      m.winnerId === m.player1Id ? 700 : 400,
                                  }}
                                >
                                  {m.player1Username}
                                </span>
                                <span className="mx-2" style={{ color: '#555' }}>
                                  vs
                                </span>
                                <span
                                  style={{
                                    color:
                                      m.winnerId === m.player2Id
                                        ? GOLD
                                        : '#ccc',
                                    fontWeight:
                                      m.winnerId === m.player2Id ? 700 : 400,
                                  }}
                                >
                                  {m.player2Username}
                                </span>
                              </span>
                            )}
                            <MatchStatusBadge status={m.status} />
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match status badge sub-component
// ---------------------------------------------------------------------------

function MatchStatusBadge({ status }: { status: string }) {
  const t = useTranslations('tournament');

  const config: Record<string, { bg: string; border: string; color: string; label: string }> = {
    pending: {
      bg: 'rgba(136, 136, 136, 0.08)',
      border: '1px solid #333',
      color: '#888',
      label: t('swissStatusPending'),
    },
    ready: {
      bg: 'rgba(196, 163, 90, 0.08)',
      border: '1px solid rgba(196, 163, 90, 0.3)',
      color: GOLD,
      label: t('swissStatusReady'),
    },
    in_progress: {
      bg: 'rgba(59, 130, 246, 0.08)',
      border: '1px solid rgba(59, 130, 246, 0.3)',
      color: '#60a5fa',
      label: t('swissStatusInProgress'),
    },
    completed: {
      bg: 'rgba(74, 222, 128, 0.08)',
      border: '1px solid rgba(74, 222, 128, 0.3)',
      color: '#4ade80',
      label: t('swissStatusCompleted'),
    },
    forfeit: {
      bg: 'rgba(204, 68, 68, 0.08)',
      border: '1px solid rgba(204, 68, 68, 0.3)',
      color: '#f87171',
      label: t('swissStatusForfeit'),
    },
    bye: {
      bg: 'rgba(136, 136, 136, 0.08)',
      border: '1px solid #333',
      color: '#888',
      label: t('swissByeLabel'),
    },
  };

  const c = config[status] ?? config.pending;

  return (
    <span
      className="px-2 py-0.5 text-[9px] uppercase tracking-wider font-medium"
      style={{ backgroundColor: c.bg, border: c.border, color: c.color }}
    >
      {c.label}
    </span>
  );
}
