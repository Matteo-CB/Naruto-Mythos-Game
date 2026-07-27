'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';
import type { DailyPlayRow, PlayStatsPeriod } from '@/lib/stats/dailyPlay';

interface PlayStatsResponse {
  series: DailyPlayRow[];
  monthSeries: DailyPlayRow[];
  week: PlayStatsPeriod;
  month: PlayStatsPeriod;
  today: DailyPlayRow | null;
  updatedAt: string;
}

type Range = 'week' | 'month';

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 px-3 py-3" style={{ backgroundColor: '#161616' }}>
      <span className="font-display text-[9px] uppercase tracking-[0.22em]" style={{ color: '#6d6d74' }}>
        {label}
      </span>
      <span
        className="font-display text-xl sm:text-2xl font-black tabular-nums leading-none"
        style={{ color: '#c4a35a' }}
      >
        {value}
      </span>
      {hint && (
        <span className="text-[10px] leading-tight" style={{ color: '#6d6d74' }}>
          {hint}
        </span>
      )}
    </div>
  );
}

function DayBars({ rows, label, showDates }: { rows: DailyPlayRow[]; label: string; showDates: boolean }) {
  const locale = useLocale();
  const max = rows.reduce((m, r) => Math.max(m, r.games), 0);
  const dayFmt = (() => {
    try {
      return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
    } catch {
      return null;
    }
  })();

  return (
    <div className="flex flex-col gap-2">
      <span className="font-display text-[9px] uppercase tracking-[0.22em]" style={{ color: '#6d6d74' }}>
        {label}
      </span>
      <div className="flex items-end gap-1 overflow-x-auto pb-1" style={{ height: 96 }}>
        {rows.map((row) => {
          const ratio = max > 0 ? row.games / max : 0;
          return (
            <div key={row.day} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" style={{ minWidth: 18 }}>
              <span className="text-[9px] tabular-nums" style={{ color: row.games > 0 ? '#9a9aa2' : '#3a3a40' }}>
                {row.games}
              </span>
              <motion.span
                className="w-full"
                initial={{ height: 0 }}
                animate={{ height: Math.max(2, Math.round(ratio * 60)) }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                style={{ backgroundColor: row.games > 0 ? '#c4a35a' : '#2a2a2e', display: 'block' }}
              />
              {showDates && (
                <span className="text-[9px] tabular-nums" style={{ color: '#5a5a61' }}>
                  {dayFmt ? dayFmt.format(new Date(`${row.day}T00:00:00.000Z`)) : row.day.slice(5)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PlayStatsButton() {
  const t = useTranslations('playStats');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<PlayStatsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [range, setRange] = useState<Range>('week');

  useEffect(() => { setMounted(true); }, []);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open || data || failed) return;
    fetch('/api/play-stats')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((d: PlayStatsResponse) => setData(d))
      .catch(() => setFailed(true));
  }, [open, data, failed]);

  const period = data ? (range === 'week' ? data.week : data.month) : null;
  const rows = data ? (range === 'week' ? data.series : data.monthSeries) : [];

  const numberFmt = (() => {
    try {
      return new Intl.NumberFormat(locale);
    } catch {
      return null;
    }
  })();
  const fmt = (n: number) => (numberFmt ? numberFmt.format(n) : String(n));

  const longDayFmt = (() => {
    try {
      return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' });
    } catch {
      return null;
    }
  })();
  const formatLongDay = (day: string) => {
    if (!longDayFmt) return day;
    try {
      return longDayFmt.format(new Date(`${day}T00:00:00.000Z`));
    } catch {
      return day;
    }
  };

  const modal = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="play-stats-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.75)', zIndex: Z_APP_MODAL }}
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-labelledby="play-stats-title"
        >
          <motion.div
            key="play-stats-panel"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border shadow-2xl"
            style={{ backgroundColor: '#111111', borderColor: '#2a2a2a' }}
          >
            <header
              className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5 sm:py-4"
              style={{ borderColor: '#2a2a2a' }}
            >
              <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                <h2
                  id="play-stats-title"
                  className="font-display truncate text-lg sm:text-xl font-black tracking-wider uppercase"
                  style={{ color: '#c4a35a' }}
                >
                  {t('modalTitle')}
                </h2>
                <span className="text-[10px] sm:text-xs uppercase tracking-widest" style={{ color: '#555555' }}>
                  {t('modalSubtitle')}
                </span>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label={t('close')}
                className="shrink-0 px-2 py-1 text-sm transition-colors"
                style={{ color: '#888888', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {t('close')}
              </button>
            </header>

            <div className="flex shrink-0 gap-1 px-4 pt-3 sm:px-5">
              {(['week', 'month'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className="font-display px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors"
                  style={{
                    backgroundColor: range === r ? 'rgba(196,163,90,0.14)' : 'transparent',
                    color: range === r ? '#c4a35a' : '#70707a',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {r === 'week' ? t('rangeWeek') : t('rangeMonth')}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {failed && (
                <p className="py-8 text-center text-xs" style={{ color: '#70707a' }}>
                  {t('unavailable')}
                </p>
              )}

              {!failed && !period && (
                <p className="py-8 text-center text-xs" style={{ color: '#70707a' }}>
                  {t('loading')}
                </p>
              )}

              {!failed && period && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <StatTile label={t('games')} value={fmt(period.games)} />
                    <StatTile label={t('players')} value={fmt(period.players)} />
                    <StatTile label={t('decks')} value={fmt(period.decks)} />
                    <StatTile label={t('perDay')} value={fmt(period.averagePerDay)} />
                  </div>

                  <DayBars rows={rows} label={t('perDayChart')} showDates={range === 'week'} />

                  <div className="grid grid-cols-1 gap-2">
                    <StatTile label={t('today')} value={fmt(data?.today?.games ?? 0)} hint={t('todayHint')} />
                  </div>

                  {period.busiestDay && (
                    <div className="px-3 py-3" style={{ backgroundColor: '#161616' }}>
                      <span className="font-display text-[9px] uppercase tracking-[0.22em]" style={{ color: '#6d6d74' }}>
                        {t('busiestDay')}
                      </span>
                      <p className="mt-1 text-sm" style={{ color: '#d9d7d0' }}>
                        {t('busiestDayValue', {
                          day: formatLongDay(period.busiestDay.day),
                          games: period.busiestDay.games,
                        })}
                      </p>
                    </div>
                  )}

                  <p className="text-[10px] leading-relaxed" style={{ color: '#55555c' }}>
                    {t('note')}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-display px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-opacity hover:opacity-80"
        style={{ backgroundColor: 'rgba(196,163,90,0.12)', color: '#c4a35a', border: 'none', cursor: 'pointer' }}
      >
        {t('buttonLabel')}
      </button>
      {mounted && createPortal(modal, document.body)}
    </>
  );
}
