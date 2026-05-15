import { describe, it, expect } from 'vitest';
import { returnCharacterToHand } from '../engine/phases/EndPhase';
import { createActionPhaseState, mockCharacter, mockCharInPlay } from './testHelpers';

describe('Bounce upgraded character — top to hand, under cards to discard (Marcello 2026-05-15 18:28)', () => {
  it('Single-card char bounced: card goes to owner hand, nothing to discard', () => {
    const state = createActionPhaseState({});
    const single = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
      { id: 'KS-094-C', name_fr: 'Gamabunta', chakra: 4, keywords: ['Summon'] },
    );
    state.activeMissions[0].player1Characters = [single];

    const handBefore = state.player1.hand.length;
    const discardBefore = state.player1.discardPile.length;

    const newState = returnCharacterToHand(state, single.instanceId, 'player1');

    expect(newState.player1.hand.length).toBe(handBefore + 1);
    expect(newState.player1.hand[newState.player1.hand.length - 1].id).toBe('KS-094-C');
    expect(newState.player1.discardPile.length).toBe(discardBefore);
    expect(newState.activeMissions[0].player1Characters.length).toBe(0);
  });

  it('Upgraded 2-card stack bounced: top to hand, bottom to discard (both to originalOwner)', () => {
    const state = createActionPhaseState({});
    const bottomCard = mockCharacter({ id: 'KS-014-R', name_fr: 'Sasuke', chakra: 3 });
    const topCard = mockCharacter({ id: 'KS-142-M', name_fr: 'Sasuke', chakra: 5 });
    const stack = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player1',
        missionIndex: 0,
        isHidden: false,
        stack: [bottomCard, topCard],
      },
      topCard,
    );
    state.activeMissions[0].player1Characters = [stack];

    const handBefore = state.player1.hand.length;
    const discardBefore = state.player1.discardPile.length;

    const newState = returnCharacterToHand(state, stack.instanceId, 'player1');

    expect(newState.player1.hand.length).toBe(handBefore + 1);
    expect(newState.player1.hand[newState.player1.hand.length - 1].id).toBe('KS-142-M');

    expect(newState.player1.discardPile.length).toBe(discardBefore + 1);
    expect(newState.player1.discardPile[newState.player1.discardPile.length - 1].id).toBe('KS-014-R');

    expect(newState.activeMissions[0].player1Characters.length).toBe(0);
  });

  it('Upgraded 3-card stack bounced: top to hand, the 2 under cards to discard preserving order', () => {
    const state = createActionPhaseState({});
    const cardA = mockCharacter({ id: 'KS-010-C', name_fr: 'Naruto', chakra: 1 });
    const cardB = mockCharacter({ id: 'KS-051-UC', name_fr: 'Naruto', chakra: 3 });
    const cardC = mockCharacter({ id: 'KS-108-R', name_fr: 'Naruto', chakra: 5 });
    const stack = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player1',
        missionIndex: 0,
        isHidden: false,
        stack: [cardA, cardB, cardC],
      },
      cardC,
    );
    state.activeMissions[0].player1Characters = [stack];

    const newState = returnCharacterToHand(state, stack.instanceId, 'player1');

    expect(newState.player1.hand[newState.player1.hand.length - 1].id).toBe('KS-108-R');

    expect(newState.player1.discardPile.length).toBe(2);
    expect(newState.player1.discardPile[0].id).toBe('KS-010-C');
    expect(newState.player1.discardPile[1].id).toBe('KS-051-UC');
  });

  it('Stolen upgraded stack bounced: top to originalOwner hand, under to originalOwner discard (not controller)', () => {
    const state = createActionPhaseState({});
    const bottomCard = mockCharacter({ id: 'KS-014-R', name_fr: 'Sasuke', chakra: 3 });
    const topCard = mockCharacter({ id: 'KS-142-M', name_fr: 'Sasuke', chakra: 5 });
    const stolenStack = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player2',
        controllerInstanceId: 'inst-ino',
        missionIndex: 0,
        isHidden: false,
        stack: [bottomCard, topCard],
      },
      topCard,
    );
    state.activeMissions[0].player1Characters = [stolenStack];

    const p1HandBefore = state.player1.hand.length;
    const p1DiscardBefore = state.player1.discardPile.length;
    const p2HandBefore = state.player2.hand.length;
    const p2DiscardBefore = state.player2.discardPile.length;

    const newState = returnCharacterToHand(state, stolenStack.instanceId, 'player1');

    expect(newState.player1.hand.length).toBe(p1HandBefore);
    expect(newState.player1.discardPile.length).toBe(p1DiscardBefore);

    expect(newState.player2.hand.length).toBe(p2HandBefore + 1);
    expect(newState.player2.hand[newState.player2.hand.length - 1].id).toBe('KS-142-M');
    expect(newState.player2.discardPile.length).toBe(p2DiscardBefore + 1);
    expect(newState.player2.discardPile[newState.player2.discardPile.length - 1].id).toBe('KS-014-R');
  });

  it('Hidden upgraded stack bounced behaves the same: top to hand, under to discard', () => {
    const state = createActionPhaseState({});
    const bottomCard = mockCharacter({ id: 'KS-014-R', name_fr: 'Sasuke', chakra: 3 });
    const topCard = mockCharacter({ id: 'KS-142-M', name_fr: 'Sasuke', chakra: 5 });
    const hiddenStack = mockCharInPlay(
      {
        controlledBy: 'player1',
        originalOwner: 'player1',
        missionIndex: 0,
        isHidden: true,
        wasRevealedAtLeastOnce: false,
        stack: [bottomCard, topCard],
      },
      topCard,
    );
    state.activeMissions[0].player1Characters = [hiddenStack];

    const newState = returnCharacterToHand(state, hiddenStack.instanceId, 'player1');

    expect(newState.player1.hand[newState.player1.hand.length - 1].id).toBe('KS-142-M');
    expect(newState.player1.discardPile.length).toBe(1);
    expect(newState.player1.discardPile[0].id).toBe('KS-014-R');
  });

  it('Bounce of non-existent instance returns state unchanged', () => {
    const state = createActionPhaseState({});
    const newState = returnCharacterToHand(state, 'ghost-id', 'player1');
    expect(newState.player1.hand.length).toBe(state.player1.hand.length);
    expect(newState.player1.discardPile.length).toBe(state.player1.discardPile.length);
  });
});
