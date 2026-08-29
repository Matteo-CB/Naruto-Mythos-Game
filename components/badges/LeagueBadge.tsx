'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { RANK_TIERS } from '@/components/EloBadge';

const TAILLES = { sm: 22, md: 30, lg: 44 } as const;

interface LeagueBadgeProps {
  league: string;
  size?: keyof typeof TAILLES;
  showLabel?: boolean;
}

export function LeagueBadge({ league, size = 'md', showLabel = false }: LeagueBadgeProps) {
  const t = useTranslations('profile');
  const palier = RANK_TIERS.find((r) => r.key === league);
  if (!palier) return null;
  const cote = TAILLES[size];
  const nom = t.has(`rankNames.${league}`) ? t(`rankNames.${league}`) : league;

  return (
    <span className="inline-flex items-center gap-2" title={nom}>
      <Image
        src={palier.image}
        alt={nom}
        width={cote}
        height={cote}
        unoptimized
        className="shrink-0"
        style={{ filter: `drop-shadow(0 0 5px ${palier.color}22)` }}
      />
      {showLabel && (
        <span className="font-display text-[10px] uppercase tracking-widest" style={{ color: palier.color }}>
          {nom}
        </span>
      )}
    </span>
  );
}
