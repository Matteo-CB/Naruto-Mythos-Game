import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import type { GameState, CharacterInPlay, ActiveMission, CharacterCard, MissionCard, PlayerID, PendingEffect } from '@/lib/engine/types';

function mockCard(ov: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'KS-999-C', cardId: 'KS-999-C', set: 'KS', number: 999,
    name_fr: 'Test', name_en: 'Test', title_fr: 'Test', title_en: 'Test',
    rarity: 'C', card_type: 'character',
    has_visual: true, chakra: 2, power: 2, keywords: [], group: 'Leaf Village', effects: [],
    ...ov,
  } as CharacterCard;
}

function mockChar(ov: Partial<CharacterInPlay> = {}): CharacterInPlay {
  const card = ov.card ?? mockCard();
  return {
    card,
    instanceId: ov.instanceId ?? 'c-' + Math.random().toString(36).slice(2, 8),
    isHidden: false, powerTokens: 0, stack: ov.stack ?? [card],
    controlledBy: ov.controlledBy ?? 'player1',
    originalOwner: ov.originalOwner ?? 'player1',
    wasRevealedAtLeastOnce: false,
    ...ov,
  } as CharacterInPlay;
}

function mockMission(ov: Partial<ActiveMission> = {}): ActiveMission {
  return {
    card: { id: 'MSS-01', cardId: 'MSS-01', set: 'KS', number: 1, name_fr: 'Mission', name_en: 'Mission', title_fr: '', title_en: '', rarity: 'MMS', card_type: 'mission', has_visual: true, effects: [], chakra: 0, power: 0, keywords: [], group: '', basePoints: 1 } as MissionCard,
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
    missionDeck: [], activeMissions: [mockMission()],
    log: [], pendingEffects: [], pendingActions: [], actionHistory: [],
    ...ov,
  } as GameState;
}




