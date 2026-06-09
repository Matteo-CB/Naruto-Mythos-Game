export const CASUAL_GAMES_BEFORE_RANKED = 5;

export interface RankedGateUser {
  casualGamesPlayed?: number | null;
  emailVerified?: boolean | null;
  role?: string | null;
}

export type RankedGateBlockReason = 'emailNotVerified' | 'needMoreCasualGames';

export interface RankedGateResult {
  allowed: boolean;
  reason?: RankedGateBlockReason;
  needed?: number;
}

export function isAdminLikeRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'owner';
}

export function checkRankedGate(user: RankedGateUser): RankedGateResult {
  if (isAdminLikeRole(user.role ?? null)) return { allowed: true };
  if (user.emailVerified === false) {
    return { allowed: false, reason: 'emailNotVerified' };
  }
  const played = user.casualGamesPlayed ?? 0;
  if (played < CASUAL_GAMES_BEFORE_RANKED) {
    return { allowed: false, reason: 'needMoreCasualGames', needed: CASUAL_GAMES_BEFORE_RANKED - played };
  }
  return { allowed: true };
}
