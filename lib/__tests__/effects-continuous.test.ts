/**
 * Comprehensive tests for all continuous [⧗] effects via ContinuousEffects.ts.
 * Tests chakra bonuses, power modifiers, and power token retention.
 */
import { describe, it, expect } from 'vitest';
import { mockCharacter, mockMission, mockCharInPlay, createActionPhaseState } from './testHelpers';
import {
  calculateContinuousChakraBonus,
  calculateContinuousPowerModifier,
  shouldRetainPowerTokens,
} from '../effects/ContinuousEffects';
import type { GameState, CharacterInPlay } from '../engine/types';

function makeMission(rank: 'D' | 'C' | 'B' | 'A' = 'D', p1: CharacterInPlay[] = [], p2: CharacterInPlay[] = []) {
  const rankBonus = { D: 1, C: 2, B: 3, A: 4 }[rank];
  return { card: mockMission(), rank, basePoints: 3, rankBonus, wonBy: null, player1Characters: p1, player2Characters: p2 };
}

// ===================================================================
// CHAKRA BONUSES
// ===================================================================
describe('Chakra Bonuses', () => {
  // 025/130 - KIBA: CHAKRA +1 if Akamaru in same mission
  describe('Kiba 025 - CHAKRA +1 if Akamaru', () => {
    it('should give +1 chakra when Akamaru is in the same mission', () => {
      const kiba = mockCharInPlay({ instanceId: 'kiba-1' }, {
        id: '025/130', number: 25, name_fr: 'Kiba Inuzuka',
        effects: [{ type: 'MAIN', description: '[⧗] If there is a friendly [u]Akamaru[/u] in this mission, CHAKRA +1.' }],
        keywords: ['Team 8'], group: 'Leaf Village',
      });
      const akamaru = mockCharInPlay({ instanceId: 'aka-1' }, {
        id: '027/130', number: 27, name_fr: 'AKAMARU', group: 'Leaf Village',
      });
      const state = createActionPhaseState({
        activeMissions: [makeMission('D', [kiba, akamaru])],
      });

      const bonus = calculateContinuousChakraBonus(state, 'player1', 0, kiba);
      expect(bonus).toBe(1);
    });

    it('should not give bonus when Akamaru is absent', () => {
      const kiba = mockCharInPlay({ instanceId: 'kiba-1' }, {
        id: '025/130', number: 25, name_fr: 'Kiba Inuzuka',
        effects: [{ type: 'MAIN', description: '[⧗] If there is a friendly [u]Akamaru[/u] in this mission, CHAKRA +1.' }],
      });
      const state = createActionPhaseState({
        activeMissions: [makeMission('D', [kiba])],
      });

      const bonus = calculateContinuousChakraBonus(state, 'player1', 0, kiba);
      expect(bonus).toBe(0);
    });

    it('should not give bonus when Akamaru is hidden', () => {
      const kiba = mockCharInPlay({ instanceId: 'kiba-1' }, {
        id: '025/130', number: 25, name_fr: 'Kiba Inuzuka',
        effects: [{ type: 'MAIN', description: '[⧗] If there is a friendly [u]Akamaru[/u] in this mission, CHAKRA +1.' }],
      });
      const hiddenAkamaru = mockCharInPlay({ instanceId: 'aka-h', isHidden: true }, {
        name_fr: 'AKAMARU',
      });
      const state = createActionPhaseState({
        activeMissions: [makeMission('D', [kiba, hiddenAkamaru])],
      });

      const bonus = calculateContinuousChakraBonus(state, 'player1', 0, kiba);
      expect(bonus).toBe(0);
    });
  });

  // 044/130 - ANKO: CHAKRA +1 if another friendly Leaf Village
  describe('Anko 044 - CHAKRA +1 if friendly Leaf Village', () => {
    it('should give +1 when another Leaf Village ally is present', () => {
      const anko = mockCharInPlay({ instanceId: 'anko-1' }, {
        id: '044/130', number: 44, name_fr: 'Anko Mitarashi',
        effects: [{ type: 'MAIN', description: '[⧗] If there is another friendly Leaf Village character in this mission, CHAKRA +1.' }],
        group: 'Leaf Village',
      });
      const leafAlly = mockCharInPlay({ instanceId: 'la-1' }, {
        group: 'Leaf Village', name_fr: 'LeafAlly',
      });
      const state = createActionPhaseState({
        activeMissions: [makeMission('D', [anko, leafAlly])],
      });

      const bonus = calculateContinuousChakraBonus(state, 'player1', 0, anko);
      expect(bonus).toBe(1);
    });

    it('should not count self as another Leaf Village', () => {
      const anko = mockCharInPlay({ instanceId: 'anko-1' }, {
        id: '044/130', number: 44, name_fr: 'Anko',
        effects: [{ type: 'MAIN', description: '[⧗] If there is another friendly Leaf Village character in this mission, CHAKRA +1.' }],
        group: 'Leaf Village',
      });
      const state = createActionPhaseState({
        activeMissions: [makeMission('D', [anko])],
      });

      const bonus = calculateContinuousChakraBonus(state, 'player1', 0, anko);
      expect(bonus).toBe(0);
    });
  });

  // 064/130 - TAYUYA: CHAKRA +X (X = missions with Sound Four)
  describe('Tayuya 064 - CHAKRA +X (Sound Four missions)', () => {
    it('should give chakra equal to number of missions with Sound Four', () => {
      const tayuya = mockCharInPlay({ instanceId: 'tay-1' }, {
        id: '064/130', number: 64, name_fr: 'Tayuya',
        effects: [{ type: 'MAIN', description: '[⧗] CHAKRA +X. X is the number of missions with friendly Sound Four.' }],
        keywords: ['Sound Four'], group: 'Sound Village',
      });
      const sf2 = mockCharInPlay({ instanceId: 'sf2' }, {
        name_fr: 'Jirobo', keywords: ['Sound Four'], group: 'Sound Village',
      });
      const state = createActionPhaseState({
        activeMissions: [
          makeMission('D', [tayuya]),
          makeMission('C', [sf2]),
        ],
      });

      const bonus = calculateContinuousChakraBonus(state, 'player1', 0, tayuya);
      expect(bonus).toBe(2); // 2 missions with Sound Four
    });
  });

  // 077/130 - KANKURO: CHAKRA +1 if non-hidden enemy in this mission
  describe('Kankuro 077 - CHAKRA +1 if enemy present', () => {
    it('should give +1 when non-hidden enemy present', () => {
      const kankuro = mockCharInPlay({ instanceId: 'kan-1' }, {
        id: '077/130', number: 77, name_fr: 'Kankuro',
        effects: [{ type: 'MAIN', description: '[⧗] If there is an enemy non-hidden character in this mission, CHAKRA +1.' }],
        group: 'Sand Village',
      });
      const enemy = mockCharInPlay({ instanceId: 'e1', controlledBy: 'player2', originalOwner: 'player2' }, {
        name_fr: 'Enemy',
      });
      const state = createActionPhaseState({
        activeMissions: [makeMission('D', [kankuro], [enemy])],
      });

      const bonus = calculateContinuousChakraBonus(state, 'player1', 0, kankuro);
      expect(bonus).toBe(1);
    });

    it('should not give bonus when only hidden enemy present', () => {
      const kankuro = mockCharInPlay({ instanceId: 'kan-1' }, {
        id: '077/130', number: 77, name_fr: 'Kankuro',
        effects: [{ type: 'MAIN', description: '[⧗] If there is an enemy non-hidden character in this mission, CHAKRA +1.' }],
      });
      const hiddenEnemy = mockCharInPlay({ instanceId: 'he', isHidden: true, controlledBy: 'player2', originalOwner: 'player2' }, {});
      const state = createActionPhaseState({
        activeMissions: [makeMission('D', [kankuro], [hiddenEnemy])],
      });

      const bonus = calculateContinuousChakraBonus(state, 'player1', 0, kankuro);
      expect(bonus).toBe(0);
    });
  });
});

