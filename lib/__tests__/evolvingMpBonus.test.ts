import { describe, it, expect } from 'vitest';
import { computeEvolvingMpBonus } from '@/lib/evolving/mpBonus';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { GameConfig } from '@/lib/engine/types';

function makeMinimalConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    player1: {
      userId: 'u1',
      isAI: false,
      deck: [],
      missionCards: [],
    } as never,
    player2: {
      userId: 'u2',
      isAI: false,
      deck: [],
      missionCards: [],
    } as never,
    gameMode: 'casual',
    ...overrides,
  } as GameConfig;
}

describe('Phase 6 — computeEvolvingMpBonus', () => {
  it('equal points → no bonus for either player', () => {
    expect(computeEvolvingMpBonus(3, 3)).toEqual({ player1: 0, player2: 0 });
    expect(computeEvolvingMpBonus(0, 0)).toEqual({ player1: 0, player2: 0 });
    expect(computeEvolvingMpBonus(5, 5)).toEqual({ player1: 0, player2: 0 });
  });

  it('3pt vs 5pt → player1 starts with +2 MP', () => {
    expect(computeEvolvingMpBonus(3, 5)).toEqual({ player1: 2, player2: 0 });
  });

  it('0pt vs 5pt → player1 starts with +5 MP', () => {
    expect(computeEvolvingMpBonus(0, 5)).toEqual({ player1: 5, player2: 0 });
  });

  it('5pt vs 3pt → player2 starts with +2 MP', () => {
    expect(computeEvolvingMpBonus(5, 3)).toEqual({ player1: 0, player2: 2 });
  });

  it('5pt vs 0pt → player2 starts with +5 MP', () => {
    expect(computeEvolvingMpBonus(5, 0)).toEqual({ player1: 0, player2: 5 });
  });

  it('1pt vs 4pt → player1 starts with +3 MP', () => {
    expect(computeEvolvingMpBonus(1, 4)).toEqual({ player1: 3, player2: 0 });
  });

  it('handles malformed input (NaN/negative/Infinity) as 0', () => {
    expect(computeEvolvingMpBonus(NaN, 5)).toEqual({ player1: 5, player2: 0 });
    expect(computeEvolvingMpBonus(-1, 5)).toEqual({ player1: 5, player2: 0 });
    expect(computeEvolvingMpBonus(Infinity, 5)).toEqual({ player1: 5, player2: 0 });
    expect(computeEvolvingMpBonus(3, -1)).toEqual({ player1: 0, player2: 3 });
  });

  it('floors non-integer points (defensive)', () => {
    expect(computeEvolvingMpBonus(2.7, 5)).toEqual({ player1: 3, player2: 0 });
  });
});

describe('Phase 6 — GameEngine.createGame + startingMissionPoints', () => {
  it('defaults missionPoints to 0 when startingMissionPoints not provided (backward compat)', () => {
    const state = GameEngine.createGame(makeMinimalConfig());
    expect(state.player1.missionPoints).toBe(0);
    expect(state.player2.missionPoints).toBe(0);
  });

  it('applies startingMissionPoints to player1', () => {
    const state = GameEngine.createGame(makeMinimalConfig({
      startingMissionPoints: { player1: 2, player2: 0 },
    }));
    expect(state.player1.missionPoints).toBe(2);
    expect(state.player2.missionPoints).toBe(0);
  });

  it('applies startingMissionPoints to player2', () => {
    const state = GameEngine.createGame(makeMinimalConfig({
      startingMissionPoints: { player1: 0, player2: 5 },
    }));
    expect(state.player1.missionPoints).toBe(0);
    expect(state.player2.missionPoints).toBe(5);
  });

  it('applies bonus to both players when both have positive values (theoretical, normally only one positive)', () => {
    const state = GameEngine.createGame(makeMinimalConfig({
      startingMissionPoints: { player1: 3, player2: 1 },
    }));
    expect(state.player1.missionPoints).toBe(3);
    expect(state.player2.missionPoints).toBe(1);
  });

  it('clamps negative values to 0 (defensive)', () => {
    const state = GameEngine.createGame(makeMinimalConfig({
      startingMissionPoints: { player1: -3, player2: -5 },
    }));
    expect(state.player1.missionPoints).toBe(0);
    expect(state.player2.missionPoints).toBe(0);
  });

  it('clamps NaN/Infinity to 0', () => {
    const state = GameEngine.createGame(makeMinimalConfig({
      startingMissionPoints: { player1: NaN, player2: Infinity },
    }));
    expect(state.player1.missionPoints).toBe(0);
    expect(state.player2.missionPoints).toBe(0);
  });

  it('floors non-integer bonus (defensive)', () => {
    const state = GameEngine.createGame(makeMinimalConfig({
      startingMissionPoints: { player1: 2.7, player2: 4.9 },
    }));
    expect(state.player1.missionPoints).toBe(2);
    expect(state.player2.missionPoints).toBe(4);
  });
});

describe('Phase 6 — full integration: computeEvolvingMpBonus + createGame', () => {
  it('the 2026-05-12 Marcello example: my deck 3pt vs opp 5pt → I start with 2 MP', () => {
    const bonus = computeEvolvingMpBonus(3, 5);
    const state = GameEngine.createGame(makeMinimalConfig({
      startingMissionPoints: bonus,
    }));
    expect(state.player1.missionPoints).toBe(2);
    expect(state.player2.missionPoints).toBe(0);
  });

  it('0pt creative deck vs full 5pt Hero deck → 0pt player starts with +5 MP', () => {
    const bonus = computeEvolvingMpBonus(0, 5);
    const state = GameEngine.createGame(makeMinimalConfig({
      startingMissionPoints: bonus,
    }));
    expect(state.player1.missionPoints).toBe(5);
    expect(state.player2.missionPoints).toBe(0);
  });

  it('both at 5pt max → no advantage', () => {
    const bonus = computeEvolvingMpBonus(5, 5);
    const state = GameEngine.createGame(makeMinimalConfig({
      startingMissionPoints: bonus,
    }));
    expect(state.player1.missionPoints).toBe(0);
    expect(state.player2.missionPoints).toBe(0);
  });
});
