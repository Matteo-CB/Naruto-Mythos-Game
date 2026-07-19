'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CountryFlag } from '@/components/CountryFlag';

interface ProgressionData {
  days: string[];
  series: Array<{ code: string; points: (number | null)[] }>;
}

const LINE_COLORS = ['#c4a35a', '#8fbf8f', '#5a7abb', '#c48f8f', '#9b7bb8'];
const W = 320;
const H = 120;
const PAD = 8;

export function WorldcupProgression({ countryName }: { countryName: (c: string) => string }) {
  const t = useTranslations('worldcup');
  const [data, setData] = useState<ProgressionData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/worldcup/progression')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ProgressionData | null) => { if (!cancelled) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!data || data.days.length < 2 || data.series.length === 0) {
    return (
      <div className="mt-8 px-5 py-4" style={{ backgroundColor: 'rgba(17, 17, 17, 0.7)' }}>
        <div className="text-[10px] uppercase tracking-[0.25em] mb-2" style={{ color: '#c4a35a' }}>{t('progressionTitle')}</div>
        <p className="text-[11px]" style={{ color: '#666' }}>{t('progressionCollecting')}</p>
      </div>
    );
  }

  const n = data.days.length;
  const x = (i: number) => PAD + (i / (n - 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - (Math.max(0, Math.min(100, v)) / 100) * (H - 2 * PAD);

  return (
    <div className="mt-8 px-5 py-4" style={{ backgroundColor: 'rgba(17, 17, 17, 0.7)' }}>
      <div className="text-[10px] uppercase tracking-[0.25em] mb-3" style={{ color: '#c4a35a' }}>{t('progressionTitle')}</div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 280, maxHeight: 160 }}>
          {[0, 25, 50, 75, 100].map((g) => (
            <line key={g} x1={PAD} x2={W - PAD} y1={y(g)} y2={y(g)} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
          ))}
          {data.series.map((s, si) => {
            const pts = s.points
              .map((p, i) => (p === null ? null : `${x(i)},${y(p)}`))
              .filter((p): p is string => p !== null)
              .join(' ');
            return <polyline key={s.code} points={pts} fill="none" stroke={LINE_COLORS[si % LINE_COLORS.length]} strokeWidth={1.6} />;
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-3 mt-2">
        {data.series.map((s, si) => (
          <span key={s.code} className="flex items-center gap-1.5">
            <span style={{ width: 10, height: 3, backgroundColor: LINE_COLORS[si % LINE_COLORS.length], display: 'inline-block' }} />
            <CountryFlag code={s.code} size={14} />
            <span className="text-[10px] uppercase tracking-wide" style={{ color: '#888' }}>{countryName(s.code)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
