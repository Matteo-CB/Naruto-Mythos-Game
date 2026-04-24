

const K_FACTOR_LOW = 32;
const K_FACTOR_HIGH = 16;
const K_THRESHOLD = 2000;
const ELO_FLOOR = 100;
const MIN_WIN_GAIN = 10;
const MAX_LOSS = 25;

function getKFactor(elo: number): number {
  return elo < K_THRESHOLD ? K_FACTOR_LOW : K_FACTOR_HIGH;
}

export function expectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

export function calculateNewElo(
  playerElo: number,
  opponentElo: number,
  actualScore: number,
): number {
  const K = getKFactor(playerElo);
  const E = expectedScore(playerElo, opponentElo);
  let delta = Math.round(K * (actualScore - E));

  
  if (actualScore === 1.0 && delta < MIN_WIN_GAIN) delta = MIN_WIN_GAIN;
  
  if (actualScore === 0.0 && delta < -MAX_LOSS) delta = -MAX_LOSS;

  return Math.max(ELO_FLOOR, playerElo + delta);
}

export interface EloInput {
  player1Elo: number;
  player2Elo: number;
  winner: 'player1' | 'player2';
  player1Score: number; // kept for back-compat; unused in vanilla formula
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

  
  const { player1Elo, player2Elo, winner, player1ConsecWins, player1ConsecLosses,
          player2ConsecWins, player2ConsecLosses } = p1EloOrInput;

  const p1ActualScore = winner === 'player1' ? 1.0 : 0.0;
  const p2ActualScore = winner === 'player2' ? 1.0 : 0.0;

  const player1NewElo = calculateNewElo(player1Elo, player2Elo, p1ActualScore);
  const player2NewElo = calculateNewElo(player2Elo, player1Elo, p2ActualScore);

  const p1IsWinner = winner === 'player1';
  return {
    player1NewElo,
    player2NewElo,
    player1Delta: player1NewElo - player1Elo,
    player2Delta: player2NewElo - player2Elo,
    player1NewConsecWins: p1IsWinner ? player1ConsecWins + 1 : 0,
    player1NewConsecLosses: p1IsWinner ? 0 : player1ConsecLosses + 1,
    player2NewConsecWins: p1IsWinner ? 0 : player2ConsecWins + 1,
    player2NewConsecLosses: p1IsWinner ? player2ConsecLosses + 1 : 0,
  };
}
