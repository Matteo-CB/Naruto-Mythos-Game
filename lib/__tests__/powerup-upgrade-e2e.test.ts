/**
 * End-to-end tests for POWERUP and UPGRADE flows.
 * Uses REAL card IDs to verify effect handlers are actually triggered
 * through the full GameEngine.applyAction pipeline.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../engine/GameEngine';
import { mockCharacter, mockCharInPlay, mockMission, createActionPhaseState } from './testHelpers';
import type { GameState, CharacterInPlay, TurnNumber } from '../engine/types';
import { generateInstanceId, generateGameId } from '../engine/utils/id';
import { getPlayableCharacters } from '../data/cardLoader';
import { getEffectHandler } from '../effects/EffectRegistry';

// Load real card data
const allChars = getPlayableCharacters();
function findCard(id: string) {
  return allChars.find(c => c.id === id);
}

describe('POWERUP end-to-end', () => {
  it('Hiruzen 001 should POWERUP 2 on a single friendly Leaf Village target', () => {
    const hiruzen = findCard('001/130')!;
    expect(hiruzen).toBeDefined();
    expect(hiruzen.effects?.some(e => e.type === 'MAIN')).toBe(true);

    // A friendly Leaf Village character already on mission 0
    const ally = mockCharInPlay(
      { instanceId: 'ally-leaf', controlledBy: 'player1', missionIndex: 0 },
      { id: '003/130', name_fr: 'TSUNADE', group: 'Leaf Village', power: 2, chakra: 2 },
    );

    const state = createActionPhaseState({
      player1: {
        ...createActionPhaseState().player1,
        hand: [hiruzen, mockCharacter(), mockCharacter(), mockCharacter(), mockCharacter()],
        chakra: 10,
      },
      activeMissions: [{
        card: mockMission(),
        rank: 'D',
        basePoints: 3,
        rankBonus: 1,
        player1Characters: [ally],
        player2Characters: [],
        wonBy: null,
      }],
    });

    // Play Hiruzen on mission 0
    const newState = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER',
      cardIndex: 0,
      missionIndex: 0,
      hidden: false,
    });

    // Hiruzen should be on the board
    const p1Chars = newState.activeMissions[0].player1Characters;
    expect(p1Chars.length).toBe(2);

    // The ally should have 2 power tokens from Hiruzen's POWERUP 2
    const updatedAlly = p1Chars.find(c => c.instanceId === 'ally-leaf');
    expect(updatedAlly).toBeDefined();
    expect(updatedAlly!.powerTokens).toBe(2);
  });

  it('Hiruzen 001 should fizzle if no Leaf Village target', () => {
    const hiruzen = findCard('001/130')!;

    // Only non-Leaf Village ally
    const ally = mockCharInPlay(
      { instanceId: 'ally-sand', controlledBy: 'player1', missionIndex: 0 },
      { name_fr: 'Enemy', group: 'Sand Village', power: 2 },
    );

    const state = createActionPhaseState({
      player1: {
        ...createActionPhaseState().player1,
        hand: [hiruzen, mockCharacter(), mockCharacter(), mockCharacter(), mockCharacter()],
        chakra: 10,
      },
      activeMissions: [{
        card: mockMission(),
        rank: 'D',
        basePoints: 3,
        rankBonus: 1,
        player1Characters: [ally],
        player2Characters: [],
        wonBy: null,
      }],
    });

    const newState = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER',
      cardIndex: 0,
      missionIndex: 0,
      hidden: false,
    });

    // Ally should have 0 power tokens (fizzled)
    const updatedAlly = newState.activeMissions[0].player1Characters.find(c => c.instanceId === 'ally-sand');
    expect(updatedAlly!.powerTokens).toBe(0);
  });

  it('Gaara 074 should POWERUP X where X = number of hidden allies in this mission', () => {
    const gaara = findCard('074/130')!;
    expect(gaara).toBeDefined();

    // Two hidden allies in the same mission
    const hidden1 = mockCharInPlay(
      { instanceId: 'h1', controlledBy: 'player1', missionIndex: 0, isHidden: true },
      { name_fr: 'Hidden1' },
    );
    const hidden2 = mockCharInPlay(
      { instanceId: 'h2', controlledBy: 'player1', missionIndex: 0, isHidden: true },
      { name_fr: 'Hidden2' },
    );

    const state = createActionPhaseState({
      player1: {
        ...createActionPhaseState().player1,
        hand: [gaara, mockCharacter(), mockCharacter(), mockCharacter(), mockCharacter()],
        chakra: 10,
      },
      activeMissions: [{
        card: mockMission(),
        rank: 'D',
        basePoints: 3,
        rankBonus: 1,
        player1Characters: [hidden1, hidden2],
        player2Characters: [],
        wonBy: null,
      }],
    });

    const newState = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER',
      cardIndex: 0,
      missionIndex: 0,
      hidden: false,
    });

    // Gaara should have powerTokens = 2 (2 hidden allies)
    const playedGaara = newState.activeMissions[0].player1Characters.find(
      c => c.card.id === '074/130'
    );
    expect(playedGaara).toBeDefined();
    expect(playedGaara!.powerTokens).toBe(2);
  });
});

describe('UPGRADE end-to-end', () => {
  it('Upgrading Naruto 009 to Naruto 108 should trigger MAIN and UPGRADE effects', () => {
    const naruto009 = findCard('009/130')!;
    const naruto108 = findCard('108/130')!;
    expect(naruto009).toBeDefined();
    expect(naruto108).toBeDefined();

    // Check names match for upgrade
    expect(naruto009.name_fr.toUpperCase()).toBe(naruto108.name_fr.toUpperCase());
    expect(naruto108.chakra).toBeGreaterThan(naruto009.chakra);

    // Place Naruto 009 on board with an enemy that has power 3 or less
    const narutoOnBoard = mockCharInPlay(
      { instanceId: 'naruto-in-play', controlledBy: 'player1', missionIndex: 0 },
      { ...naruto009 },
    );
    // Enemy with power 3 in the same mission
    const enemy = mockCharInPlay(
      { instanceId: 'enemy-1', controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0 },
      { id: '099/130', name_fr: 'Enemy', power: 3, chakra: 2 },
    );

    const state = createActionPhaseState({
      player1: {
        ...createActionPhaseState().player1,
        hand: [naruto108, mockCharacter({ name_fr: 'Other1' }), mockCharacter({ name_fr: 'Other2' })],
        chakra: 20,
      },
      activeMissions: [{
        card: mockMission(),
        rank: 'D',
        basePoints: 3,
        rankBonus: 1,
        player1Characters: [narutoOnBoard],
        player2Characters: [enemy],
        wonBy: null,
      }],
    });

    const newState = GameEngine.applyAction(state, 'player1', {
      type: 'UPGRADE_CHARACTER',
      cardIndex: 0,
      missionIndex: 0,
      targetInstanceId: 'naruto-in-play',
    });

    // Stack should be upgraded
    const upgraded = newState.activeMissions[0].player1Characters.find(c => c.instanceId === 'naruto-in-play');
    expect(upgraded).toBeDefined();
    expect(upgraded!.stack.length).toBe(2);
    expect(upgraded!.card.id).toBe('108/130');

    // MAIN effect: enemy should be hidden (power 3 <= 3)
    const updatedEnemy = newState.activeMissions[0].player2Characters.find(c => c.instanceId === 'enemy-1');
    expect(updatedEnemy!.isHidden).toBe(true);

    // UPGRADE effect: POWERUP X where X = enemy power (3)
    expect(upgraded!.powerTokens).toBe(3);

    // Chakra should be reduced by the cost difference (108 cost - 009 cost)
    const costDiff = naruto108.chakra - naruto009.chakra;
    expect(newState.player1.chakra).toBe(20 - costDiff);
  });

  it('Upgrading Gaara 074 to Gaara 120 should defeat weak enemies and POWERUP X', () => {
    const gaara074 = findCard('074/130')!;
    const gaara120 = findCard('120/130')!;
    expect(gaara074).toBeDefined();
    expect(gaara120).toBeDefined();

    // Check names match for upgrade
    expect(gaara074.name_fr.toUpperCase()).toBe(gaara120.name_fr.toUpperCase());
    expect(gaara120.chakra).toBeGreaterThan(gaara074.chakra);

    // Place Gaara 074 on board, add weak enemies
    const gaaraOnBoard = mockCharInPlay(
      { instanceId: 'gaara-in-play', controlledBy: 'player1', missionIndex: 0 },
      { ...gaara074 },
    );
    const weakEnemy1 = mockCharInPlay(
      { instanceId: 'weak1', controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0 },
      { name_fr: 'Weak1', power: 1, chakra: 1 },
    );
    const weakEnemy2 = mockCharInPlay(
      { instanceId: 'weak2', controlledBy: 'player2', originalOwner: 'player2', missionIndex: 1 },
      { name_fr: 'Weak2', power: 0, chakra: 1 },
    );

    const state = createActionPhaseState({
      player1: {
        ...createActionPhaseState().player1,
        hand: [gaara120, mockCharacter({ name_fr: 'Other1' }), mockCharacter({ name_fr: 'Other2' })],
        chakra: 20,
      },
      activeMissions: [
        {
          card: mockMission(),
          rank: 'D',
          basePoints: 3,
          rankBonus: 1,
          player1Characters: [gaaraOnBoard],
          player2Characters: [weakEnemy1],
          wonBy: null,
        },
        {
          card: mockMission(),
          rank: 'C',
          basePoints: 3,
          rankBonus: 2,
          player1Characters: [],
          player2Characters: [weakEnemy2],
          wonBy: null,
        },
      ],
    });

    const newState = GameEngine.applyAction(state, 'player1', {
      type: 'UPGRADE_CHARACTER',
      cardIndex: 0,
      missionIndex: 0,
      targetInstanceId: 'gaara-in-play',
    });

    // Stack should be upgraded
    const upgraded = newState.activeMissions[0].player1Characters.find(c => c.instanceId === 'gaara-in-play');
    expect(upgraded).toBeDefined();
    expect(upgraded!.stack.length).toBe(2);
    expect(upgraded!.card.id).toBe('120/130');

    // MAIN effect: weak enemies should be defeated
    const m0Enemies = newState.activeMissions[0].player2Characters;
    const m1Enemies = newState.activeMissions[1].player2Characters;
    // Weak enemies with power <= 1 should be defeated (removed)
    expect(m0Enemies.find(c => c.instanceId === 'weak1')).toBeUndefined();
    expect(m1Enemies.find(c => c.instanceId === 'weak2')).toBeUndefined();

    // UPGRADE effect: POWERUP X where X = number of defeated (2)
    expect(upgraded!.powerTokens).toBe(2);
  });

  it('Rock Lee 039 UPGRADE should POWERUP 2', () => {
    const rockLee = findCard('039/130')!;
    expect(rockLee).toBeDefined();

    // A lower cost Rock Lee already on board
    const leeOnBoard = mockCharInPlay(
      { instanceId: 'lee-in-play', controlledBy: 'player1', missionIndex: 0, powerTokens: 1 },
      { id: '039/130', name_fr: rockLee.name_fr, chakra: rockLee.chakra - 1, power: rockLee.power - 1, keywords: ['Team Guy'], group: 'Leaf Village',
        effects: [
          { type: 'MAIN', description: '[⧗] This character doesn\'t lose Power tokens at the end of the round.' },
          { type: 'UPGRADE', description: 'POWERUP 2.' },
        ],
      },
    );

    const state = createActionPhaseState({
      player1: {
        ...createActionPhaseState().player1,
        hand: [rockLee, mockCharacter({ name_fr: 'Other' })],
        chakra: 20,
      },
      activeMissions: [{
        card: mockMission(),
        rank: 'D',
        basePoints: 3,
        rankBonus: 1,
        player1Characters: [leeOnBoard],
        player2Characters: [],
        wonBy: null,
      }],
    });

    const newState = GameEngine.applyAction(state, 'player1', {
      type: 'UPGRADE_CHARACTER',
      cardIndex: 0,
      missionIndex: 0,
      targetInstanceId: 'lee-in-play',
    });

    const upgraded = newState.activeMissions[0].player1Characters.find(c => c.instanceId === 'lee-in-play');
    expect(upgraded).toBeDefined();
    // Should have 1 (existing) + 2 (UPGRADE POWERUP) = 3 tokens
    expect(upgraded!.powerTokens).toBe(3);
  });
});

describe('Card data integrity for effects', () => {
  it('all cards with EFFECT_CORRECTIONS should have effects loaded', () => {
    const correctedIds = ['108/130', '120/130', '133/130', '137/130', '109/130', '112/130', '135/130'];
    for (const id of correctedIds) {
      const card = findCard(id);
      if (!card) continue; // Card might not be playable
      expect(card.effects, `Card ${id} should have effects`).toBeDefined();
      expect(card.effects!.length, `Card ${id} should have at least 1 effect`).toBeGreaterThan(0);
    }
  });

  it('effect handlers should be registered for key cards', () => {
    const cardsWithHandlers = [
      '001/130', '003/130', '007/130', '009/130', '011/130', '013/130', '015/130',
      '039/130', '074/130', '108/130', '120/130', '133/130', '135/130', '136/130', '137/130',
    ];
    for (const id of cardsWithHandlers) {
      const handler = getEffectHandler(id, 'MAIN');
      expect(handler, `Card ${id} should have a MAIN handler`).toBeDefined();
    }
  });

  it('Naruto cards should have matching names for upgrade chain', () => {
    const naruto009 = findCard('009/130');
    const naruto108 = findCard('108/130');
    const naruto133 = findCard('133/130');

    if (naruto009 && naruto108) {
      expect(naruto009.name_fr.toUpperCase()).toBe(naruto108.name_fr.toUpperCase());
    }
    if (naruto108 && naruto133) {
      expect(naruto108.name_fr.toUpperCase()).toBe(naruto133.name_fr.toUpperCase());
    }
  });
});
