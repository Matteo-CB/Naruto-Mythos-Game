import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { getValidActionsForPlayer } from '@/lib/engine/phases/ActionPhase';
import { getFirstStrikeStatus } from '@/lib/engine/rules/firstStrike';
import { getCardById } from '@/lib/data/cardIndex';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { CharacterCard, GameState } from '@/lib/engine/types';

const TEMARI = 'SS-049-C';

function withTemariInHand(): GameState {
  const state = buildSimState({
    p2: [simChar('KS-005-C', { owner: 'player2', instanceId: 'fs-enemy' })],
    missions: 2,
    chakra1: 30,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  state.activePlayer = 'player1';
  state.player1.hand = [getCardById(TEMARI) as unknown as CharacterCard];
  return state;
}

function movedAway(state: GameState): boolean {
  return state.activeMissions[0].player2Characters.every((c) => c.instanceId !== 'fs-enemy');
}

describe('FIRST STRIKE triggers on the play, never from a prompt', () => {
  it('no action offers First Strike any more', () => {
    const state = withTemariInHand();
    const actions = getValidActionsForPlayer(state, 'player1');
    expect(actions.every((a) => !String(a.type).includes('FIRST_STRIKE'))).toBe(true);
  });

  it('playing it as the first card of the round resolves its effect', () => {
    const state = withTemariInHand();
    expect(getFirstStrikeStatus(state, 'player1')).toBe('available');

    const after = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER',
      cardIndex: 0,
      missionIndex: 0,
      hidden: false,
    });

    expect(after).not.toBe(state);
    const fired = after.pendingEffects.length > 0 || after.pendingActions.length > 0 || movedAway(after);
    expect(fired, 'the First Strike effect must resolve or ask for its target').toBe(true);
    expect(getFirstStrikeStatus(after, 'player1')).toBe('used');
  });

  it('playing any card first closes the window for the round', () => {
    const state = withTemariInHand();
    state.player1.hand = [getCardById('KS-005-C') as unknown as CharacterCard, getCardById(TEMARI) as unknown as CharacterCard];

    const afterFirst = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER',
      cardIndex: 0,
      missionIndex: 1,
      hidden: false,
    });
    expect(getFirstStrikeStatus(afterFirst, 'player1')).toBe('expired');

    const board = afterFirst;
    board.activePlayer = 'player1';
    board.player2.hasPassed = true;

    const afterTemari = GameEngine.applyAction(board, 'player1', {
      type: 'PLAY_CHARACTER',
      cardIndex: 0,
      missionIndex: 0,
      hidden: false,
    });

    expect(getFirstStrikeStatus(afterTemari, 'player1')).toBe('expired');
    expect(afterTemari.pendingEffects.length, 'no First Strike effect may be pending').toBe(0);
    expect(movedAway(afterTemari), 'the enemy must not have been moved').toBe(false);
  });

  it('playing it face down triggers nothing', () => {
    const state = withTemariInHand();

    const after = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_HIDDEN',
      cardIndex: 0,
      missionIndex: 0,
    });

    expect(after.pendingEffects.length).toBe(0);
    expect(movedAway(after)).toBe(false);
    expect(getFirstStrikeStatus(after, 'player1')).toBe('expired');
  });

  it('each player owns their own window', () => {
    const state = withTemariInHand();

    const after = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER',
      cardIndex: 0,
      missionIndex: 0,
      hidden: false,
    });

    expect(getFirstStrikeStatus(after, 'player1')).toBe('used');
    expect(getFirstStrikeStatus(after, 'player2')).toBe('available');
  });
});
