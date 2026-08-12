'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { PlayerNameLink } from '@/components/social/PlayerNameLink';
import { Link } from '@/lib/i18n/navigation';
import type { TournamentData } from '@/stores/tournamentStore';
import { buildTournamentResultsView, type ResultMatchEntry } from '@/lib/tournament/resultsView';

interface Props {
  tournament: TournamentData;
}

function placeColor(place: 1 | 2 | 3): string {
  if (place === 1) return 'var(--t-accent)';
  if (place === 2) return '#b8b8b8';
  return '#a87440';
}

function outcomeLabel(t: ReturnType<typeof useTranslations>, outcome: ResultMatchEntry['outcome']): string {
  switch (outcome) {
    case 'win_played': return t('results.outcomePlayed');
    case 'win_forfeit': return t('results.outcomeForfeit');
    case 'double_forfeit': return t('results.outcomeDoubleForfeit');
    case 'bye': return t('results.outcomeBye');
    case 'incomplete': return t('results.outcomeIncomplete');
  }
}

function outcomeColor(outcome: ResultMatchEntry['outcome']): string {
  switch (outcome) {
    case 'win_played': return '#7a9e4a';
    case 'win_forfeit': return '#cc7a30';
    case 'double_forfeit': return 'var(--t-danger)';
    case 'bye': return '#8888aa';
    case 'incomplete': return 'var(--t-dim)';
  }
}

export function TournamentResults({ tournament }: Props) {
  const t = useTranslations('tournament');

  const view = useMemo(() => buildTournamentResultsView(tournament), [tournament]);

  if (tournament.status !== 'completed' || !view.champion) return null;

  const totalForfeits = view.forfeitCount + view.doubleForfeitCount;

  return (
    <div className="flex flex-col gap-6 p-6" style={{ backgroundColor: 'var(--t-panel)', border: '1px solid var(--t-border)' }}>
      <h3 className="text-center text-xs font-bold uppercase tracking-[0.3em]" style={{ color: 'var(--t-muted)' }}>
        {t('resultsTitle')}
      </h3>

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="flex flex-col items-center gap-2 py-4"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.4em]" style={{ color: 'var(--t-accent)' }}>
          {t('champion')}
        </span>
        <motion.span
          initial={{ y: 10 }}
          animate={{ y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="text-2xl font-bold tracking-wide"
          style={{ color: 'var(--t-accent)' }}
        >
          <PlayerNameLink username={view.champion.username} />
        </motion.span>
      </motion.div>

      {view.podium.length > 1 && (
        <>
          <div style={{ height: '1px', backgroundColor: 'var(--t-surface-2)' }} />
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--t-dim)' }}>
              {t('results.podium')}
            </span>
            {view.podium.map((entry, i) => (
              <motion.div
                key={entry.userId}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.4 + i * 0.1 }}
                className="flex items-center justify-between px-2 py-1"
              >
                <div className="flex items-center gap-3">
                  <span className="font-display text-sm font-bold tabular-nums" style={{ color: placeColor(entry.place) }}>
                    #{entry.place}
                  </span>
                  <PlayerNameLink username={entry.username} className="text-sm" style={{ color: entry.place === 1 ? 'var(--t-accent)' : 'var(--t-muted)' }} />
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {totalForfeits > 0 && (
        <>
          <div style={{ height: '1px', backgroundColor: 'var(--t-surface-2)' }} />
          <div className="px-2 py-2 text-xs" style={{ color: 'var(--t-accent)', backgroundColor: 'rgba(204, 122, 48, 0.06)' }}>
            {t('results.forfeitSummary', { single: view.forfeitCount, double: view.doubleForfeitCount })}
          </div>
        </>
      )}

      {view.entries.length > 0 && (
        <>
          <div style={{ height: '1px', backgroundColor: 'var(--t-surface-2)' }} />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--t-dim)' }}>
              {t('results.matchHistory')}
            </span>
            {view.entries.map((entry, i) => {
              const isReplayable = !!entry.gameId && entry.outcome === 'win_played';
              const rowContent = (
                <div className="flex items-center justify-between px-2 py-1 gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-[10px] uppercase tracking-wider tabular-nums" style={{ color: 'var(--t-dim)' }}>
                      R{entry.round}
                    </span>
                    {entry.outcome === 'double_forfeit' ? (
                      <span className="text-xs truncate" style={{ color: 'var(--t-muted)' }}>
                        {entry.doubleForfeitUsernames.join(' & ') || '?'}
                      </span>
                    ) : entry.outcome === 'bye' ? (
                      <span className="text-xs truncate" style={{ color: 'var(--t-muted)' }}>
                        {entry.winnerUsername ?? '?'}
                      </span>
                    ) : (
                      <span className="text-xs truncate" style={{ color: 'var(--t-muted)' }}>
                        {entry.winnerUsername ?? '?'}
                        {entry.loserUsername && (
                          <span style={{ color: 'var(--t-dim)' }}> vs {entry.loserUsername}</span>
                        )}
                      </span>
                    )}
                  </div>
                  <span
                    className="text-[10px] uppercase tracking-wider whitespace-nowrap"
                    style={{ color: outcomeColor(entry.outcome) }}
                  >
                    {outcomeLabel(t, entry.outcome)}
                  </span>
                </div>
              );

              if (isReplayable && entry.gameId) {
                return (
                  <motion.div
                    key={entry.matchId}
                    initial={{ x: -10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.5 + i * 0.04 }}
                  >
                    <Link
                      href={`/replay/${entry.gameId}`}
                      className="block transition-colors hover:bg-white/2"
                      style={{ color: '#4a9eff' }}
                    >
                      {rowContent}
                    </Link>
                  </motion.div>
                );
              }

              return (
                <motion.div
                  key={entry.matchId}
                  initial={{ x: -10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.5 + i * 0.04 }}
                >
                  {rowContent}
                </motion.div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
