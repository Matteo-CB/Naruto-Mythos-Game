import { describe, it, expect } from 'vitest';
import { expectedScore, calculateNewElo, calculateEloChanges } from '../elo/elo';

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
      expect(newElo).toBe(1000); // Exactly 0.5 expected, 0.5 actual
    });

    it('should use K=32 for players below 2000', () => {
      const newElo = calculateNewElo(1000, 1000, 1.0);
      // K=32, E=0.5, actual=1.0, delta = 32*(1-0.5) = 16
      expect(newElo).toBe(1016);
    });

    it('should use K=16 for players at/above 2000', () => {
      const newElo = calculateNewElo(2000, 2000, 1.0);
      // K=16, E=0.5, actual=1.0, delta = 16*(1-0.5) = 8
      expect(newElo).toBe(2008);
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
  });

  describe('calculateEloChanges', () => {
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
});