// ===================================================================
// POWER MODIFIERS
// ===================================================================
describe('Power Modifiers', () => {
  // 015/130 - KAKASHI: Other Team 7 +1 Power
  describe('Kakashi 015 - Team 7 +1 Power', () => {
    it('should give +1 power to other Team 7 characters', () => {
      const kakashi = mockCharInPlay({ instanceId: 'kak-1' }, {
        id: '015/130', number: 15, name_fr: 'Kakashi',
        effects: [{ type: 'MAIN', description: '[⧗] Other Team 7 characters in this mission gain +1 Power.' }],
        keywords: ['Team 7'], group: 'Leaf Village',
      });
      const naruto = mockCharInPlay({ instanceId: 'nar-1' }, {
        name_fr: 'Naruto', keywords: ['Team 7'], group: 'Leaf Village',
      });
      const state = createActionPhaseState({
        activeMissions: [makeMission('D', [kakashi, naruto])],
      });

      const modifier = calculateContinuousPowerModifier(state, 'player1', 0, naruto);
      expect(modifier).toBe(1);
    });

    it('should not buff non-Team-7 characters', () => {
      const kakashi = mockCharInPlay({ instanceId: 'kak-1' }, {
        id: '015/130', number: 15, name_fr: 'Kakashi',
        effects: [{ type: 'MAIN', description: '[⧗] Other Team 7 characters in this mission gain +1 Power.' }],
        keywords: ['Team 7'],
      });
      const gaara = mockCharInPlay({ instanceId: 'gaara-1' }, {
        name_fr: 'Gaara', keywords: ['Team Baki'],
      });
      const state = createActionPhaseState({
        activeMissions: [makeMission('D', [kakashi, gaara])],
      });

      const modifier = calculateContinuousPowerModifier(state, 'player1', 0, gaara);
      expect(modifier).toBe(0);
    });

    it('should not buff self', () => {
      const kakashi = mockCharInPlay({ instanceId: 'kak-1' }, {
        id: '015/130', number: 15, name_fr: 'Kakashi',
        effects: [{ type: 'MAIN', description: '[⧗] Other Team 7 characters in this mission gain +1 Power.' }],
        keywords: ['Team 7'],
      });
      const state = createActionPhaseState({
        activeMissions: [makeMission('D', [kakashi])],
      });

      const modifier = calculateContinuousPowerModifier(state, 'player1', 0, kakashi);
      expect(modifier).toBe(0);
    });
  });

  // 042/130 - GAI: Other Team Guy +1 Power
  describe('Gai 042 - Team Guy +1 Power', () => {
    it('should give +1 power to Team Guy characters', () => {
      const gai = mockCharInPlay({ instanceId: 'gai-1' }, {
        id: '042/130', number: 42, name_fr: 'Gai Maito',
        effects: [{ type: 'MAIN', description: '[⧗] Other Team Guy characters in this mission gain +1 Power.' }],
        keywords: ['Team Guy'], group: 'Leaf Village',
      });
      const lee = mockCharInPlay({ instanceId: 'lee-1' }, {
        name_fr: 'Rock Lee', keywords: ['Team Guy'],
      });
      const state = createActionPhaseState({
        activeMissions: [makeMission('D', [gai, lee])],
      });

      const modifier = calculateContinuousPowerModifier(state, 'player1', 0, lee);
      expect(modifier).toBe(1);
    });
  });

  // 013/130 - SASUKE: -1 Power per other non-hidden friendly
  describe('Sasuke 013 - debuff per friendly', () => {
    it('should lose -1 per other non-hidden friendly', () => {
      const sasuke = mockCharInPlay({ instanceId: 'sas-1' }, {
        id: '013/130', number: 13, name_fr: 'Sasuke',
        effects: [{ type: 'MAIN', description: '[⧗] -1 Power for every other non-hidden friendly character in this mission.' }],
        keywords: ['Team 7'],
      });
      const ally1 = mockCharInPlay({ instanceId: 'a1' }, { name_fr: 'A1' });
      const ally2 = mockCharInPlay({ instanceId: 'a2' }, { name_fr: 'A2' });
      const hiddenAlly = mockCharInPlay({ instanceId: 'ha', isHidden: true }, { name_fr: 'Hidden' });
      const state = createActionPhaseState({
        activeMissions: [makeMission('D', [sasuke, ally1, ally2, hiddenAlly])],
      });

      const modifier = calculateContinuousPowerModifier(state, 'player1', 0, sasuke);
      expect(modifier).toBe(-2); // 2 non-hidden others
    });

    it('should have 0 modifier when alone', () => {
      const sasuke = mockCharInPlay({ instanceId: 'sas-1' }, {
        id: '013/130', number: 13, name_fr: 'Sasuke',
        effects: [{ type: 'MAIN', description: '[⧗] -1 Power for every other non-hidden friendly character in this mission.' }],
      });
      const state = createActionPhaseState({
        activeMissions: [makeMission('D', [sasuke])],
      });

      const modifier = calculateContinuousPowerModifier(state, 'player1', 0, sasuke);
      expect(modifier).toBe(0);
    });
  });

  // 079/130 - TEMARI: +2 Power if you have the Edge
  describe('Temari 079 - +2 Power with Edge', () => {
    it('should give +2 power when player has Edge', () => {
      const temari = mockCharInPlay({ instanceId: 'tem-1' }, {
        id: '079/130', number: 79, name_fr: 'Temari',
        effects: [{ type: 'MAIN', description: '[⧗] +2 Power if you have the Edge.' }],
        group: 'Sand Village',
      });
      const state = createActionPhaseState({
        edgeHolder: 'player1',
        activeMissions: [makeMission('D', [temari])],
      });

      const modifier = calculateContinuousPowerModifier(state, 'player1', 0, temari);
      expect(modifier).toBe(2);
    });

    it('should not give bonus when opponent has Edge', () => {
      const temari = mockCharInPlay({ instanceId: 'tem-1' }, {
        id: '079/130', number: 79, name_fr: 'Temari',
        effects: [{ type: 'MAIN', description: '[⧗] +2 Power if you have the Edge.' }],
      });
      const state = createActionPhaseState({
        edgeHolder: 'player2',
        activeMissions: [makeMission('D', [temari])],
      });

      const modifier = calculateContinuousPowerModifier(state, 'player1', 0, temari);
      expect(modifier).toBe(0);
    });
  });

  // 084/130 - YASHAMARU: +2 Power if friendly Gaara
  describe('Yashamaru 084 - +2 Power if Gaara', () => {
    it('should give +2 when friendly Gaara is in the same mission', () => {
      const yashamaru = mockCharInPlay({ instanceId: 'yash-1' }, {
        id: '084/130', number: 84, name_fr: 'Yashamaru',
        effects: [{ type: 'MAIN', description: '[⧗] +2 Power if there is a friendly [u]Gaara[/u] in this mission.' }],
        group: 'Sand Village',
      });
      const gaara = mockCharInPlay({ instanceId: 'gaara-1' }, {
        name_fr: 'GAARA', group: 'Sand Village',
      });
      const state = createActionPhaseState({
        activeMissions: [makeMission('D', [yashamaru, gaara])],
      });

      const modifier = calculateContinuousPowerModifier(state, 'player1', 0, yashamaru);
      expect(modifier).toBe(2);
    });

    it('should not give bonus when no Gaara', () => {
      const yashamaru = mockCharInPlay({ instanceId: 'yash-1' }, {
        id: '084/130', number: 84, name_fr: 'Yashamaru',
        effects: [{ type: 'MAIN', description: '[⧗] +2 Power if there is a friendly [u]Gaara[/u] in this mission.' }],
      });
      const state = createActionPhaseState({
        activeMissions: [makeMission('D', [yashamaru])],
      });

      const modifier = calculateContinuousPowerModifier(state, 'player1', 0, yashamaru);
      expect(modifier).toBe(0);
    });
  });

  // 101/130 - TON TON: +1 Power if Tsunade or Shizune
  describe('Ton Ton 101 - +1 Power if Tsunade/Shizune', () => {
    it('should give +1 when Tsunade is in the same mission', () => {
      const tonton = mockCharInPlay({ instanceId: 'tt-1' }, {
        id: '101/130', number: 101, name_fr: 'Ton Ton',
        effects: [{ type: 'MAIN', description: '[⧗] +1 Power if there is a friendly Tsunade or Shizune in this mission.' }],
      });
      const tsunade = mockCharInPlay({ instanceId: 'tsu-1' }, {
        name_fr: 'TSUNADE', group: 'Leaf Village',
      });
      const state = createActionPhaseState({
        activeMissions: [makeMission('D', [tonton, tsunade])],
      });

      const modifier = calculateContinuousPowerModifier(state, 'player1', 0, tonton);
      expect(modifier).toBe(1);
    });

    it('should give +1 when Shizune is in the same mission', () => {
      const tonton = mockCharInPlay({ instanceId: 'tt-1' }, {
        id: '101/130', number: 101, name_fr: 'Ton Ton',
        effects: [{ type: 'MAIN', description: '[⧗] +1 Power if there is a friendly Tsunade or Shizune in this mission.' }],
      });
      const shizune = mockCharInPlay({ instanceId: 'shiz-1' }, {
        name_fr: 'SHIZUNE', group: 'Leaf Village',
      });
      const state = createActionPhaseState({
        activeMissions: [makeMission('D', [tonton, shizune])],
      });

      const modifier = calculateContinuousPowerModifier(state, 'player1', 0, tonton);
      expect(modifier).toBe(1);
    });

    it('should not give bonus without Tsunade or Shizune', () => {
      const tonton = mockCharInPlay({ instanceId: 'tt-1' }, {
        id: '101/130', number: 101, name_fr: 'Ton Ton',
        effects: [{ type: 'MAIN', description: '[⧗] +1 Power if there is a friendly Tsunade or Shizune in this mission.' }],
      });
      const state = createActionPhaseState({
        activeMissions: [makeMission('D', [tonton])],
      });

      const modifier = calculateContinuousPowerModifier(state, 'player1', 0, tonton);
      expect(modifier).toBe(0);
    });
  });

  // Combined modifiers
  describe('Combined modifiers', () => {
    it('Kakashi + Gai should stack on a Team 7 + Team Guy character', () => {
      const kakashi = mockCharInPlay({ instanceId: 'kak-1' }, {
        id: '015/130', number: 15, name_fr: 'Kakashi',
        effects: [{ type: 'MAIN', description: '[⧗] Other Team 7 characters in this mission gain +1 Power.' }],
        keywords: ['Team 7'],
      });
      const gai = mockCharInPlay({ instanceId: 'gai-1' }, {
        id: '042/130', number: 42, name_fr: 'Gai',
        effects: [{ type: 'MAIN', description: '[⧗] Other Team Guy characters in this mission gain +1 Power.' }],
        keywords: ['Team Guy'],
      });
      // A character that is both Team 7 and Team Guy doesn't exist in the card data,
      // but let's test stacking with a Team 7 member
      const naruto = mockCharInPlay({ instanceId: 'nar-1' }, {
        name_fr: 'Naruto', keywords: ['Team 7'],
      });
      const state = createActionPhaseState({
        activeMissions: [makeMission('D', [kakashi, gai, naruto])],
      });

      const modifier = calculateContinuousPowerModifier(state, 'player1', 0, naruto);
      expect(modifier).toBe(1); // only Kakashi's Team 7 buff
    });
  });
});

