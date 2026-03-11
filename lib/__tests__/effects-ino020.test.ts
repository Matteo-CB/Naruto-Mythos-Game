import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry, getEffectHandler } from '@/lib/effects/EffectRegistry';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { GameState, CharacterInPlay, ActiveMission, CharacterCard, MissionCard, PlayerID } from '@/lib/engine/types';

function mockCard(ov: Partial<CharacterCard> = {}): CharacterCard {
  return { id: 'KS-999-C', cardId: 'KS-999-C', set: 'KS', number: 999, name_fr: 'Test', title_fr: 'Test', rarity: 'C', card_type: 'character', has_visual: true, chakra: 2, power: 2, keywords: [], group: 'Leaf Village', effects: [], ...ov } as CharacterCard;
}

function mockChar(ov: Partial<CharacterInPlay> = {}): CharacterInPlay {
  return { card: ov.card ?? mockCard(), instanceId: ov.instanceId ?? 'c-'+Math.random().toString(36).slice(2,8), isHidden: false, powerTokens: 0, stack: [], controlledBy: ov.controlledBy ?? 'player1', originalOwner: ov.originalOwner ?? 'player1', wasRevealedAtLeastOnce: false, ...ov } as CharacterInPlay;
}

function mockMission(ov: Partial<ActiveMission> = {}): ActiveMission {
  return { card: { id: 'MSS 01', cardId: 'MSS-01', set: 'KS', number: 1, name_fr: 'Test Mission', title_fr: 'M', rarity: 'MMS', card_type: 'mission', has_visual: true, effects: [], chakra: 0, power: 0, keywords: [], group: '', basePoints: 1 } as MissionCard, rank: 'D', basePoints: 1, rankBonus: 1, player1Characters: [], player2Characters: [], wonBy: null, ...ov } as ActiveMission;
}

function makePlayer(ov: Partial<GameState['player1']> = {}) {
  return { id: (ov.id ?? 'player1') as PlayerID, userId: 'u1', isAI: false, deck: [], hand: [], discardPile: [], missionCards: [], chakra: 10, missionPoints: 0, hasPassed: false, charactersInPlay: 0, unusedMission: null, hasMulliganed: false, ...ov };
}

function makeState(ov: Partial<GameState> = {}): GameState {
  return { turn: 2, phase: 'action', activePlayer: 'player1', edgeHolder: 'player1', player1: makePlayer(), player2: makePlayer({ id: 'player2' as PlayerID, userId: 'u2', isAI: true, aiDifficulty: 'easy' }), missionDeck: [], activeMissions: [mockMission(), mockMission({ rank: 'C', rankBonus: 2 })], log: [], pendingEffects: [], pendingActions: [], actionHistory: [], ...ov } as GameState;
}


