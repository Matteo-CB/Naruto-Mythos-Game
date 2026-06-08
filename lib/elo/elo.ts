

const K_FACTOR = 32;
const ELO_FLOOR = 100;
const MIN_WIN_GAIN = 10;
const MAX_LOSS = 32;

function getKFactor(_elo: number): number {
  return K_FACTOR;
}

export function expectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

export function getMinWinGain(_myElo: number, _opponentElo: number): number {
  return MIN_WIN_GAIN;
}

export function getMaxLoss(_myElo: number, _opponentElo: number): number {
  return MAX_LOSS;
}

export function calculateNewElo(
  playerElo: number,
  opponentElo: number,
  actualScore: number,
): number {
  const K = getKFactor(playerElo);
  const E = expectedScore(playerElo, opponentElo);
  let delta = Math.round(K * (actualScore - E));

  if (actualScore === 1.0) {
    const minGain = getMinWinGain(playerElo, opponentElo);
    if (delta < minGain) delta = minGain;
  }
  if (actualScore === 0.0) {
    const maxLoss = getMaxLoss(playerElo, opponentElo);
    if (delta < -maxLoss) delta = -maxLoss;
  }

  return Math.max(ELO_FLOOR, playerElo + delta);
}

export interface PerformanceBonusInput {
  winnerScore: number;
  loserScore: number;
  loserBoardCount: number;
  isForfeit: boolean;
  winReason?: 'score' | 'forfeit' | 'timeout' | 'clock' | 'idle';
}

export interface PerformanceBonus {
  scoreBonus: number;
  boardBonus: number;
  forfeitBonus: number;
  total: number;
  scoreGap: number;
  loserBoardCount: number;
  applied: boolean;
  isForfeit: boolean;
}

export const FORFEIT_BONUS = 3;

function calcScoreBonus(scoreGap: number): number {
  if (scoreGap >= 25) return 9;
  if (scoreGap >= 20) return 7;
  if (scoreGap >= 15) return 5;
  if (scoreGap >= 10) return 2;
  return 0;
}

function calcBoardBonus(loserBoardCount: number): number {
  if (loserBoardCount <= 0) return 6;
  if (loserBoardCount === 1) return 5;
  if (loserBoardCount === 2) return 4;
  if (loserBoardCount === 3) return 3;
  if (loserBoardCount === 4) return 2;
  if (loserBoardCount === 5) return 1;
  return 0;
}

export function calculatePerformanceBonus(input: PerformanceBonusInput): PerformanceBonus {
  const scoreGap = Math.max(0, input.winnerScore - input.loserScore);
  const loserBoardCount = Math.max(0, input.loserBoardCount);
  if (input.isForfeit) {
    return {
      scoreBonus: 0,
      boardBonus: 0,
      forfeitBonus: FORFEIT_BONUS,
      total: FORFEIT_BONUS,
      scoreGap,
      loserBoardCount,
      applied: true,
      isForfeit: true,
    };
  }
  const scoreBonus = calcScoreBonus(scoreGap);
  const boardBonus = calcBoardBonus(loserBoardCount);
  return {
    scoreBonus,
    boardBonus,
    forfeitBonus: 0,
    total: scoreBonus + boardBonus,
    scoreGap,
    loserBoardCount,
    applied: true,
    isForfeit: false,
  };
}

export interface EloInput {
  player1Elo: number;
  player2Elo: number;
  winner: 'player1' | 'player2';
  player1Score: number;
  player2Score: number;
  player1ConsecWins: number;
  player1ConsecLosses: number;
  player2ConsecWins: number;
  player2ConsecLosses: number;
  performanceBonus?: PerformanceBonus | null;
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
  performanceBonus: PerformanceBonus | null;
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
          player2ConsecWins, player2ConsecLosses, performanceBonus } = p1EloOrInput;

  const p1ActualScore = winner === 'player1' ? 1.0 : 0.0;
  const p2ActualScore = winner === 'player2' ? 1.0 : 0.0;

  let player1NewElo = calculateNewElo(player1Elo, player2Elo, p1ActualScore);
  let player2NewElo = calculateNewElo(player2Elo, player1Elo, p2ActualScore);

  const bonus = performanceBonus ?? null;
  if (bonus && bonus.total > 0) {
    if (winner === 'player1') {
      player1NewElo = Math.max(ELO_FLOOR, player1NewElo + bonus.total);
    } else {
      player2NewElo = Math.max(ELO_FLOOR, player2NewElo + bonus.total);
    }
  }

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
    performanceBonus: bonus,
  };
}
