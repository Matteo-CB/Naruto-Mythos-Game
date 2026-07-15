export const PLAYER_PRIOR_GAMES = 10;
export const COUNTRY_PRIOR_PLAYERS = 4;
export const MIN_RANKED_PLAYERS = 6;
export const TOP_PLAYERS_CAP = 8;
export const WORLDCUP_MIN_ELO = 1200;

export function playerFairScore(wins: number, games: number): number {
  return (wins + PLAYER_PRIOR_GAMES * 0.5) / (games + PLAYER_PRIOR_GAMES);
}

export function countryFairScore(playerScores: number[]): number {
  const sum = playerScores.reduce((s, v) => s + v, 0);
  return (sum + COUNTRY_PRIOR_PLAYERS * 0.5) / (playerScores.length + COUNTRY_PRIOR_PLAYERS);
}

export interface RankedResultRow {
  userId: string;
  result: string;
}

export interface CountryUser {
  username: string;
  elo: number;
  countryCode: string | null;
}

export interface CountryPlayerEntry {
  username: string;
  elo: number;
  wins7d: number;
  games7d: number;
}

export interface CountryStanding {
  countryCode: string;
  ranked: boolean;
  players: number;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  score: number;
  avgElo: number;
  topPlayers: CountryPlayerEntry[];
}

export function buildCountryStandings(
  results: RankedResultRow[],
  users: Map<string, CountryUser>,
): CountryStanding[] {
  const perUser = new Map<string, { wins: number; games: number }>();
  for (const row of results) {
    const u = users.get(row.userId);
    if (!u || !u.countryCode || u.elo < WORLDCUP_MIN_ELO) continue;
    let agg = perUser.get(row.userId);
    if (!agg) {
      agg = { wins: 0, games: 0 };
      perUser.set(row.userId, agg);
    }
    agg.games += 1;
    if (row.result === 'win') agg.wins += 1;
  }

  const perCountry = new Map<string, { users: Array<{ userId: string; wins: number; games: number }> }>();
  for (const [userId, agg] of perUser) {
    const cc = users.get(userId)!.countryCode!;
    let entry = perCountry.get(cc);
    if (!entry) {
      entry = { users: [] };
      perCountry.set(cc, entry);
    }
    entry.users.push({ userId, wins: agg.wins, games: agg.games });
  }

  const standings: CountryStanding[] = [];
  for (const [cc, entry] of perCountry) {
    const games = entry.users.reduce((s, u) => s + u.games, 0);
    const wins = entry.users.reduce((s, u) => s + u.wins, 0);
    if (games === 0) continue;
    const eloSum = entry.users.reduce((s, u) => s + (users.get(u.userId)?.elo ?? 0), 0);
    const playerScores = entry.users.map((u) => playerFairScore(u.wins, u.games));
    const sortedPlayers = [...entry.users].sort((a, b) => {
      const ea = users.get(a.userId)?.elo ?? 0;
      const eb = users.get(b.userId)?.elo ?? 0;
      return eb - ea || b.games - a.games;
    });
    standings.push({
      countryCode: cc,
      ranked: entry.users.length >= MIN_RANKED_PLAYERS,
      players: entry.users.length,
      games,
      wins,
      losses: games - wins,
      winRate: wins / games,
      score: countryFairScore(playerScores),
      avgElo: Math.round(eloSum / entry.users.length),
      topPlayers: sortedPlayers.slice(0, TOP_PLAYERS_CAP).map((u) => ({
        username: users.get(u.userId)?.username ?? '',
        elo: users.get(u.userId)?.elo ?? 0,
        wins7d: u.wins,
        games7d: u.games,
      })),
    });
  }

  standings.sort((a, b) => {
    if (a.ranked !== b.ranked) return a.ranked ? -1 : 1;
    return b.score - a.score || b.games - a.games || b.players - a.players;
  });
  return standings;
}
