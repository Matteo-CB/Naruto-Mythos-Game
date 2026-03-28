/**
 * Swiss-system tournament engine.
 * Pure functions, no DB dependency.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwissPlayer {
  userId: string;
  username: string;
  seed: number;
}

export interface SwissMatchResult {
  round: number;
  player1Id: string;
  player2Id: string;
  winnerId: string | null; // null = draw
  isBye: boolean;
}

export interface SwissStanding {
  userId: string;
  username: string;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  matchPoints: number;
  buchholz: number;
  buchholzExtended: number;
  seed: number;
  opponents: string[];
  hadBye: boolean;
}

export interface SwissPairing {
  round: number;
  matchIndex: number;
  player1: SwissPlayer;
  player2: SwissPlayer | null; // null = bye
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the number of Swiss rounds for a given player count.
 * Standard: ceil(log2(N))
 */
export function computeSwissRoundCount(playerCount: number): number {
  if (playerCount <= 1) return 0;
  return Math.ceil(Math.log2(playerCount));
}

/**
 * Compute full standings from players and results.
 * Sorted by: matchPoints desc -> buchholz desc -> buchholzExtended desc -> head-to-head -> seed asc
 * Rank is 1..N with no ties (seed is the ultimate tiebreaker).
 */
export function computeStandings(
  players: SwissPlayer[],
  results: SwissMatchResult[],
): SwissStanding[] {
  // Build per-player stats
  const statsMap = new Map<string, {
    userId: string;
    username: string;
    seed: number;
    wins: number;
    losses: number;
    draws: number;
    matchPoints: number;
    opponents: string[];
    hadBye: boolean;
  }>();

  for (const p of players) {
    statsMap.set(p.userId, {
      userId: p.userId,
      username: p.username,
      seed: p.seed,
      wins: 0,
      losses: 0,
      draws: 0,
      matchPoints: 0,
      opponents: [],
      hadBye: false,
    });
  }

  for (const r of results) {
    if (r.isBye) {
      // Bye = automatic win (3 pts), no opponent recorded for Buchholz
      const byeWinnerId = r.winnerId || r.player1Id;
      const s = statsMap.get(byeWinnerId);
      if (s) {
        s.wins++;
        s.matchPoints += 3;
        s.hadBye = true;
      }
      continue;
    }

    const s1 = statsMap.get(r.player1Id);
    const s2 = statsMap.get(r.player2Id);

    if (s1) s1.opponents.push(r.player2Id);
    if (s2) s2.opponents.push(r.player1Id);

    if (r.winnerId === null) {
      // Draw
      if (s1) { s1.draws++; s1.matchPoints += 1; }
      if (s2) { s2.draws++; s2.matchPoints += 1; }
    } else if (r.winnerId === r.player1Id) {
      if (s1) { s1.wins++; s1.matchPoints += 3; }
      if (s2) { s2.losses++; }
    } else {
      if (s2) { s2.wins++; s2.matchPoints += 3; }
      if (s1) { s1.losses++; }
    }
  }

  // Compute Buchholz (sum of opponents' match points)
  const buchholzMap = new Map<string, number>();
  for (const [userId, stats] of statsMap) {
    let buchholz = 0;
    for (const oppId of stats.opponents) {
      const opp = statsMap.get(oppId);
      if (opp) buchholz += opp.matchPoints;
    }
    buchholzMap.set(userId, buchholz);
  }

  // Compute Buchholz Extended (sum of opponents' Buchholz)
  const buchholzExtMap = new Map<string, number>();
  for (const [userId, stats] of statsMap) {
    let buchholzExt = 0;
    for (const oppId of stats.opponents) {
      buchholzExt += (buchholzMap.get(oppId) ?? 0);
    }
    buchholzExtMap.set(userId, buchholzExt);
  }

  // Build head-to-head lookup
  const h2hMap = new Map<string, number>(); // "A|B" -> +1 if A beat B, -1 if B beat A, 0 draw
  for (const r of results) {
    if (r.isBye || r.winnerId === null) continue;
    const loserId = r.winnerId === r.player1Id ? r.player2Id : r.player1Id;
    h2hMap.set(`${r.winnerId}|${loserId}`, 1);
    h2hMap.set(`${loserId}|${r.winnerId}`, -1);
  }

  // Build standings array
  const standings: SwissStanding[] = [];
  for (const [userId, stats] of statsMap) {
    standings.push({
      userId,
      username: stats.username,
      rank: 0, // assigned after sort
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
      matchPoints: stats.matchPoints,
      buchholz: buchholzMap.get(userId) ?? 0,
      buchholzExtended: buchholzExtMap.get(userId) ?? 0,
      seed: stats.seed,
      opponents: stats.opponents,
      hadBye: stats.hadBye,
    });
  }

  // Sort
  standings.sort((a, b) => {
    // 1. Match points desc
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
    // 2. Buchholz desc
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    // 3. Buchholz Extended desc
    if (b.buchholzExtended !== a.buchholzExtended) return b.buchholzExtended - a.buchholzExtended;
    // 4. Head-to-head
    const h2h = h2hMap.get(`${a.userId}|${b.userId}`);
    if (h2h === 1) return -1; // a beat b -> a ranks higher
    if (h2h === -1) return 1; // b beat a -> b ranks higher
    // 5. Seed asc (lower seed = higher rank)
    return a.seed - b.seed;
  });

  // Assign ranks
  for (let i = 0; i < standings.length; i++) {
    standings[i].rank = i + 1;
  }

  return standings;
}

/**
 * Generate round 1 pairings by seed: 1v2, 3v4, etc.
 * Odd player count: last seed gets bye.
 */
