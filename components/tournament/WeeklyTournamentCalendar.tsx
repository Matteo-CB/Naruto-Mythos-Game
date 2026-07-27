'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';
import {
  WEEKLY_SCHEDULE,
  KIND_COLORS,
  AUTO_TOURNAMENT_REG_HOUR,
  AUTO_SEALED_BOOSTER_COUNT,
  NWL_PARTNER_NAME,
  NWL_FIRST_PLACE_STORE_CREDIT_GBP,
  NWL_FIRST_PLACE_PAYPAL_GBP,
  NWL_CHUNIN_PODIUM_PLACES,
  inferTournamentKind,
  startHourForSpec,
  maxPlayersForSpec,
  nextWeeklyOccurrences,
  type TourneyKind,
  type WeeklyDaySpec,
} from '@/lib/tournament/weeklySchedule';

interface DayCard {
  scheduleWeekday: number;
  spec: WeeklyDaySpec;
  dayLabel: string;
  reg: string;
  start: string;
  isToday: boolean;
}

interface TournamentLite {
  id: string;
  name?: string;
  format?: string | null;
  gameMode?: string | null;
  useBanList?: boolean | null;
  partner?: string | null;
  status?: string | null;
  scheduledStartAt?: string | null;
  maxPlayers?: number | null;
}

const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const LEGEND_KINDS: TourneyKind[] = ['classic', 'open', 'elimination', 'sealed', 'partner'];
const PARTNER_NAMES: Record<string, string> = { nwl: NWL_PARTNER_NAME };
const WD_SHORT: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const CARD_CLIP = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
const FALLBACK_GAP = 12;

