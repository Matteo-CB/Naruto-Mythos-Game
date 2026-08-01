

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






export function roundMatchCounts(playerCount: number): number[] {
  const counts: number[] = [];
  let remaining = playerCount;
  while (remaining > 1) {
    const matches = Math.ceil(remaining / 2);
    counts.push(matches);
    remaining = matches;
  }
  return counts.length > 0 ? counts : [1];
}

export function generateBracket(participants: Participant[]): BracketResult {
  const n = participants.length;
  const counts = roundMatchCounts(n);
  const totalRounds = counts.length;

  const matches: BracketMatch[] = [];

  const hasOpeningBye = n % 2 === 1;
  const byePlayer = hasOpeningBye ? participants[0] : null;
  const paired = hasOpeningBye ? participants.slice(1) : participants;

  const round1Pairs: Array<[Participant, Participant]> = [];
  for (let i = 0; i < paired.length / 2; i += 1) {
    round1Pairs.push([paired[i], paired[paired.length - 1 - i]]);
  }

  round1Pairs.forEach(([p1, p2], index) => {
    matches.push({
      bracket: MAIN_BRACKET,
      round: 1,
      matchIndex: index,
      player1: { participantId: p1.userId, username: p1.username },
      player2: { participantId: p2.userId, username: p2.username },
      winnerId: null,
      winnerUsername: null,
      isBye: false,
      status: 'pending',
    });
  });

  if (byePlayer) {
    matches.push({
      bracket: MAIN_BRACKET,
      round: 1,
      matchIndex: round1Pairs.length,
      player1: { participantId: byePlayer.userId, username: byePlayer.username },
      player2: { participantId: null, username: null },
      winnerId: byePlayer.userId,
      winnerUsername: byePlayer.username,
      isBye: true,
      status: 'completed',
    });
  }

  for (let round = 2; round <= totalRounds; round += 1) {
    const matchCount = counts[round - 1];
    const previousCount = counts[round - 2];
    for (let i = 0; i < matchCount; i += 1) {
      const singleFeeder = 2 * i + 1 >= previousCount;
      matches.push({
        bracket: MAIN_BRACKET,
        round,
        matchIndex: i,
        player1: { participantId: null, username: null },
        player2: { participantId: null, username: null },
        winnerId: null,
        winnerUsername: null,
        isBye: singleFeeder,
        status: 'pending',
      });
    }
  }

  for (const m of matches.filter(entry => entry.round === 1 && entry.isBye && entry.winnerId)) {
    propagateWinner(matches, m);
  }

  return { matches, totalRounds, thirdPlaceMatch: buildThirdPlaceMatch(n, totalRounds) };
}

export function buildThirdPlaceMatch(playerCount: number, totalRounds: number): BracketMatch | null {
  if (playerCount < 4 || totalRounds < 2) return null;
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

  if (nextMatch.isBye && nextMatch.player1.participantId && !nextMatch.player2.participantId) {
    nextMatch.winnerId = nextMatch.player1.participantId;
    nextMatch.winnerUsername = nextMatch.player1.username;
    nextMatch.status = 'completed';
    propagateWinner(matches, nextMatch);
    return nextMatch;
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
