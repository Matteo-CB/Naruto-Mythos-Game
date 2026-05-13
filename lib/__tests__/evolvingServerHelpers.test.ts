import { describe, it, expect } from 'vitest';
import {
  buildEvolvingGameConfigExtras,
  getEvolvingEloField,
  getEvolvingEloType,
} from '@/lib/socket/server';

describe('Phase 8 — server helpers (isolated)', () => {
  describe('buildEvolvingGameConfigExtras', () => {
    it('returns empty object for non-Evolving room (backward-compat preserved)', () => {
      expect(buildEvolvingGameConfigExtras({
        isEvolving: false,
        hostEvolvingPoints: 3,
        guestEvolvingPoints: 5,
      })).toEqual({});
    });

    it('returns startingMissionPoints with the correct bonus for Evolving room', () => {
      expect(buildEvolvingGameConfigExtras({
        isEvolving: true,
        hostEvolvingPoints: 3,
        guestEvolvingPoints: 5,
      })).toEqual({
        startingMissionPoints: { player1: 2, player2: 0 },
      });
    });

    it('Marcello example: 3pt host vs 5pt guest → host (player1) gets +2 MP', () => {
      expect(buildEvolvingGameConfigExtras({
        isEvolving: true,
        hostEvolvingPoints: 3,
        guestEvolvingPoints: 5,
      })).toEqual({
        startingMissionPoints: { player1: 2, player2: 0 },
      });
    });

    it('0pt creative vs 5pt full Hero → 0pt player gets +5 MP', () => {
      expect(buildEvolvingGameConfigExtras({
        isEvolving: true,
        hostEvolvingPoints: 0,
        guestEvolvingPoints: 5,
      })).toEqual({
        startingMissionPoints: { player1: 5, player2: 0 },
      });
    });

    it('both 5pt → no bonus', () => {
      expect(buildEvolvingGameConfigExtras({
        isEvolving: true,
        hostEvolvingPoints: 5,
        guestEvolvingPoints: 5,
      })).toEqual({
        startingMissionPoints: { player1: 0, player2: 0 },
      });
    });

    it('handles malformed NaN host/guest points as 0', () => {
      expect(buildEvolvingGameConfigExtras({
        isEvolving: true,
        hostEvolvingPoints: NaN,
        guestEvolvingPoints: 5,
      })).toEqual({
        startingMissionPoints: { player1: 5, player2: 0 },
      });
    });
  });

  describe('getEvolvingEloField', () => {
    it('returns "evolvingElo" when isEvolving', () => {
      expect(getEvolvingEloField(true)).toBe('evolvingElo');
    });

    it('returns "elo" when not isEvolving', () => {
      expect(getEvolvingEloField(false)).toBe('elo');
    });
  });

  describe('getEvolvingEloType', () => {
    it('returns "evolving" when isEvolving', () => {
      expect(getEvolvingEloType(true)).toBe('evolving');
    });

    it('returns "ranked" when not isEvolving', () => {
      expect(getEvolvingEloType(false)).toBe('ranked');
    });
  });
});
