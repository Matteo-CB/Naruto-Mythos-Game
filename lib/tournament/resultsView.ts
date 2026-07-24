import type { TournamentData, TournamentMatch } from '@/stores/tournamentStore';

export type MatchOutcomeKind =
  | 'win_played'
  | 'win_forfeit'
  | 'double_forfeit'
  | 'bye'
  | 'incomplete';

export interface ResultMatchEntry {
  matchId: string;
  round: number;
  matchIndex: number;
  bracket: string;
  outcome: MatchOutcomeKind;
  winnerUsername: string | null;
  winnerId: string | null;
  loserUsername: string | null;
  loserId: string | null;
  doubleForfeitUsernames: string[];
  gameId: string | null;
}

export interface PodiumEntry {
  userId: string;
  username: string;
  place: 1 | 2 | 3;
}

export interface TournamentResultsView {
  format: 'swiss' | 'elimination' | 'double_elimination' | 'unknown';
  champion: { userId: string; username: string } | null;
  podium: PodiumEntry[];
  entries: ResultMatchEntry[];
  forfeitCount: number;
  doubleForfeitCount: number;
}

function classifyMatch(m: TournamentMatch): MatchOutcomeKind {
  if (m.isBye) return 'bye';
  if (m.status === 'completed' && m.winnerId) return 'win_played';
  if (m.status === 'forfeit' && m.winnerId) return 'win_forfeit';
  if (m.status === 'forfeit' && !m.winnerId) return 'double_forfeit';
  return 'incomplete';
}

function loserOf(m: TournamentMatch): { id: string | null; username: string | null } {
  if (!m.winnerId) return { id: null, username: null };
  if (m.winnerId === m.player1Id) {
    return { id: m.player2Id, username: m.player2Username };
  }
  if (m.winnerId === m.player2Id) {
    return { id: m.player1Id, username: m.player1Username };
  }
  return { id: null, username: null };
}

function buildEntries(matches: TournamentMatch[]): ResultMatchEntry[] {
  const sorted = [...matches].sort((a, b) => {
    if (a.round !== b.round) return b.round - a.round;
    return a.matchIndex - b.matchIndex;
  });
  return sorted.map((m) => {
    const kind = classifyMatch(m);
    const loser = loserOf(m);
    const doubleNames: string[] = [];
    if (kind === 'double_forfeit') {
      if (m.player1Username) doubleNames.push(m.player1Username);
      if (m.player2Username) doubleNames.push(m.player2Username);
    }
    return {
      matchId: m.id,
      round: m.round,
      matchIndex: m.matchIndex,
      bracket: m.bracket,
      outcome: kind,
      winnerUsername: m.winnerUsername ?? null,
      winnerId: m.winnerId ?? null,
      loserUsername: loser.username,
      loserId: loser.id,
      doubleForfeitUsernames: doubleNames,
      gameId: m.gameId ?? null,
    };
  });
}

function buildSwissPodium(t: TournamentData): PodiumEntry[] {
  const standings = t.standings ?? [];
  return standings.slice(0, 3).map((s, i) => ({
    userId: s.userId,
    username: s.username,
    place: (i + 1) as 1 | 2 | 3,
  }));
}

function buildEliminationPodium(t: TournamentData, entries: ResultMatchEntry[]): PodiumEntry[] {
  if (!t.winnerId || !t.winnerUsername) return [];
  const podium: PodiumEntry[] = [
    { userId: t.winnerId, username: t.winnerUsername, place: 1 },
  ];

  const finalEntry = entries.find((e) => e.bracket === 'main' && (e.outcome === 'win_played' || e.outcome === 'win_forfeit') && e.winnerId === t.winnerId);
  if (finalEntry && finalEntry.loserId && finalEntry.loserUsername) {
    podium.push({ userId: finalEntry.loserId, username: finalEntry.loserUsername, place: 2 });
  }

  const semiRound = finalEntry ? finalEntry.round - 1 : null;
  if (semiRound !== null && semiRound >= 1) {
    const semiLosers = entries.filter(
      (e) => e.round === semiRound && (e.outcome === 'win_played' || e.outcome === 'win_forfeit') && e.loserId && e.loserId !== t.winnerId,
    );
    if (semiLosers[0]?.loserId && semiLosers[0]?.loserUsername) {
      podium.push({ userId: semiLosers[0].loserId, username: semiLosers[0].loserUsername, place: 3 });
    }
  }

  return podium;
}

export function buildEliminationPrizeUserIds(tournament: TournamentData): { userId: string; place: 1 | 2 | 3 }[] {
  if (!tournament.winnerId) return [];
  const entries = buildEntries(tournament.matches ?? []);
  const result: { userId: string; place: 1 | 2 | 3 }[] = [{ userId: tournament.winnerId, place: 1 }];
  const finalEntry = entries.find(
    (e) => e.bracket === 'main' && (e.outcome === 'win_played' || e.outcome === 'win_forfeit') && e.winnerId === tournament.winnerId,
  );
  if (finalEntry?.loserId) result.push({ userId: finalEntry.loserId, place: 2 });
  const semiRound = finalEntry ? finalEntry.round - 1 : null;
  if (semiRound !== null && semiRound >= 1) {
    const semiLosers = entries.filter(
      (e) => e.round === semiRound && (e.outcome === 'win_played' || e.outcome === 'win_forfeit') && e.loserId && e.loserId !== tournament.winnerId,
    );
    for (const s of semiLosers) if (s.loserId) result.push({ userId: s.loserId, place: 3 });
  }
  return result;
}

export function buildTournamentResultsView(tournament: TournamentData): TournamentResultsView {
  const format = (tournament.format ?? 'unknown') as TournamentResultsView['format'];
  const entries = buildEntries(tournament.matches ?? []);
  const forfeitCount = entries.filter((e) => e.outcome === 'win_forfeit').length;
  const doubleForfeitCount = entries.filter((e) => e.outcome === 'double_forfeit').length;

  const champion = tournament.winnerId && tournament.winnerUsername
    ? { userId: tournament.winnerId, username: tournament.winnerUsername }
    : null;

  let podium: PodiumEntry[];
  if (format === 'swiss') {
    podium = buildSwissPodium(tournament);
    if (podium.length === 0 && champion) {
      podium = [{ userId: champion.userId, username: champion.username, place: 1 }];
    }
  } else {
    podium = buildEliminationPodium(tournament, entries);
  }

  return {
    format,
    champion,
    podium,
    entries,
    forfeitCount,
    doubleForfeitCount,
  };
}
