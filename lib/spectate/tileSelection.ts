import { TOURNAMENT_SPECTATE_MAX_TILES } from '@/lib/tournament/spectatePolicy';

export interface LiveMatch {
  roomCode: string;
  matchId: string | null;
  player1Name: string;
  player2Name: string;
  turn: number;
  phase: string;
  spectatorCount: number;
  startedAt: number;
}

export const MAX_TILES = TOURNAMENT_SPECTATE_MAX_TILES;

export function isTileSelectable(selected: readonly string[], roomCode: string): boolean {
  if (selected.includes(roomCode)) return true;
  return selected.length < MAX_TILES;
}

export function toggleTile(selected: readonly string[], roomCode: string): string[] {
  if (selected.includes(roomCode)) return selected.filter((code) => code !== roomCode);
  if (selected.length >= MAX_TILES) return [...selected];
  return [...selected, roomCode];
}

export function fillEmptyTiles(selected: readonly string[], live: readonly LiveMatch[]): string[] {
  const next = [...selected];
  for (const match of live) {
    if (next.length >= MAX_TILES) break;
    if (!next.includes(match.roomCode)) next.push(match.roomCode);
  }
  return next;
}

export function replaceEndedTile(
  selected: readonly string[],
  endedRoomCode: string,
  live: readonly LiveMatch[],
): string[] {
  const index = selected.indexOf(endedRoomCode);
  if (index === -1) return [...selected];

  const successor = live.find(
    (match) => match.roomCode !== endedRoomCode && !selected.includes(match.roomCode),
  );

  const next = [...selected];
  if (successor) {
    next[index] = successor.roomCode;
    return next;
  }
  next.splice(index, 1);
  return next;
}

export function pruneVanishedTiles(selected: readonly string[], live: readonly LiveMatch[]): string[] {
  const alive = new Set(live.map((match) => match.roomCode));
  return selected.filter((code) => alive.has(code));
}

export function gridColumnsFor(count: number): number {
  if (count <= 1) return 1;
  return 2;
}
