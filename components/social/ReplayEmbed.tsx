'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import type { ReplaySnapshot } from '@/lib/social/types';

function PlayerSide({ name, score, win, align }: { name: string; score?: number; win: boolean; align: 'left' | 'right' }) {
  return (
    <div className="flex-1 min-w-0" style={{ textAlign: align }}>
      <div
        className="font-display text-sm truncate"
        style={{
          color: win ? 'var(--t-accent)' : '#d8d6cf',
          textShadow: win ? '0 0 14px rgba(196,163,90,0.45)' : 'none',
          letterSpacing: '0.02em',
        }}
      >
        {name}
      </div>
      {typeof score === 'number' && (
        <div className="font-display text-2xl tabular-nums mt-0.5" style={{ color: win ? 'var(--t-accent)' : '#6a6a70' }}>
          {score}
        </div>
      )}
    </div>
  );
}

export function ReplayEmbed({ replay }: { replay: ReplaySnapshot }) {
  const t = useTranslations('feed');
  const p1Win = !!replay.winnerName && replay.winnerName === replay.player1Name;
  const p2Win = !!replay.winnerName && replay.winnerName === replay.player2Name;
  const hasMoment = typeof replay.actionIndex === 'number';
  const href = `/replay/${replay.gameId}${hasMoment ? `?action=${replay.actionIndex}` : ''}`;

  return (
    <div className="mt-2 overflow-hidden" style={{ backgroundColor: 'var(--t-bg)', border: '1px solid #1e1e22' }}>
      <div className="px-3 pt-2.5 flex items-center justify-between">
        <span className="font-display text-[9px] uppercase tracking-[0.28em]" style={{ color: 'var(--t-accent)' }}>
          {hasMoment ? t('replayMoment') : t('replayLabel')}
        </span>
        {replay.isAiGame && (
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5" style={{ backgroundColor: 'rgba(136,136,136,0.1)', color: 'var(--t-muted)' }}>
            {t('vsAi')}
          </span>
        )}
      </div>

      <div className="px-4 py-3 flex items-center gap-4">
        <PlayerSide name={replay.player1Name} score={replay.player1Score} win={p1Win} align="left" />
        <span className="font-display text-[11px] tracking-widest shrink-0" style={{ color: '#4a4a50' }}>VS</span>
        <PlayerSide name={replay.player2Name} score={replay.player2Score} win={p2Win} align="right" />
      </div>

      <div className="px-3 pb-3">
        {replay.available ? (
          <Link
            href={href as '/'}
            className="block w-full text-center font-display text-[11px] uppercase tracking-widest py-2 transition-colors"
            style={{ backgroundColor: 'var(--t-accent-glow)', color: 'var(--t-accent)' }}
          >
            {hasMoment ? t('watchMoment') : t('watchReplay')}
          </Link>
        ) : (
          <div className="text-center text-[10px] py-2" style={{ color: '#5a5a5a' }}>{t('replayExpired')}</div>
        )}
      </div>
    </div>
  );
}
