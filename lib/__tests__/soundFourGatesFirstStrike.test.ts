import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { getFirstStrikeStatus } from '@/lib/engine/rules/firstStrike';
import { getCardById } from '@/lib/data/cardIndex';
import { buildSimState } from '@/lib/cards/sim/buildState';
import type { CharacterCard, GameState } from '@/lib/engine/types';

const JIROBO = 'SS-032-C';
const SAKON = 'SS-036-C';

function boardWith(cardId: string): GameState {
  const state = buildSimState({ missions: 2, chakra1: 30, edgeHolder: 'player1' });
  state.phase = 'action';
  state.activePlayer = 'player1';
  state.player1.hand = [getCardById(cardId) as unknown as CharacterCard];
  return state;
}

function play(state: GameState): GameState {
  return GameEngine.applyAction(state, 'player1', {
    type: 'PLAY_CHARACTER',
    cardIndex: 0,
    missionIndex: 0,
    hidden: false,
  });
}

function repondreOui(state: GameState): GameState {
  let courant = state;
  let garde = 0;
  while (courant.pendingActions.length > 0 && garde < 8) {
    const q = courant.pendingActions[0];
    courant = GameEngine.applyAction(courant, q.player, {
      type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [q.options[0]],
    } as never);
    garde += 1;
  }
  return courant;
}

describe('Jirobo SS-032 FIRST STRIKE', () => {
  it('puts 2 power tokens on itself apres confirmation, et le journalise', () => {
    const after = repondreOui(play(boardWith(JIROBO)));

    expect(after.pendingEffects.length).toBe(0);
    expect(after.pendingActions.length).toBe(0);
    expect(getFirstStrikeStatus(after, 'player1')).toBe('used');

    const self = after.activeMissions[0].player1Characters[0];
    expect(self.powerTokens).toBe(2);
    expect(after.log.some((l) => l.messageKey === 'game.log.effect.powerupSelf'
      && l.messageParams?.id === JIROBO && l.messageParams?.amount === 2)).toBe(true);
  });

  it('does nothing when played face down', () => {
    const after = GameEngine.applyAction(boardWith(JIROBO), 'player1', {
      type: 'PLAY_HIDDEN',
      cardIndex: 0,
      missionIndex: 0,
    });

    expect(after.activeMissions[0].player1Characters[0].powerTokens).toBe(0);
  });
});

describe('Sakon SS-036 FIRST STRIKE', () => {
  it('draws one card apres confirmation, et le journalise', () => {
    const state = boardWith(SAKON);
    state.player1.deck = [getCardById('KS-005-C') as unknown as CharacterCard];

    const after = repondreOui(play(state));

    expect(after.pendingEffects.length).toBe(0);
    expect(after.pendingActions.length).toBe(0);
    expect(after.player1.deck.length).toBe(0);
    expect(after.player1.hand.length).toBe(1);
    expect(after.log.some((l) => l.messageKey === 'game.log.effect.draw'
      && l.messageParams?.id === SAKON)).toBe(true);
  });

  it('logs a refusal when the deck is empty', () => {
    const state = boardWith(SAKON);
    state.player1.deck = [];

    const after = repondreOui(play(state));

    expect(after.player1.hand.length).toBe(0);
    expect(after.log.some((l) => l.messageKey === 'game.log.effect.ss036EmptyDeck'
      && l.messageParams?.id === SAKON)).toBe(true);
  });
});
