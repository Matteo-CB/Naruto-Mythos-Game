'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useLocaleBcp47 } from '@/lib/i18n/useLocaleMeta';
import { Link } from '@/lib/i18n/navigation';
import {
  type TdTournament,
  type TdStanding,
  type TdRound,
  PANEL_CLIP,
  ROW_CLIP,
  EASE,
  StatusBadge,
  formatTournamentDate,
  formatLocation,
  TopdeckCredit,
} from './shared';
import { pct, isUrl, splitRounds, extractDecks, deckCardCount, type DeckEntry } from '@/lib/topdeck/detail';

type Tab = 'standings' | 'pairings' | 'bracket' | 'decklists';
type SortKey = 'standing' | 'points' | 'winRate' | 'opponentWinRate';
const LIVE_REFRESH_MS = 45_000;
const LIST_INITIAL = 100;
const LIST_STEP = 100;

function ShowMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (shown >= total) return null;
  return (
    <button onClick={onMore} className="font-display text-[11px] uppercase tracking-widest py-3 mt-1 cursor-pointer transition-colors hover:text-[#c4a35a]" style={{ color: '#888' }}>
      + {total - shown}
    </button>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-display text-[9px] uppercase tracking-[0.22em]" style={{ color: '#5f5f5f' }}>{label}</span>
      <span className="font-display text-sm tabular-nums" style={{ color: '#e8e2d4' }}>{value}</span>
    </div>
  );
}

function PlayerSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 mb-3" style={{ backgroundColor: 'rgba(13,12,16,0.85)', borderRadius: 9999 }}>
      <img src="/images/icons/search.svg" alt="" draggable={false} style={{ width: 14, height: 14, opacity: 0.35, flexShrink: 0 }} />
      <input
        type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="font-display flex-1 bg-transparent text-sm outline-none" style={{ color: '#f0eee7', letterSpacing: '0.03em' }}
      />
      {value && <button onClick={() => onChange('')} className="font-display text-[11px] uppercase cursor-pointer" style={{ color: '#888' }}>X</button>}
    </div>
  );
}

