

export interface Participant {
  userId: string;
  username: string;
}

export interface BracketSlot {
  participantId: string | null;
  username: string | null;
}

export const MAIN_BRACKET = 'main';
export const THIRD_PLACE_BRACKET = 'third';

export interface BracketMatch {
  bracket?: string;
  round: number;
  matchIndex: number;
  player1: BracketSlot;
  player2: BracketSlot;
  winnerId: string | null;
  winnerUsername: string | null;
  isBye: boolean;
  status: 'pending' | 'ready' | 'completed';
}

export interface BracketResult {
  matches: BracketMatch[];
  totalRounds: number;
  thirdPlaceMatch: BracketMatch | null;
}






export function generateBracket(participants: Participant[]): BracketResult {
  const size = nextPowerOf2(participants.length);
  const totalRounds = Math.log2(size);

  
  const seeded: (Participant | null)[] = [...participants];
  while (seeded.length < size) seeded.push(null);

  
  const ordered = standardSeedPairing(seeded);

  const matches: BracketMatch[] = [];

  
  for (let i = 0; i < ordered.length; i += 2) {
    const p1 = ordered[i];
    const p2 = ordered[i + 1];
    const isBye = !p1 || !p2;
    const winner = isBye ? (p1 || p2) : null;

    matches.push({
      bracket: MAIN_BRACKET,
      round: 1,
      matchIndex: i / 2,
      player1: { participantId: p1?.userId ?? null, username: p1?.username ?? null },
      player2: { participantId: p2?.userId ?? null, username: p2?.username ?? null },
      winnerId: winner?.userId ?? null,
      winnerUsername: winner?.username ?? null,
      isBye,
      status: isBye ? 'completed' : 'pending',
    });
  }

  
  for (let round = 2; round <= totalRounds; round++) {
    const matchCount = size / Math.pow(2, round);
    for (let i = 0; i < matchCount; i++) {
      matches.push({
        bracket: MAIN_BRACKET,
        round,
        matchIndex: i,
        player1: { participantId: null, username: null },
        player2: { participantId: null, username: null },
        winnerId: null,
        winnerUsername: null,
        isBye: false,
        status: 'pending',
      });
    }
  }

  
  const round1 = matches.filter(m => m.round === 1);
  for (const m of round1) {
    if (m.isBye && m.winnerId) {
      propagateWinner(matches, m);
    }
  }

  return { matches, totalRounds, thirdPlaceMatch: buildThirdPlaceMatch(size, totalRounds) };
}


export function buildThirdPlaceMatch(size: number, totalRounds: number): BracketMatch | null {
  if (size < 4 || totalRounds < 2) return null;
  return {
    bracket: THIRD_PLACE_BRACKET,
    round: totalRounds,
    matchIndex: 0,
    player1: { participantId: null, username: null },
    player2: { participantId: null, username: null },
    winnerId: null,
    winnerUsername: null,
    isBye: false,
    status: 'pending',
  };
}


export function advanceWinner(
  matches: BracketMatch[],
  completedMatch: BracketMatch,
): BracketMatch | null {
  return propagateWinner(matches, completedMatch);
}


export function isRoundComplete(matches: BracketMatch[], round: number): boolean {
  return matches
    .filter(m => m.round === round)
    .every(m => m.status === 'completed');
}


export function getReadyMatches(matches: BracketMatch[]): BracketMatch[] {
  return matches.filter(
    m => m.status === 'ready' || (m.status === 'pending' && m.player1.participantId && m.player2.participantId),
  );
}





function propagateWinner(matches: BracketMatch[], completed: BracketMatch): BracketMatch | null {
  const nextRound = completed.round + 1;
  const nextMatchIndex = Math.floor(completed.matchIndex / 2);
  const isTopSlot = completed.matchIndex % 2 === 0;

  const nextMatch = matches.find(
    m => (m.bracket ?? MAIN_BRACKET) === MAIN_BRACKET && m.round === nextRound && m.matchIndex === nextMatchIndex,
  );
  if (!nextMatch) return null; // final was just completed

  const winnerSlot: BracketSlot = {
    participantId: completed.winnerId,
    username: completed.winnerUsername,
  };

  if (isTopSlot) {
    nextMatch.player1 = winnerSlot;
  } else {
    nextMatch.player2 = winnerSlot;
  }

  
  if (nextMatch.player1.participantId && nextMatch.player2.participantId) {
    nextMatch.status = 'ready';
  }

  
  

  return nextMatch;
}

export function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}


function standardSeedPairing<T>(arr: (T | null)[]): (T | null)[] {
  const n = arr.length;
  if (n <= 2) return arr;
  const indices = bracketOrder(n);
  return indices.map(i => arr[i] ?? null);
}

function bracketOrder(n: number): number[] {
  if (n === 1) return [0];
  const half = bracketOrder(n / 2);
  const result: number[] = [];
  for (const h of half) {
    result.push(h, n - 1 - h);
  }
  return result;
}


export function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
