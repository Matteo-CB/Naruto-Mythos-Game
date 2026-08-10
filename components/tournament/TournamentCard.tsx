'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import type { TournamentData } from '@/stores/tournamentStore';

const ROW_CLIP = 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)';

const STATUS_COLOR: Record<string, string> = {
  registration: 'var(--t-accent)',
  in_progress: 'var(--t-success)',
  completed: 'var(--t-muted)',
  cancelled: 'var(--t-danger)',
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
  const accent = STATUS_COLOR[tournament.status] || 'var(--t-muted)';
  const typeColor = tournament.type === 'simulator' ? 'var(--t-accent)' : 'var(--t-text)';

  return (
    <motion.div
      whileHover={{ x: 3 }}
      transition={{ duration: 0.2 }}
    >
      <Link
        href={`/tournaments/${tournament.id}` as '/'}
        className="block relative px-4 sm:px-5 py-3 sm:py-4 cursor-pointer transition-colors"
        style={{ backgroundColor: 'var(--t-panel)', clipPath: ROW_CLIP }}
      >
        <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
          <h3
            className="font-display text-sm sm:text-base flex-1 min-w-0 truncate"
            style={{ color: 'var(--t-text-strong)', letterSpacing: '0.03em' }}
          >
            {tournament.name}
          </h3>
          <span
            className="font-display text-[9px] uppercase tracking-widest px-2 py-0.5 shrink-0"
            style={{
              color: accent,
              backgroundColor: `color-mix(in srgb, ${accent} 8%, transparent)`,
              borderRadius: 9999,
            }}
          >
            {statusLabels[tournament.status] || tournament.status}
          </span>
        </div>

        <div className="font-display flex items-center gap-3 flex-wrap text-[10px] sm:text-[11px] uppercase tracking-widest" style={{ color: 'var(--t-dim)' }}>
          <span style={{ color: typeColor }}>
            {tournament.type === 'simulator' ? t('typeSimulator') : t('typePlayer')}
          </span>
          <span style={{ color: 'var(--t-muted)' }}>·</span>
          <span>{tournament.gameMode === 'sealed' ? t('sealed') : t('classic')}</span>
          <span style={{ color: 'var(--t-muted)' }}>·</span>
          <span className="tabular-nums">{participantCount}/{tournament.maxPlayers}</span>
        </div>

        <div className="font-display text-[10px] uppercase tracking-widest mt-2" style={{ color: 'var(--t-dim)' }}>
          {t('createdBy')} <span style={{ color: 'var(--t-muted)' }}>{tournament.creatorUsername}</span>
        </div>
      </Link>
    </motion.div>
  );
}
