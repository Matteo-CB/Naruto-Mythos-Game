/**
 * Tournament bracket generation & advancement logic (single elimination).
 */

export interface Participant {
  userId: string;
  username: string;
}

export interface BracketSlot {
  participantId: string | null;
  username: string | null;
}

export interface BracketMatch {
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
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a full single-elimination bracket for the given participants.
 * Participants should already be shuffled (random seeding) or ordered (manual).
 * Pads to the next power of 2 with byes.
 */
export function generateBracket(participants: Participant[]): BracketResult {
  const size = nextPowerOf2(participants.length);
  const totalRounds = Math.log2(size);

  // Seed array — nulls become byes
  const seeded: (Participant | null)[] = [...participants];
  while (seeded.length < size) seeded.push(null);

  // Standard bracket ordering so byes are spread evenly
  const ordered = standardSeedPairing(seeded);

  const matches: BracketMatch[] = [];

  // Round 1
  for (let i = 0; i < ordered.length; i += 2) {
    const p1 = ordered[i];
    const p2 = ordered[i + 1];
    const isBye = !p1 || !p2;
    const winner = isBye ? (p1 || p2) : null;

    matches.push({
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

  // Placeholder matches for rounds 2+
  for (let round = 2; round <= totalRounds; round++) {
    const matchCount = size / Math.pow(2, round);
    for (let i = 0; i < matchCount; i++) {
      matches.push({
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

  // Propagate round-1 bye winners into round 2
  const round1 = matches.filter(m => m.round === 1);
  for (const m of round1) {
    if (m.isBye && m.winnerId) {
      propagateWinner(matches, m);
    }
  }

  return { matches, totalRounds };
}

/**
 * Advance a match winner to the next round.
 * Returns the updated next-round match, or null if the tournament is over (final completed).
 */
export function advanceWinner(
  matches: BracketMatch[],
  completedMatch: BracketMatch,
): BracketMatch | null {
  return propagateWinner(matches, completedMatch);
}

/**
 * Check if all matches in a given round are completed.
 */
export function isRoundComplete(matches: BracketMatch[], round: number): boolean {
  return matches
    .filter(m => m.round === round)
    .every(m => m.status === 'completed');
}

/**
 * Get the list of matches that are ready to play (both slots filled, not started).
 */
export function getReadyMatches(matches: BracketMatch[]): BracketMatch[] {
  return matches.filter(
    m => m.status === 'ready' || (m.status === 'pending' && m.player1.participantId && m.player2.participantId),
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function propagateWinner(matches: BracketMatch[], completed: BracketMatch): BracketMatch | null {
  const nextRound = completed.round + 1;
  const nextMatchIndex = Math.floor(completed.matchIndex / 2);
  const isTopSlot = completed.matchIndex % 2 === 0;

  const nextMatch = matches.find(
    m => m.round === nextRound && m.matchIndex === nextMatchIndex,
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

  // Both slots filled → match is ready
  if (nextMatch.player1.participantId && nextMatch.player2.participantId) {
    nextMatch.status = 'ready';
  }

  // If one slot is a bye propagation (the other feeder was also a bye/completed)
  // and the other slot is still null, we wait — it'll fill when the other feeder completes.

  return nextMatch;
}

export function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Standard bracket seeding order using the fold algorithm.
 * Ensures byes (null entries at the end of the array) are spread across the bracket.
 */
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

/**
 * Generate a random 8-character join code (uppercase alphanumeric).
 */
export function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