// ===================================================================
// POWER TOKEN RETENTION
// ===================================================================
describe('Power Token Retention', () => {
  describe('Rock Lee 039 - retains power tokens', () => {
    it('should retain power tokens when face-visible', () => {
      const lee = mockCharInPlay({ instanceId: 'lee-1', powerTokens: 3 }, {
        id: '039/130', number: 39, name_fr: 'Rock Lee',
        effects: [{ type: 'MAIN', description: '[⧗] This character doesn\'t lose Power tokens at the end of the round.' }],
      });
      expect(shouldRetainPowerTokens(lee)).toBe(true);
    });

    it('should NOT retain when hidden', () => {
      const lee = mockCharInPlay({ instanceId: 'lee-h', isHidden: true, powerTokens: 3 }, {
        id: '039/130', number: 39, name_fr: 'Rock Lee',
        effects: [{ type: 'MAIN', description: '[⧗] This character doesn\'t lose Power tokens at the end of the round.' }],
      });
      expect(shouldRetainPowerTokens(lee)).toBe(false);
    });
  });

  describe('Other characters - do not retain', () => {
    it('should not retain for normal characters', () => {
      const naruto = mockCharInPlay({ powerTokens: 5 }, {
        id: '009/130', number: 9, name_fr: 'Naruto',
      });
      expect(shouldRetainPowerTokens(naruto)).toBe(false);
    });
  });
});

