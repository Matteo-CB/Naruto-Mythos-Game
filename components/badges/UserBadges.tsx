'use client';

import { RoleBadge } from './RoleBadge';
import { EloBadge, PLACEMENT_MATCHES_REQUIRED } from '@/components/EloBadge';

interface UserBadgesProps {
  role?: string;
  elo?: number;
  totalGames?: number;
  badgePrefs?: string[];
  leaguesEnabled?: boolean;
  size?: 'sm' | 'md';
}

/**
 * Displays all applicable badges for a user in a row.
 * Badges hidden via badgePrefs are not shown.
 * Unranked players (< 5 games) don't get a league badge at all.
 * Order: Admin > League
 */
export function UserBadges({
  role = 'user',
  elo,
  totalGames,
  badgePrefs = [],
  leaguesEnabled = false,
  size = 'sm',
}: UserBadgesProps) {
  const hiddenBadges = new Set(badgePrefs);

  const showAdmin = role === 'admin' && !hiddenBadges.has('admin');
  // Hide league badge entirely for unranked players (< PLACEMENT_MATCHES_REQUIRED games)
  const isUnranked = totalGames !== undefined && totalGames < PLACEMENT_MATCHES_REQUIRED;
  const showLeague = leaguesEnabled && elo !== undefined && !hiddenBadges.has('league') && !isUnranked;

  if (!showAdmin && !showLeague) return null;

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {showAdmin && <RoleBadge role="admin" size={size} />}
      {showLeague && <EloBadge elo={elo!} size={size} showElo={false} totalGames={totalGames} />}
    </span>
  );
}
