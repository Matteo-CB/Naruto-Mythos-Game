'use client';

import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations, useLocale } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';
import {
  WEEKLY_SCHEDULE,
  KIND_COLORS,
  AUTO_TOURNAMENT_MAX_PLAYERS,
  AUTO_TOURNAMENT_REG_HOUR,
  AUTO_TOURNAMENT_START_HOUR,
  AUTO_SEALED_BOOSTER_COUNT,
  inferTournamentKind,
  type TourneyKind,
  type WeeklyDaySpec,
} from '@/lib/tournament/weeklySchedule';

interface TournamentLite {
  id: string;
  name?: string;
  format?: string | null;
  gameMode?: string | null;
  useBanList?: boolean | null;
  status?: string | null;
  scheduledStartAt?: string | null;
  maxPlayers?: number | null;
}

const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const LEGEND_KINDS: TourneyKind[] = ['classic', 'open', 'elimination', 'sealed'];
const WD_SHORT: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function parisWeekday(d: Date): number {
  try {
    return WD_SHORT[new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short' }).format(d)] ?? 0;
  } catch {
    return 0;
  }
}

function parisDateParts(base: Date): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(base)) map[p.type] = p.value;
  return { year: +map.year, month: +map.month, day: +map.day };
}

function parisWallToUtc(year: number, month: number, day: number, hour: number): Date {
  const guess = Date.UTC(year, month - 1, day, hour, 0, 0);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(guess))) map[p.type] = p.value;
  let h = parseInt(map.hour, 10);
  if (h === 24) h = 0;
  const asUtc = Date.UTC(+map.year, +map.month - 1, +map.day, h, +map.minute, +map.second);
  return new Date(guess - (asUtc - guess));
}

function ruleChips(spec: WeeklyDaySpec, t: ReturnType<typeof useTranslations>): string[] {
  const chips: string[] = [];
  chips.push(spec.format === 'elimination' ? t('rules.formatElim') : t('rules.formatSwiss'));
  chips.push(t('rules.slots', { count: AUTO_TOURNAMENT_MAX_PLAYERS }));
  if (spec.gameMode === 'sealed') chips.push(t('rules.sealed', { count: AUTO_SEALED_BOOSTER_COUNT }));
  else if (!spec.useBanList) chips.push(t('rules.allCards'));
  else chips.push(t('rules.banList'));
  chips.push(t('rules.discord'));
  return chips;
}

