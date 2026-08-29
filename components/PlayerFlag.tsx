'use client';

import { CountryFlag } from '@/components/CountryFlag';
import { SeasonBadge } from '@/components/badges/SeasonBadge';
import { parseBadgeChoisi } from '@/lib/badges/badgeChoisi';

interface PlayerFlagProps {
  code: string | null | undefined;
  badge?: string | null;
  size?: number;
  title?: string;
  masquerLeBadge?: string | null;
}

export function PlayerFlag({ code, badge, size = 18, title, masquerLeBadge }: PlayerFlagProps) {
  const choix = parseBadgeChoisi(badge);
  const cache = choix !== null && masquerLeBadge === choix.badge;
  if (!code && (!choix || cache)) return null;

  return (
    <span className="inline-flex items-center gap-1 shrink-0" style={{ verticalAlign: 'middle' }}>
      <CountryFlag code={code} size={size} title={title} />
      {choix && !cache && (
        <SeasonBadge seasonId={choix.seasonId} badge={choix.badge} size={size <= 16 ? "xs" : "sm"} />
      )}
    </span>
  );
}
