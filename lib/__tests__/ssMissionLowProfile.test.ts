import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCharacterById } from '@/lib/data/cardIndex';
import type { GameState, PendingAction } from '@/lib/engine/types';

const PLAIN = 'KS-005-C';
const WITH_AMBUSH = 'KS-014-UC';

function lowProfileBoard(hiddenId: string): GameState {
  const state = buildSimState({
    missionIds: ['SS-006-MMS', 'KS-006-MMS'],
    p1: [simChar(hiddenId, { owner: 'player1', instanceId: 'my-hidden', hidden: true })],
    p2: [simChar(PLAIN, { owner: 'player2', instanceId: 'enemy-1' })],
    chakra1: 20,
  });
  state.player2.hand = [getCharacterById(PLAIN)!, getCharacterById('KS-009-C')!];
  return state;
}

function reveal(state: GameState): GameState {
  return GameEngine.applyAction(state, 'player1', {
    type: 'REVEAL_CHARACTER', characterInstanceId: 'my-hidden', missionIndex: 0,
  });
}

function tokensOf(state: GameState, instanceId: string): number {
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (char.instanceId === instanceId) return char.powerTokens;
    }
  }
  return -1;
}

function promptFor(state: GameState, key: string): PendingAction | undefined {
  return state.pendingActions.find((a) => a.descriptionKey === key);
}

const CONFIRM_KEY = 'game.effect.desc.ssMss06ConfirmAmbush';

describe('Keep a Low Profile grants a real AMBUSH, asked like any other', () => {
  it('revealing a plain character asks before giving the tokens', () => {
    const revealed = reveal(lowProfileBoard(PLAIN));

    const prompt = promptFor(revealed, CONFIRM_KEY);
    expect(prompt, 'the granted AMBUSH opens a window').toBeTruthy();
    expect(tokensOf(revealed, 'my-hidden'), 'nothing is granted before the answer').toBe(0);

    const accepted = GameEngine.applyAction(revealed, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: prompt!.id, selectedTargets: ['my-hidden'],
    });
    expect(tokensOf(accepted, 'my-hidden'), 'accepting powers the character up').toBe(2);
  });

  it('declining leaves the character untouched', () => {
    const revealed = reveal(lowProfileBoard(PLAIN));
    const prompt = promptFor(revealed, CONFIRM_KEY)!;
    const effect = revealed.pendingEffects.find((e) => e.id === prompt.sourceEffectId)!;

    const declined = GameEngine.applyAction(revealed, 'player1', {
      type: 'DECLINE_OPTIONAL_EFFECT', pendingEffectId: effect.id,
    });
    expect(tokensOf(declined, 'my-hidden'), 'an optional effect refused gives nothing').toBe(0);
  });

  it('a character with its own ability still gets it, and gets it last', () => {
    const revealed = reveal(lowProfileBoard(WITH_AMBUSH));

    const ownEffect = revealed.pendingActions[0];
    expect(ownEffect, 'the card resolves its own ability first').toBeTruthy();
    expect(ownEffect.descriptionKey).not.toBe(CONFIRM_KEY);
    expect(promptFor(revealed, CONFIRM_KEY), 'the mission does not jump the queue').toBeFalsy();

    let afterOwn = revealed;
    for (let step = 0; step < 6; step++) {
      const next = afterOwn.pendingActions[0];
      if (!next || next.descriptionKey === CONFIRM_KEY) break;
      afterOwn = GameEngine.applyAction(afterOwn, next.player, {
        type: 'SELECT_TARGET', pendingActionId: next.id, selectedTargets: [next.options[0]],
      });
    }

    const missionPrompt = promptFor(afterOwn, CONFIRM_KEY);
    expect(missionPrompt, 'once the card is done, the mission asks').toBeTruthy();

    const accepted = GameEngine.applyAction(afterOwn, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: missionPrompt!.id, selectedTargets: ['my-hidden'],
    });
    expect(tokensOf(accepted, 'my-hidden')).toBe(2);
  });

  it('a mission without Keep a Low Profile never asks', () => {
    const elsewhere = buildSimState({
      missionIds: ['KS-006-MMS', 'SS-006-MMS'],
      p1: [simChar(PLAIN, { owner: 'player1', instanceId: 'my-hidden', hidden: true })],
      chakra1: 20,
    });

    const revealed = reveal(elsewhere);
    expect(promptFor(revealed, CONFIRM_KEY)).toBeFalsy();
    expect(tokensOf(revealed, 'my-hidden')).toBe(0);
  });
});