export function WeeklyTournamentCalendar({ tournaments = [] }: { tournaments?: TournamentLite[] }) {
  const t = useTranslations('tournamentCalendar');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const weekdayName = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'long' });
    return (wd: number) => {
      const s = fmt.format(new Date(Date.UTC(2024, 0, 7 + wd)));
      return s.charAt(0).toUpperCase() + s.slice(1);
    };
  }, [locale]);

  const todayWd = useMemo(() => parisWeekday(new Date()), []);

  const localTimes = useMemo(() => {
    try {
      const p = parisDateParts(new Date());
      const reg = parisWallToUtc(p.year, p.month, p.day, AUTO_TOURNAMENT_REG_HOUR);
      const start = parisWallToUtc(p.year, p.month, p.day, AUTO_TOURNAMENT_START_HOUR);
      const plain = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
      const withZone = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
      return { reg: plain.format(reg), start: withZone.format(start) };
    } catch {
      return { reg: `${AUTO_TOURNAMENT_REG_HOUR}:00`, start: `${AUTO_TOURNAMENT_START_HOUR}:00` };
    }
  }, [locale]);

  const byDay = useMemo(() => {
    const map = new Map<number, TournamentLite[]>();
    for (const tr of tournaments) {
      if (!tr.scheduledStartAt) continue;
      if (tr.status && !['registration', 'scheduled', 'ready'].includes(tr.status)) continue;
      const wd = parisWeekday(new Date(tr.scheduledStartAt));
      const arr = map.get(wd) ?? [];
      arr.push(tr);
      map.set(wd, arr);
    }
    return map;
  }, [tournaments]);

  const modal = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="cal-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.78)', zIndex: Z_APP_MODAL }}
          onClick={() => setOpen(false)}
          role="dialog" aria-modal="true"
        >
          <motion.div
            key="cal-panel"
            initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden"
            style={{ backgroundColor: '#111111', boxShadow: '0 24px 70px rgba(0,0,0,0.6)' }}
          >
            <header className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #232323' }}>
              <div className="flex items-baseline gap-3 min-w-0">
                <h2 className="text-lg font-black uppercase tracking-wider truncate" style={{ color: '#c4a35a' }}>{t('title')}</h2>
                <span className="font-display hidden sm:inline text-[11px] uppercase tracking-widest" style={{ color: '#555' }}>{t('subtitle')}</span>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-[11px] font-bold uppercase tracking-widest shrink-0" style={{ color: '#888' }}>{t('close')}</button>
            </header>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3" style={{ borderBottom: '1px solid #1c1c1c' }}>
              {LEGEND_KINDS.map((k) => (
                <span key={k} className="flex items-center gap-1.5 text-[11px]" style={{ color: '#9a9a9f' }}>
                  <span className="inline-block h-2.5 w-2.5" style={{ backgroundColor: KIND_COLORS[k] }} />
                  {t(`kind.${k}` as `kind.${TourneyKind}`)}
                </span>
              ))}
            </div>

            <div className="overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-2.5">
                {DISPLAY_ORDER.map((wd) => {
                  const spec = WEEKLY_SCHEDULE[wd];
                  const live = byDay.get(wd) ?? [];
                  const color = spec ? KIND_COLORS[spec.kind] : '#4a4a4e';
                  const isToday = wd === todayWd;
                  return (
                    <div
                      key={wd}
                      className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center"
                      style={{
                        backgroundColor: isToday ? '#17161c' : '#0c0b0f',
                        boxShadow: isToday ? `0 0 20px ${color}18` : undefined,
                      }}
                    >
                      <div className="flex items-center gap-2.5 sm:w-44 sm:shrink-0">
                        <span className="font-display text-sm uppercase tracking-widest" style={{ color: isToday ? '#e8e6df' : '#c9c7c0' }}>{weekdayName(wd)}</span>
                        {isToday && (
                          <span className="font-display text-[9px] uppercase tracking-widest px-1.5 py-0.5" style={{ backgroundColor: `${color}22`, color }}>{t('today')}</span>
                        )}
                      </div>

                      {!spec ? (
                        <span className="text-[13px]" style={{ color: '#55555c' }}>{t('noTournament')}</span>
                      ) : (
                        <div className="flex-1 flex flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-display text-[11px] uppercase tracking-wider px-2.5 py-1" style={{ backgroundColor: `${color}22`, color }}>
                              {t(`kind.${spec.kind}` as `kind.${TourneyKind}`)}
                            </span>
                            {ruleChips(spec, t).map((c, i) => (
                              <span key={i} className="text-[11px] px-2 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.045)', color: '#a7a7ac' }}>{c}</span>
                            ))}
                          </div>
                          <span className="text-[11px]" style={{ color: '#6a6a70' }}>
                            {t('rules.times', { reg: localTimes.reg, start: localTimes.start })}
                          </span>
                        </div>
                      )}

                      {spec && live.length > 0 && (
                        <div className="flex flex-wrap gap-2 sm:shrink-0">
                          {live.map((tr) => {
                            const c = KIND_COLORS[inferTournamentKind(tr)];
                            return (
                              <Link key={tr.id} href={`/tournaments/${tr.id}` as '/'} onClick={() => setOpen(false)}
                                className="text-[10px] uppercase tracking-widest px-3 py-1.5" style={{ backgroundColor: `${c}1f`, color: c }}>
                                {tr.status === 'registration' ? t('registrationOpen') : t('view')}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
        className="text-[11px] font-bold uppercase tracking-widest px-4 py-2 transition-colors"
        style={{ backgroundColor: 'rgba(196,163,90,0.1)', color: '#c4a35a' }}
      >
        {t('button')}
      </button>
      {mounted ? createPortal(modal, document.body) : null}
    </>
  );
}
