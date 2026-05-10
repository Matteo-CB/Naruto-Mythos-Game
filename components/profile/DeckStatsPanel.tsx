'use client';

import { useEffect, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';

interface DailyEntry {
  d: number;
  w: number;
  l: number;
  x: number;
  e: number;
}

interface DeckStats {
  deckId: string;
  deckName: string;
  wins: number;
  losses: number;
  draws: number;
  eloDeltaSum: number;
  gamesTotal: number;
  winrate: number;
  lastPlayedAt: string | null;
  daily: DailyEntry[];
}

interface Deck {
  id: string;
  name: string;
}

function relativeTime(iso: string | null, t: ReturnType<typeof useTranslations>): string {
  if (!iso) return t('never');
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return t('justNow');
  const min = Math.floor(sec / 60);
  if (min < 60) return t('minutesAgo', { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('hoursAgo', { n: hr });
  const day = Math.floor(hr / 24);
  if (day < 7) return t('daysAgo', { n: day });
  const wk = Math.floor(day / 7);
  return t('weeksAgo', { n: wk });
}

function Sparkline({ daily }: { daily: DailyEntry[] }) {
  const points = useMemo(() => {
    if (daily.length === 0) return null;
    const today = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    const cutoff = today - 90;
    const filled = new Map<number, number>();
    let cum = 0;
    const sorted = [...daily].filter(d => d.d >= cutoff).sort((a, b) => a.d - b.d);
    for (const e of sorted) {
      cum += e.e;
      filled.set(e.d, cum);
    }
    if (filled.size === 0) return null;
    const W = 200;
    const H = 36;
    const days = [...filled.keys()];
    const minDay = days[0];
    const maxDay = today;
    const range = Math.max(1, maxDay - minDay);
    const values = [...filled.values()];
    const minV = Math.min(0, ...values);
    const maxV = Math.max(0, ...values);
    const vRange = Math.max(1, maxV - minV);
    let lastY = H - ((0 - minV) / vRange) * H;
    const path: string[] = [];
    let runningCum = 0;
    for (let day = minDay; day <= maxDay; day++) {
      if (filled.has(day)) runningCum = filled.get(day)!;
      const x = ((day - minDay) / range) * W;
      const y = H - ((runningCum - minV) / vRange) * H;
      lastY = y;
      path.push(path.length === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : `L${x.toFixed(1)},${y.toFixed(1)}`);
    }
    const baselineY = H - ((0 - minV) / vRange) * H;
    return { path: path.join(' '), baselineY, lastY, W, H, lastValue: cum };
  }, [daily]);

  if (!points) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ width: 200, height: 36, color: '#333' }}
      >
        <span className="text-[10px]">...</span>
      </div>
    );
  }

  const stroke = points.lastValue >= 0 ? '#3e8b3e' : '#b33e3e';
  return (
    <svg width={points.W} height={points.H} viewBox={`0 0 ${points.W} ${points.H}`} style={{ display: 'block' }}>
      <line x1="0" y1={points.baselineY} x2={points.W} y2={points.baselineY} stroke="#1e1e1e" strokeWidth="1" />
      <path d={points.path} stroke={stroke} strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function DeckCard({ stats, t, tStats }: { stats: DeckStats; t: ReturnType<typeof useTranslations>; tStats: ReturnType<typeof useTranslations> }) {
  const eloColor = stats.eloDeltaSum > 0 ? '#3e8b3e' : stats.eloDeltaSum < 0 ? '#b33e3e' : '#888';
  const winrateColor = stats.winrate >= 60 ? '#3e8b3e' : stats.winrate >= 40 ? '#c4a35a' : '#b33e3e';

  return (
    <div
      className="relative rounded-lg overflow-hidden"
      style={{ backgroundColor: '#111111', border: '1px solid #1e1e1e' }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent 10%, #c4a35a33, transparent 90%)' }}
      />

      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
        <h3 className="text-sm font-semibold truncate flex-1" style={{ color: '#e0e0e0' }}>
          {stats.deckName}
        </h3>
        <span className="text-[10px] shrink-0" style={{ color: '#555' }}>
          {relativeTime(stats.lastPlayedAt, tStats)}
        </span>
      </div>

      {stats.gamesTotal === 0 ? (
        <div className="px-4 pb-4 pt-2">
          <p className="text-[11px]" style={{ color: '#444' }}>{tStats('noGamesYet')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-[auto,1fr,auto] items-center gap-4 px-4 pb-4 pt-1">
          <div className="flex flex-col items-center min-w-[72px]">
            <span className="text-2xl font-bold tabular-nums leading-tight" style={{ color: winrateColor }}>
              {stats.winrate}%
            </span>
            <span className="text-[9px] uppercase tracking-wider" style={{ color: '#555' }}>
              {tStats('winrate')}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <Sparkline daily={stats.daily} />
            <div className="flex gap-3 text-[10px] tabular-nums" style={{ color: '#666' }}>
              <span style={{ color: '#3e8b3e' }}>{stats.wins}W</span>
              <span style={{ color: '#b33e3e' }}>{stats.losses}L</span>
              {stats.draws > 0 && <span>{stats.draws}D</span>}
              <span style={{ color: '#444' }}>·</span>
              <span>{tStats('games', { n: stats.gamesTotal })}</span>
            </div>
          </div>

          <div className="flex flex-col items-end shrink-0">
            <span className="text-base font-bold tabular-nums leading-tight" style={{ color: eloColor }}>
              {stats.eloDeltaSum > 0 ? '+' : ''}{stats.eloDeltaSum}
            </span>
            <span className="text-[9px] uppercase tracking-wider" style={{ color: '#555' }}>
              ELO 90d
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function DeckStatsPanel({ decks }: { decks: Deck[] }) {
  const t = useTranslations('profile');
  const tStats = useTranslations('deckStats');
  const [statsByDeck, setStatsByDeck] = useState<Record<string, DeckStats | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (decks.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch('/api/decks/stats')
      .then((r) => (r.ok ? r.json() : { decks: [] }))
      .then((data: { decks: DeckStats[] }) => {
        if (cancelled) return;
        const next: Record<string, DeckStats | null> = {};
        for (const s of data.decks ?? []) next[s.deckId] = s;
        setStatsByDeck(next);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [decks]);

  if (decks.length === 0) return null;

  const sorted = [...decks].sort((a, b) => {
    const sa = statsByDeck[a.id];
    const sb = statsByDeck[b.id];
    const tA = sa?.lastPlayedAt ? new Date(sa.lastPlayedAt).getTime() : 0;
    const tB = sb?.lastPlayedAt ? new Date(sb.lastPlayedAt).getTime() : 0;
    return tB - tA;
  });

  return (
    <section className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#555' }}>
          {tStats('title')}
        </h2>
        <div className="flex-1 h-px" style={{ backgroundColor: '#1e1e1e' }} />
        <span className="text-[10px] tabular-nums" style={{ color: '#444' }}>
          {decks.length}
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {decks.slice(0, 4).map((d) => (
            <div
              key={d.id}
              className="rounded-lg"
              style={{
                backgroundColor: '#111111',
                border: '1px solid #1e1e1e',
                height: 96,
              }}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sorted.map((deck) => {
            const stats = statsByDeck[deck.id] ?? {
              deckId: deck.id,
              deckName: deck.name,
              wins: 0, losses: 0, draws: 0, eloDeltaSum: 0, gamesTotal: 0, winrate: 0,
              lastPlayedAt: null,
              daily: [],
            };
            return <DeckCard key={deck.id} stats={stats} t={t} tStats={tStats} />;
          })}
        </div>
      )}
    </section>
  );
}
