





export interface SwissPlayer {
  userId: string;
  username: string;
  seed: number;
}

export interface SwissMatchResult {
  round: number;
  player1Id: string;
  player2Id: string;
  winnerId: string | null;
  isBye: boolean;
  isDoubleForfeit?: boolean;
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






export function computeSwissRoundCount(playerCount: number): number {
  if (playerCount <= 1) return 0;
  return Math.ceil(Math.log2(playerCount));
}


export function computeStandings(
  players: SwissPlayer[],
  results: SwissMatchResult[],
): SwissStanding[] {
  
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

    if (r.isDoubleForfeit) {
      if (s1) { s1.losses++; }
      if (s2) { s2.losses++; }
    } else if (r.winnerId === null) {
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

  
  const buchholzMap = new Map<string, number>();
  for (const [userId, stats] of statsMap) {
    let buchholz = 0;
    for (const oppId of stats.opponents) {
      const opp = statsMap.get(oppId);
      if (opp) buchholz += opp.matchPoints;
    }
    buchholzMap.set(userId, buchholz);
  }

  
  const buchholzExtMap = new Map<string, number>();
  for (const [userId, stats] of statsMap) {
    let buchholzExt = 0;
    for (const oppId of stats.opponents) {
      buchholzExt += (buchholzMap.get(oppId) ?? 0);
    }
    buchholzExtMap.set(userId, buchholzExt);
  }

  
  const h2hMap = new Map<string, number>(); // "A|B" -> +1 if A beat B, -1 if B beat A, 0 draw
  for (const r of results) {
    if (r.isBye || r.winnerId === null) continue;
    const loserId = r.winnerId === r.player1Id ? r.player2Id : r.player1Id;
    h2hMap.set(`${r.winnerId}|${loserId}`, 1);
    h2hMap.set(`${loserId}|${r.winnerId}`, -1);
  }

  
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

  
  standings.sort((a, b) => {
    
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
    
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    
    if (b.buchholzExtended !== a.buchholzExtended) return b.buchholzExtended - a.buchholzExtended;
    
    const h2h = h2hMap.get(`${a.userId}|${b.userId}`);
    if (h2h === 1) return -1; // a beat b -> a ranks higher
    if (h2h === -1) return 1; // b beat a -> b ranks higher
    
    return a.seed - b.seed;
  });

  
  for (let i = 0; i < standings.length; i++) {
    standings[i].rank = i + 1;
  }

  return standings;
}


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


export function generateSwissPairings(
  players: SwissPlayer[],
  results: SwissMatchResult[],
  roundNumber: number,
  excludeUserIds: Set<string> = new Set(),
): SwissPairing[] {
  const standings = computeStandings(players, results);


  const previousPairings = new Set<string>();
  for (const r of results) {
    if (!r.isBye) {
      previousPairings.add(pairKey(r.player1Id, r.player2Id));
    }
  }


  const hadByeSet = new Set<string>();
  for (const s of standings) {
    if (s.hadBye) hadByeSet.add(s.userId);
  }


  const playerMap = new Map<string, SwissPlayer>();
  for (const p of players) {
    playerMap.set(p.userId, p);
  }


  let toPair = standings.map(s => s.userId).filter(id => !excludeUserIds.has(id));

  const pairings: SwissPairing[] = [];
  let matchIndex = 0;

  
  if (toPair.length % 2 === 1) {
    
    let byePlayerId: string | null = null;
    for (let i = toPair.length - 1; i >= 0; i--) {
      if (!hadByeSet.has(toPair[i])) {
        byePlayerId = toPair[i];
        toPair.splice(i, 1);
        break;
      }
    }
    
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

  
  const paired = new Set<string>();
  let floaters: string[] = [];

  for (let g = 0; g < groups.length; g++) {
    const group = [...floaters, ...groups[g]];
    floaters = [];

    
    const workingGroup = [...group];
    if (workingGroup.length % 2 === 1) {
      floaters.push(workingGroup.pop()!);
    }

    
    const half = Math.floor(workingGroup.length / 2);
    const upper = workingGroup.slice(0, half);
    const lower = workingGroup.slice(half);

    
    const usedLower = new Set<number>();
    for (let i = 0; i < upper.length; i++) {
      let pairedIdx = -1;

      
      if (!usedLower.has(i) && !previousPairings.has(pairKey(upper[i], lower[i]))) {
        pairedIdx = i;
      } else {
        
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
        
        floaters.push(upper[i]);
      }
    }

    
    for (let j = 0; j < lower.length; j++) {
      if (!usedLower.has(j)) {
        floaters.push(lower[j]);
      }
    }
  }

  
  
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
      
      const p2 = floaters.shift()!;
      pairings.push({
        round: roundNumber,
        matchIndex: matchIndex++,
        player1: playerMap.get(p1)!,
        player2: playerMap.get(p2)!,
      });
    }
  }

  const revanches = pairings.filter(
    (p) => p.player2 !== null && previousPairings.has(pairKey(p.player1.userId, p.player2.userId)),
  );
  if (revanches.length === 0) return pairings;

  const bye = pairings.find((p) => p.player2 === null) ?? null;
  const sansRevanche = apparierSansRevanche(toPair.slice(), previousPairings);
  if (!sansRevanche) return pairings;

  const refaits: SwissPairing[] = [];
  let indexRefait = 0;
  if (bye) refaits.push({ ...bye, matchIndex: indexRefait++ });
  for (const [a, b] of sansRevanche) {
    refaits.push({
      round: roundNumber,
      matchIndex: indexRefait++,
      player1: playerMap.get(a)!,
      player2: playerMap.get(b)!,
    });
  }
  return refaits;
}


const RECHERCHE_APPARIEMENT_MAX = 200_000;

export function apparierSansRevanche(
  ordre: string[],
  dejaJoues: Set<string>,
): Array<[string, string]> | null {
  let essais = 0;

  function chercher(restants: string[]): Array<[string, string]> | null {
    if (restants.length === 0) return [];
    if (restants.length % 2 === 1) return null;
    const premier = restants[0];
    const autres = restants.slice(1);
    for (let i = 0; i < autres.length; i += 1) {
      essais += 1;
      if (essais > RECHERCHE_APPARIEMENT_MAX) return null;
      if (dejaJoues.has(pairKey(premier, autres[i]))) continue;
      const suite = chercher(autres.filter((_, j) => j !== i));
      if (suite) return [[premier, autres[i]], ...suite];
    }
    return null;
  }

  return chercher(ordre);
}



function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
