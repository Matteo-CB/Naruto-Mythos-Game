import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCharacterById } from '@/lib/data/cardIndex';
import type { GameState } from '@/lib/engine/types';

const TEMARI = 'SS-049-C';
const ALLY = 'KS-009-C';

function boardWithTemariInHand(): GameState {
  const state = buildSimState({
    missionIds: ['KS-001-MMS', 'KS-006-MMS'],
    hand1: [TEMARI],
    p1: [simChar(ALLY, { owner: 'player1', instanceId: 'ally-1' })],
    p2: [simChar(ALLY, { owner: 'player2', instanceId: 'enemy-1' })],
    chakra1: 20,
  });
  return state;
}

function playTemari(state: GameState): GameState {
  return GameEngine.applyAction(state, 'player1', {
    type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
  });
}

describe('Temari 049 announces her FIRST STRIKE like every other effect', () => {
  it('a window opens before any target picker', () => {
    const played = playTemari(boardWithTemariInHand());

    const prompt = played.pendingActions[0];
    expect(prompt, 'FIRST STRIKE opens a window').toBeTruthy();

    const effect = played.pendingEffects.find((e) => e.id === prompt.sourceEffectId)!;
    expect(effect.targetSelectionType, 'the first window is the announcement').toBe('SS049_CONFIRM_FIRST_STRIKE');
    expect(effect.isOptional, 'an instant effect is never forced').toBe(true);
    expect(prompt.options, 'the window points at Temari herself').toEqual([effect.sourceInstanceId]);
  });

  it('accepting then leads to the character picker, and the move happens', () => {
    const played = playTemari(boardWithTemariInHand());
    const confirm = played.pendingActions[0];

    const confirmed = GameEngine.applyAction(played, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: confirm.id, selectedTargets: [confirm.options[0]],
    });

    const picker = confirmed.pendingActions[0];
    expect(picker, 'the picker comes second').toBeTruthy();
    const pickerEffect = confirmed.pendingEffects.find((e) => e.id === picker.sourceEffectId)!;
    expect(pickerEffect.targetSelectionType).toBe('SS049_FS_CHAR');
    expect(picker.options, 'characters of this mission can be moved').toContain('ally-1');

    let moved = GameEngine.applyAction(confirmed, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: picker.id, selectedTargets: ['ally-1'],
    });

    const destination = moved.pendingActions[0];
    if (destination) {
      moved = GameEngine.applyAction(moved, 'player1', {
        type: 'SELECT_TARGET', pendingActionId: destination.id, selectedTargets: [destination.options[0]],
      });
    }

    expect(
      moved.activeMissions[1].player1Characters.some((c) => c.instanceId === 'ally-1'),
      'the character really changes mission',
    ).toBe(true);
  });

  it('declining the window leaves the board untouched', () => {
    const played = playTemari(boardWithTemariInHand());
    const confirm = played.pendingActions[0];
    const effect = played.pendingEffects.find((e) => e.id === confirm.sourceEffectId)!;

    const declined = GameEngine.applyAction(played, 'player1', {
      type: 'DECLINE_OPTIONAL_EFFECT', pendingEffectId: effect.id,
    });

    expect(declined.pendingActions.length, 'nothing else is asked').toBe(0);
    expect(
      declined.activeMissions[0].player1Characters.some((c) => c.instanceId === 'ally-1'),
      'the ally stayed where it was',
    ).toBe(true);
    expect(
      declined.activeMissions[0].player1Characters.some((c) => c.card.id === TEMARI),
      'and Temari is in play all the same',
    ).toBe(true);
  });

  it('the card really is a FIRST STRIKE card, so the window text matches the card', () => {
    const temari = getCharacterById(TEMARI)!;
    expect((temari.effects ?? []).some((e) => e.type === 'FIRST_STRIKE')).toBe(true);
  });
});
