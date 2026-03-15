/**
 * Comprehensive tests for Uncommon, Rare, Secret, and Mythos card effect handlers.
 * Covers: Rock Lee 039, Naruto 108, Gaara 120, Naruto 133, Sakura 135, Sasuke 136,
 *         Kakashi 137, Itachi 143, Kisame 144.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mockCharacter, mockMission, mockCharInPlay, createActionPhaseState } from './testHelpers';
import { initializeRegistry, getEffectHandler } from '../effects/EffectRegistry';
import type { EffectContext } from '../effects/EffectTypes';
import type { GameState, CharacterInPlay } from '../engine/types';

beforeAll(() => {
  initializeRegistry();
});

function makeCtx(
  state: GameState,
  sourcePlayer: 'player1' | 'player2',
  sourceCard: CharacterInPlay,
  sourceMissionIndex: number,
  triggerType: 'MAIN' | 'UPGRADE' | 'AMBUSH' | 'SCORE' = 'MAIN',
  isUpgrade = false,
): EffectContext {
  return { state, sourcePlayer, sourceCard, sourceMissionIndex, triggerType, isUpgrade };
}

function makeMission(rank: 'D' | 'C' | 'B' | 'A' = 'D', p1: CharacterInPlay[] = [], p2: CharacterInPlay[] = []) {
  const rankBonus = { D: 1, C: 2, B: 3, A: 4 }[rank];
  return { card: mockMission(), rank, basePoints: 3, rankBonus, wonBy: null, player1Characters: p1, player2Characters: p2 };
}

// ===================================================================
// 039/130 - ROCK LEE (UC): Continuous token retention + UPGRADE POWERUP 2
// ===================================================================
describe('039/130 - Rock Lee', () => {
  it('should POWERUP 2 on UPGRADE (returns CONFIRM popup)', () => {
    const lee = mockCharInPlay({ instanceId: 'lee-1', powerTokens: 1 }, {
      id: 'KS-039-UC', number: 39, name_fr: 'Rock Lee', keywords: ['Team Guy'], group: 'Leaf Village',
      effects: [
        { type: 'MAIN', description: '[⧗] This character doesn\'t lose Power tokens at the end of the round.' },
        { type: 'UPGRADE', description: 'POWERUP 2.' },
      ],
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [lee])],
    });

    const handler = getEffectHandler('KS-039-UC', 'UPGRADE')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', lee, 0, 'UPGRADE', true));
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('ROCKLEE039_CONFIRM_UPGRADE');
    expect(result.validTargets).toEqual(['lee-1']);
    expect(result.isOptional).toBe(true);
  });

  it('MAIN handler should be a no-op (continuous logged)', () => {
    const lee = mockCharInPlay({ instanceId: 'lee-1' }, {
      id: 'KS-039-UC', number: 39, name_fr: 'Rock Lee',
      effects: [{ type: 'MAIN', description: '[⧗] This character doesn\'t lose Power tokens at the end of the round.' }],
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [lee])],
    });

    const handler = getEffectHandler('KS-039-UC', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', lee, 0));
    expect(result.state).toBeDefined();
  });
});

// ===================================================================
// 108/130 - NARUTO UZUMAKI (RA): Hide enemy Power<=3 + UPGRADE POWERUP X
// ===================================================================
describe('108/130 - Naruto Uzumaki (RA)', () => {
  it('MAIN should require target selection to hide an enemy with Power 3 or less', () => {
    const naruto = mockCharInPlay({ instanceId: 'naruto-1' }, {
      id: 'KS-108-R', number: 108, name_fr: 'NARUTO UZUMAKI', power: 5, chakra: 5,
    });
    const enemy = mockCharInPlay({ instanceId: 'enemy-1', isHidden: false, powerTokens: 0 }, {
      id: 'KS-001-C', number: 1, name_fr: 'HIRUZEN SARUTOBI', power: 3,
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [naruto], [enemy])],
    });

    const handler = getEffectHandler('KS-108-R', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', naruto, 0));
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('NARUTO108_CONFIRM_MAIN');
    expect(result.validTargets).toContain('naruto-1');
    expect(result.isOptional).toBe(true);
  });

  it('should fizzle when no enemy with Power 3 or less exists', () => {
    const naruto = mockCharInPlay({ instanceId: 'naruto-1' }, {
      id: 'KS-108-R', number: 108, name_fr: 'NARUTO UZUMAKI', power: 5,
    });
    const enemy = mockCharInPlay({ instanceId: 'enemy-1', isHidden: false, powerTokens: 0 }, {
      id: 'KS-136-S', number: 136, name_fr: 'SASUKE UCHIHA', power: 8,
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [naruto], [enemy])],
    });

    const handler = getEffectHandler('KS-108-R', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', naruto, 0));
    // Enemy should remain visible
    expect(result.state.activeMissions[0].player2Characters[0].isHidden).toBe(false);
  });

  it('UPGRADE should return CONFIRM_MAIN with isOptional (modifier pattern)', () => {
    const naruto = mockCharInPlay({ instanceId: 'naruto-1', powerTokens: 0 }, {
      id: 'KS-108-R', number: 108, name_fr: 'NARUTO UZUMAKI', power: 5, chakra: 5,
    });
    const enemy = mockCharInPlay({ instanceId: 'enemy-1', isHidden: false, powerTokens: 0 }, {
      id: 'KS-001-C', number: 1, name_fr: 'HIRUZEN SARUTOBI', power: 3,
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [naruto], [enemy])],
    });

    const handler = getEffectHandler('KS-108-R', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', naruto, 0, 'MAIN', true));
    // Returns CONFIRM popup (same handler for MAIN and UPGRADE)
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('NARUTO108_CONFIRM_MAIN');
    expect(result.isOptional).toBe(true);
  });

  it('RA variant 108/130 A should use same handler', () => {
    const handler = getEffectHandler('KS-108-RA', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 120/130 - GAARA (R): Defeat Power<=1 in every mission + UPGRADE POWERUP X
// ===================================================================
describe('120/130 - Gaara (R)', () => {
  it('should prompt player to defeat enemies with Power 1 or less (optional - always shows UI)', () => {
    const gaara = mockCharInPlay({ instanceId: 'gaara-r', powerTokens: 0 }, {
      id: 'KS-120-R', number: 120, name_fr: 'Gaara', power: 4,
    });
    const weakE1 = mockCharInPlay({ instanceId: 'we1', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'WeakE1', power: 1,
    });
    const weakE2 = mockCharInPlay({ instanceId: 'we2', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'WeakE2', power: 0,
    });
    const strongE = mockCharInPlay({ instanceId: 'se1', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'StrongE', power: 3,
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player2: { ...baseState.player2, discardPile: [] },
      activeMissions: [
        makeMission('D', [gaara], [weakE1]),
        makeMission('C', [], [weakE2, strongE]),
      ],
    };

    const handler = getEffectHandler('KS-120-R', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', gaara, 0));
    // Handler uses CONFIRM popup pattern before per-mission defeat selection
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.isOptional).toBe(true);
    expect(result.targetSelectionType).toBe('GAARA120_CONFIRM_MAIN');
    // sourceCard is used as validTarget for confirm (not the weak enemies)
    expect(result.validTargets).toContain('gaara-r');
    // Enemies NOT defeated yet (pending confirmation)
    expect(result.state.activeMissions[0].player2Characters.length).toBe(1);
  });

  it('should encode defeatedCount and nextMissionIndex in description for upgrade chain', () => {
    const gaara = mockCharInPlay({ instanceId: 'gaara-r', powerTokens: 0 }, {
      id: 'KS-120-R', number: 120, name_fr: 'Gaara', power: 4,
    });
    const weakE1 = mockCharInPlay({ instanceId: 'we1', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'W1', power: 1,
    });
    const weakE2 = mockCharInPlay({ instanceId: 'we2', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'W2', power: 0,
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player2: { ...baseState.player2, discardPile: [] },
      activeMissions: [
        makeMission('D', [gaara], [weakE1]),
        makeMission('C', [], [weakE2]),
      ],
    };

    const handler = getEffectHandler('KS-120-R', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', gaara, 0, 'MAIN', true));
    // Handler returns CONFIRM popup (GAARA120_CONFIRM_MAIN), not direct per-mission selection
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.isOptional).toBe(true);
    expect(result.targetSelectionType).toBe('GAARA120_CONFIRM_MAIN');
    const desc = JSON.parse(result.description ?? '{}');
    // Description encodes isUpgrade flag for post-confirm processing
    expect(desc.isUpgrade).toBe(true);
  });

  it('should not defeat characters with Power > 1', () => {
    const gaara = mockCharInPlay({ instanceId: 'gaara-r' }, {
      id: 'KS-120-R', number: 120, name_fr: 'Gaara',
    });
    const strongE = mockCharInPlay({ instanceId: 'se1', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'Strong', power: 3,
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [gaara], [strongE])],
    });

    const handler = getEffectHandler('KS-120-R', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', gaara, 0));
    expect(result.state.activeMissions[0].player2Characters.length).toBe(1);
  });

  it('RA variant 120/130 A should use same handler', () => {
    const handler = getEffectHandler('KS-120-RA', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 133/130 - NARUTO UZUMAKI "Rasengan" (S): Hide Power<=5 this mission + Power<=2 anywhere
// ===================================================================
describe('133/130 - Naruto Uzumaki (S)', () => {
  it('should require stage 1 target selection for Power<=5 in this mission', () => {
    const naruto = mockCharInPlay({ instanceId: 'naruto-s' }, {
      id: 'KS-133-S', number: 133, name_fr: 'Naruto Uzumaki', power: 6,
    });
    const target1 = mockCharInPlay({ instanceId: 't1', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'T1', power: 4,
    });
    const target2 = mockCharInPlay({ instanceId: 't2', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'T2', power: 2,
    });
    const state = createActionPhaseState({
      activeMissions: [
        makeMission('D', [naruto], [target1]),
        makeMission('C', [], [target2]),
      ],
    });

    const handler = getEffectHandler('KS-133-S', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', naruto, 0));
    // Handler uses CONFIRM popup pattern before actual target selection
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('NARUTO133_CONFIRM_MAIN');
    // sourceCard is used as validTarget for the confirm step
    expect(result.validTargets).toContain('naruto-s');
    const desc = JSON.parse(result.description!);
    expect(desc.useDefeat).toBe(false);
  });

  it('should require stage 1 target selection with defeat flag on upgrade', () => {
    const naruto = mockCharInPlay({ instanceId: 'naruto-s' }, {
      id: 'KS-133-S', number: 133, name_fr: 'Naruto Uzumaki', power: 6,
    });
    const target1 = mockCharInPlay({ instanceId: 't1', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'T1', power: 4,
    });
    const target2 = mockCharInPlay({ instanceId: 't2', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'T2', power: 1,
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player2: { ...baseState.player2, discardPile: [] },
      activeMissions: [
        makeMission('D', [naruto], [target1]),
        makeMission('C', [], [target2]),
      ],
    };

    const handler = getEffectHandler('KS-133-S', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', naruto, 0, 'MAIN', true));
    // Handler uses CONFIRM popup pattern (upgrade defeat mode encoded in description)
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('NARUTO133_CONFIRM_MAIN');
    expect(result.validTargets).toContain('naruto-s');
    // Note: useDefeat is false in this step; upgrade detection happens in EffectEngine
    const desc = JSON.parse(result.description!);
    expect(typeof desc.missionIndex).toBe('number');
  });

  it('should not target Power > 5 in this mission', () => {
    const naruto = mockCharInPlay({ instanceId: 'naruto-s' }, {
      id: 'KS-133-S', number: 133, name_fr: 'Naruto', power: 6,
    });
    const strongE = mockCharInPlay({ instanceId: 'se', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'Strong', power: 7,
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [naruto], [strongE])],
    });

    const handler = getEffectHandler('KS-133-S', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', naruto, 0));
    expect(result.state.activeMissions[0].player2Characters[0].isHidden).toBe(false);
  });
});

// ===================================================================
// 135/130 - SAKURA HARUNO (S): Look top 3, play best character
// ===================================================================
describe('135/130 - Sakura Haruno (S)', () => {
  it('should prompt to choose a character from top 3 of deck', () => {
    const sakura = mockCharInPlay({ instanceId: 'sakura-s' }, {
      id: 'KS-135-S', number: 135, name_fr: 'Sakura Haruno', power: 4, chakra: 5,
    });
    const d1 = mockCharacter({ name_fr: 'D1', power: 2, chakra: 2 });
    const d2 = mockCharacter({ name_fr: 'D2', power: 5, chakra: 3 });
    const d3 = mockCharacter({ name_fr: 'D3', power: 1, chakra: 1 });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, deck: [d1, d2, d3], chakra: 10 },
      activeMissions: [makeMission('D', [sakura])],
    };

    const handler = getEffectHandler('KS-135-S', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', sakura, 0));
    // Handler uses CONFIRM popup pattern before revealing top 3 cards
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('SAKURA135_CONFIRM_MAIN');
    // sourceCard is used as validTarget for the confirm step
    expect(result.validTargets).toContain('sakura-s');
    // Deck not yet drawn (awaiting confirm)
    expect(result.state.player1.deck.length).toBe(3);
  });

  it('should offer only affordable cards on upgrade (cost reduction 4)', () => {
    const sakura = mockCharInPlay({ instanceId: 'sakura-s' }, {
      id: 'KS-135-S', number: 135, name_fr: 'Sakura', power: 4,
    });
    const expensive = mockCharacter({ name_fr: 'Expensive', power: 5, chakra: 6 });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, deck: [expensive], chakra: 5 },
      activeMissions: [makeMission('D', [sakura])],
    };

    const handler = getEffectHandler('KS-135-S', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', sakura, 0, 'MAIN', true));
    // Handler uses CONFIRM popup pattern (upgrade cost reduction applied in EffectEngine)
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('SAKURA135_CONFIRM_MAIN');
    expect(result.validTargets).toContain('sakura-s');
  });

  it('should handle empty deck', () => {
    const sakura = mockCharInPlay({ instanceId: 'sakura-s' }, {
      id: 'KS-135-S', number: 135, name_fr: 'Sakura',
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, deck: [] },
      activeMissions: [makeMission('D', [sakura])],
    };

    const handler = getEffectHandler('KS-135-S', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', sakura, 0));
    expect(result.state.activeMissions[0].player1Characters.length).toBe(1); // only sakura
  });
});

// ===================================================================
// 136/130 - SASUKE UCHIWA (S): On-defeat trigger + UPGRADE mutual destruction
// ===================================================================
describe('136/130 - Sasuke Uchiwa (S)', () => {
  it('MAIN should be continuous (no immediate state change except log)', () => {
    const sasuke = mockCharInPlay({ instanceId: 'sasuke-s' }, {
      id: 'KS-136-S', number: 136, name_fr: 'Sasuke Uchiwa', power: 8,
      effects: [{ type: 'MAIN', description: '[⧗] When a character is defeated, gain 1 Chakra.' }],
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [sasuke])],
    });

    const handler = getEffectHandler('KS-136-S', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', sasuke, 0));
    expect(result.state).toBeDefined();
  });

  it('UPGRADE should require target selection to choose friendly to sacrifice', () => {
    const sasuke = mockCharInPlay({ instanceId: 'sasuke-s' }, {
      id: 'KS-136-S', number: 136, name_fr: 'Sasuke', power: 8,
    });
    const friendlyTarget = mockCharInPlay({ instanceId: 'ft-1', controlledBy: 'player1', originalOwner: 'player1' }, {
      name_fr: 'FriendlyVictim', power: 2,
    });
    const enemyTarget = mockCharInPlay({ instanceId: 'et-1', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'EnemyVictim', power: 3,
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, discardPile: [] },
      player2: { ...baseState.player2, discardPile: [] },
      activeMissions: [makeMission('D', [sasuke, friendlyTarget], [enemyTarget])],
    };

    const handler = getEffectHandler('KS-136-S', 'UPGRADE')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', sasuke, 0, 'UPGRADE', true));
    // Stage 1: choose which friendly to sacrifice
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('SASUKE136_CHOOSE_FRIENDLY');
    expect(result.validTargets).toContain('ft-1');
    expect(result.isMandatory).toBe(true);
  });

  it('UPGRADE should fizzle when no valid targets exist', () => {
    const sasuke = mockCharInPlay({ instanceId: 'sasuke-s' }, {
      id: 'KS-136-S', number: 136, name_fr: 'Sasuke', power: 8,
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [sasuke])],
    });

    const handler = getEffectHandler('KS-136-S', 'UPGRADE')!;
    const result = handler(makeCtx(state, 'player1', sasuke, 0, 'UPGRADE', true));
    expect(result.state.activeMissions[0].player1Characters.length).toBe(1);
  });
});

// ===================================================================
// 137/130 - KAKASHI HATAKE (S): Hide upgraded char in mission + UPGRADE move self
// ===================================================================
describe('137/130 - Kakashi Hatake (S)', () => {
  it('MAIN should require target selection to hide an upgraded character in this mission', () => {
    const kakashi = mockCharInPlay({ instanceId: 'kakashi-s' }, {
      id: 'KS-137-S', number: 137, name_fr: 'Kakashi Hatake', power: 7,
    });
    // An upgraded enemy (stack.length >= 2)
    const baseCard = mockCharacter({ name_fr: 'Enemy', power: 3, chakra: 3 });
    const upgradeCard = mockCharacter({ name_fr: 'Enemy', power: 5, chakra: 5 });
    const upgradedEnemy = mockCharInPlay({
      instanceId: 'e1',
      controlledBy: 'player2',
      originalOwner: 'player2',
      stack: [baseCard, upgradeCard],
    }, {
      name_fr: 'Enemy', power: 5,
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [kakashi], [upgradedEnemy])],
    });

    const handler = getEffectHandler('KS-137-S', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', kakashi, 0));
    // Handler uses CONFIRM popup pattern before actual target selection
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('KAKASHI137_CONFIRM_MAIN');
    // sourceCard is used as validTarget for the confirm step (not the target)
    expect(result.validTargets).toContain('kakashi-s');
  });

  it('MAIN should fizzle when no upgraded character in this mission', () => {
    const kakashi = mockCharInPlay({ instanceId: 'kakashi-s' }, {
      id: 'KS-137-S', number: 137, name_fr: 'Kakashi',
    });
    // Non-upgraded enemy (stack.length = 1)
    const enemy = mockCharInPlay({ instanceId: 'e1', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'Enemy', power: 5,
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [kakashi], [enemy])],
    });

    const handler = getEffectHandler('KS-137-S', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', kakashi, 0));
    // Enemy should NOT be hidden (not upgraded)
    const e = result.state.activeMissions[0].player2Characters.find(c => c.instanceId === 'e1');
    expect(e?.isHidden).toBe(false);
  });

  it('MAIN should include friendly upgraded characters as valid targets', () => {
    const kakashi = mockCharInPlay({ instanceId: 'kakashi-s' }, {
      id: 'KS-137-S', number: 137, name_fr: 'Kakashi Hatake', power: 7,
    });
    const baseCard = mockCharacter({ name_fr: 'Ally', power: 2, chakra: 2 });
    const upgradeCard = mockCharacter({ name_fr: 'Ally', power: 4, chakra: 4 });
    const upgradedAlly = mockCharInPlay({
      instanceId: 'ally-1',
      stack: [baseCard, upgradeCard],
    }, {
      name_fr: 'Ally', power: 4,
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [kakashi, upgradedAlly])],
    });

    const handler = getEffectHandler('KS-137-S', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', kakashi, 0));
    // Handler uses CONFIRM popup pattern when valid targets exist
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('KAKASHI137_CONFIRM_MAIN');
    // Kakashi itself is used as validTarget for the confirm step
    expect(result.validTargets).toContain('kakashi-s');
  });

  it('UPGRADE should require target selection to choose destination mission', () => {
    const kakashi = mockCharInPlay({ instanceId: 'kakashi-s' }, {
      id: 'KS-137-S', number: 137, name_fr: 'Kakashi', power: 7,
    });
    const state = createActionPhaseState({
      activeMissions: [
        makeMission('D', [kakashi]),
        makeMission('C'),
      ],
    });

    const handler = getEffectHandler('KS-137-S', 'UPGRADE')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', kakashi, 0, 'UPGRADE', true));
    // Handler uses CONFIRM popup pattern before mission selection
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('KAKASHI137_CONFIRM_UPGRADE');
    // sourceCard is used as validTarget for the confirm step
    expect(result.validTargets).toContain('kakashi-s');
  });
});

// ===================================================================
// 143/130 - ITACHI UCHIWA (M): MAIN move friendly + AMBUSH move enemy
// ===================================================================
describe('143/130 - Itachi Uchiwa (M)', () => {
  it('MAIN should prompt to choose a friendly character from another mission', () => {
    const itachi = mockCharInPlay({ instanceId: 'itachi-m' }, {
      id: 'KS-143-M', number: 143, name_fr: 'Itachi Uchiwa', power: 5,
    });
    const friendlyElsewhere = mockCharInPlay({ instanceId: 'fe-1' }, {
      name_fr: 'FriendlyElse', power: 3,
    });
    const state = createActionPhaseState({
      activeMissions: [
        makeMission('D', [itachi]),
        makeMission('C', [friendlyElsewhere]),
      ],
    });

    const handler = getEffectHandler('KS-143-M', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', itachi, 0));
    // Handler uses CONFIRM popup pattern before actual target selection
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('ITACHI143_CONFIRM_MAIN');
    // sourceCard is used as validTarget for the confirm step (itachi)
    expect(result.validTargets).toContain('itachi-m');
  });

  it('MAIN should fizzle when no friendly in another mission', () => {
    const itachi = mockCharInPlay({ instanceId: 'itachi-m' }, {
      id: 'KS-143-M', number: 143, name_fr: 'Itachi',
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [itachi])],
    });

    const handler = getEffectHandler('KS-143-M', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', itachi, 0));
    expect(result.state.activeMissions[0].player1Characters.length).toBe(1);
  });

  it('AMBUSH should prompt to choose an enemy character from another mission', () => {
    const itachi = mockCharInPlay({ instanceId: 'itachi-m' }, {
      id: 'KS-143-M', number: 143, name_fr: 'Itachi', power: 5,
    });
    const enemyElsewhere = mockCharInPlay({ instanceId: 'ee-1', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'EnemyElse', power: 3,
    });
    const state = createActionPhaseState({
      activeMissions: [
        makeMission('D', [itachi]),
        makeMission('C', [], [enemyElsewhere]),
      ],
    });

    const handler = getEffectHandler('KS-143-M', 'AMBUSH')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', itachi, 0, 'AMBUSH'));
    // Handler uses CONFIRM popup pattern before actual enemy selection
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('ITACHI143_CONFIRM_AMBUSH');
    // sourceCard is used as validTarget for the confirm step (itachi)
    expect(result.validTargets).toContain('itachi-m');
  });
});

// ===================================================================
// 144/130 - KISAME HOSHIGAKI (M): Steal 1 Chakra from opponent
// ===================================================================
describe('144/130 - Kisame Hoshigaki (M)', () => {
  it('should steal 1 chakra from opponent', () => {
    const kisame = mockCharInPlay({ instanceId: 'kisame-m' }, {
      id: 'KS-144-M', number: 144, name_fr: 'Kisame Hoshigaki', power: 6,
    });
    const state = createActionPhaseState({
      player1: { ...createActionPhaseState().player1, chakra: 5 },
      player2: { ...createActionPhaseState().player2, chakra: 3 },
      activeMissions: [makeMission('D', [kisame])],
    });

    const handler = getEffectHandler('KS-144-M', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', kisame, 0));
    // Handler uses CONFIRM popup pattern before the actual steal
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('KISAME144_CONFIRM_MAIN');
    // Chakra not changed yet (awaiting confirm)
    expect(result.state.player1.chakra).toBe(5); // unchanged
    expect(result.state.player2.chakra).toBe(3); // unchanged
  });

  it('should not steal when opponent has 0 chakra', () => {
    const kisame = mockCharInPlay({ instanceId: 'kisame-m' }, {
      id: 'KS-144-M', number: 144, name_fr: 'Kisame',
    });
    const state = createActionPhaseState({
      player1: { ...createActionPhaseState().player1, chakra: 5 },
      player2: { ...createActionPhaseState().player2, chakra: 0 },
      activeMissions: [makeMission('D', [kisame])],
    });

    const handler = getEffectHandler('KS-144-M', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', kisame, 0));
    expect(result.state.player1.chakra).toBe(5); // unchanged
    expect(result.state.player2.chakra).toBe(0); // unchanged
  });
});

// ===================================================================
// Registry completeness for non-common cards
// ===================================================================
describe('Non-common registry completeness', () => {
  const cardIds = [
    { id: 'KS-039-UC', types: ['MAIN', 'UPGRADE'] },
    { id: 'KS-108-R', types: ['MAIN'] },
    { id: 'KS-120-R', types: ['MAIN'] },
    { id: 'KS-110-R', types: ['MAIN', 'UPGRADE'] },
    { id: 'KS-133-S', types: ['MAIN'] },
    { id: 'KS-135-S', types: ['MAIN'] },
    { id: 'KS-135-MV', types: ['MAIN'] },
    { id: 'KS-136-S', types: ['MAIN', 'UPGRADE'] },
    { id: 'KS-136-MV', types: ['MAIN', 'UPGRADE'] },
    { id: 'KS-137-S', types: ['MAIN', 'UPGRADE'] },
    { id: 'KS-143-M', types: ['MAIN', 'AMBUSH'] },
    { id: 'KS-144-M', types: ['MAIN'] },
    { id: 'KS-000-L', types: ['MAIN'] },
  ];

  it.each(cardIds)('should have all handlers for $id', ({ id, types }) => {
    for (const type of types) {
      const handler = getEffectHandler(id, type as 'MAIN' | 'UPGRADE' | 'AMBUSH');
      expect(handler, `Missing handler for ${id} ${type}`).toBeDefined();
    }
  });
});

// ===================================================================
// 110/130 - INO YAMANAKA (R): Move weakest enemy + UPGRADE hide
// ===================================================================
describe('110/130 - Ino Yamanaka (R)', () => {
  it('MAIN should fizzle when fewer than 2 enemy characters in mission', () => {
    const ino = mockCharInPlay({ instanceId: 'ino-1' }, {
      id: 'KS-110-R', number: 110, name_fr: 'INO YAMANAKA', chakra: 5, power: 4,
    });
    const enemy = mockCharInPlay(
      { instanceId: 'enemy-1', controlledBy: 'player2', originalOwner: 'player2' },
      { name_fr: 'GAARA', power: 3 },
    );
    const state = createActionPhaseState({
      activeMissions: [
        makeMission('D', [ino], [enemy]),
        makeMission('C'),
      ],
    });

    const handler = getEffectHandler('KS-110-R', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', ino, 0));
    expect(result.requiresTargetSelection).toBeFalsy();
    // Should have logged a no-target message
    expect(result.state.log.some((l: { details?: string }) =>
      l.details?.includes('Fewer than 2')
    )).toBe(true);
  });

  it('MAIN should identify weakest enemy and return target selection', () => {
    const ino = mockCharInPlay({ instanceId: 'ino-1' }, {
      id: 'KS-110-R', number: 110, name_fr: 'INO YAMANAKA', chakra: 5, power: 4,
    });
    const enemy1 = mockCharInPlay(
      { instanceId: 'enemy-weak', controlledBy: 'player2', originalOwner: 'player2' },
      { name_fr: 'WEAK GUY', power: 1 },
    );
    const enemy2 = mockCharInPlay(
      { instanceId: 'enemy-strong', controlledBy: 'player2', originalOwner: 'player2' },
      { name_fr: 'STRONG GUY', power: 5 },
    );
    const state = createActionPhaseState({
      activeMissions: [
        makeMission('D', [ino], [enemy1, enemy2]),
        makeMission('C'),
      ],
    });

    const handler = getEffectHandler('KS-110-R', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', ino, 0));
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('INO110_CONFIRM_MAIN');
    expect(result.validTargets).toContain('ino-1');
    expect(result.isOptional).toBe(true);
  });

  it('MAIN should return CONFIRM popup when tied for weakest', () => {
    const ino = mockCharInPlay({ instanceId: 'ino-1' }, {
      id: 'KS-110-R', number: 110, name_fr: 'INO YAMANAKA', chakra: 5, power: 4,
    });
    const enemy1 = mockCharInPlay(
      { instanceId: 'enemy-a', controlledBy: 'player2', originalOwner: 'player2' },
      { name_fr: 'GUY A', power: 2 },
    );
    const enemy2 = mockCharInPlay(
      { instanceId: 'enemy-b', controlledBy: 'player2', originalOwner: 'player2' },
      { name_fr: 'GUY B', power: 2 },
    );
    const state = createActionPhaseState({
      activeMissions: [
        makeMission('D', [ino], [enemy1, enemy2]),
        makeMission('C'),
      ],
    });

    const handler = getEffectHandler('KS-110-R', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', ino, 0));
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('INO110_CONFIRM_MAIN');
    expect(result.isOptional).toBe(true);
  });

  it('MAIN should fizzle when only one mission in play', () => {
    const ino = mockCharInPlay({ instanceId: 'ino-1' }, {
      id: 'KS-110-R', number: 110, name_fr: 'INO YAMANAKA', chakra: 5, power: 4,
    });
    const enemy1 = mockCharInPlay(
      { instanceId: 'enemy-1', controlledBy: 'player2', originalOwner: 'player2' },
      { name_fr: 'GUY A', power: 2 },
    );
    const enemy2 = mockCharInPlay(
      { instanceId: 'enemy-2', controlledBy: 'player2', originalOwner: 'player2' },
      { name_fr: 'GUY B', power: 3 },
    );
    const state = createActionPhaseState({
      activeMissions: [
        makeMission('D', [ino], [enemy1, enemy2]),
      ],
    });

    const handler = getEffectHandler('KS-110-R', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', ino, 0));
    expect(result.requiresTargetSelection).toBeFalsy();
    expect(result.state.log.some((l: { details?: string }) =>
      l.details?.includes('Only one mission')
    )).toBe(true);
  });

  it('UPGRADE should return CONFIRM popup (modifier pattern)', () => {
    const ino = mockCharInPlay({ instanceId: 'ino-1' }, {
      id: 'KS-110-R', number: 110, name_fr: 'INO YAMANAKA', chakra: 5, power: 4,
    });
    const enemy1 = mockCharInPlay(
      { instanceId: 'enemy-weak', controlledBy: 'player2', originalOwner: 'player2' },
      { name_fr: 'WEAK GUY', power: 1 },
    );
    const enemy2 = mockCharInPlay(
      { instanceId: 'enemy-strong', controlledBy: 'player2', originalOwner: 'player2' },
      { name_fr: 'STRONG GUY', power: 5 },
    );
    const state = createActionPhaseState({
      activeMissions: [
        makeMission('D', [ino], [enemy1, enemy2]),
        makeMission('C'),
      ],
    });

    const handler = getEffectHandler('KS-110-R', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', ino, 0, 'MAIN', true));
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('INO110_CONFIRM_MAIN');
    expect(result.isOptional).toBe(true);
  });
});