function StandingsTable({ standings, query, onQuery }: { standings: TdStanding[]; query: string; onQuery: (v: string) => void }) {
  const t = useTranslations('topdeck.detail');
  const [sortKey, setSortKey] = useState<SortKey>('standing');
  const [asc, setAsc] = useState(true);
  const [visible, setVisible] = useState(LIST_INITIAL);

  const clickSort = (k: SortKey) => {
    if (k === sortKey) { setAsc((v) => !v); return; }
    setSortKey(k);
    setAsc(k === 'standing');
  };

  const withRank = useMemo(
    () => standings.map((s, i) => ({ ...s, displayRank: s.standing ?? i + 1 })),
    [standings],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? withRank.filter((s) => s.name.toLowerCase().includes(q)) : withRank;
    const dir = asc ? 1 : -1;
    const key: 'displayRank' | SortKey = sortKey === 'standing' ? 'displayRank' : sortKey;
    return [...filtered].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [withRank, query, sortKey, asc]);

  const headers: { key: SortKey; label: string; right?: boolean }[] = [
    { key: 'standing', label: t('rank') },
    { key: 'points', label: t('points'), right: true },
    { key: 'winRate', label: t('winRate'), right: true },
    { key: 'opponentWinRate', label: t('oppWinRate'), right: true },
  ];

  return (
    <div>
      <PlayerSearch value={query} onChange={onQuery} placeholder={t('searchPlayer')} />
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-[44px_1fr_60px_70px_70px] gap-2 px-3 py-2">
          <button onClick={() => clickSort('standing')} className="font-display text-[9px] uppercase tracking-[0.2em] text-left cursor-pointer transition-colors hover:text-[#c4a35a]" style={{ color: sortKey === 'standing' ? '#c4a35a' : '#5f5f5f' }}>
            {t('rank')}{sortKey === 'standing' ? (asc ? ' ↑' : ' ↓') : ''}
          </button>
          <span className="font-display text-[9px] uppercase tracking-[0.2em]" style={{ color: '#5f5f5f' }}>{t('player')}</span>
          {headers.slice(1).map((h) => (
            <button key={h.key} onClick={() => clickSort(h.key)} className="font-display text-[9px] uppercase tracking-[0.2em] text-right cursor-pointer transition-colors hover:text-[#c4a35a]" style={{ color: sortKey === h.key ? '#c4a35a' : '#5f5f5f' }}>
              {h.label}{sortKey === h.key ? (asc ? ' ↑' : ' ↓') : ''}
            </button>
          ))}
        </div>
        {rows.slice(0, visible).map((s, i) => (
          <div key={`${s.id ?? s.name}-${i}`} className="grid grid-cols-[44px_1fr_60px_70px_70px] gap-2 items-center px-3 py-2" style={{ backgroundColor: i % 2 === 0 ? '#0c0b10' : '#0a0a0d', clipPath: ROW_CLIP }}>
            <span className="font-display tabular-nums text-sm" style={{ color: s.displayRank <= 3 ? '#c4a35a' : '#888' }}>#{s.displayRank}</span>
            <span className="font-display text-sm truncate" style={{ color: '#e8e2d4' }}>{s.name}</span>
            <span className="font-display tabular-nums text-sm text-right" style={{ color: '#c4a35a' }}>{s.points ?? '-'}</span>
            <span className="font-display tabular-nums text-xs text-right" style={{ color: '#9a9a9a' }}>{pct(s.winRate)}</span>
            <span className="font-display tabular-nums text-xs text-right" style={{ color: '#777' }}>{pct(s.opponentWinRate)}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="font-display text-sm text-center py-8" style={{ color: '#666' }}>-</p>}
        <div className="flex justify-center"><ShowMore shown={visible} total={rows.length} onMore={() => setVisible((v) => v + LIST_STEP)} /></div>
      </div>
    </div>
  );
}

function Pod({ table }: { table: NonNullable<TdRound['tables']>[number] }) {
  const t = useTranslations('topdeck.detail');
  const players = table.players ?? [];
  const winnerName = table.winner ?? null;
  const isDraw = (table.winner_id ?? '').toLowerCase() === 'draw' || (table.status ?? '').toLowerCase().includes('draw');
  const pending = !winnerName && !isDraw && !(table.status ?? '').toLowerCase().includes('complete');
  return (
    <div className="flex flex-col gap-1 px-3 py-2" style={{ backgroundColor: '#0c0b10', clipPath: ROW_CLIP }}>
      <div className="flex items-center justify-between">
        <span className="font-display text-[10px] uppercase tracking-widest" style={{ color: '#5f5f5f' }}>{t('table')} {table.table ?? '-'}</span>
        {isDraw ? <span className="font-display text-[10px] uppercase" style={{ color: '#888' }}>{t('draw')}</span>
          : pending ? <span className="font-display text-[10px] uppercase" style={{ color: '#7eb6ff' }}>{t('pending')}</span> : null}
      </div>
      {players.map((p, pi) => {
        const isWinner = !!winnerName && (p.name ?? '') === winnerName;
        return (
          <span key={pi} className="font-display text-sm truncate" style={{ color: isWinner ? '#c4a35a' : '#cfcabd' }}>
            {isWinner ? '▸ ' : ''}{p.name ?? '-'}
          </span>
        );
      })}
    </div>
  );
}

function PairingsView({ rounds }: { rounds: TdRound[] }) {
  const t = useTranslations('topdeck.detail');
  return (
    <div className="flex flex-col gap-5">
      {rounds.map((r, ri) => (
        <div key={ri} className="flex flex-col gap-2">
          <span className="font-display text-xs uppercase tracking-[0.25em]" style={{ color: '#c4a35a' }}>{t('round', { n: String(r.round ?? ri + 1) })}</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(r.tables ?? []).map((tbl, ti) => <Pod key={ti} table={tbl} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function BracketView({ rounds }: { rounds: TdRound[] }) {
  return (
    <div className="overflow-x-auto pb-2 no-scrollbar">
      <div className="flex gap-4 min-w-min">
        {rounds.map((r, ri) => (
          <div key={ri} className="flex flex-col gap-2 shrink-0" style={{ width: 240 }}>
            <span className="font-display text-xs uppercase tracking-[0.25em] text-center" style={{ color: '#c4a35a' }}>{String(r.round ?? ri + 1)}</span>
            <div className="flex flex-col gap-2">
              {(r.tables ?? []).map((tbl, ti) => <Pod key={ti} table={tbl} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeckPanel({ entry }: { entry: DeckEntry }) {
  const t = useTranslations('topdeck.detail');
  const deckObj = entry.deckObj;
  const total = useMemo(() => deckCardCount(deckObj), [deckObj]);

  if (!deckObj || Object.keys(deckObj).length === 0) {
    if (isUrl(entry.decklist)) {
      return <a href={entry.decklist!} target="_blank" rel="noopener noreferrer" className="font-display text-[11px] uppercase tracking-widest" style={{ color: '#c4a35a' }}>{t('viewDecklist')}</a>;
    }
    return <pre className="font-display text-[11px] whitespace-pre-wrap" style={{ color: '#9a9a9a' }}>{entry.decklist}</pre>;
  }

  return (
    <div className="flex flex-col gap-3">
      {total > 0 && <span className="font-display text-[10px] uppercase tracking-widest" style={{ color: '#777' }}>{t('cards', { count: total })}</span>}
      {Object.entries(deckObj).map(([section, cards]) => (
        <div key={section} className="flex flex-col gap-1">
          <span className="font-display text-[10px] uppercase tracking-[0.2em]" style={{ color: '#c4a35a' }}>{section}</span>
          <div className="flex flex-col gap-0.5">
            {Object.entries(cards).map(([card, info]) => (
              <span key={card} className="font-display text-[12px]" style={{ color: '#cfcabd' }}>
                <span className="tabular-nums" style={{ color: '#7a7a7a' }}>{info.count ?? 1}x </span>{card}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DecklistsView({ decks, query, onQuery }: { decks: DeckEntry[]; query: string; onQuery: (v: string) => void }) {
  const t = useTranslations('topdeck.detail');
  const [open, setOpen] = useState<string | null>(null);
  const [visible, setVisible] = useState(LIST_INITIAL);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? decks.filter((d) => d.name.toLowerCase().includes(q)) : decks;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [decks, query]);

  return (
    <div>
      <PlayerSearch value={query} onChange={onQuery} placeholder={t('searchPlayer')} />
      <div className="flex flex-col gap-1">
        {rows.slice(0, visible).map((d, i) => {
          const isOpen = open === d.id;
          return (
            <div key={d.id} style={{ backgroundColor: i % 2 === 0 ? '#0c0b10' : '#0a0a0d', clipPath: ROW_CLIP }}>
              <button onClick={() => setOpen(isOpen ? null : d.id)} className="w-full flex items-center justify-between gap-3 px-3 py-2 cursor-pointer text-left">
                <span className="font-display text-sm truncate" style={{ color: '#e8e2d4' }}>{d.name}</span>
                <span className="font-display text-[11px] uppercase tracking-widest shrink-0" style={{ color: '#c4a35a' }}>{isOpen ? '−' : t('viewDecklist')}</span>
              </button>
              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }} className="overflow-hidden">
                    <div className="px-3 pb-3 pt-1"><DeckPanel entry={d} /></div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
        {rows.length === 0 && <p className="font-display text-sm text-center py-8" style={{ color: '#666' }}>-</p>}
        <div className="flex justify-center"><ShowMore shown={visible} total={rows.length} onMore={() => setVisible((v) => v + LIST_STEP)} /></div>
      </div>
    </div>
  );
}

export function TournamentDetail({ tid }: { tid: string }) {
  const t = useTranslations('topdeck');
  const td = useTranslations('topdeck.detail');
  const bcp47 = useLocaleBcp47();
  const [data, setData] = useState<TdTournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>('standings');
  const [playerQuery, setPlayerQuery] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const h = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    if (['standings', 'pairings', 'bracket', 'decklists'].includes(h)) setTab(h as Tab);
  }, []);

  const selectTab = useCallback((tb: Tab) => {
    setTab(tb);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${tb}`);
    }
  }, []);

  const load = useCallback((silent: boolean) => {
    if (!silent) setLoading(true);
    return fetch(`/api/topdeck/tournaments/${encodeURIComponent(tid)}`)
      .then((r) => { if (r.status === 404) { setNotFound(true); return null; } if (!r.ok) throw new Error('bad'); return r.json(); })
      .then((d) => { if (d?.tournament) setData(d.tournament); if (!silent) setLoading(false); })
      .catch(() => { if (!silent) { setNotFound(true); setLoading(false); } });
  }, [tid]);

  useEffect(() => { load(false); }, [load]);

  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (data?.status === 'ongoing') {
      pollRef.current = setInterval(() => load(true), LIVE_REFRESH_MS);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [data?.status, load]);

  const rounds = useMemo<TdRound[]>(() => (Array.isArray(data?.rounds) ? data!.rounds! : []), [data]);
  const { swiss: swissRounds, cut: cutRounds } = useMemo(() => splitRounds(rounds), [rounds]);
  const decks = useMemo<DeckEntry[]>(() => extractDecks(rounds), [rounds]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: [0.16, 0.36, 0.16] }} transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.06 }} style={{ height: i === 0 ? 120 : 44, backgroundColor: '#0c0b10', clipPath: ROW_CLIP }} />
        ))}
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <p className="font-display text-base uppercase tracking-wider" style={{ color: '#9a9a9a' }}>{td('notFound')}</p>
        <Link href="/topdeck" className="font-display text-[11px] uppercase tracking-widest transition-colors hover:text-[#c4a35a]" style={{ color: '#c4a35a' }}>{td('backToList')}</Link>
      </div>
    );
  }

  const standings = data.standings ?? [];
  const loc = formatLocation(data);
  const date = formatTournamentDate(data.startDate, bcp47);

  const tabs: Tab[] = [];
  if (standings.length) tabs.push('standings');
  if (swissRounds.length) tabs.push('pairings');
  if (cutRounds.length) tabs.push('bracket');
  if (decks.length) tabs.push('decklists');
  const activeTab = tabs.includes(tab) ? tab : tabs[0];

  return (
    <div className="flex flex-col gap-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="relative overflow-hidden p-5 sm:p-6" style={{ backgroundColor: '#0d0c10', clipPath: PANEL_CLIP }}>
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <h1 className="font-display-force text-xl sm:text-3xl leading-tight" style={{ color: '#f2efe7', textShadow: '0 0 22px rgba(196,163,90,0.15)' }}>{data.name}</h1>
          <StatusBadge status={data.status} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-5">
          <StatBox label={t('filters.game')} value={data.game || '-'} />
          <StatBox label={t('filters.format')} value={data.format || '-'} />
          <StatBox label={td('player')} value={String(data.participants)} />
          {data.topCut ? <StatBox label={td('topCut')} value={String(data.topCut)} /> : null}
          {data.swissNum ? <StatBox label={td('swiss')} value={String(data.swissNum)} /> : null}
          {date ? <StatBox label={t('card.date')} value={date} /> : null}
        </div>
        {loc && <p className="font-display text-xs mb-4" style={{ color: '#8a8a8a' }}>{loc}</p>}
        <a href={data.url} target="_blank" rel="noopener noreferrer" className="font-display inline-flex items-center gap-2 px-4 py-2 text-[11px] uppercase tracking-widest transition-colors" style={{ backgroundColor: 'rgba(196,163,90,0.16)', color: '#c4a35a', borderRadius: 9999 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(196,163,90,0.28)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(196,163,90,0.16)'; }}>
          {data.status === 'upcoming' ? td('registerOnTopdeck') : td('viewOnTopdeck')}
        </a>
      </motion.div>

      {tabs.length > 0 ? (
        <div className="flex flex-col gap-4">
          {tabs.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {tabs.map((tb) => (
                <button key={tb} onClick={() => selectTab(tb)} className="font-display text-[11px] uppercase tracking-widest px-4 py-1.5 transition-colors"
                  style={{ color: activeTab === tb ? '#0a0a0a' : '#c4a35a', backgroundColor: activeTab === tb ? '#c4a35a' : 'transparent', borderRadius: 9999, cursor: 'pointer' }}>
                  {td(tb)}
                </button>
              ))}
            </div>
          )}
          <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
            {activeTab === 'standings' && <StandingsTable standings={standings} query={playerQuery} onQuery={setPlayerQuery} />}
            {activeTab === 'pairings' && <PairingsView rounds={swissRounds} />}
            {activeTab === 'bracket' && <BracketView rounds={cutRounds} />}
            {activeTab === 'decklists' && <DecklistsView decks={decks} query={playerQuery} onQuery={setPlayerQuery} />}
          </motion.div>
        </div>
      ) : (
        <p className="font-display text-sm text-center py-12" style={{ color: '#666' }}>{td('noStandings')}</p>
      )}

      <div className="flex justify-center mt-4"><TopdeckCredit /></div>
    </div>
  );
}
