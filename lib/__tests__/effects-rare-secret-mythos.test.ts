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
  it('should POWERUP 2 on UPGRADE', () => {
    const lee = mockCharInPlay({ instanceId: 'lee-1', powerTokens: 1 }, {
      id: '039/130', number: 39, name_fr: 'Rock Lee', keywords: ['Team Guy'], group: 'Leaf Village',
      effects: [
        { type: 'MAIN', description: '[⧗] This character doesn\'t lose Power tokens at the end of the round.' },
        { type: 'UPGRADE', description: 'POWERUP 2.' },
      ],
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [lee])],
    });

    const handler = getEffectHandler('039/130', 'UPGRADE')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', lee, 0, 'UPGRADE', true));
    const updated = result.state.activeMissions[0].player1Characters.find(c => c.instanceId === 'lee-1');
    expect(updated?.powerTokens).toBe(3); // 1 existing + 2 upgrade
  });

  it('MAIN handler should be a no-op (continuous logged)', () => {
    const lee = mockCharInPlay({ instanceId: 'lee-1' }, {
      id: '039/130', number: 39, name_fr: 'Rock Lee',
      effects: [{ type: 'MAIN', description: '[⧗] This character doesn\'t lose Power tokens at the end of the round.' }],
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [lee])],
    });

    const handler = getEffectHandler('039/130', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', lee, 0));
    expect(result.state).toBeDefined();
  });
});

