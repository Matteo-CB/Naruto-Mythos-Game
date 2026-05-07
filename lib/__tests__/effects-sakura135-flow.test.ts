import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { EffectEngine } from '@/lib/effects/EffectEngine';
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
    instanceId: ov.instanceId ?? 'c-' + Math.random().toString(36).slice(2, 8),
    isHidden: false, powerTokens: 0, stack: ov.stack ?? [],
    controlledBy: ov.controlledBy ?? 'player1',
    originalOwner: ov.originalOwner ?? 'player1',
    wasRevealedAtLeastOnce: false,
    ...ov,
  } as CharacterInPlay;
}

function mockMission(ov: Partial<ActiveMission> = {}): ActiveMission {
  return {
    card: { id: 'MSS 01', cardId: 'MSS-01', set: 'KS', number: 1, name_fr: 'Mission', title_fr: '', rarity: 'MMS', card_type: 'mission', has_visual: true, effects: [], chakra: 0, power: 0, keywords: [], group: '', basePoints: 1 } as MissionCard,
    rank: 'D', basePoints: 1, rankBonus: 1,
    player1Characters: [], player2Characters: [], wonBy: null,
    ...ov,
  } as ActiveMission;
}

function makePlayer(ov: Partial<GameState['player1']> = {}) {
  return {
    id: (ov.id ?? 'player1') as PlayerID, userId: 'u1', isAI: false,
    deck: [], hand: [], discardPile: [], missionCards: [],
    chakra: 10, missionPoints: 0, hasPassed: false, charactersInPlay: 0,
    unusedMission: null, hasMulliganed: false,
    ...ov,
  };
}

function makeState(ov: Partial<GameState> = {}): GameState {
  return {
    turn: 2, phase: 'action', activePlayer: 'player1', edgeHolder: 'player1',
    player1: makePlayer(),
    player2: makePlayer({ id: 'player2' as PlayerID, userId: 'u2' }),
    missionDeck: [], activeMissions: [mockMission(), mockMission({ rank: 'C', rankBonus: 2 })],
    log: [], pendingEffects: [], pendingActions: [], actionHistory: [],
    ...ov,
  } as GameState;
}

