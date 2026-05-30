'use client';

import { motion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import {
  type TdTournament,
  PANEL_CLIP,
  EASE,
  StatusBadge,
  formatTournamentDate,
  formatLocation,
} from './shared';

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="font-display text-[9px] uppercase tracking-[0.22em]" style={{ color: '#5f5f5f' }}>
        {label}
      </span>
      <span className="font-display text-[12px] truncate" style={{ color: '#d8d2c4' }}>
        {value}
      </span>
    </div>
  );
}

export function TournamentCard({ t: data, index }: { t: TdTournament; index: number }) {
  const t = useTranslations('topdeck');
  const locale = useLocale();
  const date = formatTournamentDate(data.startDate, locale);
  const loc = formatLocation(data);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.03, 0.3), ease: EASE }}
    >
      <Link
        href={`/topdeck/${encodeURIComponent(data.tid)}` as Parameters<typeof Link>[0]['href']}
        className="group relative block overflow-hidden transition-[background-color,transform] duration-200"
        style={{ backgroundColor: '#0d0c10', clipPath: PANEL_CLIP }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = '#121017';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = '#0d0c10';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
        }}
      >
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-[15px] sm:text-base leading-snug pr-1" style={{ color: '#f2efe7' }}>
              {data.name}
            </h3>
            <StatusBadge status={data.status} />
          </div>

          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            <Meta label={t('filters.format')} value={data.format || '-'} />
            <Meta label={t('filters.country')} value={loc || t('card.noLocation')} />
            <Meta label={t('card.date')} value={date || '-'} />
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-display text-[12px] tabular-nums" style={{ color: '#c4a35a' }}>
                {data.participants} <span style={{ color: '#6a6a6a' }}>{t('card.players')}</span>
              </span>
              {data.topCut ? (
                <span className="font-display text-[11px] tabular-nums px-2 py-0.5" style={{ backgroundColor: 'rgba(196,163,90,0.12)', color: '#c4a35a', borderRadius: 9999 }}>
                  {t('card.topCut', { count: data.topCut })}
                </span>
              ) : null}
              {data.swissNum ? (
                <span className="font-display text-[11px] tabular-nums" style={{ color: '#6a6a6a' }}>
                  {t('card.swiss', { count: data.swissNum })}
                </span>
              ) : null}
            </div>
            <span className="font-display text-[11px] uppercase tracking-widest transition-colors" style={{ color: '#777' }}>
              {t('card.viewDetails')}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