// ===================================================================
// 108/130 - NARUTO UZUMAKI (RA): Hide enemy Power<=3 + UPGRADE POWERUP X
// ===================================================================
describe('108/130 - Naruto Uzumaki (RA)', () => {
  it('MAIN should hide an enemy character with Power 3 or less in this mission', () => {
    const naruto = mockCharInPlay({ instanceId: 'naruto-1' }, {
      id: '108/130', number: 108, name_fr: 'NARUTO UZUMAKI', power: 5, chakra: 5,
    });
    const enemy = mockCharInPlay({ instanceId: 'enemy-1', isHidden: false, powerTokens: 0 }, {
      id: '001/130', number: 1, name_fr: 'HIRUZEN SARUTOBI', power: 3,
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [naruto], [enemy])],
    });

    const handler = getEffectHandler('108/130', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', naruto, 0));
    // Enemy should be hidden
    const p2Chars = result.state.activeMissions[0].player2Characters;
    expect(p2Chars[0].isHidden).toBe(true);
  });

  it('should fizzle when no enemy with Power 3 or less exists', () => {
    const naruto = mockCharInPlay({ instanceId: 'naruto-1' }, {
      id: '108/130', number: 108, name_fr: 'NARUTO UZUMAKI', power: 5,
    });
    const enemy = mockCharInPlay({ instanceId: 'enemy-1', isHidden: false, powerTokens: 0 }, {
      id: '136/130', number: 136, name_fr: 'SASUKE UCHIHA', power: 8,
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [naruto], [enemy])],
    });

    const handler = getEffectHandler('108/130', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', naruto, 0));
    // Enemy should remain visible
    expect(result.state.activeMissions[0].player2Characters[0].isHidden).toBe(false);
  });

  it('UPGRADE should POWERUP X where X is the power of the hidden enemy', () => {
    const naruto = mockCharInPlay({ instanceId: 'naruto-1', powerTokens: 0 }, {
      id: '108/130', number: 108, name_fr: 'NARUTO UZUMAKI', power: 5, chakra: 5,
    });
    const enemy = mockCharInPlay({ instanceId: 'enemy-1', isHidden: false, powerTokens: 0 }, {
      id: '001/130', number: 1, name_fr: 'HIRUZEN SARUTOBI', power: 3,
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [naruto], [enemy])],
    });

    const handler = getEffectHandler('108/130', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', naruto, 0, 'MAIN', true));
    // Enemy should be hidden
    expect(result.state.activeMissions[0].player2Characters[0].isHidden).toBe(true);
    // Naruto should have POWERUP 3 (enemy's power)
    const updatedNaruto = result.state.activeMissions[0].player1Characters.find(c => c.instanceId === 'naruto-1');
    expect(updatedNaruto?.powerTokens).toBe(3);
  });

  it('RA variant 108/130 A should use same handler', () => {
    const handler = getEffectHandler('108/130 A', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 120/130 - GAARA (R): Defeat Power<=1 in every mission + UPGRADE POWERUP X
// ===================================================================
describe('120/130 - Gaara (R)', () => {
  it('should defeat enemies with Power 1 or less across all missions', () => {
    const gaara = mockCharInPlay({ instanceId: 'gaara-r', powerTokens: 0 }, {
      id: '120/130', number: 120, name_fr: 'Gaara', power: 4,
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

    const handler = getEffectHandler('120/130', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', gaara, 0));
    // weakE1 should be defeated (removed from mission 0)
    expect(result.state.activeMissions[0].player2Characters.length).toBe(0);
    // weakE2 should be defeated (removed from mission 1), strongE remains
    expect(result.state.activeMissions[1].player2Characters.length).toBe(1);
    expect(result.state.activeMissions[1].player2Characters[0].instanceId).toBe('se1');
  });

  it('should POWERUP X on upgrade where X = defeated count', () => {
    const gaara = mockCharInPlay({ instanceId: 'gaara-r', powerTokens: 0 }, {
      id: '120/130', number: 120, name_fr: 'Gaara', power: 4,
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

    const handler = getEffectHandler('120/130', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', gaara, 0, 'MAIN', true));
    const updatedGaara = result.state.activeMissions[0].player1Characters.find(c => c.instanceId === 'gaara-r');
    expect(updatedGaara?.powerTokens).toBe(2); // 2 defeated
  });

  it('should not defeat characters with Power > 1', () => {
    const gaara = mockCharInPlay({ instanceId: 'gaara-r' }, {
      id: '120/130', number: 120, name_fr: 'Gaara',
    });
    const strongE = mockCharInPlay({ instanceId: 'se1', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'Strong', power: 3,
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [gaara], [strongE])],
    });

    const handler = getEffectHandler('120/130', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', gaara, 0));
    expect(result.state.activeMissions[0].player2Characters.length).toBe(1);
  });

  it('RA variant 120/130 A should use same handler', () => {
    const handler = getEffectHandler('120/130 A', 'MAIN');
    expect(handler).toBeDefined();
  });
});

// ===================================================================
// 133/130 - NARUTO UZUMAKI "Rasengan" (S): Hide Power<=5 this mission + Power<=2 anywhere
// ===================================================================
describe('133/130 - Naruto Uzumaki (S)', () => {
  it('should hide Power<=5 in this mission AND Power<=2 in any mission', () => {
    const naruto = mockCharInPlay({ instanceId: 'naruto-s' }, {
      id: '133/130', number: 133, name_fr: 'Naruto Uzumaki', power: 6,
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

    const handler = getEffectHandler('133/130', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', naruto, 0));
    const t1 = result.state.activeMissions[0].player2Characters.find(c => c.instanceId === 't1');
    const t2 = result.state.activeMissions[1].player2Characters.find(c => c.instanceId === 't2');
    expect(t1?.isHidden).toBe(true);
    expect(t2?.isHidden).toBe(true);
  });

  it('should defeat both targets on upgrade', () => {
    const naruto = mockCharInPlay({ instanceId: 'naruto-s' }, {
      id: '133/130', number: 133, name_fr: 'Naruto Uzumaki', power: 6,
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

    const handler = getEffectHandler('133/130', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', naruto, 0, 'MAIN', true));
    expect(result.state.activeMissions[0].player2Characters.length).toBe(0); // t1 defeated
    expect(result.state.activeMissions[1].player2Characters.length).toBe(0); // t2 defeated
  });

  it('should not target Power > 5 in this mission', () => {
    const naruto = mockCharInPlay({ instanceId: 'naruto-s' }, {
      id: '133/130', number: 133, name_fr: 'Naruto', power: 6,
    });
    const strongE = mockCharInPlay({ instanceId: 'se', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'Strong', power: 7,
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [naruto], [strongE])],
    });

    const handler = getEffectHandler('133/130', 'MAIN')!;
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
      id: '135/130', number: 135, name_fr: 'Sakura Haruno', power: 4, chakra: 5,
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

    const handler = getEffectHandler('135/130', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', sakura, 0));
    // Now returns target selection: choose which character from top 3
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('SAKURA135_CHOOSE_CARD');
    // All 3 are characters, all affordable with 10 chakra
    expect(result.validTargets!.length).toBe(3);
    // Deck should be empty (cards were drawn)
    expect(result.state.player1.deck.length).toBe(0);
    // Drawn cards stored at end of discard pile
    expect(result.state.player1.discardPile.length).toBe(3);
  });

  it('should offer only affordable cards on upgrade (cost reduction 4)', () => {
    const sakura = mockCharInPlay({ instanceId: 'sakura-s' }, {
      id: '135/130', number: 135, name_fr: 'Sakura', power: 4,
    });
    const expensive = mockCharacter({ name_fr: 'Expensive', power: 5, chakra: 6 });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, deck: [expensive], chakra: 5 },
      activeMissions: [makeMission('D', [sakura])],
    };

    const handler = getEffectHandler('135/130', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', sakura, 0, 'MAIN', true));
    // Cost = 6 - 4 = 2, player has 5 chakra — affordable
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('SAKURA135_CHOOSE_CARD');
    expect(result.validTargets).toContain('0');
  });

  it('should handle empty deck', () => {
    const sakura = mockCharInPlay({ instanceId: 'sakura-s' }, {
      id: '135/130', number: 135, name_fr: 'Sakura',
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, deck: [] },
      activeMissions: [makeMission('D', [sakura])],
    };

    const handler = getEffectHandler('135/130', 'MAIN')!;
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
      id: '136/130', number: 136, name_fr: 'Sasuke Uchiwa', power: 8,
      effects: [{ type: 'MAIN', description: '[⧗] When a character is defeated, gain 1 Chakra.' }],
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [sasuke])],
    });

    const handler = getEffectHandler('136/130', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', sasuke, 0));
    expect(result.state).toBeDefined();
  });

  it('UPGRADE should defeat a friendly AND enemy in this mission', () => {
    const sasuke = mockCharInPlay({ instanceId: 'sasuke-s' }, {
      id: '136/130', number: 136, name_fr: 'Sasuke', power: 8,
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

    const handler = getEffectHandler('136/130', 'UPGRADE')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', sasuke, 0, 'UPGRADE', true));
    // Both should be defeated
    const p1Chars = result.state.activeMissions[0].player1Characters;
    const p2Chars = result.state.activeMissions[0].player2Characters;
    expect(p1Chars.length).toBe(1); // only sasuke remains
    expect(p1Chars[0].instanceId).toBe('sasuke-s');
    expect(p2Chars.length).toBe(0); // enemy defeated
  });

  it('UPGRADE should fizzle when no valid targets exist', () => {
    const sasuke = mockCharInPlay({ instanceId: 'sasuke-s' }, {
      id: '136/130', number: 136, name_fr: 'Sasuke', power: 8,
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [sasuke])],
    });

    const handler = getEffectHandler('136/130', 'UPGRADE')!;
    const result = handler(makeCtx(state, 'player1', sasuke, 0, 'UPGRADE', true));
    expect(result.state.activeMissions[0].player1Characters.length).toBe(1);
  });
});

// ===================================================================
// 137/130 - KAKASHI HATAKE (S): Hide upgraded char in mission + UPGRADE move self
// ===================================================================
describe('137/130 - Kakashi Hatake (S)', () => {
  it('MAIN should hide an upgraded character in this mission', () => {
    const kakashi = mockCharInPlay({ instanceId: 'kakashi-s' }, {
      id: '137/130', number: 137, name_fr: 'Kakashi Hatake', power: 7,
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

    const handler = getEffectHandler('137/130', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', kakashi, 0));
    const e = result.state.activeMissions[0].player2Characters.find(c => c.instanceId === 'e1');
    expect(e?.isHidden).toBe(true);
  });

  it('MAIN should fizzle when no upgraded character in this mission', () => {
    const kakashi = mockCharInPlay({ instanceId: 'kakashi-s' }, {
      id: '137/130', number: 137, name_fr: 'Kakashi',
    });
    // Non-upgraded enemy (stack.length = 1)
    const enemy = mockCharInPlay({ instanceId: 'e1', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'Enemy', power: 5,
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [kakashi], [enemy])],
    });

    const handler = getEffectHandler('137/130', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', kakashi, 0));
    // Enemy should NOT be hidden (not upgraded)
    const e = result.state.activeMissions[0].player2Characters.find(c => c.instanceId === 'e1');
    expect(e?.isHidden).toBe(false);
  });

  it('MAIN should also target friendly upgraded characters', () => {
    const kakashi = mockCharInPlay({ instanceId: 'kakashi-s' }, {
      id: '137/130', number: 137, name_fr: 'Kakashi Hatake', power: 7,
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

    const handler = getEffectHandler('137/130', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', kakashi, 0));
    const ally = result.state.activeMissions[0].player1Characters.find(c => c.instanceId === 'ally-1');
    expect(ally?.isHidden).toBe(true);
  });

  it('UPGRADE should move self to another mission', () => {
    const kakashi = mockCharInPlay({ instanceId: 'kakashi-s' }, {
      id: '137/130', number: 137, name_fr: 'Kakashi', power: 7,
    });
    const state = createActionPhaseState({
      activeMissions: [
        makeMission('D', [kakashi]),
        makeMission('C'),
      ],
    });

    const handler = getEffectHandler('137/130', 'UPGRADE')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', kakashi, 0, 'UPGRADE', true));
    // Kakashi moved from mission 0 to mission 1
    expect(result.state.activeMissions[0].player1Characters.length).toBe(0);
    expect(result.state.activeMissions[1].player1Characters.length).toBe(1);
    expect(result.state.activeMissions[1].player1Characters[0].instanceId).toBe('kakashi-s');
  });
});

// ===================================================================
// 143/130 - ITACHI UCHIWA (M): MAIN move friendly + AMBUSH move enemy
// ===================================================================
describe('143/130 - Itachi Uchiwa (M)', () => {
  it('MAIN should prompt to choose a friendly character from another mission', () => {
    const itachi = mockCharInPlay({ instanceId: 'itachi-m' }, {
      id: '143/130', number: 143, name_fr: 'Itachi Uchiwa', power: 5,
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

    const handler = getEffectHandler('143/130', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', itachi, 0));
    // Now returns target selection: choose which friendly char to move
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('ITACHI143_CHOOSE_FRIENDLY');
    expect(result.validTargets).toContain('fe-1');
    expect(result.validTargets).not.toContain('itachi-m'); // Itachi is in this mission, not a valid target
  });

  it('MAIN should fizzle when no friendly in another mission', () => {
    const itachi = mockCharInPlay({ instanceId: 'itachi-m' }, {
      id: '143/130', number: 143, name_fr: 'Itachi',
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [itachi])],
    });

    const handler = getEffectHandler('143/130', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', itachi, 0));
    expect(result.state.activeMissions[0].player1Characters.length).toBe(1);
  });

  it('AMBUSH should prompt to choose an enemy character from another mission', () => {
    const itachi = mockCharInPlay({ instanceId: 'itachi-m' }, {
      id: '143/130', number: 143, name_fr: 'Itachi', power: 5,
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

    const handler = getEffectHandler('143/130', 'AMBUSH')!;
    expect(handler).toBeDefined();
    const result = handler(makeCtx(state, 'player1', itachi, 0, 'AMBUSH'));
    // Now returns target selection: choose which enemy char to move
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.targetSelectionType).toBe('ITACHI143_CHOOSE_ENEMY');
    expect(result.validTargets).toContain('ee-1');
  });
});

// ===================================================================
// 144/130 - KISAME HOSHIGAKI (M): Steal 1 Chakra from opponent
// ===================================================================
describe('144/130 - Kisame Hoshigaki (M)', () => {
  it('should steal 1 chakra from opponent', () => {
    const kisame = mockCharInPlay({ instanceId: 'kisame-m' }, {
      id: '144/130', number: 144, name_fr: 'Kisame Hoshigaki', power: 6,
    });
    const state = createActionPhaseState({
      player1: { ...createActionPhaseState().player1, chakra: 5 },
      player2: { ...createActionPhaseState().player2, chakra: 3 },
      activeMissions: [makeMission('D', [kisame])],
    });

    const handler = getEffectHandler('144/130', 'MAIN')!;
    const result = handler(makeCtx(state, 'player1', kisame, 0));
    expect(result.state.player1.chakra).toBe(6); // 5 + 1
    expect(result.state.player2.chakra).toBe(2); // 3 - 1
  });

  it('should not steal when opponent has 0 chakra', () => {
    const kisame = mockCharInPlay({ instanceId: 'kisame-m' }, {
      id: '144/130', number: 144, name_fr: 'Kisame',
    });
    const state = createActionPhaseState({
      player1: { ...createActionPhaseState().player1, chakra: 5 },
      player2: { ...createActionPhaseState().player2, chakra: 0 },
      activeMissions: [makeMission('D', [kisame])],
    });

    const handler = getEffectHandler('144/130', 'MAIN')!;
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
    { id: '039/130', types: ['MAIN', 'UPGRADE'] },
    { id: '108/130', types: ['MAIN'] },
    { id: '120/130', types: ['MAIN'] },
    { id: '133/130', types: ['MAIN'] },
    { id: '135/130', types: ['MAIN'] },
    { id: '136/130', types: ['MAIN', 'UPGRADE'] },
    { id: '137/130', types: ['MAIN', 'UPGRADE'] },
    { id: '143/130', types: ['MAIN', 'AMBUSH'] },
    { id: '144/130', types: ['MAIN'] },
    { id: 'Legendary', types: ['MAIN'] },
  ];

  it.each(cardIds)('should have all handlers for $id', ({ id, types }) => {
    for (const type of types) {
      const handler = getEffectHandler(id, type as 'MAIN' | 'UPGRADE' | 'AMBUSH');
      expect(handler, `Missing handler for ${id} ${type}`).toBeDefined();
    }
  });
});
