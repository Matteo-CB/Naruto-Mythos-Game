/**
 * Intelligent ELO rating system for the Naruto Mythos TCG.
 *
 * Features:
 * - Standard ELO base formula
 * - Score margin multiplier (winner only — dominant wins earn more)
 * - Win streak bonus / lose streak protection
 * - Minimum +5 ELO per victory guaranteed
 * - Demotion shield: can't fall more than 30 below a league threshold
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const K_FACTOR_LOW = 32;
const K_FACTOR_HIGH = 16;
const K_THRESHOLD = 2000;
const ELO_FLOOR = 100;
const MIN_WIN_GAIN = 5;
const MAX_SCORE_MARGIN = 7;
const MARGIN_BONUS_CAP = 0.5; // +50% max for dominant wins
const STREAK_THRESHOLD = 3;   // streaks activate at 3+
const STREAK_PER_LEVEL = 0.08; // +8% per streak level
const STREAK_MAX_LEVELS = 5;  // cap at 5 levels = 40%
const DEMOTION_SHIELD = 30;   // can't fall more than 30 below league threshold

// League thresholds for demotion shield (ascending order)
const LEAGUE_THRESHOLDS = [0, 450, 550, 700, 1000, 1200, 1500, 1700];

// ─── Core functions ──────────────────────────────────────────────────────────

function getKFactor(elo: number): number {
  return elo < K_THRESHOLD ? K_FACTOR_LOW : K_FACTOR_HIGH;
}

export function expectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

/**
 * Score margin multiplier — bigger win = more ELO for the winner.
 * margin = winnerScore - loserScore (0 to ~10)
 * Returns 1.0 (no bonus) to 1.5 (max bonus).
 */
function scoreMarginMultiplier(winnerScore: number, loserScore: number): number {
  const margin = Math.max(0, winnerScore - loserScore);
  const capped = Math.min(margin, MAX_SCORE_MARGIN);
  return 1.0 + (capped / MAX_SCORE_MARGIN) * MARGIN_BONUS_CAP;
}

/**
 * Win streak multiplier — 3+ consecutive wins = bonus.
 * Returns 1.0 (no bonus) to 1.4 (max bonus at 7+ wins).
 */
function winStreakMultiplier(consecutiveWins: number): number {
  if (consecutiveWins < STREAK_THRESHOLD) return 1.0;
  const levels = Math.min(consecutiveWins - (STREAK_THRESHOLD - 1), STREAK_MAX_LEVELS);
  return 1.0 + levels * STREAK_PER_LEVEL;
}

/**
 * Lose streak protection — 3+ consecutive losses = reduced loss.
 * Returns 1.0 (no protection) to 0.6 (max protection at 7+ losses).
 */
function loseStreakProtection(consecutiveLosses: number): number {
  if (consecutiveLosses < STREAK_THRESHOLD) return 1.0;
  const levels = Math.min(consecutiveLosses - (STREAK_THRESHOLD - 1), STREAK_MAX_LEVELS);
  return 1.0 - levels * STREAK_PER_LEVEL;
}

/**
 * Demotion shield — prevent falling more than 30 below a league threshold
 * that the player was at or above before the match.
 */
function applyDemotionShield(oldElo: number, newElo: number): number {
  if (newElo >= oldElo) return newElo; // gaining ELO, no shield needed
  let shielded = newElo;
  // Check each league threshold (descending) the player was at or above
  for (let i = LEAGUE_THRESHOLDS.length - 1; i >= 0; i--) {
    const threshold = LEAGUE_THRESHOLDS[i];
    if (threshold <= 0) continue; // no shield for the lowest tier
    if (oldElo >= threshold && shielded < threshold - DEMOTION_SHIELD) {
      shielded = threshold - DEMOTION_SHIELD;
    }
  }
  return shielded;
}

// ─── Legacy export (for tests and non-ranked uses) ───────────────────────────

export function calculateNewElo(
  playerElo: number,
  opponentElo: number,
  actualScore: number,
): number {
  const K = getKFactor(playerElo);
  const E = expectedScore(playerElo, opponentElo);
  const newElo = Math.round(playerElo + K * (actualScore - E));
  return Math.max(ELO_FLOOR, newElo);
}

// ─── Main calculation ────────────────────────────────────────────────────────

export interface EloInput {
  player1Elo: number;
  player2Elo: number;
  winner: 'player1' | 'player2';
  player1Score: number; // mission points
  player2Score: number;
  player1ConsecWins: number;
  player1ConsecLosses: number;
  player2ConsecWins: number;
  player2ConsecLosses: number;
}