describe('Ino 020 (UC) - Take Control', () => {
  beforeAll(async () => { await initializeRegistry(); });

  const ino019 = mockCard({ id: 'KS-019-C', number: 19, name_fr: 'INO YAMANAKA', title_fr: 'La fleuriste', chakra: 2, power: 1, effects: [{ type: 'MAIN', description: 'Some effect' }], keywords: ['Team 10'], group: 'Leaf Village' });
  const ino020 = mockCard({ id: 'KS-020-UC', number: 20, name_fr: 'INO YAMANAKA', title_fr: 'Transposition', rarity: 'UC', chakra: 3, power: 0, effects: [{ type: 'MAIN', description: 'Take control of an enemy character with cost 2 or less in this mission.' }, { type: 'UPGRADE', description: 'MAIN effect: Instead, the cost limit is 3 or less.' }], keywords: ['Team 10', 'Jutsu'], group: 'Leaf Village' });

  it('MAIN fresh: costLimit=2, returns CONFIRM popup', () => {
    const e3 = mockChar({ instanceId: 'e3', card: mockCard({ id: 'KS-050-C', name_fr: 'OROCHIMARU', chakra: 3, power: 3 }), controlledBy: 'player2', originalOwner: 'player2' });
    const e2 = mockChar({ instanceId: 'e2', card: mockCard({ id: 'KS-046-C', name_fr: 'EBISU', chakra: 2, power: 1 }), controlledBy: 'player2', originalOwner: 'player2' });
    const ino = mockChar({ instanceId: 'ino1', card: ino020 });
    const state = makeState({ activeMissions: [mockMission({ player1Characters: [ino], player2Characters: [e3, e2] }), mockMission({ rank: 'C', rankBonus: 2 })] });
    const handler = getEffectHandler('KS-020-UC', 'MAIN');
    expect(handler).toBeTruthy();
    const result = handler!({ state, sourcePlayer: 'player1', sourceCard: ino, sourceMissionIndex: 0, triggerType: 'MAIN', isUpgrade: false });
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('INO020_CONFIRM_MAIN');
    expect(result.validTargets).toContain('ino1');
  });

  it('MAIN upgrade: costLimit=3, returns CONFIRM popup', () => {
    const e3 = mockChar({ instanceId: 'e3', card: mockCard({ id: 'KS-050-C', name_fr: 'OROCHIMARU', chakra: 3, power: 3 }), controlledBy: 'player2', originalOwner: 'player2' });
    const ino = mockChar({ instanceId: 'ino1', card: ino020 });
    const state = makeState({ activeMissions: [mockMission({ player1Characters: [ino], player2Characters: [e3] }), mockMission({ rank: 'C', rankBonus: 2 })] });
    const handler = getEffectHandler('KS-020-UC', 'MAIN');
    const result = handler!({ state, sourcePlayer: 'player1', sourceCard: ino, sourceMissionIndex: 0, triggerType: 'MAIN', isUpgrade: true });
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('INO020_CONFIRM_MAIN');
  });

  it('takeControlOfEnemy transfers character', () => {
    const enemy = mockChar({ instanceId: 'et', card: mockCard({ id: 'KS-050-C', name_fr: 'OROCHIMARU', chakra: 3, power: 3 }), controlledBy: 'player2', originalOwner: 'player2' });
    const ino = mockChar({ instanceId: 'ino1', card: ino020 });
    const state = makeState({ activeMissions: [mockMission({ player1Characters: [ino], player2Characters: [enemy] }), mockMission({ rank: 'C', rankBonus: 2 })] });
    const pe = { id: 'pe1', sourcePlayer: 'player1' as PlayerID, sourceCardId: 'KS-020-UC', sourceInstanceId: 'ino1', sourceMissionIndex: 0, effectType: 'MAIN' as const, isUpgrade: true, targetSelectionType: 'TAKE_CONTROL_ENEMY_THIS_MISSION', validTargets: ['et'], effectDescription: 'tc', isOptional: true };
    const ns = EffectEngine.takeControlOfEnemy(state, pe as any, 'et');
    expect(ns.activeMissions[0].player2Characters.some(c => c.instanceId === 'et')).toBe(false);
    expect(ns.activeMissions[0].player1Characters.some(c => c.instanceId === 'et')).toBe(true);
    expect(ns.activeMissions[0].player1Characters.find(c => c.instanceId === 'et')?.controlledBy).toBe('player1');
  });

  it('handler pre-filters same-name targets (returns CONFIRM)', () => {
    const enemyIno = mockChar({ instanceId: 'ei', card: mockCard({ id: 'KS-019-C', name_fr: 'INO YAMANAKA', chakra: 2, power: 1 }), controlledBy: 'player2', originalOwner: 'player2' });
    const enemyOther = mockChar({ instanceId: 'eo', card: mockCard({ id: 'KS-046-C', name_fr: 'EBISU', chakra: 1, power: 1 }), controlledBy: 'player2', originalOwner: 'player2' });
    const myIno = mockChar({ instanceId: 'ino1', card: ino020 });
    const state = makeState({ activeMissions: [mockMission({ player1Characters: [myIno], player2Characters: [enemyIno, enemyOther] }), mockMission({ rank: 'C', rankBonus: 2 })] });
    const handler = getEffectHandler('KS-020-UC', 'MAIN');
    const result = handler!({ state, sourcePlayer: 'player1', sourceCard: myIno, sourceMissionIndex: 0, triggerType: 'MAIN', isUpgrade: true });
    // Now returns CONFIRM popup (pre-filter is re-checked in CONFIRM case)
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('INO020_CONFIRM_MAIN');
  });

  it('full integration: upgrade 019->020, confirm then select cost-3 target', () => {
    const e3 = mockChar({ instanceId: 'e3', card: mockCard({ id: 'KS-050-C', name_fr: 'OROCHIMARU', chakra: 3, power: 3 }), controlledBy: 'player2', originalOwner: 'player2' });
    const i19 = mockChar({ instanceId: 'i19', card: ino019 });
    const state = makeState({
      player1: makePlayer({ hand: [ino020], charactersInPlay: 1 }),
      player2: makePlayer({ id: 'player2' as PlayerID, userId: 'u2', isAI: true, aiDifficulty: 'easy', charactersInPlay: 1 }),
      activeMissions: [mockMission({ player1Characters: [i19], player2Characters: [e3] }), mockMission({ rank: 'C', rankBonus: 2 })],
    });
    const afterUpgrade = GameEngine.applyAction(state, 'player1', { type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'i19' });
    // First pending is the CONFIRM popup
    expect(afterUpgrade.pendingActions.length).toBeGreaterThan(0);
    const confirmPa = afterUpgrade.pendingActions[0];
    expect(confirmPa.player).toBe('player1');
    // Confirm the MAIN effect
    const afterConfirm = GameEngine.applyAction(afterUpgrade, 'player1', { type: 'SELECT_TARGET', pendingActionId: confirmPa.id, selectedTargets: [confirmPa.options[0]] });
    // Now should have the UPGRADE confirm popup (Type A: cost 3 instead of 2)
    expect(afterConfirm.pendingActions.length).toBeGreaterThan(0);
    const upgradePa = afterConfirm.pendingActions[0];
    // Confirm the UPGRADE
    const afterUpgradeConfirm = GameEngine.applyAction(afterConfirm, 'player1', { type: 'SELECT_TARGET', pendingActionId: upgradePa.id, selectedTargets: [upgradePa.options[0]] });
    // Now should have the actual target selection with cost 3 limit
    expect(afterUpgradeConfirm.pendingActions.length).toBeGreaterThan(0);
    const selectPa = afterUpgradeConfirm.pendingActions[0];
    expect(selectPa.options).toContain('e3');
    const afterSelect = GameEngine.applyAction(afterUpgradeConfirm, 'player1', { type: 'SELECT_TARGET', pendingActionId: selectPa.id, selectedTargets: ['e3'] });
    expect(afterSelect.activeMissions[0].player2Characters.some(c => c.instanceId === 'e3')).toBe(false);
    expect(afterSelect.activeMissions[0].player1Characters.some(c => c.instanceId === 'e3')).toBe(true);
  });
});
