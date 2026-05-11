'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import type { TournamentData } from '@/stores/tournamentStore';

const ROW_CLIP = 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)';

const STATUS_COLOR: Record<string, string> = {
  registration: '#c4a35a',
  in_progress: '#5fb05f',
  completed: '#888888',
  cancelled: '#d97676',
};

interface Props {
  tournament: TournamentData;
}

export function TournamentCard({ tournament }: Props) {
  const t = useTranslations('tournament');

  const statusLabels: Record<string, string> = {
    registration: t('statusRegistration'),
    in_progress: t('statusInProgress'),
    completed: t('statusCompleted'),
    cancelled: t('statusCancelled'),
  };

  const participantCount = tournament.participants?.length ?? tournament._count?.participants ?? 0;
  const accent = STATUS_COLOR[tournament.status] || '#888';
  const typeColor = tournament.type === 'simulator' ? '#c4a35a' : '#5fa3df';

  return (
    <motion.div
      whileHover={{ x: 3 }}
      transition={{ duration: 0.2 }}
    >
      <Link
        href={`/tournaments/${tournament.id}` as '/'}
        className="block relative px-4 sm:px-5 py-3 sm:py-4 cursor-pointer transition-colors"
        style={{ backgroundColor: '#0d0c10', clipPath: ROW_CLIP }}
      >
        <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
          <h3
            className="font-display text-sm sm:text-base flex-1 min-w-0 truncate"
            style={{ color: '#f0eee7', letterSpacing: '0.03em' }}
          >
            {tournament.name}
          </h3>
          <span
            className="font-display text-[9px] uppercase tracking-widest px-2 py-0.5 shrink-0"
            style={{
              color: accent,
              backgroundColor: `${accent}14`,
              borderRadius: 9999,
            }}
          >
            {statusLabels[tournament.status] || tournament.status}
          </span>
        </div>

        <div className="font-display flex items-center gap-3 flex-wrap text-[10px] sm:text-[11px] uppercase tracking-widest" style={{ color: '#666' }}>
          <span style={{ color: typeColor }}>
            {tournament.type === 'simulator' ? t('typeSimulator') : t('typePlayer')}
          </span>
          <span style={{ color: '#3a3a3a' }}>·</span>
          <span>{tournament.gameMode === 'sealed' ? t('sealed') : t('classic')}</span>
          <span style={{ color: '#3a3a3a' }}>·</span>
          <span className="tabular-nums">{participantCount}/{tournament.maxPlayers}</span>
        </div>

        <div className="font-display text-[10px] uppercase tracking-widest mt-2" style={{ color: '#444' }}>
          {t('createdBy')} <span style={{ color: '#888' }}>{tournament.creatorUsername}</span>
        </div>
      </Link>
    </motion.div>
  );
}
