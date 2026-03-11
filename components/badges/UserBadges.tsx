'use client';

import { RoleBadge } from './RoleBadge';
import { EloBadge } from '@/components/EloBadge';

interface UserBadgesProps {
  role?: string;
  elo?: number;
  badgePrefs?: string[];
  leaguesEnabled?: boolean;
  size?: 'sm' | 'md';
}

/**
 * Displays all applicable badges for a user in a row.
 * Badges hidden via badgePrefs are not shown.
 * Order: Admin > League
 */
export function UserBadges({
  role = 'user',
  elo,
  badgePrefs = [],
  leaguesEnabled = false,
  size = 'sm',
}: UserBadgesProps) {
  const hiddenBadges = new Set(badgePrefs);

  const showAdmin = role === 'admin' && !hiddenBadges.has('admin');
  const showLeague = leaguesEnabled && elo !== undefined && !hiddenBadges.has('league');

  if (!showAdmin && !showLeague) return null;

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {showAdmin && <RoleBadge role="admin" size={size} />}
      {showLeague && <EloBadge elo={elo!} size={size} showElo={false} />}
    </span>
  );
}
