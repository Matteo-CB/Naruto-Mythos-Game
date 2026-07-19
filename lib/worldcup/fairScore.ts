export const TEAM_SIZE = 6;
export const MIN_RANKED_PLAYERS = TEAM_SIZE;
export const WORLDCUP_MIN_ELO = 1200;
export const MIN_PLAYER_GAMES = 10;

export const SCORE_WEIGHTS = {
  winRate: 0.5,
  strength: 0.2,
  elo: 0.2,
  activity: 0.1,
} as const;

export const STRENGTH_ELO_MIN = 1200;
export const STRENGTH_ELO_MAX = 2500;
export const TEAM_ELO_MIN = 1200;
export const TEAM_ELO_MAX = 3000;
export const ACTIVITY_GAMES_MAX = 300;
export const FORFEIT_PENALTY = 15;

export interface RankedResultRow {
  userId: string;
  result: string;
  opponentElo: number;
  isForfeit: boolean;
}

export interface CountryUser {
  username: string;
  elo: number;
  countryCode: string | null;
}

export interface CountryPlayerEntry {
  userId: string;
  username: string;
  elo: number;
  wins: number;
  games: number;
}

export interface ScoreBreakdown {
  winRate: number;
  strengthFactor: number;
  eloFactor: number;
  activityFactor: number;
  forfeitRate: number;
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
  avgElo: number;
  avgOpponentElo: number;
  forfeitLosses: number;
  score: number;
  breakdown: ScoreBreakdown;
  topPlayers: CountryPlayerEntry[];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return clamp01((value - min) / (max - min));
}

interface TeamStats {
  games: number;
  wins: number;
  avgElo: number;
  avgOpponentEloOnWins: number;
  forfeitLosses: number;
}

export function computeCountryScore(t: TeamStats): { score: number; breakdown: ScoreBreakdown } {
  const winRate = t.games > 0 ? t.wins / t.games : 0;
  const strengthFactor = normalize(t.avgOpponentEloOnWins, STRENGTH_ELO_MIN, STRENGTH_ELO_MAX);
  const eloFactor = normalize(t.avgElo, TEAM_ELO_MIN, TEAM_ELO_MAX);
  const activityFactor = normalize(t.games, TEAM_SIZE * MIN_PLAYER_GAMES, ACTIVITY_GAMES_MAX);
  const forfeitRate = t.games > 0 ? t.forfeitLosses / t.games : 0;

  const base = 100 * (
    SCORE_WEIGHTS.winRate * winRate
    + SCORE_WEIGHTS.strength * strengthFactor
    + SCORE_WEIGHTS.elo * eloFactor
    + SCORE_WEIGHTS.activity * activityFactor
  );
  const score = Math.max(0, Math.min(100, base - FORFEIT_PENALTY * forfeitRate));

  return {
    score,
    breakdown: { winRate, strengthFactor, eloFactor, activityFactor, forfeitRate },
  };
}

interface PlayerAgg {
  userId: string;
  elo: number;
  games: number;
  wins: number;
  forfeitLosses: number;
  sumOpponentEloOnWins: number;
}

export function buildCountryStandings(
  results: RankedResultRow[],
  users: Map<string, CountryUser>,
): CountryStanding[] {
  const perUser = new Map<string, PlayerAgg>();
  for (const row of results) {
    const u = users.get(row.userId);
    if (!u || !u.countryCode || u.elo < WORLDCUP_MIN_ELO) continue;
    let agg = perUser.get(row.userId);
    if (!agg) {
      agg = { userId: row.userId, elo: u.elo, games: 0, wins: 0, forfeitLosses: 0, sumOpponentEloOnWins: 0 };
      perUser.set(row.userId, agg);
    }
    agg.games += 1;
    if (row.result === 'win') {
      agg.wins += 1;
      agg.sumOpponentEloOnWins += row.opponentElo;
    } else if (row.result === 'loss' && row.isForfeit) {
      agg.forfeitLosses += 1;
    }
  }

  const perCountry = new Map<string, PlayerAgg[]>();
  for (const agg of perUser.values()) {
    if (agg.games < MIN_PLAYER_GAMES) continue;
    const cc = users.get(agg.userId)!.countryCode!;
    let list = perCountry.get(cc);
    if (!list) {
      list = [];
      perCountry.set(cc, list);
    }
    list.push(agg);
  }

  const standings: CountryStanding[] = [];
  for (const [cc, eligible] of perCountry) {
    const team = [...eligible]
      .sort((a, b) => b.elo - a.elo || b.games - a.games)
      .slice(0, TEAM_SIZE);
    const games = team.reduce((s, u) => s + u.games, 0);
    if (games === 0) continue;
    const wins = team.reduce((s, u) => s + u.wins, 0);
    const eloSum = team.reduce((s, u) => s + u.elo, 0);
    const forfeitLosses = team.reduce((s, u) => s + u.forfeitLosses, 0);
    const winsForStrength = team.reduce((s, u) => s + u.wins, 0);
    const sumOppEloOnWins = team.reduce((s, u) => s + u.sumOpponentEloOnWins, 0);
    const avgOpponentEloOnWins = winsForStrength > 0 ? sumOppEloOnWins / winsForStrength : 0;
    const avgElo = Math.round(eloSum / team.length);

    const { score, breakdown } = computeCountryScore({
      games,
      wins,
      avgElo,
      avgOpponentEloOnWins,
      forfeitLosses,
    });

    standings.push({
      countryCode: cc,
      ranked: team.length >= MIN_RANKED_PLAYERS,
      players: eligible.length,
      teamSize: team.length,
      games,
      wins,
      losses: games - wins,
      winRate: wins / games,
      avgElo,
      avgOpponentElo: Math.round(avgOpponentEloOnWins),
      forfeitLosses,
      score,
      breakdown,
      topPlayers: team.map((u) => ({
        userId: u.userId,
        username: users.get(u.userId)?.username ?? '',
        elo: u.elo,
        wins: u.wins,
        games: u.games,
      })),
    });
  }

  standings.sort((a, b) => {
    if (a.ranked !== b.ranked) return a.ranked ? -1 : 1;
    return b.score - a.score || b.games - a.games || b.avgElo - a.avgElo;
  });
  return standings;
}