function parisWeekday(d: Date): number {
  try {
    return WD_SHORT[new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short' }).format(d)] ?? 0;
  } catch {
    return 0;
  }
}

function detailLines(
  spec: WeeklyDaySpec,
  card: DayCard,
  t: ReturnType<typeof useTranslations>,
): string[] {
  const lines: string[] = [];
  lines.push(spec.format === 'elimination' ? t('detail.formatElim') : t('detail.formatSwiss'));
  lines.push(t('detail.slots', { count: maxPlayersForSpec(spec) }));
  if (spec.gameMode === 'sealed') lines.push(t('detail.sealed', { count: AUTO_SEALED_BOOSTER_COUNT }));
  lines.push(spec.useBanList ? t('detail.banList') : t('detail.allCards'));
  lines.push(t('detail.schedule', { reg: card.reg, start: card.start }));
  lines.push(t('detail.presence'));
  lines.push(t('detail.discord'));
  if (spec.partner) lines.push(t('detail.partner', { partner: PARTNER_NAMES[spec.partner] ?? spec.partner }));
  return lines;
}

export function WeeklyTournamentCalendar({ tournaments = [] }: { tournaments?: TournamentLite[] }) {
  const t = useTranslations('tournamentCalendar');
  const locale = useLocale();

  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [openDay, setOpenDay] = useState<number | null>(null);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      if (ro) ro.disconnect();
    };
  }, [update]);

  useEffect(() => { setMounted(true); }, []);

  const scrollDir = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const step = card ? card.offsetWidth + FALLBACK_GAP : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  const timeFormats = useMemo(() => {
    try {
      return {
        plain: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
        withZone: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }),
        weekday: new Intl.DateTimeFormat(locale, { weekday: 'long' }),
        dayKey: new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      };
    } catch {
      return null;
    }
  }, [locale]);

  const dayCards = useMemo<DayCard[]>(() => {
    const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

    if (!mounted || !timeFormats) {
      const fallbackWeekday = (wd: number) => {
        try {
          const fmt = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
          return capitalize(fmt.format(new Date(Date.UTC(2024, 0, 7 + wd))));
        } catch {
          return '';
        }
      };
      return DISPLAY_ORDER.flatMap((wd) => {
        const spec = WEEKLY_SCHEDULE[wd];
        if (!spec) return [];
        return [{
          scheduleWeekday: wd,
          spec,
          dayLabel: fallbackWeekday(wd),
          reg: `${AUTO_TOURNAMENT_REG_HOUR}:00`,
          start: `${startHourForSpec(spec)}:00`,
          isToday: false,
        }];
      });
    }

    const now = new Date();
    const todayKey = timeFormats.dayKey.format(now);
    return nextWeeklyOccurrences(now).map((occurrence) => ({
      scheduleWeekday: occurrence.scheduleWeekday,
      spec: occurrence.spec,
      dayLabel: capitalize(timeFormats.weekday.format(occurrence.startAt)),
      reg: timeFormats.plain.format(occurrence.regAt),
      start: timeFormats.withZone.format(occurrence.startAt),
      isToday: timeFormats.dayKey.format(occurrence.startAt) === todayKey,
    }));
  }, [mounted, timeFormats, locale]);

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

  useEffect(() => {
    if (!mounted) return;
    const el = scrollRef.current;
    if (!el) return;
    const card = todayRef.current;
    el.scrollLeft = card
      ? Math.max(0, card.offsetLeft - Math.max(0, (el.clientWidth - card.offsetWidth) / 2))
      : 0;
    update();
  }, [mounted, dayCards, update]);

  useEffect(() => {
    if (openDay === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenDay(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openDay]);

  const detail = (() => {
    if (openDay === null) return null;
    const card = dayCards.find((c) => c.scheduleWeekday === openDay);
    if (!card) return null;
    return { card, spec: card.spec, live: byDay.get(card.scheduleWeekday) ?? [] };
  })();

  const arrowStyle = {
    backgroundColor: 'rgba(13,12,16,0.92)',
    color: '#c4a35a',
    borderRadius: 9999,
    boxShadow: '0 4px 14px rgba(0,0,0,0.55)',
  } as const;

  const detailModal = (
    <AnimatePresence>
      {detail && (
        <motion.div
          key="calendar-detail-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.75)', zIndex: Z_APP_MODAL }}
          onClick={() => setOpenDay(null)}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            key="calendar-detail-panel"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden"
            style={{ backgroundColor: '#111114', border: '1px solid #26262c', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}
          >
            <header className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid #1c1c20' }}>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-display truncate text-base uppercase tracking-widest" style={{ color: '#e8e6df' }}>
                  {detail.card.dayLabel}
                </span>
                <span
                  className="font-display self-start text-[9px] uppercase tracking-wider px-1.5 py-0.5"
                  style={{ backgroundColor: KIND_COLORS[detail.spec.kind] + '1f', color: KIND_COLORS[detail.spec.kind] }}
                >
                  {t(`kind.${detail.spec.kind}` as `kind.${TourneyKind}`)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpenDay(null)}
                className="shrink-0 px-2 py-1 text-[11px] uppercase tracking-widest"
                style={{ color: '#888', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {t('close')}
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="font-display text-[9px] uppercase tracking-[0.22em]" style={{ color: '#6d6d74' }}>
                  {t('detailsRules')}
                </span>
                <ul className="flex flex-col gap-2">
                  {detailLines(detail.spec, detail.card, t).map((line, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden="true" className="shrink-0" style={{ color: KIND_COLORS[detail.spec.kind] }}>
                        &bull;
                      </span>
                      <span className="text-[11px] leading-relaxed" style={{ color: '#b9b7b1' }}>
                        {line}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {detail.spec.partner === 'nwl' && (
                <div className="flex flex-col gap-1.5 px-3 py-3" style={{ backgroundColor: '#161619' }}>
                  <span className="font-display text-[9px] uppercase tracking-[0.22em]" style={{ color: KIND_COLORS[detail.spec.kind] }}>
                    {t('rules.rewardsLabel')}
                  </span>
                  <span className="text-[11px] leading-relaxed" style={{ color: '#cfcdc6' }}>
                    {t('rules.nwlPrize', {
                      credit: NWL_FIRST_PLACE_STORE_CREDIT_GBP,
                      paypal: NWL_FIRST_PLACE_PAYPAL_GBP,
                    })}
                  </span>
                  <span className="text-[11px] leading-relaxed" style={{ color: '#cfcdc6' }}>
                    {t('rules.nwlChunin', { places: NWL_CHUNIN_PODIUM_PLACES })}
                  </span>
                </div>
              )}

              {detail.live.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {detail.live.map((tr) => {
                    const c = KIND_COLORS[inferTournamentKind(tr)];
                    return (
                      <Link
                        key={tr.id}
                        href={`/tournaments/${tr.id}` as '/'}
                        onClick={() => setOpenDay(null)}
                        className="font-display block text-center text-[10px] uppercase tracking-widest px-2 py-2 transition-opacity hover:opacity-80"
                        style={{ backgroundColor: c + '1f', color: c }}
                      >
                        {tr.status === 'registration' ? t('registrationOpen') : t('view')}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <section className="w-full">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2.5">
        <h2 className="font-display text-base sm:text-lg uppercase tracking-wider" style={{ color: '#c4a35a' }}>
          {t('title')}
        </h2>
        <span className="font-display text-[9px] sm:text-[10px] uppercase tracking-[0.25em]" style={{ color: '#5b5b62' }}>
          {t('subtitle')}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {LEGEND_KINDS.map((k) => (
          <span
            key={k}
            className="font-display text-[9px] sm:text-[10px] uppercase tracking-widest px-2 py-1"
            style={{ backgroundColor: `${KIND_COLORS[k]}1f`, color: KIND_COLORS[k] }}
          >
            {t(`kind.${k}` as `kind.${TourneyKind}`)}
          </span>
        ))}
      </div>

      <div className="relative">
        {canLeft && (
          <button
            type="button"
            onClick={() => scrollDir(-1)}
            aria-label={t('prev')}
            className="font-display absolute left-1 top-1/2 -translate-y-1/2 z-10 w-9 h-9 sm:w-10 sm:h-10 hidden sm:flex items-center justify-center cursor-pointer text-base transition-colors hover:text-[#ffd966]"
            style={arrowStyle}
          >
            &lt;
          </button>
        )}
        {canRight && (
          <button
            type="button"
            onClick={() => scrollDir(1)}
            aria-label={t('next')}
            className="font-display absolute right-1 top-1/2 -translate-y-1/2 z-10 w-9 h-9 sm:w-10 sm:h-10 hidden sm:flex items-center justify-center cursor-pointer text-base transition-colors hover:text-[#ffd966]"
            style={arrowStyle}
          >
            &gt;
          </button>
        )}

        <div
          ref={scrollRef}
          className="relative flex flex-row items-stretch gap-2 sm:gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar pb-2"
          style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain' }}
        >
          {dayCards.map((card) => {
            const { spec, isToday } = card;
            const live = byDay.get(card.scheduleWeekday) ?? [];
            const color = KIND_COLORS[spec.kind];

            return (
              <div
                key={card.scheduleWeekday}
                ref={isToday ? todayRef : undefined}
                className="shrink-0 w-33 sm:w-40 snap-start"
              >
                <button
                  type="button"
                  onClick={() => setOpenDay(card.scheduleWeekday)}
                  aria-label={t('openDetails')}
                  className="relative flex h-full w-full flex-col overflow-hidden text-left transition-opacity hover:opacity-90"
                  style={{
                    backgroundColor: isToday ? '#16151b' : '#0d0c11',
                    clipPath: CARD_CLIP,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {isToday && (
                    <motion.span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0"
                      style={{ backgroundColor: `${color}12` }}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}

                  <div className="relative flex h-full w-full flex-col gap-1.5 px-2.5 py-2.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <span
                        className="font-display truncate text-[11px] uppercase tracking-widest"
                        style={{ color: isToday ? '#f2efe7' : '#c9c7c0' }}
                      >
                        {card.dayLabel}
                      </span>
                      {isToday && (
                        <span
                          className="font-display shrink-0 text-[8px] uppercase tracking-widest px-1 py-0.5"
                          style={{ backgroundColor: `${color}26`, color }}
                        >
                          {t('today')}
                        </span>
                      )}
                    </div>

                    <span aria-hidden="true" className="block w-full" style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />

                    <span
                      className="font-display self-start text-[9px] uppercase tracking-wider px-1.5 py-0.5"
                      style={{ backgroundColor: `${color}1f`, color }}
                    >
                      {t(`kind.${spec.kind}` as `kind.${TourneyKind}`)}
                    </span>

                    <span
                      className="font-display mt-auto text-sm tabular-nums"
                      style={{ color: isToday ? '#f0eee7' : '#cfcdc6' }}
                    >
                      {card.start}
                    </span>

                    {live.length > 0 && (
                      <span
                        className="font-display block text-center text-[8px] uppercase tracking-widest px-1.5 py-1"
                        style={{ backgroundColor: `${color}1f`, color }}
                      >
                        {live.some((tr) => tr.status === 'registration') ? t('registrationOpen') : t('view')}
                      </span>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-2 text-[10px] sm:text-[11px]" style={{ color: '#55555c' }}>
        {t('localTimeNote')}
      </p>

      {mounted && createPortal(detailModal, document.body)}


    </section>
  );
}
