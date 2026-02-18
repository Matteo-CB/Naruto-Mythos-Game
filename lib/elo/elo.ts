/**
 * ELO rating system for the Naruto Mythos TCG.
 *
 * Uses standard ELO formula:
 * - K-factor: 32 for players below 2000, 16 above
 * - Expected score: E = 1 / (1 + 10^((oppElo - playerElo) / 400))
 * - New ELO: oldElo + K * (actualScore - expectedScore)
 * - Win = 1.0, Draw = 0.5, Loss = 0.0
 * - Minimum ELO: 100 (floor)
 */

const K_FACTOR_LOW = 32;
const K_FACTOR_HIGH = 16;
const K_THRESHOLD = 2000;
const ELO_FLOOR = 100;

function getKFactor(elo: number): number {
  return elo < K_THRESHOLD ? K_FACTOR_LOW : K_FACTOR_HIGH;
}

/**
 * Calculate the expected score for a player.
 */
export function expectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

/**
 * Calculate the new ELO rating after a game.
 */
export function calculateNewElo(
  playerElo: number,
  opponentElo: number,
  actualScore: number, // 1.0 = win, 0.5 = draw, 0.0 = loss
): number {
  const K = getKFactor(playerElo);
  const E = expectedScore(playerElo, opponentElo);
  const newElo = Math.round(playerElo + K * (actualScore - E));
  return Math.max(ELO_FLOOR, newElo);
}

/**
 * Calculate ELO changes for both players after a match.
 */
export function calculateEloChanges(
  player1Elo: number,
  player2Elo: number,
  winner: 'player1' | 'player2' | 'draw',
): { player1NewElo: number; player2NewElo: number; player1Delta: number; player2Delta: number } {
  const p1Score = winner === 'player1' ? 1.0 : winner === 'draw' ? 0.5 : 0.0;
  const p2Score = winner === 'player2' ? 1.0 : winner === 'draw' ? 0.5 : 0.0;

  const player1NewElo = calculateNewElo(player1Elo, player2Elo, p1Score);
  const player2NewElo = calculateNewElo(player2Elo, player1Elo, p2Score);

  return {
    player1NewElo,
    player2NewElo,
    player1Delta: player1NewElo - player1Elo,
    player2Delta: player2NewElo - player2Elo,
  };
}
