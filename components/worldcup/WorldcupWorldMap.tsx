'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import { ISO_NUMERIC_TO_ALPHA2 } from '@/lib/data/isoNumericToAlpha2';

interface WorldTopology {
  objects: { countries?: unknown };
}

interface Row {
  countryCode: string;
  ranked: boolean;
  score: number;
  winRate: number;
}

interface Props {
  rows: Row[];
  countryName: (c: string) => string;
  onSelect?: (code: string) => void;
}

const VW = 960;
const VH = 470;
const NO_DATA_FILL = 'var(--t-map-nodata)';
const STROKE = 'var(--t-bg)';
const HOVER_FILL = 'var(--t-accent-bright)';
function rampColor(t: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, t)) * 1000) / 10;
  return `color-mix(in srgb, var(--t-accent) ${pct}%, var(--t-map-low))`;
}

interface Country {
  code: string;
  d: string;
}

export function WorldcupWorldMap({ rows, countryName, onSelect }: Props) {
  const t = useTranslations('worldcup');
  const [topology, setTopology] = useState<WorldTopology | null>(null);
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/data/world-110m.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('atlas'))))
      .then((topo: WorldTopology) => { if (!cancelled) setTopology(topo); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const countries = useMemo<Country[]>(() => {
    if (!topology || !topology.objects.countries) return [];
    const fc = feature(
      topology as never,
      topology.objects.countries as never,
    ) as unknown as FeatureCollection<Geometry, GeoJsonProperties>;
    const drawable = fc.features.filter((f) => String(f.id) !== '010');
    const projection = geoNaturalEarth1().fitExtent([[8, 8], [VW - 8, VH - 8]], {
      type: 'FeatureCollection',
      features: drawable,
    } as FeatureCollection);
    const pathGen = geoPath(projection);
    const out: Country[] = [];
    for (const f of drawable) {
      const code = ISO_NUMERIC_TO_ALPHA2[String(f.id)];
      const d = pathGen(f);
      if (code && d) out.push({ code, d });
    }
    return out;
  }, [topology]);

  const { scoreByCode, maxScore, rankedSet } = useMemo(() => {
    const map = new Map<string, number>();
    const ranked = new Set<string>();
    let max = 1;
    for (const r of rows) {
      map.set(r.countryCode, r.score);
      if (r.ranked) ranked.add(r.countryCode);
      if (r.ranked && r.score > max) max = r.score;
    }
    return { scoreByCode: map, maxScore: max, rankedSet: ranked };
  }, [rows]);

  const hoveredRow = hovered ? rows.find((r) => r.countryCode === hovered) : null;
  const leader = useMemo(() => rows.find((r) => r.ranked)?.countryCode ?? null, [rows]);

  if (failed) return null;

  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <span className="text-[10px] uppercase tracking-[0.25em]" style={{ color: 'var(--t-accent)' }}>
          {t('worldMapTitle')}
        </span>
        <span className="font-display text-[11px] uppercase tracking-widest tabular-nums" style={{ color: hoveredRow ? 'var(--t-text)' : 'var(--t-dim)' }}>
          {hoveredRow
            ? `${countryName(hoveredRow.countryCode)} · ${hoveredRow.score.toFixed(1)}`
            : t('worldMapHint')}
        </span>
      </div>

      <div className="w-full overflow-hidden" style={{ backgroundColor: 'var(--t-map-bg)' }}>
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          className="block w-full h-auto"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={t('worldMapTitle')}
        >
          <defs>
            <filter id="wc-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="var(--t-accent)" floodOpacity="0.65" />
            </filter>
          </defs>
          {countries.map((c) => {
            const score = scoreByCode.get(c.code);
            const isRanked = rankedSet.has(c.code);
            const isHovered = hovered === c.code;
            const fill = isRanked && score !== undefined ? rampColor(Math.min(1, score / maxScore)) : NO_DATA_FILL;
            return (
              <path
                key={c.code + c.d.length}
                d={c.d}
                stroke={STROKE}
                strokeWidth={0.4}
                style={{
                  fill: isHovered && isRanked ? HOVER_FILL : fill,
                  cursor: isRanked ? 'pointer' : 'default',
                  filter: c.code === leader ? 'url(#wc-glow)' : undefined,
                  transition: 'fill 160ms ease',
                }}
                onMouseEnter={() => setHovered(c.code)}
                onMouseLeave={() => setHovered((h) => (h === c.code ? null : h))}
                onClick={() => { if (isRanked && onSelect) onSelect(c.code); }}
              >
                <title>{`${countryName(c.code)}${score !== undefined ? ` · ${score.toFixed(1)}` : ''}`}</title>
              </path>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
