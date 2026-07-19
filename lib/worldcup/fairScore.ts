export const TEAM_SIZE = 6;
export const MIN_RANKED_PLAYERS = TEAM_SIZE;
export const WORLDCUP_MIN_ELO = 1200;

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
  teamSize: number;
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

  const perCountry = new Map<string, Array<{ userId: string; wins: number; games: number; elo: number }>>();
  for (const [userId, agg] of perUser) {
    const u = users.get(userId)!;
    const cc = u.countryCode!;
    let entry = perCountry.get(cc);
    if (!entry) {
      entry = [];
      perCountry.set(cc, entry);
    }
    entry.push({ userId, wins: agg.wins, games: agg.games, elo: u.elo });
  }

  const standings: CountryStanding[] = [];
  for (const [cc, all] of perCountry) {
    const team = [...all]
      .sort((a, b) => b.elo - a.elo || b.games - a.games)
      .slice(0, TEAM_SIZE);
    const games = team.reduce((s, u) => s + u.games, 0);
    if (games === 0) continue;
    const wins = team.reduce((s, u) => s + u.wins, 0);
    const eloSum = team.reduce((s, u) => s + u.elo, 0);
    const winRate = wins / games;
    standings.push({
      countryCode: cc,
      ranked: team.length >= MIN_RANKED_PLAYERS,
      players: all.length,
      teamSize: team.length,
      games,
      wins,
      losses: games - wins,
      winRate,
      score: winRate,
      avgElo: Math.round(eloSum / team.length),
      topPlayers: team.map((u) => ({
        username: users.get(u.userId)?.username ?? '',
        elo: u.elo,
        wins7d: u.wins,
        games7d: u.games,
      })),
    });
  }

  standings.sort((a, b) => {
    if (a.ranked !== b.ranked) return a.ranked ? -1 : 1;
    return b.score - a.score || b.games - a.games || b.avgElo - a.avgElo;
  });
  return standings;
}
