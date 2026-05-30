'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { TournamentCard } from './TournamentCard';
import { type TdTournament, type TdFacets, ROW_CLIP, EASE, TopdeckCredit } from './shared';

const PAGE_SIZE = 24;
type SortKey = 'recent' | 'oldest' | 'biggest';
const STATUS_TABS = ['upcoming', 'ongoing', 'completed'] as const;
type StatusTab = (typeof STATUS_TABS)[number];
const DISTANCE_STOPS = [25, 50, 100, 200, 300, 500, 1000, Infinity];
const DISTANCE_MAX_INDEX = DISTANCE_STOPS.length - 1;

function Pill({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 cursor-pointer transition-colors"
      style={{
        backgroundColor: active ? 'rgba(196,163,90,0.16)' : 'rgba(255,255,255,0.03)',
        color: active ? '#c4a35a' : '#777',
        borderRadius: 9999,
      }}
    >
      <span className="text-[11px] tracking-wider uppercase whitespace-nowrap">{label}</span>
      {typeof count === 'number' && (
        <span className="text-[10px] tabular-nums" style={{ color: active ? '#c4a35a' : '#555' }}>{count}</span>
      )}
    </motion.button>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.16, 0.36, 0.16] }}
          transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.05 }}
          style={{ height: 132, backgroundColor: '#0c0b10', clipPath: ROW_CLIP }}
        />
      ))}
    </div>
  );
}

