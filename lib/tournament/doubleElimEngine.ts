import { nextPowerOf2 } from './tournamentEngine';

export type DEBracket = 'winners' | 'losers' | 'grand_final';

export interface DEParticipant {
  userId: string;
  username: string;
}

export interface DEMatch {
  bracket: DEBracket;
  round: number;
  matchIndex: number;
  player1Id: string | null;
  player1Username: string | null;
  player2Id: string | null;
  player2Username: string | null;
  winnerId: string | null;
  winnerUsername: string | null;
  isBye: boolean;
  status: 'pending' | 'ready' | 'completed';
}

export interface DEBracketResult {
  matches: DEMatch[];
  totalRounds: number;
  wbRounds: number;
  lbRounds: number;
}

function bracketOrder(n: number): number[] {
  if (n === 1) return [0];
  const half = bracketOrder(n / 2);
  const result: number[] = [];
  for (const h of half) result.push(h, n - 1 - h);
  return result;
}

export function generateDoubleElimBracket(participants: DEParticipant[]): DEBracketResult {
  if (participants.length < 2) return { matches: [], totalRounds: 0, wbRounds: 0, lbRounds: 0 };

  const n = participants.length;
  const size = nextPowerOf2(n);
  const wbRounds = Math.log2(size);
  const lbRounds = Math.max(0, 2 * wbRounds - 2);

  const seeded: (DEParticipant | null)[] = [...participants];
  while (seeded.length < size) seeded.push(null);
  const ordered = bracketOrder(size).map((i) => seeded[i] ?? null);

  const matches: DEMatch[] = [];

  for (let i = 0; i < size; i += 2) {
    const p1 = ordered[i];
    const p2 = ordered[i + 1];
    const isBye = !p1 || !p2;
    const winner = isBye ? p1 || p2 : null;
    matches.push({
      bracket: 'winners', round: 1, matchIndex: i / 2,
      player1Id: p1?.userId ?? null, player1Username: p1?.username ?? null,
      player2Id: p2?.userId ?? null, player2Username: p2?.username ?? null,
      winnerId: winner?.userId ?? null, winnerUsername: winner?.username ?? null,
      isBye,
      status: isBye ? 'completed' : (p1 && p2 ? 'ready' : 'pending'),
    });
  }

  for (let r = 2; r <= wbRounds; r++) {
    const count = size / Math.pow(2, r);
    for (let i = 0; i < count; i++) {
      matches.push({
        bracket: 'winners', round: r, matchIndex: i,
        player1Id: null, player1Username: null,
        player2Id: null, player2Username: null,
        winnerId: null, winnerUsername: null,
        isBye: false, status: 'pending',
      });
    }
  }

  for (let lbR = 1; lbR <= lbRounds; lbR++) {
    const j = Math.ceil(lbR / 2);
    const count = Math.max(1, size / Math.pow(2, j + 1));
    for (let i = 0; i < count; i++) {
      matches.push({
        bracket: 'losers', round: lbR, matchIndex: i,
        player1Id: null, player1Username: null,
        player2Id: null, player2Username: null,
        winnerId: null, winnerUsername: null,
        isBye: false, status: 'pending',
      });
    }
  }

  matches.push({
    bracket: 'grand_final', round: 1, matchIndex: 0,
    player1Id: null, player1Username: null,
    player2Id: null, player2Username: null,
    winnerId: null, winnerUsername: null,
    isBye: false, status: 'pending',
  });

  for (const m of matches.filter((x) => x.bracket === 'winners' && x.round === 1 && x.isBye && x.winnerId)) {
    propagateInitialBye(matches, m, wbRounds);
  }

  return { matches, totalRounds: wbRounds + lbRounds + 1, wbRounds, lbRounds };
}

function propagateInitialBye(matches: DEMatch[], byeMatch: DEMatch, wbRounds: number): void {
  if (byeMatch.bracket !== 'winners' || !byeMatch.winnerId) return;
  const nextRound = byeMatch.round + 1;
  if (nextRound > wbRounds) return;
  const nextMatchIndex = Math.floor(byeMatch.matchIndex / 2);
  const isTopSlot = byeMatch.matchIndex % 2 === 0;
  const next = matches.find((m) => m.bracket === 'winners' && m.round === nextRound && m.matchIndex === nextMatchIndex);
  if (!next) return;
  if (isTopSlot) {
    next.player1Id = byeMatch.winnerId;
    next.player1Username = byeMatch.winnerUsername;
  } else {
    next.player2Id = byeMatch.winnerId;
    next.player2Username = byeMatch.winnerUsername;
  }
  if (next.player1Id && next.player2Id) next.status = 'ready';
}

export interface NextSlotPlan {
  bracket: DEBracket;
  round: number;
  matchIndex: number;
  slot: 'player1' | 'player2';
}

export function loserDropTarget(
  match: { bracket: DEBracket; round: number; matchIndex: number },
  wbRounds: number,
): NextSlotPlan | null {
  if (match.bracket !== 'winners') return null;
  if (match.round === wbRounds) {
    const lbRounds = Math.max(0, 2 * wbRounds - 2);
    return { bracket: 'losers', round: lbRounds, matchIndex: 0, slot: 'player2' };
  }
  const k = match.round;
  const lbRound = k === 1 ? 1 : 2 * k - 2;
  const odd = lbRound % 2 === 1;
  if (odd) {
    const matchIdx = Math.floor(match.matchIndex / 2);
    const slot: 'player1' | 'player2' = match.matchIndex % 2 === 0 ? 'player1' : 'player2';
    return { bracket: 'losers', round: lbRound, matchIndex: matchIdx, slot };
  }
  const slot: 'player1' | 'player2' = 'player2';
  return { bracket: 'losers', round: lbRound, matchIndex: match.matchIndex, slot };
}

export function winnerAdvanceTarget(
  match: { bracket: DEBracket; round: number; matchIndex: number },
  wbRounds: number,
  lbRounds: number,
): NextSlotPlan | null {
  if (match.bracket === 'winners') {
    if (match.round === wbRounds) {
      return { bracket: 'grand_final', round: 1, matchIndex: 0, slot: 'player1' };
    }
    const nextRound = match.round + 1;
    const matchIdx = Math.floor(match.matchIndex / 2);
    const slot: 'player1' | 'player2' = match.matchIndex % 2 === 0 ? 'player1' : 'player2';
    return { bracket: 'winners', round: nextRound, matchIndex: matchIdx, slot };
  }

  if (match.bracket === 'losers') {
    if (match.round === lbRounds) {
      return { bracket: 'grand_final', round: 1, matchIndex: 0, slot: 'player2' };
    }
    const nextRound = match.round + 1;
    const nextOdd = nextRound % 2 === 1;
    if (nextOdd) {
      const matchIdx = Math.floor(match.matchIndex / 2);
      const slot: 'player1' | 'player2' = match.matchIndex % 2 === 0 ? 'player1' : 'player2';
      return { bracket: 'losers', round: nextRound, matchIndex: matchIdx, slot };
    }
    return { bracket: 'losers', round: nextRound, matchIndex: match.matchIndex, slot: 'player1' };
  }

  return null;
}

export function isGrandFinalReset(
  match: { bracket: DEBracket; round: number },
  winnerCameFromLosers: boolean,
): boolean {
  return match.bracket === 'grand_final' && match.round === 1 && winnerCameFromLosers;
}