describe('MSS-05 Bring it Back: single non-stacked Gaara goes to hand, never discard', () => {
  beforeAll(async () => { await initializeRegistry(); });

  it('lone Gaara (stack length = 1) returns to owner hand, nothing added to discard', () => {
    const gaaraCard: CharacterCard = mockCard({ id: 'KS-029-C', number: 29, name_fr: 'GAARA', name_en: 'GAARA' });
    const gaaraInPlay = mockChar({
      card: gaaraCard, instanceId: 'gaara-1', stack: [gaaraCard],
      controlledBy: 'player2', originalOwner: 'player2',
    });

    const state = makeState({
      player2: makePlayer({ id: 'player2' as PlayerID, userId: 'u2', charactersInPlay: 1 }),
      activeMissions: [mockMission({ player2Characters: [gaaraInPlay] })],
    });
    state.player1.discardPile = [];
    state.player2.discardPile = [];

    const pe: PendingEffect = {
      id: 'pe-mss05',
      sourceCardId: 'KS-005-MMS',
      sourceInstanceId: 'mss05-src',
      sourceMissionIndex: 0,
      effectType: 'SCORE',
      effectDescription: 'MSS 05',
      targetSelectionType: 'MSS05_RETURN_TO_HAND',
      sourcePlayer: 'player2',
      requiresTargetSelection: true,
      validTargets: ['gaara-1'],
      isOptional: false,
      isMandatory: true,
      resolved: false,
      isUpgrade: false,
    } as PendingEffect;
    state.pendingEffects = [pe];

    const result = EffectEngine.applyTargetedEffect(state, pe, ['gaara-1']);

    expect(result.player2.hand.length).toBe(1);
    expect((result.player2.hand[0] as { id: string }).id).toBe('KS-029-C');
    expect(result.player2.discardPile.length).toBe(0);
    expect(result.activeMissions[0].player2Characters.length).toBe(0);
    expect(result.player1.discardPile.length).toBe(0);
    expect(result.player1.hand.length).toBe(0);
  });

  it('stacked Gaara (upgrade on top) returns TOP to hand and UNDER cards to discard (V2 rule)', () => {
    const baseGaara: CharacterCard = mockCard({ id: 'KS-029-C', number: 29, name_fr: 'GAARA', name_en: 'GAARA', chakra: 3 });
    const upgradeGaara: CharacterCard = mockCard({ id: 'KS-090-C', number: 90, name_fr: 'GAARA', name_en: 'GAARA', chakra: 5 });
    const stacked = mockChar({
      card: upgradeGaara, instanceId: 'gaara-stack', stack: [baseGaara, upgradeGaara],
      controlledBy: 'player2', originalOwner: 'player2',
    });
    const state = makeState({
      activeMissions: [mockMission({ player2Characters: [stacked] })],
    });

    const pe: PendingEffect = {
      id: 'pe-mss05-2',
      sourceCardId: 'KS-005-MMS',
      sourceInstanceId: 'mss05-src',
      sourceMissionIndex: 0,
      effectType: 'SCORE',
      effectDescription: 'MSS 05',
      targetSelectionType: 'MSS05_RETURN_TO_HAND',
      sourcePlayer: 'player2',
      requiresTargetSelection: true,
      validTargets: ['gaara-stack'],
      isOptional: false,
      isMandatory: true,
      resolved: false,
      isUpgrade: false,
    } as PendingEffect;
    state.pendingEffects = [pe];

    const result = EffectEngine.applyTargetedEffect(state, pe, ['gaara-stack']);

    expect(result.player2.hand.length).toBe(1);
    expect((result.player2.hand[0] as { id: string }).id).toBe('KS-090-C');
    expect(result.player2.discardPile.length).toBe(1);
    expect((result.player2.discardPile[0] as { id: string }).id).toBe('KS-029-C');
  });

  it('Orochimaru 051 on lost mission with NO other mission to escape stays on the mission, never goes to hand', async () => {
    const { executeMissionPhase } = await import('@/lib/engine/phases/MissionPhase');
    const orochiCard: CharacterCard = mockCard({
      id: 'KS-051-UC', number: 51, name_fr: 'OROCHIMARU', name_en: 'OROCHIMARU',
      chakra: 5, power: 5, rarity: 'UC',
      effects: [{
        type: 'MAIN',
        description: '[⧗] If you lost this mission during the Mission Evaluation phase, move this character to another mission.',
        description_fr: '',
      }] as never,
    });
    const orochi = mockChar({
      card: orochiCard, instanceId: 'orochi-1', stack: [orochiCard],
      controlledBy: 'player1', originalOwner: 'player1',
    });
    const winnerChar: CharacterCard = mockCard({ id: 'KS-200-C', number: 200, name_fr: 'WINNER', name_en: 'WINNER', power: 10 });
    const winnerInPlay = mockChar({
      card: winnerChar, instanceId: 'winner-c', stack: [winnerChar],
      controlledBy: 'player2', originalOwner: 'player2',
    });

    const state = makeState({
      turn: 2, phase: 'mission',
      activeMissions: [mockMission({
        player1Characters: [orochi],
        player2Characters: [winnerInPlay],
      })],
      missionScoringProgress: { currentRankIndex: 0, missionCardScoreDone: false, processedCharacterIds: [], winner: null } as never,
    });

    const after = executeMissionPhase(state);

    let stillOnMission = false;
    for (const m of after.activeMissions) {
      if (m.player1Characters.find((c) => c.instanceId === 'orochi-1')) stillOnMission = true;
    }
    expect(stillOnMission).toBe(true);
    expect(after.player1.hand.length).toBe(0);
    expect(after.player1.discardPile.length).toBe(0);
  });

  it('FULL FLOW: loser has stacked Gaara, winner wins MSS-05 mission, loser Gaara stays UNTOUCHED', async () => {
    const { executeMissionPhase } = await import('@/lib/engine/phases/MissionPhase');

    const gaaraBase: CharacterCard = mockCard({ id: 'KS-029-C', number: 29, name_fr: 'GAARA', name_en: 'GAARA', chakra: 3, power: 3 });
    const gaaraTop: CharacterCard = mockCard({ id: 'KS-090-R', number: 90, name_fr: 'GAARA', name_en: 'GAARA', chakra: 5, power: 6 });
    const loserStackedGaara = mockChar({
      card: gaaraTop, instanceId: 'loser-gaara-stack', stack: [gaaraBase, gaaraTop],
      controlledBy: 'player1', originalOwner: 'player1',
    });

    const winnerChar: CharacterCard = mockCard({ id: 'KS-200-C', number: 200, name_fr: 'STRONG', name_en: 'STRONG', power: 20 });
    const winnerCharInPlay = mockChar({
      card: winnerChar, instanceId: 'winner-c', stack: [winnerChar],
      controlledBy: 'player2', originalOwner: 'player2',
    });

    const mss05Mission = mockMission({
      card: { id: 'KS-005-MMS', cardId: 'KS-005-MMS', set: 'KS', number: 5, name_fr: 'Ramener', name_en: 'Bring it Back', title_fr: '', title_en: '', rarity: 'MMS', card_type: 'mission', has_visual: true, effects: [{ type: 'SCORE', description: 'Return a friendly char to hand', description_fr: '' }] as never, chakra: 0, power: 0, keywords: [], group: '', basePoints: 1 } as MissionCard,
      rank: 'D', basePoints: 1, rankBonus: 1,
      player1Characters: [loserStackedGaara],
      player2Characters: [winnerCharInPlay],
      wonBy: null,
    });

    const state = makeState({
      turn: 2, phase: 'mission',
      activeMissions: [mss05Mission],
      missionScoringProgress: { currentRankIndex: 0, missionCardScoreDone: false, processedCharacterIds: [], winner: null } as never,
    });
    state.player1.discardPile = [];
    state.player1.hand = [];
    state.player2.discardPile = [];
    state.player2.hand = [];

    const after = executeMissionPhase(state);

    const gaaraStillOnMission = after.activeMissions[0].player1Characters.find((c) => c.instanceId === 'loser-gaara-stack');
    expect(gaaraStillOnMission).toBeTruthy();
    expect(gaaraStillOnMission!.stack.length).toBe(2);
    expect(after.player1.discardPile.length).toBe(0);
    expect(after.player1.hand.length).toBe(0);
  });

  it('LOSER side Gaara is never affected by MSS-05 SCORE of WINNER (no targeting leakage)', () => {
    const loserGaara: CharacterCard = mockCard({ id: 'KS-029-C', number: 29, name_fr: 'GAARA', name_en: 'GAARA' });
    const loserGaaraInPlay = mockChar({
      card: loserGaara, instanceId: 'loser-gaara', stack: [loserGaara],
      controlledBy: 'player1', originalOwner: 'player1',
    });
    const winnerChar: CharacterCard = mockCard({ id: 'KS-100-C', number: 100, name_fr: 'WINNER_CHAR', name_en: 'WINNER_CHAR' });
    const winnerCharInPlay = mockChar({
      card: winnerChar, instanceId: 'winner-c', stack: [winnerChar],
      controlledBy: 'player2', originalOwner: 'player2',
    });

    const state = makeState({
      activeMissions: [mockMission({
        player1Characters: [loserGaaraInPlay],
        player2Characters: [winnerCharInPlay],
      })],
    });

    const pe: PendingEffect = {
      id: 'pe-mss05-3',
      sourceCardId: 'KS-005-MMS',
      sourceInstanceId: 'mss05-src',
      sourceMissionIndex: 0,
      effectType: 'SCORE',
      effectDescription: 'MSS 05',
      targetSelectionType: 'MSS05_RETURN_TO_HAND',
      sourcePlayer: 'player2',
      requiresTargetSelection: true,
      validTargets: ['winner-c'],
      isOptional: false,
      isMandatory: true,
      resolved: false,
      isUpgrade: false,
    } as PendingEffect;
    state.pendingEffects = [pe];

    const result = EffectEngine.applyTargetedEffect(state, pe, ['winner-c']);

    expect(result.activeMissions[0].player1Characters.length).toBe(1);
    expect(result.activeMissions[0].player1Characters[0].instanceId).toBe('loser-gaara');
    expect(result.player1.hand.length).toBe(0);
    expect(result.player1.discardPile.length).toBe(0);

    expect(result.player2.hand.length).toBe(1);
    expect((result.player2.hand[0] as { id: string }).id).toBe('KS-100-C');
    expect(result.player2.discardPile.length).toBe(0);
  });
});
