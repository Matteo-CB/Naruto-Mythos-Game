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

export const FORMAT_A_RONDES = 'elimination';

export function verrouDeRondeActif(format?: string | null): boolean {
  return format === FORMAT_A_RONDES;
}

export function isOpenForUser(
  match: SelectableMatch,
  userId: string,
  currentRound?: number | null,
  format?: string | null,
): boolean {
  if (!OPEN_STATUSES.has(match.status)) return false;
  if (match.isBye === true) return false;
  if (verrouDeRondeActif(format) && typeof currentRound === 'number' && match.round > currentRound) return false;
  return match.player1Id === userId || match.player2Id === userId;
}

export function attendLOuvertureDeSaRonde(
  matches: readonly SelectableMatch[],
  userId: string | undefined | null,
  currentRound: number | null | undefined,
  format?: string | null,
): boolean {
  if (!userId || typeof currentRound !== 'number') return false;
  if (!verrouDeRondeActif(format)) return false;
  if (selectCurrentMatchForUser(matches, userId, currentRound, format)) return false;
  return matches.some(
    (m) => m.round > currentRound
      && m.isBye !== true
      && OPEN_STATUSES.has(m.status)
      && (m.player1Id === userId || m.player2Id === userId),
  );
}

export function selectCurrentMatchForUser(
  matches: readonly SelectableMatch[],
  userId: string | undefined | null,
  currentRound: number | null | undefined,
  format?: string | null,
): SelectableMatch | undefined {
  if (!userId) return undefined;
  const open = matches.filter((m) => isOpenForUser(m, userId, currentRound, format));
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
