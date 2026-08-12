'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CountryFlag } from '@/components/CountryFlag';
import { getCardGroup, type CardMetaTranslator } from '@/lib/utils/cardLocale';

interface Row {
  countryCode: string;
  ranked: boolean;
  score: number;
  winRate: number;
  avgElo: number;
  avgOpponentElo: number;
  players: number;
  games: number;
  topGroup: string | null;
}

function Select({ rows, value, onChange, countryName }: { rows: Row[]; value: string; onChange: (v: string) => void; countryName: (c: string) => string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2 py-1.5 text-[12px] font-display uppercase tracking-wide"
      style={{ backgroundColor: 'var(--t-surface-2)', color: 'var(--t-text)', border: '1px solid var(--t-border)' }}
    >
      {rows.map((r) => (
        <option key={r.countryCode} value={r.countryCode}>{countryName(r.countryCode)}</option>
      ))}
    </select>
  );
}

export function WorldcupComparator({ rows, countryName, tCardMeta }: { rows: Row[]; countryName: (c: string) => string; tCardMeta: CardMetaTranslator }) {
  const t = useTranslations('worldcup');
  const ranked = rows.filter((r) => r.ranked);
  const [a, setA] = useState(ranked[0]?.countryCode ?? '');
  const [b, setB] = useState(ranked[1]?.countryCode ?? ranked[0]?.countryCode ?? '');

  if (ranked.length < 2) return null;

  const ca = ranked.find((r) => r.countryCode === a) ?? ranked[0];
  const cb = ranked.find((r) => r.countryCode === b) ?? ranked[1];

  const metrics: Array<{ label: string; a: number; b: number; suffix?: string }> = [
    { label: t('colScore'), a: ca.score, b: cb.score },
    { label: t('colWinRate'), a: ca.winRate, b: cb.winRate, suffix: '%' },
    { label: t('detailAvgElo'), a: ca.avgElo, b: cb.avgElo },
    { label: t('detailBeatenElo'), a: ca.avgOpponentElo, b: cb.avgOpponentElo },
    { label: t('colPlayers'), a: ca.players, b: cb.players },
    { label: t('detailGames'), a: ca.games, b: cb.games },
  ];

  return (
    <div className="mt-8 px-5 py-4" style={{ backgroundColor: 'var(--t-panel-veil)' }}>
      <div className="text-[10px] uppercase tracking-[0.25em] mb-3" style={{ color: 'var(--t-accent)' }}>
        {t('comparatorTitle')}
      </div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <CountryFlag code={ca.countryCode} size={22} />
          <Select rows={ranked} value={a} onChange={setA} countryName={countryName} />
        </div>
        <span className="font-display text-[10px] uppercase tracking-widest" style={{ color: 'var(--t-dim)' }}>vs</span>
        <div className="flex items-center gap-2">
          <Select rows={ranked} value={b} onChange={setB} countryName={countryName} />
          <CountryFlag code={cb.countryCode} size={22} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {metrics.map((m) => {
          const aBetter = m.a >= m.b;
          return (
            <div key={m.label} className="grid items-center gap-2" style={{ gridTemplateColumns: '4rem 1fr 4rem' }}>
              <span className="text-right font-display text-xs tabular-nums" style={{ color: aBetter ? 'var(--t-accent)' : 'var(--t-muted)' }}>
                {m.a.toFixed(m.suffix ? 1 : 0)}{m.suffix ?? ''}
              </span>
              <span className="text-center text-[9px] uppercase tracking-widest" style={{ color: 'var(--t-dim)' }}>{m.label}</span>
              <span className="font-display text-xs tabular-nums" style={{ color: !aBetter ? 'var(--t-accent)' : 'var(--t-muted)' }}>
                {m.b.toFixed(m.suffix ? 1 : 0)}{m.suffix ?? ''}
              </span>
            </div>
          );
        })}
        <div className="grid items-center gap-2 mt-1 pt-2" style={{ gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--t-divider)' }}>
          <span className="text-[9px] uppercase tracking-widest text-center" style={{ color: 'var(--t-accent-label)' }}>
            {ca.topGroup ? getCardGroup(ca.topGroup, tCardMeta) : '-'}
          </span>
          <span className="text-[9px] uppercase tracking-widest text-center" style={{ color: 'var(--t-accent-label)' }}>
            {cb.topGroup ? getCardGroup(cb.topGroup, tCardMeta) : '-'}
          </span>
        </div>
      </div>
    </div>
  );
}
