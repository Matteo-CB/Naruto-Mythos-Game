import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { GameState, CharacterInPlay, ActiveMission, CharacterCard, MissionCard, PlayerID, PendingEffect, PendingAction } from '@/lib/engine/types';

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
    card: { id: 'MSS-01', cardId: 'MSS-01', set: 'KS', number: 1, name_fr: 'Mission', title_fr: '', rarity: 'MMS', card_type: 'mission', has_visual: true, effects: [], chakra: 0, power: 0, keywords: [], group: '', basePoints: 1 } as MissionCard,
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
    turn: 35, phase: 'action', activePlayer: 'player2', edgeHolder: 'player2',
    player1: makePlayer(),
    player2: makePlayer({ id: 'player2' as PlayerID, userId: 'u2' }),
    missionDeck: [], activeMissions: [mockMission()],
    log: [], pendingEffects: [], pendingActions: [], actionHistory: [],
    ...ov,
  } as GameState;
}

describe('Itachi 140 (KS-140-S) reorder discard targets the right cards', () => {
  beforeAll(async () => { await initializeRegistry(); });

  it('Itachi 140 reorder uses the explicit instance ids it just discarded, not slice(-n)', () => {
    const handCards = Array.from({ length: 6 }, (_, i) => ({
      ...mockCard({ id: `KS-00${i + 1}-C` }),
      instanceId: `hand-${i + 1}`,
    }));
    const preExistingDiscard = [
      { ...mockCard({ id: 'KS-OLD-A' }), instanceId: 'old-a' },
      { ...mockCard({ id: 'KS-OLD-B' }), instanceId: 'old-b' },
    ];
    const deckCards = Array.from({ length: 8 }, (_, i) => ({
      ...mockCard({ id: `KS-NEW-${i + 1}-C` }),
      instanceId: `deck-${i + 1}`,
    }));

    const state = makeState({
      player1: makePlayer({ hand: handCards as never, deck: deckCards as never, discardPile: preExistingDiscard as never }),
    });

    const itachiCard = { ...mockCard({ id: 'KS-140-S' }), instanceId: 'itachi-src' };
    const sourceEffectId = 'pe-confirm';
    const pe: PendingEffect = {
      id: sourceEffectId,
      sourceCardId: 'KS-140-S',
      sourceInstanceId: itachiCard.instanceId,
      sourceMissionIndex: 0,
      effectType: 'MAIN',
      effectDescription: JSON.stringify({ isUpgrade: false }),
      targetSelectionType: 'ITACHI140_CONFIRM_MAIN',
      sourcePlayer: 'player2',
      requiresTargetSelection: true,
      validTargets: [itachiCard.instanceId],
      isOptional: false,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
    } as PendingEffect;
    const pa: PendingAction = {
      id: 'pa-confirm',
      type: 'SELECT_TARGET',
      player: 'player2',
      description: 'Itachi confirm',
      options: [itachiCard.instanceId],
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId,
    } as PendingAction;
    state.pendingEffects = [pe];
    state.pendingActions = [pa];

    const afterConfirm = GameEngine.applyAction(state, 'player2', {
      type: 'SELECT_TARGET',
      pendingActionId: pa.id,
      selectedTargets: [itachiCard.instanceId],
    } as never);

    expect(afterConfirm.player1.hand.length).toBe(6);
    expect(afterConfirm.player1.discardPile.length).toBe(8);

    const reorderEff = afterConfirm.pendingEffects.find((e) => e.targetSelectionType === 'REORDER_DISCARD');
    expect(reorderEff).toBeTruthy();
    expect(reorderEff!.validTargets.length).toBe(6);

    const reorderTargetIds = new Set(reorderEff!.validTargets.map((id) => id.replace(/__dup\d+$/, '')));
    expect(reorderTargetIds.has('old-a')).toBe(false);
    expect(reorderTargetIds.has('old-b')).toBe(false);
    for (let i = 1; i <= 6; i++) {
      expect(reorderTargetIds.has(`hand-${i}`)).toBe(true);
    }
  });

  it('REORDER_DISCARD reorders the targeted cards IN PLACE (keeps non-target cards, incl. a later-defeated card, at their positions)', () => {
    const discard = [
      { ...mockCard({ id: 'OLD-A' }), instanceId: 'old-a' },
      { ...mockCard({ id: 'I-1' }), instanceId: 'i1' },
      { ...mockCard({ id: 'I-2' }), instanceId: 'i2' },
      { ...mockCard({ id: 'OLD-B' }), instanceId: 'old-b' },
      { ...mockCard({ id: 'I-3' }), instanceId: 'i3' },
    ];
    const state = makeState({
      player1: makePlayer({ discardPile: discard as never }),
    });
    const pe: PendingEffect = {
      id: 'reorder-eff',
      sourceCardId: 'REORDER_DISCARD',
      sourceInstanceId: 'reorder-eff',
      sourceMissionIndex: 0,
      effectType: 'MAIN',
      effectDescription: JSON.stringify({ count: 3, discardOwner: 'player1' }),
      targetSelectionType: 'REORDER_DISCARD',
      sourcePlayer: 'player1',
      requiresTargetSelection: true,
      validTargets: ['i1', 'i2', 'i3'],
      isOptional: false,
      isMandatory: true,
      resolved: false,
      isUpgrade: false,
    } as PendingEffect;
    state.pendingEffects = [pe];

    const chosenOrder = JSON.stringify(['i2', 'i1', 'i3']);
    const result = EffectEngine.applyTargetedEffect(state, pe, [chosenOrder]);

    const finalPile = result.player1.discardPile;
    expect(finalPile.length).toBe(5);
    const ids = (finalPile as unknown as Array<{ instanceId: string }>).map((c) => c.instanceId);
    expect(ids).toEqual(['old-a', 'i2', 'i1', 'old-b', 'i3']);
  });
});
