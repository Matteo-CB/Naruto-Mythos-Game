'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import type { TournamentData } from '@/stores/tournamentStore';

interface Props {
  tournament: TournamentData;
}

export function TournamentCard({ tournament }: Props) {
  const t = useTranslations('tournament');

  const statusColors: Record<string, string> = {
    registration: '#c4a35a',
    in_progress: '#4a9eff',
    completed: '#44cc44',
    cancelled: '#cc4444',
  };

  const statusLabels: Record<string, string> = {
    registration: t('statusRegistration'),
    in_progress: t('statusInProgress'),
    completed: t('statusCompleted'),
    cancelled: t('statusCancelled'),
  };

  const participantCount = tournament.participants?.length ?? tournament._count?.participants ?? 0;

  return (
    <Link
      href={`/tournaments/${tournament.id}`}
      className="block transition-all"
      style={{
        backgroundColor: '#111111',
        border: '1px solid #262626',
        padding: '16px',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#c4a35a'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#262626'; }}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold tracking-wide" style={{ color: '#e0e0e0' }}>
          {tournament.name}
        </h3>
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5"
          style={{
            color: statusColors[tournament.status] || '#888',
            border: `1px solid ${statusColors[tournament.status] || '#888'}`,
          }}
        >
          {statusLabels[tournament.status] || tournament.status}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs" style={{ color: '#777' }}>
        <span
          className="uppercase tracking-wider font-medium"
          style={{ color: tournament.type === 'simulator' ? '#c4a35a' : '#4a9eff' }}
        >
          {tournament.type === 'simulator' ? t('typeSimulator') : t('typePlayer')}
        </span>
        <span>{tournament.gameMode === 'sealed' ? t('sealed') : t('classic')}</span>
        <span>{t('players')}: {participantCount}/{tournament.maxPlayers}</span>
      </div>

      <div className="mt-2 text-[11px]" style={{ color: '#555' }}>
        {t('createdBy')} {tournament.creatorUsername}
      </div>
    </Link>
  );
}
