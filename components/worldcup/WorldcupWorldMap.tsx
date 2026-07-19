'use client';

import { useTranslations } from 'next-intl';
import { CountryFlag } from '@/components/CountryFlag';

interface Row {
  countryCode: string;
  ranked: boolean;
  score: number;
}

export function WorldcupWorldMap({ rows, countryName }: { rows: Row[]; countryName: (c: string) => string }) {
  const t = useTranslations('worldcup');
  const ranked = rows.filter((r) => r.ranked);
  if (ranked.length === 0) return null;

  const maxScore = Math.max(...ranked.map((r) => r.score), 1);

  return (
    <div className="mb-6">
      <div className="text-[10px] uppercase tracking-[0.25em] mb-3" style={{ color: '#c4a35a' }}>
        {t('worldMapTitle')}
      </div>
      <div className="flex flex-wrap gap-3">
        {ranked.map((r) => {
          const t01 = r.score / maxScore;
          const size = 26 + Math.round(t01 * 34);
          const glow = 0.1 + t01 * 0.5;
          return (
            <div key={r.countryCode} className="flex flex-col items-center gap-1" title={`${countryName(r.countryCode)} · ${r.score.toFixed(1)}`}>
              <span
                className="flex items-center justify-center"
                style={{ boxShadow: `0 0 ${6 + t01 * 20}px rgba(196,163,90,${glow})`, borderRadius: 2 }}
              >
                <CountryFlag code={r.countryCode} size={size} />
              </span>
              <span className="font-display text-[9px] tabular-nums" style={{ color: t01 > 0.66 ? '#c4a35a' : '#777' }}>
                {r.score.toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