export function generateSwissRound1(players: SwissPlayer[]): SwissPairing[] {
  const sorted = [...players].sort((a, b) => a.seed - b.seed);
  const pairings: SwissPairing[] = [];
  let matchIndex = 0;

  for (let i = 0; i < sorted.length - 1; i += 2) {
    pairings.push({
      round: 1,
      matchIndex: matchIndex++,
      player1: sorted[i],
      player2: sorted[i + 1],
    });
  }

  // Odd player: last gets bye
  if (sorted.length % 2 === 1) {
    pairings.push({
      round: 1,
      matchIndex: matchIndex++,
      player1: sorted[sorted.length - 1],
      player2: null,
    });
  }

  return pairings;
}

/**
 * Generate Swiss pairings for rounds 2+.
 * Dutch system: group by match points, split each group, pair upper vs lower.
 * No rematches. Odd players get bye (lowest standing without previous bye).
 */
export function generateSwissPairings(
  players: SwissPlayer[],
  results: SwissMatchResult[],
  roundNumber: number,
): SwissPairing[] {
  const standings = computeStandings(players, results);

  // Build set of previous pairings to prevent rematches
  const previousPairings = new Set<string>();
  for (const r of results) {
    if (!r.isBye) {
      previousPairings.add(pairKey(r.player1Id, r.player2Id));
    }
  }

  // Build set of players who already had a bye
  const hadByeSet = new Set<string>();
  for (const s of standings) {
    if (s.hadBye) hadByeSet.add(s.userId);
  }

  // Player lookup
  const playerMap = new Map<string, SwissPlayer>();
  for (const p of players) {
    playerMap.set(p.userId, p);
  }

  // Work with a mutable list of players to pair (in standings order)
  let toPair = standings.map(s => s.userId);

  const pairings: SwissPairing[] = [];
  let matchIndex = 0;

  // Handle bye for odd count
  if (toPair.length % 2 === 1) {
    // Lowest standing player who hasn't had a bye yet
    let byePlayerId: string | null = null;
    for (let i = toPair.length - 1; i >= 0; i--) {
      if (!hadByeSet.has(toPair[i])) {
        byePlayerId = toPair[i];
        toPair.splice(i, 1);
        break;
      }
    }
    // If everyone had a bye already, give it to the lowest
    if (!byePlayerId) {
      byePlayerId = toPair.pop()!;
    }
    const byePlayer = playerMap.get(byePlayerId)!;
    pairings.push({
      round: roundNumber,
      matchIndex: matchIndex++,
      player1: byePlayer,
      player2: null,
    });
  }

  // Group players by match points (preserving standings order within each group)
  const standingMap = new Map<string, SwissStanding>();
  for (const s of standings) standingMap.set(s.userId, s);

  const groups: string[][] = [];
  let currentGroup: string[] = [];
  let currentPoints = -1;

  for (const userId of toPair) {
    const pts = standingMap.get(userId)!.matchPoints;
    if (pts !== currentPoints) {
      if (currentGroup.length > 0) groups.push(currentGroup);
      currentGroup = [userId];
      currentPoints = pts;
    } else {
      currentGroup.push(userId);
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  // Dutch system: pair within groups, float remainders down
  const paired = new Set<string>();
  let floaters: string[] = [];

  for (let g = 0; g < groups.length; g++) {
    const group = [...floaters, ...groups[g]];
    floaters = [];

    // If odd group, last player floats down
    const workingGroup = [...group];
    if (workingGroup.length % 2 === 1) {
      floaters.push(workingGroup.pop()!);
    }

    // Split into upper and lower halves
    const half = Math.floor(workingGroup.length / 2);
    const upper = workingGroup.slice(0, half);
    const lower = workingGroup.slice(half);

    // Try to pair upper[i] vs lower[i], swapping in lower half to avoid rematches
    const usedLower = new Set<number>();
    for (let i = 0; i < upper.length; i++) {
      let pairedIdx = -1;

      // Try direct pairing first
      if (!usedLower.has(i) && !previousPairings.has(pairKey(upper[i], lower[i]))) {
        pairedIdx = i;
      } else {
        // Swap within lower half to find a valid opponent
        for (let j = 0; j < lower.length; j++) {
          if (!usedLower.has(j) && !previousPairings.has(pairKey(upper[i], lower[j]))) {
            pairedIdx = j;
            break;
          }
        }
      }

      if (pairedIdx >= 0) {
        usedLower.add(pairedIdx);
        paired.add(upper[i]);
        paired.add(lower[pairedIdx]);
        pairings.push({
          round: roundNumber,
          matchIndex: matchIndex++,
          player1: playerMap.get(upper[i])!,
          player2: playerMap.get(lower[pairedIdx])!,
        });
      } else {
        // Cannot pair without rematch - float down
        floaters.push(upper[i]);
      }
    }

    // Any unused lower half players also float down
    for (let j = 0; j < lower.length; j++) {
      if (!usedLower.has(j)) {
        floaters.push(lower[j]);
      }
    }
  }

  // Handle any remaining floaters (shouldn't happen normally, but as a safety net)
  // Pair them greedily
  while (floaters.length >= 2) {
    const p1 = floaters.shift()!;
    let found = false;
    for (let i = 0; i < floaters.length; i++) {
      if (!previousPairings.has(pairKey(p1, floaters[i]))) {
        const p2 = floaters.splice(i, 1)[0];
        pairings.push({
          round: roundNumber,
          matchIndex: matchIndex++,
          player1: playerMap.get(p1)!,
          player2: playerMap.get(p2)!,
        });
        found = true;
        break;
      }
    }
    if (!found) {
      // Last resort: allow rematch
      const p2 = floaters.shift()!;
      pairings.push({
        round: roundNumber,
        matchIndex: matchIndex++,
        player1: playerMap.get(p1)!,
        player2: playerMap.get(p2)!,
      });
    }
  }

  return pairings;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
