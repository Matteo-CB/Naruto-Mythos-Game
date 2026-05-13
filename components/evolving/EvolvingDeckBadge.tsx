'use client';

import { useTranslations } from 'next-intl';
import { EVOLVING_MAX_POINTS } from '@/lib/evolving/constants';
import { getEvolvingColorForPoints } from '@/lib/evolving/colors';

interface Props {
  points: number;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export function EvolvingDeckBadge({ points, size = 'sm', showLabel = true }: Props) {
  const t = useTranslations('evolving');

  if (typeof points !== 'number' || !Number.isFinite(points) || points < 0) return null;
  if (points > EVOLVING_MAX_POINTS) return null;

  const color = getEvolvingColorForPoints(points);
  if (color === null) return null;

  const padX = size === 'md' ? 'px-2' : 'px-1.5';
  const padY = size === 'md' ? 'py-1' : 'py-0.5';
  const text = size === 'md' ? 'text-[11px]' : 'text-[9px]';

  return (
    <span
      className={`inline-flex items-center gap-1 ${padX} ${padY} ${text} font-bold uppercase tracking-wider whitespace-nowrap`}
      style={{
        color,
        backgroundColor: 'rgba(0,0,0,0.35)',
        border: `1px solid ${color}`,
        borderRadius: '3px',
      }}
      aria-label={t('costLabel', { points, max: EVOLVING_MAX_POINTS })}
      title={t('costLabel', { points, max: EVOLVING_MAX_POINTS })}
    >
      <span className="tabular-nums">{points}/{EVOLVING_MAX_POINTS}</span>
      {showLabel && (
        <span style={{ opacity: 0.65, fontSize: size === 'md' ? '9px' : '7px' }}>EVO</span>
      )}
    </span>
  );
}