describe('Sakura 135 - Bring it Back full flow', () => {
  beforeAll(async () => { await initializeRegistry(); });

  const sakura135 = mockCard({
    id: 'KS-135-S', number: 135, rarity: 'S',
    name_fr: 'SAKURA HARUNO', title_fr: 'The Leaf Medical Corps',
    chakra: 5, power: 4,
    keywords: ['Team 7'], group: 'Leaf Village',
    effects: [
      { type: 'MAIN', description: 'Look at the top 3 cards of your deck. Play one character anywhere and discard the other cards.' },
      { type: 'UPGRADE', description: 'MAIN effect: Instead, play the card paying 4 less.' },
    ],
  });

  it('full flow: CONFIRM_MAIN -> CHOOSE_CARD -> REORDER_DISCARD -> placement, no infinite loop', () => {
    const sakuraInPlay = mockChar({
      instanceId: 'sakura-1', card: sakura135, stack: [sakura135],
    });
    const top1 = mockCard({ id: 'KS-201-C', name_fr: 'Top1', chakra: 2 });
    const top2 = mockCard({ id: 'KS-202-C', name_fr: 'Top2', chakra: 2 });
    const top3 = mockCard({ id: 'KS-203-C', name_fr: 'Top3', chakra: 2 });

    const initialEffectId = 'sakura-confirm-1';
    const initialActionId = 'sakura-confirm-act-1';

    let state = makeState({
      player1: makePlayer({
        deck: [top1, top2, top3], chakra: 10, charactersInPlay: 1,
      }),
      activeMissions: [
        mockMission({ player1Characters: [sakuraInPlay] }),
        mockMission({ rank: 'C', rankBonus: 2 }),
      ],
      pendingEffects: [{
        id: initialEffectId,
        sourceCardId: 'KS-135-S',
        sourceInstanceId: 'sakura-1',
        sourceMissionIndex: 0,
        effectType: 'MAIN',
        effectDescription: JSON.stringify({ costReduction: 0 }),
        targetSelectionType: 'SAKURA135_CONFIRM_MAIN',
        sourcePlayer: 'player1',
        requiresTargetSelection: true,
        validTargets: ['sakura-1'],
        isOptional: false, isMandatory: true, resolved: false, isUpgrade: false,
      }],
      pendingActions: [{
        id: initialActionId,
        type: 'SELECT_TARGET',
        player: 'player1',
        description: 'Confirm Sakura 135',
        options: ['sakura-1'],
        minSelections: 1, maxSelections: 1,
        sourceEffectId: initialEffectId,
      }],
    });

    state = GameEngine.applyAction(state, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: initialActionId, selectedTargets: ['sakura-1'],
    });

    const choosePending = state.pendingEffects.find((e) => e.targetSelectionType === 'SAKURA135_CHOOSE_CARD');
    expect(choosePending).toBeDefined();
    const chooseAction = state.pendingActions.find((a) => a.sourceEffectId === choosePending!.id);
    expect(chooseAction).toBeDefined();

    state = GameEngine.applyAction(state, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: chooseAction!.id, selectedTargets: ['0'],
    });

    const reorderPending = state.pendingEffects.find((e) => e.targetSelectionType === 'REORDER_DISCARD');
    expect(reorderPending).toBeDefined();
    expect(reorderPending!.validTargets!.length).toBe(2);

    const choosePendingStillThere = state.pendingEffects.find((e) => e.targetSelectionType === 'SAKURA135_CHOOSE_CARD');
    expect(choosePendingStillThere).toBeUndefined();

    const reorderAction = state.pendingActions.find((a) => a.sourceEffectId === reorderPending!.id);
    expect(reorderAction).toBeDefined();

    const orderedIds = [reorderPending!.validTargets![0], reorderPending!.validTargets![1]];
    state = GameEngine.applyAction(state, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: reorderAction!.id, selectedTargets: [JSON.stringify(orderedIds)],
    });

    const reorderStillThere = state.pendingEffects.find((e) => e.targetSelectionType === 'REORDER_DISCARD');
    expect(reorderStillThere).toBeUndefined();

    const newReorderCreated = state.pendingEffects.filter((e) => e.targetSelectionType === 'REORDER_DISCARD');
    expect(newReorderCreated.length).toBe(0);

    const missionPending = state.pendingEffects.find((e) => e.targetSelectionType === 'SAKURA135_CHOOSE_MISSION');
    expect(missionPending).toBeDefined();

    const missionAction = state.pendingActions.find((a) => a.sourceEffectId === missionPending!.id);
    expect(missionAction).toBeDefined();

    state = GameEngine.applyAction(state, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: missionAction!.id, selectedTargets: ['0'],
    });

    expect(state.activeMissions[0].player1Characters.length).toBe(2);
    expect(state.player1.discardPile.length).toBe(2);
    expect(state.pendingEffects.length).toBe(0);
    expect(state.pendingActions.length).toBe(0);
  });

  it('engine does not duplicate REORDER_DISCARD pending after submission', () => {
    const sakuraInPlay = mockChar({
      instanceId: 'sakura-2', card: sakura135, stack: [sakura135],
    });
    const t1 = mockCard({ id: 'KS-301-C', name_fr: 'A', chakra: 1 });
    const t2 = mockCard({ id: 'KS-302-C', name_fr: 'B', chakra: 1 });
    const t3 = mockCard({ id: 'KS-303-C', name_fr: 'C', chakra: 1 });

    let state = makeState({
      player1: makePlayer({ deck: [t1, t2, t3], chakra: 5, charactersInPlay: 1 }),
      activeMissions: [
        mockMission({ player1Characters: [sakuraInPlay] }),
      ],
      pendingEffects: [{
        id: 'pe-1',
        sourceCardId: 'KS-135-S',
        sourceInstanceId: 'sakura-2',
        sourceMissionIndex: 0,
        effectType: 'MAIN',
        effectDescription: JSON.stringify({ costReduction: 0 }),
        targetSelectionType: 'SAKURA135_CONFIRM_MAIN',
        sourcePlayer: 'player1',
        requiresTargetSelection: true,
        validTargets: ['sakura-2'],
        isOptional: false, isMandatory: true, resolved: false, isUpgrade: false,
      }],
      pendingActions: [{
        id: 'pa-1',
        type: 'SELECT_TARGET', player: 'player1',
        description: 'Confirm', options: ['sakura-2'],
        minSelections: 1, maxSelections: 1, sourceEffectId: 'pe-1',
      }],
    });

    state = GameEngine.applyAction(state, 'player1', { type: 'SELECT_TARGET', pendingActionId: 'pa-1', selectedTargets: ['sakura-2'] });
    const cp = state.pendingEffects.find((e) => e.targetSelectionType === 'SAKURA135_CHOOSE_CARD')!;
    const cpa = state.pendingActions.find((a) => a.sourceEffectId === cp.id)!;
    state = GameEngine.applyAction(state, 'player1', { type: 'SELECT_TARGET', pendingActionId: cpa.id, selectedTargets: ['0'] });

    const rp = state.pendingEffects.find((e) => e.targetSelectionType === 'REORDER_DISCARD')!;
    const rpa = state.pendingActions.find((a) => a.sourceEffectId === rp.id)!;
    const orderedIds = [rp.validTargets![0], rp.validTargets![1]];
    state = GameEngine.applyAction(state, 'player1', { type: 'SELECT_TARGET', pendingActionId: rpa.id, selectedTargets: [JSON.stringify(orderedIds)] });

    expect(state.pendingEffects.filter((e) => e.targetSelectionType === 'REORDER_DISCARD').length).toBe(0);
    expect(state.pendingDiscardReorder).toBeUndefined();
  });
});
