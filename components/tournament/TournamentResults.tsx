'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import type { TournamentData } from '@/stores/tournamentStore';

interface Props {
  tournament: TournamentData;
}

export function TournamentResults({ tournament }: Props) {
  const t = useTranslations('tournament');

  if (tournament.status !== 'completed' || !tournament.winnerUsername) return null;

  const eliminationOrder: { username: string; round: number }[] = [];
  const sortedMatches = [...(tournament.matches || [])].sort((a, b) => a.round - b.round);

  for (const match of sortedMatches) {
    if (match.status === 'completed' && match.winnerId && !match.isBye) {
      const loserName = match.winnerId === match.player1Id ? match.player2Username : match.player1Username;
      const loserId = match.winnerId === match.player1Id ? match.player2Id : match.player1Id;
      if (loserId && loserName) {
        eliminationOrder.push({ username: loserName, round: match.round });
      }
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6" style={{ backgroundColor: '#111111', border: '1px solid #262626' }}>
      <h3 className="text-center text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#888' }}>
        {t('resultsTitle')}
      </h3>

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="flex flex-col items-center gap-2 py-4"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.4em]" style={{ color: '#c4a35a' }}>
          {t('champion')}
        </span>
        <motion.span
          initial={{ y: 10 }}
          animate={{ y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="text-2xl font-bold tracking-wide"
          style={{ color: '#c4a35a', textShadow: '0 0 20px rgba(196, 163, 90, 0.3)' }}
        >
          {tournament.winnerUsername}
        </motion.span>
      </motion.div>

      <div style={{ height: '1px', backgroundColor: '#1e1e1e' }} />

      {eliminationOrder.length > 0 && (
        <div className="flex flex-col gap-2">
          {[...eliminationOrder].reverse().map((entry, i) => (
            <motion.div
              key={entry.username}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.5 + i * 0.1 }}
              className="flex items-center justify-between px-2 py-1"
            >
              <span className="text-xs" style={{ color: '#aaa' }}>{entry.username}</span>
              <span className="text-[10px]" style={{ color: '#555' }}>{t('round')} {entry.round}</span>
            </motion.div>
          ))}
        </div>
      )}

      {sortedMatches.filter(m => m.gameId).length > 0 && (
        <>
          <div style={{ height: '1px', backgroundColor: '#1e1e1e' }} />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#666' }}>
              {t('viewReplay')}
            </span>
            {sortedMatches.filter(m => m.gameId && !m.isBye).map((m) => (
              <Link
                key={m.id}
                href={`/replay/${m.gameId}`}
                className="flex items-center justify-between px-2 py-1 text-xs transition-colors"
                style={{ color: '#4a9eff' }}
                onMouseEnter={(e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.color = '#c4a35a'; }}
                onMouseLeave={(e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.color = '#4a9eff'; }}
              >
                <span>R{m.round}: {m.player1Username} vs {m.player2Username}</span>
                <span style={{ color: '#555' }}>{m.winnerUsername} W</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
