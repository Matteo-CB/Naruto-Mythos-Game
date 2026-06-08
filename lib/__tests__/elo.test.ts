import { describe, it, expect } from 'vitest';
import {
  expectedScore,
  calculateNewElo,
  calculateEloChanges,
  calculatePerformanceBonus,
  getMaxLoss,
  getMinWinGain,
} from '../elo/elo';

describe('ELO System', () => {
  describe('expectedScore', () => {
    it('should return 0.5 for equal ratings', () => {
      expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
    });

    it('should return higher expected score for higher-rated player', () => {
      const score = expectedScore(1400, 1000);
      expect(score).toBeGreaterThan(0.5);
    });

    it('should return lower expected score for lower-rated player', () => {
      const score = expectedScore(1000, 1400);
      expect(score).toBeLessThan(0.5);
    });

    it('should be symmetric (sum to 1)', () => {
      const e1 = expectedScore(1200, 1000);
      const e2 = expectedScore(1000, 1200);
      expect(e1 + e2).toBeCloseTo(1.0);
    });

    it('should handle large rating differences', () => {
      const score = expectedScore(2000, 1000);
      expect(score).toBeGreaterThan(0.95);
    });
  });

  describe('calculateNewElo', () => {
    it('should increase rating on win against equal opponent', () => {
      const newElo = calculateNewElo(1000, 1000, 1.0);
      expect(newElo).toBeGreaterThan(1000);
    });

    it('should decrease rating on loss against equal opponent', () => {
      const newElo = calculateNewElo(1000, 1000, 0.0);
      expect(newElo).toBeLessThan(1000);
    });

    it('should not change much on draw against equal opponent', () => {
      const newElo = calculateNewElo(1000, 1000, 0.5);
      expect(newElo).toBe(1000);
    });

    it('should use K=32 at low ELO', () => {
      const newElo = calculateNewElo(1000, 1000, 1.0);
      expect(newElo).toBe(1016);
    });

    it('should still use K=32 at/above 2000 ELO', () => {
      const newElo = calculateNewElo(2000, 2000, 1.0);
      expect(newElo).toBe(2016);
    });

    it('should never go below 100 (ELO floor)', () => {
      const newElo = calculateNewElo(100, 2500, 0.0);
      expect(newElo).toBe(100);
    });

    it('should gain less for beating a much lower-rated player', () => {
      const gainVsLow = calculateNewElo(1500, 1000, 1.0) - 1500;
      const gainVsEqual = calculateNewElo(1500, 1500, 1.0) - 1500;
      expect(gainVsLow).toBeLessThan(gainVsEqual);
    });

    it('should gain more for beating a much higher-rated player', () => {
      const gainVsHigh = calculateNewElo(1000, 1500, 1.0) - 1000;
      const gainVsEqual = calculateNewElo(1000, 1000, 1.0) - 1000;
      expect(gainVsHigh).toBeGreaterThan(gainVsEqual);
    });

    it('floors win gain at +10 even for very large gaps', () => {
      expect(calculateNewElo(1700, 100, 1.0) - 1700).toBe(10);
      expect(calculateNewElo(2500, 100, 1.0) - 2500).toBe(10);
    });

    it('caps loss at -32 universally (natural K=32 loss is the cap; gentle gaps lose less)', () => {
      expect(calculateNewElo(1500, 1000, 0.0) - 1500).toBeGreaterThanOrEqual(-32);
      expect(calculateNewElo(1700, 100, 0.0) - 1700).toBe(-32);
      expect(calculateNewElo(2500, 500, 0.0) - 2500).toBe(-32);
    });

    it('should not apply clamps to draws', () => {
      const newElo = calculateNewElo(1000, 1000, 0.5);
      expect(newElo).toBe(1000);
    });
  });

  describe('getMaxLoss / getMinWinGain', () => {
    it('returns 32 max loss regardless of gap', () => {
      expect(getMaxLoss(1000, 1000)).toBe(32);
      expect(getMaxLoss(2500, 100)).toBe(32);
      expect(getMaxLoss(100, 2500)).toBe(32);
    });

    it('returns 10 min win gain regardless of gap', () => {
      expect(getMinWinGain(1000, 1000)).toBe(10);
      expect(getMinWinGain(2500, 100)).toBe(10);
      expect(getMinWinGain(100, 2500)).toBe(10);
    });
  });

  describe('calculateEloChanges (legacy API)', () => {
    it('should return correct changes for player1 win', () => {
      const result = calculateEloChanges(1000, 1000, 'player1');
      expect(result.player1Delta).toBeGreaterThan(0);
      expect(result.player2Delta).toBeLessThan(0);
    });

    it('should return correct changes for player2 win', () => {
      const result = calculateEloChanges(1000, 1000, 'player2');
      expect(result.player1Delta).toBeLessThan(0);
      expect(result.player2Delta).toBeGreaterThan(0);
    });

    it('should return zero delta on draw between equals', () => {
      const result = calculateEloChanges(1000, 1000, 'draw');
      expect(result.player1Delta).toBe(0);
      expect(result.player2Delta).toBe(0);
    });

    it('should have symmetric absolute deltas for equal-rated players', () => {
      const result = calculateEloChanges(1000, 1000, 'player1');
      expect(Math.abs(result.player1Delta)).toBe(Math.abs(result.player2Delta));
    });
  });

  describe('calculatePerformanceBonus', () => {
    it('returns forfeit bonus of +3 on forfeit (no score/board bonus)', () => {
      const r = calculatePerformanceBonus({ winnerScore: 30, loserScore: 0, loserBoardCount: 0, isForfeit: true });
      expect(r.applied).toBe(true);
      expect(r.isForfeit).toBe(true);
      expect(r.forfeitBonus).toBe(3);
      expect(r.scoreBonus).toBe(0);
      expect(r.boardBonus).toBe(0);
      expect(r.total).toBe(3);
    });

    it('returns 0 when score gap < 10 and loser still has chars on board', () => {
      const r = calculatePerformanceBonus({ winnerScore: 10, loserScore: 5, loserBoardCount: 6, isForfeit: false });
      expect(r.total).toBe(0);
      expect(r.applied).toBe(true);
      expect(r.isForfeit).toBe(false);
    });

    it('score gap tiers: 10/15/20/25 -> +2/+5/+7/+9', () => {
      const a = calculatePerformanceBonus({ winnerScore: 10, loserScore: 0, loserBoardCount: 10, isForfeit: false });
      expect(a.scoreBonus).toBe(2);
      const b = calculatePerformanceBonus({ winnerScore: 15, loserScore: 0, loserBoardCount: 10, isForfeit: false });
      expect(b.scoreBonus).toBe(5);
      const c = calculatePerformanceBonus({ winnerScore: 20, loserScore: 0, loserBoardCount: 10, isForfeit: false });
      expect(c.scoreBonus).toBe(7);
      const d = calculatePerformanceBonus({ winnerScore: 30, loserScore: 0, loserBoardCount: 10, isForfeit: false });
      expect(d.scoreBonus).toBe(9);
    });

    it('board pressure tiers: 5/4/3/2/1/0 -> +1/+2/+3/+4/+5/+6 (start at 5 chars instead of 7)', () => {
      const make = (n: number) =>
        calculatePerformanceBonus({ winnerScore: 5, loserScore: 5, loserBoardCount: n, isForfeit: false }).boardBonus;
      expect(make(8)).toBe(0);
      expect(make(7)).toBe(0);
      expect(make(6)).toBe(0);
      expect(make(5)).toBe(1);
      expect(make(4)).toBe(2);
      expect(make(3)).toBe(3);
      expect(make(2)).toBe(4);
      expect(make(1)).toBe(5);
      expect(make(0)).toBe(6);
    });

    it('combines score gap + board pressure on a normal win', () => {
      const r = calculatePerformanceBonus({ winnerScore: 22, loserScore: 0, loserBoardCount: 1, isForfeit: false });
      expect(r.scoreBonus).toBe(7);
      expect(r.boardBonus).toBe(5);
      expect(r.forfeitBonus).toBe(0);
      expect(r.total).toBe(12);
    });

    it('max possible bonus is +15 (gap 25+ -> +9, board 0 -> +6, no forfeit)', () => {
      const r = calculatePerformanceBonus({ winnerScore: 30, loserScore: 0, loserBoardCount: 0, isForfeit: false });
      expect(r.total).toBe(15);
    });

    it('forfeit bonus does not stack with score/board (forfeit-only path)', () => {
      const r = calculatePerformanceBonus({ winnerScore: 30, loserScore: 0, loserBoardCount: 0, isForfeit: true });
      expect(r.forfeitBonus).toBe(3);
      expect(r.scoreBonus).toBe(0);
      expect(r.boardBonus).toBe(0);
      expect(r.total).toBe(3);
    });
  });

  describe('calculateEloChanges with performance bonus', () => {
    it('adds bonus to winner only, leaves loser delta untouched', () => {
      const noBonus = calculateEloChanges({
        player1Elo: 1000, player2Elo: 1000, winner: 'player1',
        player1Score: 20, player2Score: 0,
        player1ConsecWins: 0, player1ConsecLosses: 0,
        player2ConsecWins: 0, player2ConsecLosses: 0,
      });
      const bonus = calculatePerformanceBonus({ winnerScore: 20, loserScore: 0, loserBoardCount: 2, isForfeit: false });
      const withBonus = calculateEloChanges({
        player1Elo: 1000, player2Elo: 1000, winner: 'player1',
        player1Score: 20, player2Score: 0,
        player1ConsecWins: 0, player1ConsecLosses: 0,
        player2ConsecWins: 0, player2ConsecLosses: 0,
        performanceBonus: bonus,
      });
      expect(withBonus.player1Delta).toBe(noBonus.player1Delta + bonus.total);
      expect(withBonus.player2Delta).toBe(noBonus.player2Delta);
      expect(withBonus.performanceBonus).toBe(bonus);
    });

    it('applies +3 forfeit bonus on forfeit (ignores score/board)', () => {
      const bonus = calculatePerformanceBonus({ winnerScore: 30, loserScore: 0, loserBoardCount: 0, isForfeit: true });
      const noBonus = calculateEloChanges({
        player1Elo: 1000, player2Elo: 1000, winner: 'player1',
        player1Score: 30, player2Score: 0,
        player1ConsecWins: 0, player1ConsecLosses: 0,
        player2ConsecWins: 0, player2ConsecLosses: 0,
      });
      const r = calculateEloChanges({
        player1Elo: 1000, player2Elo: 1000, winner: 'player1',
        player1Score: 30, player2Score: 0,
        player1ConsecWins: 0, player1ConsecLosses: 0,
        player2ConsecWins: 0, player2ConsecLosses: 0,
        performanceBonus: bonus,
      });
      expect(bonus.total).toBe(3);
      expect(r.performanceBonus?.applied).toBe(true);
      expect(r.performanceBonus?.isForfeit).toBe(true);
      expect(r.player1Delta).toBe(noBonus.player1Delta + 3);
    });

    it('high-ELO winner with big bonus still gains meaningful ELO vs much lower opponent', () => {
      const bonus = calculatePerformanceBonus({ winnerScore: 30, loserScore: 0, loserBoardCount: 0, isForfeit: false });
      const r = calculateEloChanges({
        player1Elo: 2000, player2Elo: 800, winner: 'player1',
        player1Score: 30, player2Score: 0,
        player1ConsecWins: 0, player1ConsecLosses: 0,
        player2ConsecWins: 0, player2ConsecLosses: 0,
        performanceBonus: bonus,
      });
      expect(r.player1Delta).toBeGreaterThanOrEqual(10 + 15);
    });

    it('loss never exceeds -32 even with extreme score gap and full board pressure on the other side', () => {
      const bonus = calculatePerformanceBonus({ winnerScore: 30, loserScore: 0, loserBoardCount: 0, isForfeit: false });
      const r = calculateEloChanges({
        player1Elo: 1500, player2Elo: 800, winner: 'player2',
        player1Score: 0, player2Score: 30,
        player1ConsecWins: 0, player1ConsecLosses: 0,
        player2ConsecWins: 0, player2ConsecLosses: 0,
        performanceBonus: bonus,
      });
      expect(r.player1Delta).toBeGreaterThanOrEqual(-32);
    });
  });
});
