'use client';

import { useEffect, useMemo, useState } from 'react';

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

const GOLD = '#c4a35a';
const GREEN = '#4a9e4a';
const RED = '#b33e3e';
const GREY = '#888888';
const DARK = '#0a0a0a';

interface Props {
  username: string;
  /** Optional label override, useful when embedding in a profile page where
   *  the username is already displayed in the header. */
  compact?: boolean;
}

export function EloHistoryChart({ username, compact }: Props) {
  const [data, setData] = useState<EloHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{ idx: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/elo-history?user=${encodeURIComponent(username)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
        return res.json();
      })
      .then((json: EloHistoryData) => { if (!cancelled) setData(json); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [username]);

  // Build the SVG path + axes from the points.
  const chart = useMemo(() => {
    if (!data || data.points.length === 0) return null;
    const W = 720, H = 220, padL = 40, padR = 12, padT = 12, padB = 28;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    // Prepend the user's starting ELO so the chart begins from where they were.
    // Starting ELO = first point's elo - its delta (i.e. oldElo of the 1st game).
    const first = data.points[0];
    const startElo = first.elo - first.delta;
    const series: Array<{ t: number; elo: number; idx: number | null; point: EloPoint | null }> = [
      { t: new Date(first.t).getTime() - 1, elo: startElo, idx: null, point: null },
      ...data.points.map((p, i) => ({ t: new Date(p.t).getTime(), elo: p.elo, idx: i, point: p })),
    ];

    const minElo = Math.min(...series.map((s) => s.elo));
    const maxElo = Math.max(...series.map((s) => s.elo));
    const eloRange = Math.max(1, maxElo - minElo);
    // Y-padding so the line isn't glued to the frame.
    const yTop = maxElo + eloRange * 0.1;
    const yBot = minElo - eloRange * 0.1;
    const ySpan = Math.max(2, yTop - yBot);

    const minT = series[0].t;
    const maxT = series[series.length - 1].t;
    const tSpan = Math.max(1, maxT - minT);

    const xOf = (t: number) => padL + ((t - minT) / tSpan) * innerW;
    const yOf = (elo: number) => padT + (1 - (elo - yBot) / ySpan) * innerH;

    // Line path
    const path = series
      .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xOf(s.t).toFixed(1)} ${yOf(s.elo).toFixed(1)}`)
      .join(' ');

    // Nodes (for hover)
    const nodes = series
      .filter((s) => s.idx !== null)
      .map((s) => ({
        x: xOf(s.t),
        y: yOf(s.elo),
        idx: s.idx!,
        point: s.point!,
      }));

    // Y-axis ticks (4 values)
    const ticks = [0.0, 0.33, 0.66, 1.0].map((frac) => {
      const elo = yBot + frac * ySpan;
      return { y: padT + (1 - frac) * innerH, label: Math.round(elo) };
    });

    return { W, H, padL, padR, padT, padB, path, nodes, ticks, startElo, endElo: data.points[data.points.length - 1].elo };
  }, [data]);

  if (loading) {
    return (
      <div className={compact ? 'py-4' : 'rounded-lg p-5 border'}
        style={compact ? {} : { backgroundColor: '#111', borderColor: '#1e1e1e' }}>
        <p className="text-xs" style={{ color: '#666' }}>Loading ELO history…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={compact ? 'py-4' : 'rounded-lg p-5 border'}
        style={compact ? {} : { backgroundColor: '#111', borderColor: '#1e1e1e' }}>
        <p className="text-xs" style={{ color: RED }}>ELO history: {error}</p>
      </div>
    );
  }

  if (!data || data.points.length === 0) {
    return (
      <div className={compact ? 'py-4' : 'rounded-lg p-5 border'}
        style={compact ? {} : { backgroundColor: '#111', borderColor: '#1e1e1e' }}>
        <p className="text-xs text-center py-6" style={{ color: '#555' }}>
          No ranked games in the last {data?.windowDays ?? 14} days.
        </p>
      </div>
    );
  }

  const totalDeltaColor = data.summary.totalDelta > 0 ? GREEN : data.summary.totalDelta < 0 ? RED : GREY;

  return (
    <div className={compact ? '' : 'rounded-lg p-5 border'}
      style={compact ? {} : { backgroundColor: '#111', borderColor: '#1e1e1e' }}>

      {!compact && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD }}>
            ELO history
          </h2>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: '#555' }}>
            last {data.windowDays} days
          </span>
        </div>
      )}

      {/* Summary row */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <Stat label="games" value={data.summary.games} />
        <Stat label="W / L / D" value={`${data.summary.wins} / ${data.summary.losses} / ${data.summary.draws}`} />
        <Stat
          label="ELO change"
          value={`${data.summary.totalDelta > 0 ? '+' : ''}${data.summary.totalDelta}`}
          valueColor={totalDeltaColor}
        />
        <Stat label="opponents" value={data.summary.distinctOpponents} />
      </div>

      {/* SVG chart */}
      {chart && (
        <div className="relative mb-5" style={{ backgroundColor: DARK, border: `1px solid #1e1e1e`, padding: '8px' }}>
          <svg
            viewBox={`0 0 ${chart.W} ${chart.H}`}
            className="w-full"
            style={{ display: 'block' }}
            onMouseLeave={() => setHovered(null)}
          >
            {/* Y-axis gridlines + labels */}
            {chart.ticks.map((tk, i) => (
              <g key={i}>
                <line
                  x1={chart.padL} x2={chart.W - chart.padR}
                  y1={tk.y} y2={tk.y}
                  stroke="#1a1a1a" strokeWidth={1}
                />
                <text
                  x={chart.padL - 6} y={tk.y + 3}
                  fontSize={9} fill="#444"
                  textAnchor="end"
                  fontFamily="ui-monospace, monospace"
                >
                  {tk.label}
                </text>
              </g>
            ))}

            {/* Main ELO line */}
            <path
              d={chart.path}
              fill="none"
              stroke={GOLD}
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Nodes — coloured by result */}
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
                  {/* Generous hit target so hovering is easy */}
                  <circle cx={n.x} cy={n.y} r={10} fill="transparent" />
                </g>
              );
            })}

            {/* Start / end labels on the X axis */}
            <text
              x={chart.padL} y={chart.H - 10}
              fontSize={9} fill="#555"
              fontFamily="ui-monospace, monospace"
            >
              {chart.startElo} start
            </text>
            <text
              x={chart.W - chart.padR} y={chart.H - 10}
              fontSize={9} fill="#555"
              textAnchor="end"
              fontFamily="ui-monospace, monospace"
            >
              {chart.endElo} now
            </text>
          </svg>

          {/* Hover tooltip */}
          {hovered && (() => {
            const p = data.points[hovered.idx];
            const dateStr = new Date(p.t).toLocaleString();
            const deltaColor = p.delta > 0 ? GREEN : p.delta < 0 ? RED : GREY;
            const resultColor = p.result === 'win' ? GREEN : p.result === 'loss' ? RED : GREY;
            // Clamp tooltip position so it stays inside the container
            const pct = (hovered.x / (chart.W || 1)) * 100;
            const onLeft = pct > 60;
            return (
              <div
                className="absolute pointer-events-none px-3 py-2 text-[10px] z-10"
                style={{
                  backgroundColor: '#0a0a0a',
                  border: '1px solid #2a2a2a',
                  color: '#ccc',
                  left: onLeft ? 'auto' : `calc(${pct}% + 8px)`,
                  right: onLeft ? `calc(${100 - pct}% + 8px)` : 'auto',
                  top: 8,
                  minWidth: 160,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="uppercase font-bold" style={{ color: resultColor }}>{p.result}</span>
                  <span style={{ color: '#ccc' }}>vs {p.opponentUsername}</span>
                </div>
                <div style={{ color: '#666' }} className="mt-0.5">
                  opp ELO {p.opponentElo}  ·  my ELO {p.elo}
                </div>
                <div className="mt-0.5">
                  <span style={{ color: deltaColor, fontWeight: 700 }}>
                    {p.delta > 0 ? '+' : ''}{p.delta} ELO
                  </span>
                </div>
                <div style={{ color: '#444' }} className="mt-0.5">{dateStr}</div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Top opponents */}
      {data.opponents.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#555' }}>
              top opponents
            </h3>
            <div className="flex-1 h-px" style={{ backgroundColor: '#1e1e1e' }} />
            <span className="text-[10px]" style={{ color: '#444' }}>
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
                  style={{ backgroundColor: '#0e0e0e', borderLeft: `2px solid ${color}` }}
                >
                  <span className="truncate flex-1 min-w-0" style={{ color: '#ccc' }}>
                    {o.username}
                  </span>
                  <span className="tabular-nums shrink-0" style={{ color: '#666' }}>
                    {o.games} {o.games === 1 ? 'match' : 'matches'}
                  </span>
                  <span className="tabular-nums shrink-0 w-20 text-right" style={{ color: '#888' }}>
                    {o.wins}W {o.losses}L
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
      style={{ backgroundColor: '#0e0e0e', border: '1px solid #1a1a1a' }}
    >
      <span className="text-[9px] uppercase tracking-wider" style={{ color: '#555' }}>
        {label}
      </span>
      <span
        className="text-base font-bold tabular-nums"
        style={{ color: valueColor ?? '#ddd' }}
      >
        {value}
      </span>
    </div>
  );
}