export function TopdeckBrowser() {
  const t = useTranslations('topdeck');

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<StatusTab>('upcoming');
  const [format, setFormat] = useState('');
  const [country, setCountry] = useState('');
  const [minPlayers, setMinPlayers] = useState('');
  const [sort, setSort] = useState<SortKey>('oldest');
  const [showMore, setShowMore] = useState(false);
  const [page, setPage] = useState(1);

  const [facets, setFacets] = useState<TdFacets | null>(null);
  const [rows, setRows] = useState<TdTournament[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const userPickedStatus = useRef(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'locating' | 'granted' | 'denied'>('idle');
  const [distanceIndex, setDistanceIndex] = useState(0);
  const [userTouchedDistance, setUserTouchedDistance] = useState(false);

  const requestGeo = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setGeoStatus('denied'); return; }
    setGeoStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoStatus('granted'); },
      () => { setGeoStatus('denied'); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }, []);

  useEffect(() => {
    if (geoStatus === 'idle') requestGeo();
  }, [geoStatus, requestGeo]);

  useEffect(() => {
    setDistanceIndex(0);
    setUserTouchedDistance(false);
  }, [status]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const useProximity = !!coords;
  const showDistanceFilter = useProximity && (status === 'upcoming' || status === 'completed');
  const maxKm = DISTANCE_STOPS[distanceIndex];

  useEffect(() => { setPage(1); }, [debounced, status, format, country, minPlayers, sort, useProximity, distanceIndex]);

  const applyStatus = useCallback((s: StatusTab) => {
    setStatus(s);
    setSort(s === 'upcoming' ? 'oldest' : 'recent');
  }, []);

  const onTab = useCallback((s: StatusTab) => {
    userPickedStatus.current = true;
    applyStatus(s);
  }, [applyStatus]);

  useEffect(() => {
    fetch('/api/topdeck/filters')
      .then((r) => r.json())
      .then((d: TdFacets) => {
        setFacets(d);
        if (!userPickedStatus.current && Array.isArray(d.statuses)) {
          const countOf = (s: string) => d.statuses.find((x) => x.value === s)?.count ?? 0;
          const firstNonEmpty = STATUS_TABS.find((s) => countOf(s) > 0);
          if (firstNonEmpty) applyStatus(firstNonEmpty);
        }
      })
      .catch(() => {});
  }, [applyStatus]);

  useEffect(() => {
    setLoading(true);
    setError(false);
    const qs = new URLSearchParams();
    qs.set('take', String(PAGE_SIZE));
    qs.set('skip', String((page - 1) * PAGE_SIZE));
    if (useProximity) {
      if (status === 'upcoming') { qs.set('sort', 'startDate'); qs.set('order', 'asc'); qs.set('proximityOrder', 'date'); }
      else if (status === 'completed') { qs.set('sort', 'startDate'); qs.set('order', 'desc'); qs.set('proximityOrder', 'date'); }
      else { qs.set('sort', 'startDate'); qs.set('order', 'asc'); qs.set('proximityOrder', 'distance'); }
    } else if (sort === 'recent') { qs.set('sort', 'startDate'); qs.set('order', 'desc'); }
    else if (sort === 'oldest') { qs.set('sort', 'startDate'); qs.set('order', 'asc'); }
    else { qs.set('sort', 'participants'); qs.set('order', 'desc'); }
    if (debounced) qs.set('search', debounced);
    qs.set('status', status);
    if (format) qs.set('format', format);
    if (country) qs.set('country', country);
    if (minPlayers && Number(minPlayers) > 0) qs.set('participantsMin', String(Number(minPlayers)));
    if (useProximity && coords) {
      qs.set('near', `${coords.lat},${coords.lng}`);
      if (showDistanceFilter && Number.isFinite(maxKm)) qs.set('maxKm', String(maxKm));
    }

    let cancelled = false;
    fetch(`/api/topdeck/tournaments?${qs.toString()}`)
      .then((r) => { if (!r.ok) throw new Error('bad'); return r.json(); })
      .then((d) => {
        if (cancelled) return;
        setRows(d.tournaments ?? []);
        setTotal(d.total ?? 0);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [page, debounced, status, format, country, minPlayers, sort, useProximity, coords, maxKm]);

  useEffect(() => {
    if (!loading && showDistanceFilter && total === 0 && !userTouchedDistance && distanceIndex < DISTANCE_MAX_INDEX) {
      setDistanceIndex((i) => i + 1);
    }
  }, [loading, showDistanceFilter, total, userTouchedDistance, distanceIndex]);

  const onSlide = useCallback((v: number) => {
    setUserTouchedDistance(true);
    setDistanceIndex(v);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilters = !!(debounced || format || country || minPlayers);
  const statusCount = useCallback(
    (s: string) => facets?.statuses.find((x) => x.value === s)?.count ?? null,
    [facets],
  );

  const clearAll = useCallback(() => {
    setSearch(''); setFormat(''); setCountry(''); setMinPlayers('');
  }, []);

  const countLabel = useMemo(
    () => (total === 1 ? t('count', { count: total }) : t('countPlural', { count: total })),
    [total, t],
  );

  return (
    <div>
      {/* Status tabs */}
      <motion.div
        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.02 }}
        className="flex items-center justify-center gap-1 sm:gap-1.5 mb-6 flex-wrap"
      >
        {STATUS_TABS.map((s) => {
          const active = status === s;
          const c = statusCount(s);
          return (
            <button
              key={s}
              onClick={() => onTab(s)}
              className="flex items-center gap-1.5 text-[11px] sm:text-xs uppercase tracking-widest px-4 sm:px-6 py-2.5 transition-colors"
              style={{ color: active ? '#0a0a0a' : '#c4a35a', backgroundColor: active ? '#c4a35a' : 'transparent', borderRadius: 9999, cursor: 'pointer' }}
            >
              {t(`status.${s}`)}
              {c != null && <span className="tabular-nums text-[10px]" style={{ opacity: 0.7 }}>{c}</span>}
            </button>
          );
        })}
      </motion.div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.06 }}
        className="relative mb-4"
      >
        <div className="flex items-center gap-3 px-5 py-3" style={{ backgroundColor: 'rgba(13,12,16,0.85)', borderRadius: 9999 }}>
          <img src="/images/icons/search.svg" alt="" draggable={false} style={{ width: 16, height: 16, opacity: 0.35, flexShrink: 0 }} />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: '#f0eee7', letterSpacing: '0.03em' }}
          />
          {search && (
            <button onClick={() => { setSearch(''); searchRef.current?.focus(); }} className="text-[11px] uppercase cursor-pointer" style={{ color: '#888' }}>X</button>
          )}
        </div>
      </motion.div>

      {/* Format pills (primary filter, Naruto-only) */}
      {facets && facets.formats.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.1 }} className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar mb-3">
          <Pill active={!format} onClick={() => setFormat('')} label={t('filters.allFormats')} />
          {facets.formats.map((f) => (
            <Pill key={f.value} active={format === f.value} onClick={() => setFormat(format === f.value ? '' : f.value)} label={f.value} count={f.count} />
          ))}
        </motion.div>
      )}

      {/* More filters + sort */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowMore((v) => !v)} className="text-[11px] uppercase tracking-widest cursor-pointer transition-colors hover:text-[#c4a35a]" style={{ color: '#888' }}>
            {showMore ? t('filters.fewer') : t('filters.more')}
          </button>
          {hasActiveFilters && (
            <button onClick={clearAll} className="text-[11px] uppercase tracking-widest cursor-pointer transition-colors hover:text-[#c4a35a]" style={{ color: '#666' }}>
              {t('filters.clear')}
            </button>
          )}
        </div>
        {useProximity ? (
          showDistanceFilter ? (
            <div className="flex items-center gap-2" style={{ minWidth: 180 }}>
              <input
                type="range" min={0} max={DISTANCE_MAX_INDEX} step={1} value={distanceIndex}
                onChange={(e) => onSlide(Number(e.target.value))}
                className="topdeck-range w-32 sm:w-40"
                aria-label={t('proximity.radius')}
              />
              <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: '#c4a35a', minWidth: 48 }}>
                {Number.isFinite(maxKm) ? t('proximity.radiusKm', { km: maxKm }) : t('proximity.radiusAll')}
              </span>
            </div>
          ) : (
            <span className="text-[11px] uppercase tracking-widest" style={{ color: '#c4a35a' }}>{t('proximity.sortedNear')}</span>
          )
        ) : geoStatus === 'locating' ? (
          <span className="text-[11px] uppercase tracking-widest" style={{ color: '#888' }}>{t('proximity.locating')}</span>
        ) : geoStatus === 'denied' ? (
          <div className="flex items-center gap-2">
            <button onClick={requestGeo} className="text-[11px] uppercase tracking-widest cursor-pointer transition-colors hover:text-[#c4a35a]" style={{ color: '#888' }}>
              {t('proximity.enable')}
            </button>
            <div className="flex items-center gap-1.5">
              {(['recent', 'oldest', 'biggest'] as SortKey[]).map((s) => (
                <Pill key={s} active={sort === s} onClick={() => setSort(s)} label={t(`sort.${s}`)} />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {(['recent', 'oldest', 'biggest'] as SortKey[]).map((s) => (
              <Pill key={s} active={sort === s} onClick={() => setSort(s)} label={t(`sort.${s}`)} />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showMore && facets && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden mb-4"
          >
            <div className="flex flex-col gap-3 px-1 pb-2">
              {facets.countries.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  <Pill active={!country} onClick={() => setCountry('')} label={t('filters.allCountries')} />
                  {facets.countries.slice(0, 30).map((c) => (
                    <Pill key={c.value} active={country === c.value} onClick={() => setCountry(country === c.value ? '' : c.value)} label={c.value} count={c.count} />
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className="text-[11px] uppercase tracking-widest" style={{ color: '#777' }}>{t('filters.minParticipants')}</span>
                <input
                  type="number" min={0} value={minPlayers}
                  onChange={(e) => setMinPlayers(e.target.value)}
                  className="w-24 bg-transparent text-sm outline-none px-3 py-1.5"
                  style={{ color: '#f0eee7', backgroundColor: 'rgba(13,12,16,0.85)', borderRadius: 9999 }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Count divider */}
      {!loading && !error && total > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(196,163,90,0.15)' }} />
          <span className="text-[10px] uppercase tracking-[0.3em] tabular-nums" style={{ color: '#777' }}>{countLabel}</span>
          <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(196,163,90,0.15)' }} />
        </motion.div>
      )}

      {/* List */}
      <section>
        {loading ? (
          <SkeletonGrid />
        ) : error ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm" style={{ color: '#a06868' }}>{t('loadError')}</p>
          </div>
        ) : rows.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 gap-2 text-center">
            <p className="text-base uppercase tracking-wider" style={{ color: '#9a9a9a' }}>{t('empty.title')}</p>
            <p className="text-xs" style={{ color: '#555' }}>{t('empty.hint')}</p>
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={`${page}-${debounced}-${status}-${format}-${country}-${sort}-${useProximity ? `near-${distanceIndex}` : 'date'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {rows.map((row, i) => <TournamentCard key={row.tid} t={row} index={i} />)}
            </motion.div>
          </AnimatePresence>
        )}

        {!loading && !error && totalPages > 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.4 }} className="flex items-center justify-center gap-6 mt-8">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-4 py-2 text-xs uppercase tracking-widest cursor-pointer disabled:opacity-20 transition-colors hover:text-[#c4a35a]" style={{ color: '#888' }}>&lt;</button>
            <span className="text-sm tabular-nums" style={{ color: '#c4a35a' }}>{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-4 py-2 text-xs uppercase tracking-widest cursor-pointer disabled:opacity-20 transition-colors hover:text-[#c4a35a]" style={{ color: '#888' }}>&gt;</button>
          </motion.div>
        )}
      </section>

      <div className="flex justify-center mt-10">
        <TopdeckCredit />
      </div>
    </div>
  );
}