// ===================================================================
// Hidden characters should not provide any continuous effects
// ===================================================================
describe('Hidden characters', () => {
  it('hidden characters should give 0 chakra bonus', () => {
    const hiddenKiba = mockCharInPlay({ instanceId: 'kiba-h', isHidden: true }, {
      id: '025/130', number: 25, name_fr: 'Kiba',
      effects: [{ type: 'MAIN', description: '[⧗] If there is a friendly [u]Akamaru[/u] in this mission, CHAKRA +1.' }],
    });
    const state = createActionPhaseState({
      activeMissions: [makeMission('D', [hiddenKiba])],
    });

    const bonus = calculateContinuousChakraBonus(state, 'player1', 0, hiddenKiba);
    expect(bonus).toBe(0);
  });

  it('hidden characters should give 0 power modifier', () => {
    const hiddenTemari = mockCharInPlay({ instanceId: 'tem-h', isHidden: true }, {
      id: '079/130', number: 79, name_fr: 'Temari',
      effects: [{ type: 'MAIN', description: '[⧗] +2 Power if you have the Edge.' }],
    });
    const state = createActionPhaseState({
      edgeHolder: 'player1',
      activeMissions: [makeMission('D', [hiddenTemari])],
    });

    const modifier = calculateContinuousPowerModifier(state, 'player1', 0, hiddenTemari);
    expect(modifier).toBe(0);
  });
});
