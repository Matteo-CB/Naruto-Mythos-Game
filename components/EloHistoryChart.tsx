'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';

interface EloPoint {
  t: string;
  elo: number;
  delta: number;
  result: 'win' | 'loss' | 'draw';
  opponentUsername: string;
  opponentElo: number;
}

interface EloHistoryData {
  user: {
    id: string;
    username: string;
    elo: number;
    wins: number;
    losses: number;
    draws: number;
  };
  windowDays: number;
  summary: {
    games: number;
    wins: number;
    losses: number;
    draws: number;
    totalDelta: number;
    distinctOpponents: number;
  };
  opponents: Array<{
    username: string;
    games: number;
    wins: number;
    losses: number;
    deltaSum: number;
  }>;
  points: EloPoint[];
}

const GOLD = 'var(--t-accent)';
const GREEN = 'var(--t-success-bright)';
const RED = 'var(--t-danger)';
const GREY = 'var(--t-muted)';
const DARK = 'var(--t-bg)';

interface Props {
  username: string;

  compact?: boolean;
  eloType?: 'ranked' | 'evolving' | 'highlander';
}

export function EloHistoryChart({ username, compact, eloType = 'ranked' }: Props) {
  const t = useTranslations('eloHistory');
  const locale = useLocale();
  const [data, setData] = useState<EloHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{ idx: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const typeParam = eloType === 'ranked' ? '' : `&type=${eloType}`;
    fetch(`/api/elo-history?user=${encodeURIComponent(username)}${typeParam}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
        return res.json();
      })
      .then((json: EloHistoryData) => { if (!cancelled) setData(json); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [username, eloType]);

  const chart = useMemo(() => {
    if (!data || data.points.length === 0) return null;
    const W = 720, H = 220, padL = 40, padR = 12, padT = 12, padB = 28;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const first = data.points[0];
    const startElo = first.elo - first.delta;
    const series: Array<{ t: number; elo: number; idx: number | null; point: EloPoint | null }> = [
      { t: new Date(first.t).getTime() - 1, elo: startElo, idx: null, point: null },
      ...data.points.map((p, i) => ({ t: new Date(p.t).getTime(), elo: p.elo, idx: i, point: p })),
    ];

    const minElo = Math.min(...series.map((s) => s.elo));
    const maxElo = Math.max(...series.map((s) => s.elo));
    const eloRange = Math.max(1, maxElo - minElo);
    
    const yTop = maxElo + eloRange * 0.1;
    const yBot = minElo - eloRange * 0.1;
    const ySpan = Math.max(2, yTop - yBot);

    const minT = series[0].t;
    const maxT = series[series.length - 1].t;
    const tSpan = Math.max(1, maxT - minT);

    const xOf = (t: number) => padL + ((t - minT) / tSpan) * innerW;
    const yOf = (elo: number) => padT + (1 - (elo - yBot) / ySpan) * innerH;

    const path = series
      .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xOf(s.t).toFixed(1)} ${yOf(s.elo).toFixed(1)}`)
      .join(' ');

    const nodes = series
      .filter((s) => s.idx !== null)
      .map((s) => ({
        x: xOf(s.t),
        y: yOf(s.elo),
        idx: s.idx!,
        point: s.point!,
      }));

    const ticks = [0.0, 0.33, 0.66, 1.0].map((frac) => {
      const elo = yBot + frac * ySpan;
      return { y: padT + (1 - frac) * innerH, label: Math.round(elo) };
    });

    return { W, H, padL, padR, padT, padB, path, nodes, ticks, startElo, endElo: data.points[data.points.length - 1].elo };
  }, [data]);

  if (loading) {
    return (
      <div className={compact ? 'py-4' : 'rounded-lg p-5 border'}
        style={compact ? {} : { backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-surface-2)' }}>
        <p className="text-xs" style={{ color: 'var(--t-dim)' }}>{t('loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={compact ? 'py-4' : 'rounded-lg p-5 border'}
        style={compact ? {} : { backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-surface-2)' }}>
        <p className="text-xs" style={{ color: RED }}>{t('errorPrefix')}: {error}</p>
      </div>
    );
  }

  if (!data || data.points.length === 0) {
    return (
      <div className={compact ? 'py-4' : 'rounded-lg p-5 border'}
        style={compact ? {} : { backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-surface-2)' }}>
        <p className="text-xs text-center py-6" style={{ color: 'var(--t-dim)' }}>
          {t('emptyWindow', { days: data?.windowDays ?? 14 })}
        </p>
      </div>
    );
  }

  const totalDeltaColor = data.summary.totalDelta > 0 ? GREEN : data.summary.totalDelta < 0 ? RED : GREY;

  return (
    <div className={compact ? '' : 'rounded-lg p-5 border'}
      style={compact ? {} : { backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-surface-2)' }}>

      {!compact && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD }}>
            {t('title')}
          </h2>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t-dim)' }}>
            {t('windowLabel', { days: data.windowDays })}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat label={t('statGames')} value={data.summary.games} />
        <Stat label={t('statWL')} value={`${data.summary.wins} / ${data.summary.losses}`} />
        <Stat
          label={t('statEloChange')}
          value={`${data.summary.totalDelta > 0 ? '+' : ''}${data.summary.totalDelta}`}
          valueColor={totalDeltaColor}
        />
        <Stat label={t('statOpponents')} value={data.summary.distinctOpponents} />
      </div>

      {chart && (
        <div className="relative mb-5" style={{ backgroundColor: DARK, border: `1px solid var(--t-surface-2)`, padding: '8px' }}>
          <svg
            viewBox={`0 0 ${chart.W} ${chart.H}`}
            className="w-full"
            style={{ display: 'block' }}
            onMouseLeave={() => setHovered(null)}
          >
            
            {chart.ticks.map((tk, i) => (
              <g key={i}>
                <line
                  x1={chart.padL} x2={chart.W - chart.padR}
                  y1={tk.y} y2={tk.y}
                  stroke="var(--t-surface-2)" strokeWidth={1}
                />
                <text
                  x={chart.padL - 6} y={tk.y + 3}
                  fontSize={9} fill="var(--t-border-strong)"
                  textAnchor="end"
                  fontFamily="ui-monospace, monospace"
                >
                  {tk.label}
                </text>
              </g>
            ))}

            <path
              d={chart.path}
              fill="none"
              stroke={GOLD}
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {chart.nodes.map((n) => {
              const color = n.point.result === 'win' ? GREEN : n.point.result === 'loss' ? RED : GREY;
              const isHover = hovered?.idx === n.idx;
              return (
                <g
                  key={n.idx}
                  onMouseEnter={() => setHovered({ idx: n.idx, x: n.x, y: n.y })}
                >
                  <circle
                    cx={n.x} cy={n.y}
                    r={isHover ? 4.5 : 2.5}
                    fill={color}
                    stroke={DARK}
                    strokeWidth={isHover ? 1.5 : 1}
                  />
                  
                  <circle cx={n.x} cy={n.y} r={10} fill="transparent" />
                </g>
              );
            })}

            <text
              x={chart.padL} y={chart.H - 10}
              fontSize={9} fill="var(--t-dim)"
              fontFamily="ui-monospace, monospace"
            >
              {t('chartStart', { elo: chart.startElo })}
            </text>
            <text
              x={chart.W - chart.padR} y={chart.H - 10}
              fontSize={9} fill="var(--t-dim)"
              textAnchor="end"
              fontFamily="ui-monospace, monospace"
            >
              {t('chartNow', { elo: chart.endElo })}
            </text>
          </svg>

          {hovered && (() => {
            const p = data.points[hovered.idx];
            const dateStr = new Date(p.t).toLocaleString(locale);
            const deltaColor = p.delta > 0 ? GREEN : p.delta < 0 ? RED : GREY;
            const resultColor = p.result === 'win' ? GREEN : p.result === 'loss' ? RED : GREY;
            
            const pct = (hovered.x / (chart.W || 1)) * 100;
            const onLeft = pct > 60;
            return (
              <div
                className="absolute pointer-events-none px-3 py-2 text-[10px] z-10"
                style={{
                  backgroundColor: 'var(--t-bg)',
                  border: '1px solid var(--t-border)',
                  color: 'var(--t-text)',
                  left: onLeft ? 'auto' : `calc(${pct}% + 8px)`,
                  right: onLeft ? `calc(${100 - pct}% + 8px)` : 'auto',
                  top: 8,
                  minWidth: 160,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="uppercase font-bold" style={{ color: resultColor }}>{t(`result.${p.result}`)}</span>
                  <span style={{ color: 'var(--t-text)' }}>{t('vsOpponent', { name: p.opponentUsername })}</span>
                </div>
                <div style={{ color: 'var(--t-dim)' }} className="mt-0.5">
                  {t('oppElo', { elo: p.opponentElo })}  ·  {t('myElo', { elo: p.elo })}
                </div>
                <div className="mt-0.5">
                  <span style={{ color: deltaColor, fontWeight: 700 }}>
                    {t('eloDelta', { delta: p.delta > 0 ? `+${p.delta}` : `${p.delta}` })}
                  </span>
                </div>
                <div style={{ color: 'var(--t-muted)' }} className="mt-0.5">{dateStr}</div>
              </div>
            );
          })()}
        </div>
      )}

      {data.opponents.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--t-dim)' }}>
              {t('topOpponents')}
            </h3>
            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--t-surface-2)' }} />
            <span className="text-[10px]" style={{ color: 'var(--t-muted)' }}>
              {data.opponents.length}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {data.opponents.slice(0, 10).map((o) => {
              const color = o.deltaSum > 0 ? GREEN : o.deltaSum < 0 ? RED : GREY;
              return (
                <div
                  key={o.username}
                  className="flex items-center gap-3 px-3 py-1.5 text-xs"
                  style={{ backgroundColor: o.deltaSum > 0 ? 'var(--t-success-tint)' : 'transparent' }}
                >
                  <span className="truncate flex-1 min-w-0" style={{ color: 'var(--t-text)' }}>
                    {o.username}
                  </span>
                  <span className="tabular-nums shrink-0" style={{ color: 'var(--t-dim)' }}>
                    {t('matchCount', { count: o.games })}
                  </span>
                  <span className="tabular-nums shrink-0 w-20 text-right" style={{ color: 'var(--t-muted)' }}>
                    {o.wins}{t('winShort')} {o.losses}{t('lossShort')}
                  </span>
                  <span
                    className="tabular-nums shrink-0 w-12 text-right text-[11px] font-bold"
                    style={{ color }}
                  >
                    {o.deltaSum > 0 ? '+' : ''}{o.deltaSum}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, valueColor }: { label: string; value: string | number; valueColor?: string }) {
  return (
    <div
      className="flex flex-col gap-0.5 px-3 py-2"
      style={{ backgroundColor: 'var(--t-bg-elevated)', border: '1px solid var(--t-surface-2)' }}
    >
      <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--t-dim)' }}>
        {label}
      </span>
      <span
        className="text-base font-bold tabular-nums"
        style={{ color: valueColor ?? 'var(--t-text)' }}
      >
        {value}
      </span>
    </div>
  );
}