export interface EloResult {
  player1NewElo: number;
  player2NewElo: number;
  player1Delta: number;
  player2Delta: number;
  // Updated streaks for DB
  player1NewConsecWins: number;
  player1NewConsecLosses: number;
  player2NewConsecWins: number;
  player2NewConsecLosses: number;
}

export function calculateEloChanges(input: EloInput): EloResult;
export function calculateEloChanges(
  player1Elo: number,
  player2Elo: number,
  winner: 'player1' | 'player2' | 'draw',
): { player1NewElo: number; player2NewElo: number; player1Delta: number; player2Delta: number };
export function calculateEloChanges(
  p1EloOrInput: number | EloInput,
  p2Elo?: number,
  winnerLegacy?: 'player1' | 'player2' | 'draw',
): EloResult | { player1NewElo: number; player2NewElo: number; player1Delta: number; player2Delta: number } {
  // Legacy 3-arg signature (backward compat for tests/non-ranked)
  if (typeof p1EloOrInput === 'number') {
    const p1 = p1EloOrInput;
    const p2 = p2Elo!;
    const w = winnerLegacy!;
    const p1Score = w === 'player1' ? 1.0 : w === 'draw' ? 0.5 : 0.0;
    const p2Score = w === 'player2' ? 1.0 : w === 'draw' ? 0.5 : 0.0;
    const player1NewElo = calculateNewElo(p1, p2, p1Score);
    const player2NewElo = calculateNewElo(p2, p1, p2Score);
    return {
      player1NewElo,
      player2NewElo,
      player1Delta: player1NewElo - p1,
      player2Delta: player2NewElo - p2,
    };
  }

  // New intelligent signature
  const {
    player1Elo, player2Elo, winner,
    player1Score, player2Score,
    player1ConsecWins, player1ConsecLosses,
    player2ConsecWins, player2ConsecLosses,
  } = p1EloOrInput;

  const isP1Winner = winner === 'player1';
  const winnerElo = isP1Winner ? player1Elo : player2Elo;
  const loserElo = isP1Winner ? player2Elo : player1Elo;
  const wScore = isP1Winner ? player1Score : player2Score;
  const lScore = isP1Winner ? player2Score : player1Score;
  const winnerConsecWins = isP1Winner ? player1ConsecWins : player2ConsecWins;
  const loserConsecLosses = isP1Winner ? player2ConsecLosses : player1ConsecLosses;

  // ── Winner calculation ──
  const Kw = getKFactor(winnerElo);
  const Ew = expectedScore(winnerElo, loserElo);
  const rawWinDelta = Kw * (1.0 - Ew);
  const marginMult = scoreMarginMultiplier(wScore, lScore);
  const streakMult = winStreakMultiplier(winnerConsecWins + 1); // +1 because this win counts
  const adjustedWinDelta = Math.round(rawWinDelta * marginMult * streakMult);
  const winnerDelta = Math.max(MIN_WIN_GAIN, adjustedWinDelta);
  const winnerNewElo = Math.max(ELO_FLOOR, winnerElo + winnerDelta);

  // ── Loser calculation ──
  const Kl = getKFactor(loserElo);
  const El = expectedScore(loserElo, winnerElo);
  const rawLoseDelta = Kl * (0.0 - El); // negative
  const protection = loseStreakProtection(loserConsecLosses + 1); // +1 because this loss counts
  const adjustedLoseDelta = Math.round(rawLoseDelta * protection);
  let loserNewElo = Math.max(ELO_FLOOR, loserElo + adjustedLoseDelta);
  loserNewElo = applyDemotionShield(loserElo, loserNewElo);

  // ── Update streaks ──
  const p1IsWinner = isP1Winner;
  const p1NewConsecWins = p1IsWinner ? player1ConsecWins + 1 : 0;
  const p1NewConsecLosses = p1IsWinner ? 0 : player1ConsecLosses + 1;
  const p2NewConsecWins = !p1IsWinner ? player2ConsecWins + 1 : 0;
  const p2NewConsecLosses = !p1IsWinner ? 0 : player2ConsecLosses + 1;

  return {
    player1NewElo: isP1Winner ? winnerNewElo : loserNewElo,
    player2NewElo: isP1Winner ? loserNewElo : winnerNewElo,
    player1Delta: (isP1Winner ? winnerNewElo : loserNewElo) - player1Elo,
    player2Delta: (isP1Winner ? loserNewElo : winnerNewElo) - player2Elo,
    player1NewConsecWins: p1NewConsecWins,
    player1NewConsecLosses: p1NewConsecLosses,
    player2NewConsecWins: p2NewConsecWins,
    player2NewConsecLosses: p2NewConsecLosses,
  };
}
