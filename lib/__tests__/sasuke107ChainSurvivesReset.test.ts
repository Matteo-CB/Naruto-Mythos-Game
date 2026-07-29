import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { resetIdCounter } from '@/lib/engine/utils/id';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { GameState, PlayerID } from '@/lib/engine/types';

const SASUKE_CHIDORI = 'KS-107-R';

function charactersOn(state: GameState, missionIndex: number, player: PlayerID): string[] {
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  return state.activeMissions[missionIndex][side].map((c) => {
    const top = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
    return top.name_fr;
  });
}

function resolveEveryPendingChoice(start: GameState, player: PlayerID, simulateConcurrentGame: boolean): GameState {
  let state = start;
  for (let guard = 0; guard < 40; guard++) {
    const pending = state.pendingActions.find((a) => a.player === player);
    if (!pending) break;

    if (simulateConcurrentGame) resetIdCounter();

    const choice = pending.options?.[0];
    if (choice === undefined) break;

    state = GameEngine.applyAction(state, player, {
      type: 'SELECT_TARGET',
      pendingActionId: pending.id,
      selectedTargets: [choice],
    } as never);
  }
  return state;
}

function boardWithChidoriAndFourAllies(): GameState {
  const state = buildSimState({
    hand1: [SASUKE_CHIDORI],
    p1: [
      simChar('KS-001-C', { owner: 'player1', instanceId: 'ally-a' }),
      simChar('KS-003-C', { owner: 'player1', instanceId: 'ally-b' }),
      simChar('KS-005-C', { owner: 'player1', instanceId: 'ally-c' }),
      simChar('KS-002-UC', { owner: 'player1', instanceId: 'ally-d' }),
    ],
    missions: 3,
    chakra1: 30,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  return state;
}

describe('Sasuke Chidori moves every ally, even if another game restarts the shared counter', () => {
  it('moves all four allies out of the mission when nothing interferes', () => {
    let state = boardWithChidoriAndFourAllies();
    expect(charactersOn(state, 0, 'player1')).toHaveLength(4);

    state = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    } as never);
    state = resolveEveryPendingChoice(state, 'player1', false);

    const left = charactersOn(state, 0, 'player1');
    expect(left, `still on the mission: ${left.join(', ')}`).toEqual(['SASUKE UCHIWA']);
  });

  it('still moves all four when the shared counter is reset mid resolution', () => {
    let state = boardWithChidoriAndFourAllies();

    state = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    } as never);
    state = resolveEveryPendingChoice(state, 'player1', true);

    const left = charactersOn(state, 0, 'player1');
    expect(left, `abandoned on the mission: ${left.join(', ')}`).toEqual(['SASUKE UCHIWA']);
  });
});
