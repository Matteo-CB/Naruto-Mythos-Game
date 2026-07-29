import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { REWIND_TARGET } from '@/lib/effects/EffectEngine';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { GameState, CharacterInPlay, ActiveMission, CharacterCard, MissionCard, PlayerID } from '@/lib/engine/types';

function mockCard(ov: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'KS-999-C', cardId: 'KS-999-C', set: 'KS', number: 999,
    name_fr: 'Test', title_fr: 'Test', rarity: 'C', card_type: 'character',
    has_visual: true, chakra: 2, power: 2, keywords: [], group: 'Leaf Village', effects: [],
    ...ov,
  } as CharacterCard;
}

function mockChar(ov: Partial<CharacterInPlay> = {}): CharacterInPlay {
  return {
    card: ov.card ?? mockCard(),
    instanceId: ov.instanceId ?? 'sakura-1',
    isHidden: false, powerTokens: 0, stack: ov.stack ?? [],
    controlledBy: 'player1', originalOwner: 'player1', wasRevealedAtLeastOnce: false,
    ...ov,
  } as CharacterInPlay;
}

function mockMission(ov: Partial<ActiveMission> = {}): ActiveMission {
  return {
    card: {
      id: 'MSS 01', cardId: 'MSS-01', set: 'KS', number: 1, name_fr: 'Mission', title_fr: '',
      rarity: 'MMS', card_type: 'mission', has_visual: true, effects: [], chakra: 0, power: 0,
      keywords: [], group: '', basePoints: 1,
    } as MissionCard,
    rank: 'D', basePoints: 1, rankBonus: 1,
    player1Characters: [], player2Characters: [], wonBy: null,
    ...ov,
  } as ActiveMission;
}

function makePlayer(ov: Record<string, unknown> = {}) {
  return {
    id: (ov.id ?? 'player1') as PlayerID, userId: 'u1', isAI: false,
    deck: [], hand: [], discardPile: [], missionCards: [],
    chakra: 10, missionPoints: 0, hasPassed: false, charactersInPlay: 0,
    unusedMission: null, hasMulliganed: false,
    ...ov,
  };
}

const SAKURA = mockCard({
  id: 'KS-135-S', number: 135, rarity: 'S',
  name_fr: 'SAKURA HARUNO', title_fr: 'The Leaf Medical Corps',
  chakra: 5, power: 4, keywords: ['Team 7'], group: 'Leaf Village',
  effects: [
    { type: 'MAIN', description: 'Look at the top 3 cards of your deck. Play one character anywhere and discard the other cards.' },
    { type: 'UPGRADE', description: 'MAIN effect: Instead, play the card paying 4 less.' },
  ],
});

const TOP = [
  mockCard({ id: 'KS-201-C', name_fr: 'Top1', chakra: 2 }),
  mockCard({ id: 'KS-202-C', name_fr: 'Top2', chakra: 2 }),
  mockCard({ id: 'KS-203-C', name_fr: 'Top3', chakra: 2 }),
];

function countEverywhere(state: GameState, cardId: string): number {
  let seen = 0;
  for (const side of ['player1', 'player2'] as const) {
    for (const zone of [state[side].deck, state[side].hand, state[side].discardPile]) {
      seen += zone.filter((c) => c.id === cardId).length;
    }
  }
  for (const mission of state.activeMissions) {
    for (const key of ['player1Characters', 'player2Characters'] as const) {
      for (const char of mission[key]) {
        seen += (char.stack?.length ? char.stack : [char.card]).filter((c) => c.id === cardId).length;
      }
    }
  }
  return seen;
}

function openChain(): GameState {
  const state = {
    turn: 2, phase: 'action', activePlayer: 'player1', edgeHolder: 'player1',
    player1: makePlayer({ deck: [...TOP], chakra: 10, charactersInPlay: 1 }),
    player2: makePlayer({ id: 'player2' as PlayerID, userId: 'u2' }),
    missionDeck: [],
    activeMissions: [
      mockMission({ player1Characters: [mockChar({ card: SAKURA, stack: [SAKURA] })] }),
      mockMission({ rank: 'C', rankBonus: 2 }),
    ],
    log: [], pendingActions: [], actionHistory: [],
    pendingEffects: [{
      id: 'eff-1', sourceCardId: 'KS-135-S', sourceInstanceId: 'sakura-1', sourceMissionIndex: 0,
      effectType: 'MAIN', effectDescription: JSON.stringify({ costReduction: 0 }),
      targetSelectionType: 'SAKURA135_CONFIRM_MAIN', sourcePlayer: 'player1',
      requiresTargetSelection: true, validTargets: ['sakura-1'],
      isOptional: false, isMandatory: true, resolved: false, isUpgrade: false,
    }],
  } as unknown as GameState;

  (state as GameState).pendingActions = [{
    id: 'act-1', type: 'SELECT_TARGET', player: 'player1', description: 'Confirm Sakura 135',
    options: ['sakura-1'], minSelections: 1, maxSelections: 1, sourceEffectId: 'eff-1',
  }] as GameState['pendingActions'];

  return GameEngine.applyAction(state, 'player1', {
    type: 'SELECT_TARGET', pendingActionId: 'act-1', selectedTargets: ['sakura-1'],
  });
}

describe('going back in the Sakura effect gives the deck its cards back', () => {
  beforeAll(async () => { await initializeRegistry(); });

  function reachTheStepThatOffersGoingBack(): GameState {
    const opened = openChain();
    const choosing = opened.pendingActions[0];
    return GameEngine.applyAction(opened, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: choosing.id, selectedTargets: ['0'],
    });
  }

  it('the step where the player can go back really offers it', () => {
    const picked = reachTheStepThatOffersGoingBack();
    const effect = picked.pendingEffects.find((e) => e.targetSelectionType === 'REORDER_DISCARD');

    expect(effect, 'the discard order step must be open').toBeDefined();
    expect(effect!.validTargets, 'without this the back button never shows').toContain(REWIND_TARGET);
  });

  it('every revealed card is back exactly once after going back', () => {
    const picked = reachTheStepThatOffersGoingBack();
    const back = GameEngine.applyAction(picked, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: picked.pendingActions[0].id, selectedTargets: [REWIND_TARGET],
    });

    for (const card of TOP) {
      expect(countEverywhere(back, card.id), `${card.name_fr} is neither lost nor duplicated`).toBe(1);
    }
  });

  it('the deck is whole again after going back', () => {
    const picked = reachTheStepThatOffersGoingBack();
    expect(picked.player1.deck.length, 'the three cards left the deck').toBe(0);

    const back = GameEngine.applyAction(picked, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: picked.pendingActions[0].id, selectedTargets: [REWIND_TARGET],
    });

    expect(back.player1.deck.length, 'the three cards are back on top of the deck').toBe(TOP.length);
    expect(back.player1.discardPile.length, 'nothing was discarded on the way').toBe(0);
  });

  it('the rewind point is consumed so it never rides along afterwards', () => {
    const picked = reachTheStepThatOffersGoingBack();
    const back = GameEngine.applyAction(picked, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: picked.pendingActions[0].id, selectedTargets: [REWIND_TARGET],
    });

    expect(back.rewindPoint, 'a whole extra game state must not stay attached').toBeUndefined();
  });
});
