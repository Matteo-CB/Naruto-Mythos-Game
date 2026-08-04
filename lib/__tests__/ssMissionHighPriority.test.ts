import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCharacterById } from '@/lib/data/cardIndex';
import type { GameState } from '@/lib/engine/types';

const BAKI = 'KS-081-C';
const PLAIN = 'KS-009-C';

function deckOfTen() {
  return Array.from({ length: 10 }, () => getCharacterById(PLAIN)!);
}

function board(missionId: string, extra: string[] = []): GameState {
  const state = buildSimState({
    missionIds: [missionId, 'KS-006-MMS'],
    p1: [
      simChar(BAKI, { owner: 'player1', instanceId: 'my-baki', powerTokens: 8 }),
      ...extra.map((id, i) => simChar(id, { owner: 'player1', instanceId: `extra-${i}` })),
    ],
  });
  state.player1.deck = deckOfTen();
  state.player1.hand = [];
  return state;
}

function scoreIt(state: GameState): GameState {
  let scored = GameEngine.transitionToMissionPhase(state);
  for (let step = 0; step < 12 && scored.pendingActions.length > 0; step++) {
    const action = scored.pendingActions[0];
    scored = GameEngine.applyAction(scored, action.player, {
      type: 'SELECT_TARGET', pendingActionId: action.id, selectedTargets: [action.options[0]],
    });
  }
  return scored;
}

describe('High Priority Mission scores the mission twice, SCORE effects included', () => {
  it('a draw SCORE effect really draws twice on that mission', () => {
    const scored = scoreIt(board('SS-004-MMS'));
    expect(scored.pendingActions.length, 'the chain resolves fully').toBe(0);
    expect(scored.player1.hand.length, 'Baki draws once per scoring, so twice').toBe(2);
  });

  it('the same board on an ordinary mission draws only once', () => {
    const scored = scoreIt(board('KS-001-MMS'));
    expect(scored.player1.hand.length, 'a normal mission scores once').toBe(1);
  });

  it('the alternate artwork of the mission behaves identically', () => {
    const scored = scoreIt(board('SS-004_2-MMS'));
    expect(scored.player1.hand.length).toBe(2);
  });

  it('the mission points are doubled too, and counted once per scoring', () => {
    const doubled = scoreIt(board('SS-004-MMS'));
    const mission = doubled.activeMissions[0];
    const printed = (mission.basePoints ?? 0) + (mission.rankBonus ?? 0);
    expect(doubled.player1.missionPoints, 'base plus rank, taken twice').toBe(printed * 2);
  });

  it('several SCORE effects on the mission all fire again in the second pass', () => {
    const state = board('SS-004-MMS', [BAKI]);
    state.activeMissions[0].player1Characters[1] = simChar(BAKI, {
      owner: 'player1', instanceId: 'my-baki-2',
    });

    const scored = scoreIt(state);

    expect(scored.pendingActions.length, 'the whole chain resolves').toBe(0);
    expect(scored.player1.hand.length, 'two Bakis, two scorings, four cards').toBe(4);
  });

  it('the second pass happens once, not endlessly', () => {
    const scored = scoreIt(board('SS-004-MMS'));
    expect(scored.player1.hand.length).toBe(2);
    expect(scored.activeMissions[0].highPriorityPassDone, 'the repeat is spent').toBe(true);
  });

  it('a fresh round lets the mission repeat again', () => {
    const first = scoreIt(board('SS-004-MMS'));
    expect(first.player1.hand.length).toBe(2);

    const nextRound = {
      ...first,
      activeMissions: first.activeMissions.map((m) => ({ ...m, wonBy: null, highPriorityPassDone: false })),
      player1: { ...first.player1, hand: [], deck: deckOfTen() },
    } as GameState;

    const second = scoreIt(nextRound);
    expect(second.player1.hand.length, 'it doubles again next round').toBe(2);
  });
});
