import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getFirstStrikeStatus, resetFirstStrikeForRound } from '@/lib/engine/rules/firstStrike';
import type { GameState, PlayerID } from '@/lib/engine/types';

const TEMARI = 'SS-049-C';

function boardWithStriker(): GameState {
  const state = buildSimState({
    p1: [
      simChar(TEMARI, { owner: 'player1', instanceId: 'striker' }),
      simChar('KS-009-C', { owner: 'player1', instanceId: 'ally' }),
    ],
    p2: [simChar('KS-005-C', { owner: 'player2', instanceId: 'enemy' })],
    missions: 2,
    chakra1: 20,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  return state;
}

function missionOf(state: GameState, instanceId: string): number {
  return state.activeMissions.findIndex((m) =>
    m.player1Characters.some((c) => c.instanceId === instanceId));
}

function strike(state: GameState): GameState {
  let current = GameEngine.applyAction(state, 'player1', {
    type: 'USE_FIRST_STRIKE', characterInstanceId: 'striker',
  });
  let guard = 0;
  while (current.pendingActions.length > 0 && guard++ < 20) {
    const pending = current.pendingActions[0];
    const options = pending.options ?? [];
    if (options.length === 0) break;
    current = GameEngine.applyAction(current, pending.player as PlayerID, {
      type: 'SELECT_TARGET', pendingActionId: pending.id, selectedTargets: [options[0]],
    });
  }
  return current;
}

function strikeCount(state: GameState): number {
  return state.log.filter((l) => (l as { action?: string }).action === 'USE_FIRST_STRIKE').length;
}

describe('FIRST STRIKE is a real action, not something that happens when the card is played', () => {
  it('striking announces itself and resolves the effect', () => {
    const before = boardWithStriker();
    const after = strike(before);

    expect(strikeCount(after), 'the strike is announced in the log').toBe(1);
    expect(missionOf(after, 'striker'), 'Temari moved herself out of her mission')
      .not.toBe(missionOf(before, 'striker'));
  });

  it('a second strike in the same round is refused', () => {
    const first = strike(boardWithStriker());
    const second = GameEngine.applyAction(first, 'player1', {
      type: 'USE_FIRST_STRIKE', characterInstanceId: 'striker',
    });
    expect(strikeCount(second), 'only one strike per player per round').toBe(1);
  });

  it('a new round reopens the window', () => {
    const used = strike(boardWithStriker());
    expect(getFirstStrikeStatus(resetFirstStrikeForRound(used), 'player1'),
      'each round grants a new strike').toBe('available');
  });

  it('playing the striker no longer fires the strike by itself', () => {
    const state = buildSimState({
      hand1: [TEMARI],
      p1: [simChar('KS-009-C', { owner: 'player1', instanceId: 'ally' })],
      missions: 2,
      chakra1: 20,
      edgeHolder: 'player1',
    });
    state.phase = 'action';

    const after = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    });

    expect(after.log.some((l) => (l as { action?: string }).action === 'EFFECT_MOVE'),
      'the strike only happens when the player chooses to strike').toBe(false);
  });
});
