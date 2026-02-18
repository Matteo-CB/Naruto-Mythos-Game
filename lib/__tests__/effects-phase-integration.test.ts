/**
 * Phase integration tests.
 * Tests how card effects integrate with game phases:
 * - EndPhase: summon returns, Akamaru check, power token removal (Rock Lee exception)
 * - StartPhase: chakra calculation with continuous CHAKRA +X effects
 * - MissionPhase: scoring with continuous power modifiers
 * - Defeat replacement chain: Hayate hide-instead, Gemma sacrifice, on-defeat triggers
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mockCharacter, mockMission, mockCharInPlay, createActionPhaseState } from './testHelpers';
import { initializeRegistry } from '../effects/EffectRegistry';
import { executeEndPhase } from '../engine/phases/EndPhase';
import { calculateChakraBonus } from '../engine/phases/StartPhase';
import { calculateCharacterPower } from '../engine/phases/PowerCalculation';
import { calculateEffectiveCost } from '../engine/rules/ChakraValidation';
import { defeatEnemyCharacter, defeatFriendlyCharacter } from '../effects/defeatUtils';
import { EffectEngine } from '../effects/EffectEngine';
import type { GameState, CharacterInPlay } from '../engine/types';

beforeAll(() => {
  initializeRegistry();
});

function makeMission(rank: 'D' | 'C' | 'B' | 'A' = 'D', p1: CharacterInPlay[] = [], p2: CharacterInPlay[] = []) {
  const rankBonus = { D: 1, C: 2, B: 3, A: 4 }[rank];
  return { card: mockMission(), rank, basePoints: 3, rankBonus, wonBy: null, player1Characters: p1, player2Characters: p2 };
}

// ===================================================================
// END PHASE - Power Token Removal
// ===================================================================
describe('EndPhase - Power Token Removal', () => {
  it('should remove all power tokens from normal characters', () => {
    const char1 = mockCharInPlay({ instanceId: 'c1', powerTokens: 3 }, { name_fr: 'C1', power: 2 });
    const char2 = mockCharInPlay({ instanceId: 'c2', powerTokens: 5, controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'C2' });
    const state = createActionPhaseState({
      phase: 'end',
      activeMissions: [makeMission('D', [char1], [char2])],
    });

    const result = executeEndPhase(state);
    const c1 = result.activeMissions[0].player1Characters.find(c => c.instanceId === 'c1');
    const c2 = result.activeMissions[0].player2Characters.find(c => c.instanceId === 'c2');
    expect(c1?.powerTokens).toBe(0);
    expect(c2?.powerTokens).toBe(0);
  });

  it('Rock Lee should retain power tokens', () => {
    const lee = mockCharInPlay({ instanceId: 'lee-1', powerTokens: 4 }, {
      id: '039/130', number: 39, name_fr: 'Rock Lee',
      effects: [{ type: 'MAIN', description: '[⧗] This character doesn\'t lose Power tokens at the end of the round.' }],
    });
    const normalChar = mockCharInPlay({ instanceId: 'nc', powerTokens: 2 }, { name_fr: 'Normal' });
    const state = createActionPhaseState({
      phase: 'end',
      activeMissions: [makeMission('D', [lee, normalChar])],
    });

    const result = executeEndPhase(state);
    const updatedLee = result.activeMissions[0].player1Characters.find(c => c.instanceId === 'lee-1');
    const updatedNormal = result.activeMissions[0].player1Characters.find(c => c.instanceId === 'nc');
    expect(updatedLee?.powerTokens).toBe(4); // retained
    expect(updatedNormal?.powerTokens).toBe(0); // removed
  });
});

// ===================================================================
// END PHASE - Summon Returns
// ===================================================================
describe('EndPhase - Summon Returns', () => {
  it('should return Summon characters to hand at end of round', () => {
    const gamaBunta = mockCharInPlay({ instanceId: 'gb-1', controlledBy: 'player1', originalOwner: 'player1' }, {
      id: '094/130', number: 94, name_fr: 'Gama Bunta',
      effects: [{ type: 'MAIN', description: '[⧗] At the end of the round, you must return this character to your hand.' }],
      keywords: ['Summon'],
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      phase: 'end',
      player1: { ...baseState.player1, hand: [], charactersInPlay: 1 },
      activeMissions: [makeMission('D', [gamaBunta])],
    };

    const result = executeEndPhase(state);
    expect(result.activeMissions[0].player1Characters.length).toBe(0);
    expect(result.player1.hand.length).toBe(1);
    expect(result.player1.hand[0].name_fr).toBe('Gama Bunta');
  });

  it('should return multiple summons from different missions', () => {
    const gamahiro = mockCharInPlay({ instanceId: 'gh-1', controlledBy: 'player1', originalOwner: 'player1' }, {
      id: '095/130', number: 95, name_fr: 'Gamahiro',
      effects: [{ type: 'MAIN', description: '[⧗] At the end of the round, you must return this character to your hand.' }],
      keywords: ['Summon'],
    });
    const gamatatsu = mockCharInPlay({ instanceId: 'gt-1', controlledBy: 'player1', originalOwner: 'player1' }, {
      id: '097/130', number: 97, name_fr: 'Gamatatsu',
      effects: [{ type: 'MAIN', description: '[⧗] At the end of the round, you must return this character to your hand.' }],
      keywords: ['Summon'],
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      phase: 'end',
      player1: { ...baseState.player1, hand: [], charactersInPlay: 2 },
      activeMissions: [
        makeMission('D', [gamahiro]),
        makeMission('C', [gamatatsu]),
      ],
    };

    const result = executeEndPhase(state);
    expect(result.activeMissions[0].player1Characters.length).toBe(0);
    expect(result.activeMissions[1].player1Characters.length).toBe(0);
    expect(result.player1.hand.length).toBe(2);
  });
});

// ===================================================================
// END PHASE - Akamaru Check
// ===================================================================
describe('EndPhase - Akamaru Return', () => {
  it('should return Akamaru to hand when no Kiba in same mission', () => {
    const akamaru = mockCharInPlay({ instanceId: 'aka-1', controlledBy: 'player1', originalOwner: 'player1' }, {
      id: '027/130', number: 27, name_fr: 'Akamaru',
      effects: [{ type: 'MAIN', description: '[⧗] If there is no friendly [u]Kiba Inuzuka[/u] in this mission at end of round, return to hand.' }],
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      phase: 'end',
      player1: { ...baseState.player1, hand: [], charactersInPlay: 1 },
      activeMissions: [makeMission('D', [akamaru])],
    };

    const result = executeEndPhase(state);
    expect(result.activeMissions[0].player1Characters.length).toBe(0);
    expect(result.player1.hand.length).toBe(1);
    expect(result.player1.hand[0].name_fr).toBe('Akamaru');
  });

  it('should keep Akamaru when Kiba is in the same mission', () => {
    const akamaru = mockCharInPlay({ instanceId: 'aka-1' }, {
      id: '027/130', number: 27, name_fr: 'Akamaru',
      effects: [{ type: 'MAIN', description: '[⧗] If there is no friendly [u]Kiba Inuzuka[/u] in this mission at end of round, return to hand.' }],
    });
    const kiba = mockCharInPlay({ instanceId: 'kiba-1' }, {
      id: '025/130', number: 25, name_fr: 'KIBA INUZUKA',
    });
    const state = createActionPhaseState({
      phase: 'end',
      activeMissions: [makeMission('D', [akamaru, kiba])],
    });

    const result = executeEndPhase(state);
    expect(result.activeMissions[0].player1Characters.length).toBe(2);
  });
});

// ===================================================================
// END PHASE - Chakra Reset
// ===================================================================
describe('EndPhase - Chakra Reset', () => {
  it('should reset both players chakra to 0', () => {
    const state = createActionPhaseState({
      phase: 'end',
      player1: { ...createActionPhaseState().player1, chakra: 15 },
      player2: { ...createActionPhaseState().player2, chakra: 8 },
    });

    const result = executeEndPhase(state);
    expect(result.player1.chakra).toBe(0);
    expect(result.player2.chakra).toBe(0);
  });
});

// ===================================================================
// START PHASE - Chakra Bonus Calculation
// ===================================================================
describe('StartPhase - Chakra Bonus Calculation', () => {
  it('should calculate Kiba + Akamaru chakra bonus', () => {
    const kiba = mockCharInPlay({ instanceId: 'kiba-1' }, {
      id: '025/130', number: 25, name_fr: 'Kiba Inuzuka',
      effects: [{ type: 'MAIN', description: '[⧗] If there is a friendly [u]Akamaru[/u] in this mission, CHAKRA +1.' }],
    });
    const akamaru = mockCharInPlay({ instanceId: 'aka-1' }, {
      id: '027/130', number: 27, name_fr: 'AKAMARU',
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [kiba, akamaru])],
    });

    const bonus = calculateChakraBonus(state, 'player1');
    expect(bonus).toBe(1);
  });

  it('should calculate combined Kankuro + Anko chakra bonus', () => {
    const kankuro = mockCharInPlay({ instanceId: 'kan-1' }, {
      id: '077/130', number: 77, name_fr: 'Kankuro',
      effects: [{ type: 'MAIN', description: '[⧗] If there is an enemy non-hidden character in this mission, CHAKRA +1.' }],
      group: 'Sand Village',
    });
    const anko = mockCharInPlay({ instanceId: 'anko-1' }, {
      id: '044/130', number: 44, name_fr: 'Anko',
      effects: [{ type: 'MAIN', description: '[⧗] If there is another friendly Leaf Village character in this mission, CHAKRA +1.' }],
      group: 'Leaf Village',
    });
    const leafAlly = mockCharInPlay({ instanceId: 'la-1' }, { group: 'Leaf Village', name_fr: 'Ally' });
    const enemy = mockCharInPlay({ instanceId: 'e1', controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'E' });
    const state = createActionPhaseState({
      activeMissions: [
        makeMission('D', [kankuro], [enemy]),
        makeMission('C', [anko, leafAlly]),
      ],
    });

    const bonus = calculateChakraBonus(state, 'player1');
    expect(bonus).toBe(2); // Kankuro +1 (enemy) + Anko +1 (leaf ally)
  });

  it('should not count hidden characters for chakra bonus', () => {
    const hiddenKiba = mockCharInPlay({ instanceId: 'kiba-h', isHidden: true }, {
      id: '025/130', number: 25, name_fr: 'Kiba',
      effects: [{ type: 'MAIN', description: '[⧗] If there is a friendly [u]Akamaru[/u] in this mission, CHAKRA +1.' }],
    });
    const akamaru = mockCharInPlay({ instanceId: 'aka-1' }, { name_fr: 'AKAMARU' });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [hiddenKiba, akamaru])],
    });

    const bonus = calculateChakraBonus(state, 'player1');
    expect(bonus).toBe(0); // Kiba is hidden, continuous effects don't apply
  });
});

// ===================================================================
// POWER CALCULATION
// ===================================================================
describe('PowerCalculation - with continuous modifiers', () => {
  it('hidden characters should have 0 power', () => {
    const hidden = mockCharInPlay({ instanceId: 'h-1', isHidden: true, powerTokens: 5 }, {
      power: 10, name_fr: 'Hidden',
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [hidden])],
    });

    const power = calculateCharacterPower(state, hidden, 'player1');
    expect(power).toBe(0);
  });

  it('should include base power + tokens + continuous modifiers', () => {
    const kakashi = mockCharInPlay({ instanceId: 'kak-1' }, {
      id: '015/130', number: 15, name_fr: 'Kakashi',
      effects: [{ type: 'MAIN', description: '[⧗] Other Team 7 characters in this mission gain +1 Power.' }],
      keywords: ['Team 7'], power: 4,
    });
    const naruto = mockCharInPlay({ instanceId: 'nar-1', powerTokens: 2, missionIndex: 0 }, {
      name_fr: 'Naruto', keywords: ['Team 7'], power: 3,
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [kakashi, naruto])],
    });

    const power = calculateCharacterPower(state, naruto, 'player1');
    expect(power).toBe(6); // 3 base + 2 tokens + 1 Kakashi buff
  });

  it('Temari should get +2 with Edge', () => {
    const temari = mockCharInPlay({ instanceId: 'tem-1', missionIndex: 0 }, {
      id: '079/130', number: 79, name_fr: 'Temari', power: 3,
      effects: [{ type: 'MAIN', description: '[⧗] +2 Power if you have the Edge.' }],
    });
    const state = createActionPhaseState({
      edgeHolder: 'player1',
      activeMissions: [makeMission('D', [temari])],
    });

    const power = calculateCharacterPower(state, temari, 'player1');
    expect(power).toBe(5); // 3 base + 2 edge
  });

  it('Sasuke debuff should reduce power (min 0)', () => {
    const sasuke = mockCharInPlay({ instanceId: 'sas-1', missionIndex: 0 }, {
      id: '013/130', number: 13, name_fr: 'Sasuke', power: 2,
      effects: [{ type: 'MAIN', description: '[⧗] -1 Power for every other non-hidden friendly character in this mission.' }],
    });
    const a1 = mockCharInPlay({ instanceId: 'a1' }, { name_fr: 'A1' });
    const a2 = mockCharInPlay({ instanceId: 'a2' }, { name_fr: 'A2' });
    const a3 = mockCharInPlay({ instanceId: 'a3' }, { name_fr: 'A3' });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [sasuke, a1, a2, a3])],
    });

    const power = calculateCharacterPower(state, sasuke, 'player1');
    expect(power).toBe(0); // 2 base - 3 allies = -1 -> capped at 0
  });
});

// ===================================================================
// COST REDUCTION
// ===================================================================
describe('ChakraValidation - Cost Reduction', () => {
  it('Kurenai 034 should reduce Team 8 cost by 1', () => {
    const kurenai = mockCharInPlay({ instanceId: 'kur-1' }, {
      id: '034/130', number: 34, name_fr: 'Kurenai',
      effects: [{ type: 'MAIN', description: '[⧗] Other Team 8 characters in this mission cost 1 less (minimum 1).' }],
    });
    const team8Card = mockCharacter({ id: '025/130', number: 25, name_fr: 'Kiba', keywords: ['Team 8'], chakra: 3 });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [kurenai])],
    });

    const cost = calculateEffectiveCost(state, 'player1', team8Card, 0, false);
    expect(cost).toBe(2); // 3 - 1 = 2
  });

  it('Kurenai should not reduce non-Team 8', () => {
    const kurenai = mockCharInPlay({ instanceId: 'kur-1' }, {
      id: '034/130', number: 34, name_fr: 'Kurenai',
      effects: [{ type: 'MAIN', description: '[⧗] Other Team 8 characters in this mission cost 1 less (minimum 1).' }],
    });
    const nonTeam8 = mockCharacter({ name_fr: 'NonTeam8', keywords: ['Team 7'], chakra: 3 });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [kurenai])],
    });

    const cost = calculateEffectiveCost(state, 'player1', nonTeam8, 0, false);
    expect(cost).toBe(3);
  });
});

// ===================================================================
// DEFEAT REPLACEMENT - Hayate 048
// ===================================================================
describe('Defeat Replacement - Hayate 048', () => {
  it('should hide Hayate instead of defeating him', () => {
    const hayate = mockCharInPlay({ instanceId: 'hay-1', controlledBy: 'player2', originalOwner: 'player2' }, {
      id: '048/130', number: 48, name_fr: 'Hayate Gekko',
      effects: [{ type: 'MAIN', description: '[⧗] If this character would be defeated, hide it instead.' }],
      group: 'Leaf Village',
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [], [hayate])],
    });

    const replacement = EffectEngine.checkDefeatReplacement(state, hayate, 'player2', 0, true);
    expect(replacement.replaced).toBe(true);
    expect(replacement.replacement).toBe('hide');
  });
});

// ===================================================================
// DEFEAT REPLACEMENT - Gaara 075
// ===================================================================
describe('Defeat Replacement - Gaara 075', () => {
  it('should hide Gaara 075 instead of defeat by enemy effect', () => {
    const gaara = mockCharInPlay({ instanceId: 'gaara-1', controlledBy: 'player2', originalOwner: 'player2' }, {
      id: '075/130', number: 75, name_fr: 'Gaara',
      effects: [{ type: 'MAIN', description: '[⧗] If this character would be defeated by enemy effects, hide instead.' }],
      group: 'Sand Village',
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [], [gaara])],
    });

    const replacement = EffectEngine.checkDefeatReplacement(state, gaara, 'player2', 0, true);
    expect(replacement.replaced).toBe(true);
    expect(replacement.replacement).toBe('hide');
  });

  it('should NOT replace when defeat is from friendly effect', () => {
    const gaara = mockCharInPlay({ instanceId: 'gaara-1', controlledBy: 'player2', originalOwner: 'player2' }, {
      id: '075/130', number: 75, name_fr: 'Gaara',
      effects: [{ type: 'MAIN', description: '[⧗] If this character would be defeated by enemy effects, hide instead.' }],
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [], [gaara])],
    });

    const replacement = EffectEngine.checkDefeatReplacement(state, gaara, 'player2', 0, false);
    expect(replacement.replaced).toBe(false);
  });
});

// ===================================================================
// DEFEAT REPLACEMENT - Gemma 049 (sacrifice)
// ===================================================================
describe('Defeat Replacement - Gemma 049', () => {
  it('should sacrifice Gemma to protect a Leaf Village ally', () => {
    const leafAlly = mockCharInPlay({ instanceId: 'la-1', controlledBy: 'player1', originalOwner: 'player1' }, {
      name_fr: 'LeafAlly', group: 'Leaf Village',
    });
    const gemma = mockCharInPlay({ instanceId: 'gemma-1', controlledBy: 'player1', originalOwner: 'player1' }, {
      id: '049/130', number: 49, name_fr: 'Gemma Shiranui',
      effects: [{ type: 'MAIN', description: '[⧗] If a friendly Leaf Village character in this mission would be hidden or defeated by enemy effects, you can defeat this character instead.' }],
      group: 'Leaf Village',
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [leafAlly, gemma])],
    });

    const replacement = EffectEngine.checkDefeatReplacement(state, leafAlly, 'player1', 0, true);
    expect(replacement.replaced).toBe(true);
    expect(replacement.replacement).toBe('sacrifice');
    expect(replacement.sacrificeInstanceId).toBe('gemma-1');
  });

  it('should not sacrifice for non-Leaf Village ally', () => {
    const sandAlly = mockCharInPlay({ instanceId: 'sa-1', controlledBy: 'player1', originalOwner: 'player1' }, {
      name_fr: 'SandAlly', group: 'Sand Village',
    });
    const gemma = mockCharInPlay({ instanceId: 'gemma-1', controlledBy: 'player1', originalOwner: 'player1' }, {
      id: '049/130', number: 49, name_fr: 'Gemma',
      effects: [{ type: 'MAIN', description: '[⧗] If a friendly Leaf Village character in this mission would be hidden or defeated by enemy effects, you can defeat this character instead.' }],
      group: 'Leaf Village',
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [sandAlly, gemma])],
    });

    const replacement = EffectEngine.checkDefeatReplacement(state, sandAlly, 'player1', 0, true);
    expect(replacement.replaced).toBe(false);
  });
});

// ===================================================================
// DEFEAT UTILS - On-Defeat Triggers
// ===================================================================
describe('defeatUtils - On-Defeat Triggers', () => {
  it('should trigger Tsunade 003 on friendly defeat (+2 chakra)', () => {
    const tsunade = mockCharInPlay({ instanceId: 'tsu-1' }, {
      id: '003/130', number: 3, name_fr: 'Tsunade',
      effects: [{ type: 'MAIN', description: '[⧗] When a friendly character is defeated, gain 2 chakra.' }],
      group: 'Leaf Village',
    });
    const victim = mockCharInPlay({ instanceId: 'vic-1', controlledBy: 'player1', originalOwner: 'player1' }, {
      name_fr: 'Victim', power: 1,
    });
    const enemy = mockCharInPlay({ instanceId: 'e1', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'Attacker',
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, chakra: 5, discardPile: [] },
      activeMissions: [
        makeMission('D', [tsunade, victim], [enemy]),
      ],
    };

    const result = defeatFriendlyCharacter(state, 0, 'vic-1', 'player1');
    // Tsunade should trigger: +2 chakra for friendly defeat
    expect(result.player1.chakra).toBe(7); // 5 + 2
    // Victim should be removed
    expect(result.activeMissions[0].player1Characters.length).toBe(1); // only Tsunade remains
  });

  it('should trigger Sasuke 136 on any defeat (+1 chakra)', () => {
    const sasuke = mockCharInPlay({ instanceId: 'sas-136' }, {
      id: '136/130', number: 136, name_fr: 'Sasuke Uchiwa',
      effects: [{ type: 'MAIN', description: '[⧗] When a character is defeated, gain 1 Chakra.' }],
      group: 'Leaf Village',
    });
    const enemyVictim = mockCharInPlay({ instanceId: 'ev-1', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'EnemyVictim',
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, chakra: 3, discardPile: [] },
      player2: { ...baseState.player2, discardPile: [] },
      activeMissions: [
        makeMission('D', [sasuke], [enemyVictim]),
      ],
    };

    const result = defeatEnemyCharacter(state, 0, 'ev-1', 'player1');
    // Sasuke 136 should trigger: +1 chakra for any defeat
    expect(result.player1.chakra).toBe(4); // 3 + 1
    expect(result.activeMissions[0].player2Characters.length).toBe(0);
  });

  it('should trigger both Tsunade 003 and Sasuke 136 together', () => {
    const tsunade = mockCharInPlay({ instanceId: 'tsu-1' }, {
      id: '003/130', number: 3, name_fr: 'Tsunade',
      effects: [{ type: 'MAIN', description: '[⧗] When a friendly character is defeated, gain 2 chakra.' }],
    });
    const sasuke = mockCharInPlay({ instanceId: 'sas-136' }, {
      id: '136/130', number: 136, name_fr: 'Sasuke Uchiwa',
      effects: [{ type: 'MAIN', description: '[⧗] When a character is defeated, gain 1 Chakra.' }],
    });
    const victim = mockCharInPlay({ instanceId: 'vic', controlledBy: 'player1', originalOwner: 'player1' }, {
      name_fr: 'Victim',
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, chakra: 0, discardPile: [] },
      activeMissions: [
        makeMission('D', [tsunade, sasuke, victim]),
      ],
    };

    const result = defeatFriendlyCharacter(state, 0, 'vic', 'player1');
    // Tsunade +2, Sasuke +1 = +3 total
    expect(result.player1.chakra).toBe(3);
  });
});

// ===================================================================
// DEFEAT UTILS - Normal defeat
// ===================================================================
describe('defeatUtils - Normal defeat', () => {
  it('should remove character and add to discard pile', () => {
    const enemy = mockCharInPlay({ instanceId: 'e-1', controlledBy: 'player2', originalOwner: 'player2' }, {
      name_fr: 'Defeated',
    });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player2: { ...baseState.player2, discardPile: [], charactersInPlay: 1 },
      activeMissions: [makeMission('D', [], [enemy])],
    };

    const result = defeatEnemyCharacter(state, 0, 'e-1', 'player1');
    expect(result.activeMissions[0].player2Characters.length).toBe(0);
    expect(result.player2.discardPile.length).toBeGreaterThan(0);
  });
});

// ===================================================================
// SCORE EFFECTS via EffectEngine
// ===================================================================
describe('EffectEngine - resolveScoreEffects', () => {
  it('should trigger character SCORE effects for the winner', () => {
    const baki = mockCharInPlay({ instanceId: 'baki-1' }, {
      id: '081/130', number: 81, name_fr: 'Baki',
      effects: [{ type: 'SCORE', description: '[↯] Draw a card.' }],
    });
    const deckCard = mockCharacter({ name_fr: 'BakiDrawn' });
    const baseState = createActionPhaseState();
    const state: GameState = {
      ...baseState,
      player1: { ...baseState.player1, deck: [deckCard], hand: [] },
      activeMissions: [
        { ...makeMission('D', [baki]), wonBy: 'player1' },
      ],
    };

    const result = EffectEngine.resolveScoreEffects(state, 'player1', 0);
    expect(result.player1.hand.length).toBe(1);
    expect(result.player1.hand[0].name_fr).toBe('BakiDrawn');
  });
});
