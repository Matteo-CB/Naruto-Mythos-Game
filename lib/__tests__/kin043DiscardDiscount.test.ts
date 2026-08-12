import { describe, it, expect } from 'vitest';
import { calculateEffectiveCost, hasKin043DiscardDiscount } from '@/lib/engine/rules/ChakraValidation';
import { buildSimState } from '@/lib/cards/sim/buildState';
import { GameEngine } from '@/lib/engine/GameEngine';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

const KIN = 'SS-043-UC';

function emptyBoard(hand1: string[] = []): GameState {
  const state = buildSimState({ missions: 2, chakra1: 30, edgeHolder: 'player1', hand1 });
  state.player2.chakra = 30;
  state.phase = 'action';
  return state;
}

function kinCard(): CharacterCard {
  return getCardById(KIN) as CharacterCard;
}

describe('Kin Tsuchi SS-043 pays 1 less when her controller has a discard pile', () => {
  it('costs the printed price with an empty discard pile', () => {
    const state = emptyBoard();
    const kin = kinCard();
    expect(kin.chakra).toBe(2);
    expect(calculateEffectiveCost(state, 'player1', kin, 0, false)).toBe(2);
  });

  it('costs 1 less as soon as one card sits in the controller discard pile', () => {
    const state = emptyBoard();
    state.player1.discardPile = [kinCard()];
    expect(calculateEffectiveCost(state, 'player1', kinCard(), 0, false)).toBe(1);
  });

  it('reads the discard pile of the player who plays her, not the opponent one', () => {
    const state = emptyBoard();
    state.player2.discardPile = [kinCard()];
    expect(calculateEffectiveCost(state, 'player1', kinCard(), 0, false)).toBe(2);
    expect(calculateEffectiveCost(state, 'player2', kinCard(), 0, false)).toBe(1);
  });

  it('applies on a reveal too, since revealing is playing the character', () => {
    const state = emptyBoard();
    state.player1.discardPile = [kinCard()];
    expect(calculateEffectiveCost(state, 'player1', kinCard(), 0, true)).toBe(1);
  });

  it('never drops below 0 and leaves every other card alone', () => {
    const state = emptyBoard();
    state.player1.discardPile = [kinCard()];
    const other = getCardById('SS-046-UC') as CharacterCard;
    expect(calculateEffectiveCost(state, 'player1', other, 0, false)).toBe(other.chakra);
    const freeCard = { ...kinCard(), chakra: 0 } as CharacterCard;
    expect(calculateEffectiveCost(state, 'player1', freeCard, 0, false)).toBe(0);
  });

  it('the client-side visible state resolves the same discount, so the shown cost matches the paid cost', () => {
    const state = emptyBoard();
    state.player1.discardPile = [kinCard()];
    const visible = GameEngine.getVisibleState(state, 'player1');
    expect(hasKin043DiscardDiscount(visible, 'player1', kinCard())).toBe(true);
    expect(calculateEffectiveCost(visible, 'player1', kinCard(), 0, false)).toBe(1);
    const visibleEmpty = GameEngine.getVisibleState(emptyBoard(), 'player1');
    expect(calculateEffectiveCost(visibleEmpty, 'player1', kinCard(), 0, false)).toBe(2);
  });

  it('the discount survives a call made without a mission context', () => {
    const state = emptyBoard();
    state.player1.discardPile = [kinCard()];
    expect(calculateEffectiveCost(state, 'player1', kinCard(), -1, false)).toBe(1);
  });

  it('the engine really charges 1 Chakra when the discard pile is not empty', () => {
    const state = emptyBoard([KIN]);
    state.player1.chakra = 4;
    state.player1.discardPile = [kinCard()];
    const after = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER',
      cardIndex: 0,
      missionIndex: 0,
      hidden: false,
    });
    expect(after.activeMissions[0].player1Characters.length).toBe(1);
    expect(after.player1.chakra).toBe(3);
  });

  it('the engine charges the full 2 Chakra when the discard pile is empty', () => {
    const state = emptyBoard([KIN]);
    state.player1.chakra = 4;
    const after = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER',
      cardIndex: 0,
      missionIndex: 0,
      hidden: false,
    });
    expect(after.activeMissions[0].player1Characters.length).toBe(1);
    expect(after.player1.chakra).toBe(2);
  });

  it('a hidden play still costs exactly 1, the discount does not make her free', () => {
    const state = emptyBoard([KIN]);
    state.player1.chakra = 4;
    state.player1.discardPile = [kinCard()];
    const after = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_HIDDEN',
      cardIndex: 0,
      missionIndex: 0,
    });
    expect(after.activeMissions[0].player1Characters.length).toBe(1);
    expect(after.activeMissions[0].player1Characters[0].isHidden).toBe(true);
    expect(after.player1.chakra).toBe(3);
  });
});
