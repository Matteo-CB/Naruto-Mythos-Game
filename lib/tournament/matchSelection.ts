export interface SelectableMatch {
  id: string;
  round: number;
  matchIndex: number;
  status: string;
  roomCode?: string | null;
  player1Id?: string | null;
  player2Id?: string | null;
  isBye?: boolean;
}

const OPEN_STATUSES = new Set(['pending', 'ready', 'in_progress']);

export function isOpenForUser(match: SelectableMatch, userId: string): boolean {
  if (!OPEN_STATUSES.has(match.status)) return false;
  if (match.isBye === true) return false;
  return match.player1Id === userId || match.player2Id === userId;
}

export function selectCurrentMatchForUser(
  matches: readonly SelectableMatch[],
  userId: string | undefined | null,
  currentRound: number | null | undefined,
): SelectableMatch | undefined {
  if (!userId) return undefined;
  const open = matches.filter((m) => isOpenForUser(m, userId));
  if (open.length === 0) return undefined;

  const ranked = [...open].sort((a, b) => {
    const aLive = a.status === 'in_progress' && !!a.roomCode ? 1 : 0;
    const bLive = b.status === 'in_progress' && !!b.roomCode ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;
    if (typeof currentRound === 'number') {
      const aCur = a.round === currentRound ? 1 : 0;
      const bCur = b.round === currentRound ? 1 : 0;
      if (aCur !== bCur) return bCur - aCur;
    }
    if (a.round !== b.round) return b.round - a.round;
    return a.matchIndex - b.matchIndex;
  });

  return ranked[0];
}
