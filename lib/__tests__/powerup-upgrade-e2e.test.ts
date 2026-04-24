
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../engine/GameEngine';
import { mockCharacter, mockCharInPlay, mockMission, createActionPhaseState } from './testHelpers';
import type { GameState, CharacterInPlay, TurnNumber } from '../engine/types';
import { generateInstanceId, generateGameId } from '../engine/utils/id';
import { getAllCharacters } from '../data/cardLoader';
import { getEffectHandler } from '../effects/EffectRegistry';


const allChars = getAllCharacters();
function findCard(id: string) {
  return allChars.find(c => c.id === id);
}

describe('POWERUP end-to-end', () => {
  it('Hiruzen 001 should prompt to POWERUP 2 on a single friendly Leaf Village target (optional)', () => {
    const hiruzen = findCard('KS-001-C')!;
    expect(hiruzen).toBeDefined();
    expect(hiruzen.effects?.some(e => e.type === 'MAIN')).toBe(true);

    
    const ally = mockCharInPlay(
      { instanceId: 'ally-leaf', controlledBy: 'player1', missionIndex: 0 },
      { id: 'KS-003-C', name_fr: 'TSUNADE', group: 'Leaf Village', power: 2, chakra: 2 },
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

    
    const p1Chars = newState.activeMissions[0].player1Characters;
    expect(p1Chars.length).toBe(2);

    
    expect(newState.pendingEffects.length).toBeGreaterThan(0);
    const pendingEff = newState.pendingEffects.find(e => e.targetSelectionType === 'HIRUZEN001_CONFIRM_MAIN');
    expect(pendingEff).toBeDefined();
    expect(pendingEff!.isOptional).toBe(true);
    
    const updatedAlly = p1Chars.find(c => c.instanceId === 'ally-leaf');
    expect(updatedAlly!.powerTokens).toBe(0);
  });

  it('Hiruzen 001 should fizzle if no Leaf Village target', () => {
    const hiruzen = findCard('KS-001-C')!;

    
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

    
    const updatedAlly = newState.activeMissions[0].player1Characters.find(c => c.instanceId === 'ally-sand');
    expect(updatedAlly!.powerTokens).toBe(0);
  });

  it('Gaara 074 should POWERUP X where X = number of hidden allies in this mission', () => {
    const gaara = findCard('KS-074-C')!;
    expect(gaara).toBeDefined();

    
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

    const afterPlay = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER',
      cardIndex: 0,
      missionIndex: 0,
      hidden: false,
    });

    
    const confirmPending = afterPlay.pendingEffects.find(
      (e: any) => e.targetSelectionType === 'GAARA074_CONFIRM_MAIN'
    );
    expect(confirmPending).toBeDefined();
    expect(afterPlay.pendingActions.length).toBeGreaterThan(0);

    
    const confirmAction = afterPlay.pendingActions[0];
    const newState = GameEngine.applyAction(afterPlay, 'player1', {
      type: 'SELECT_TARGET',
      pendingActionId: confirmAction.id,
      selectedTargets: [confirmAction.options[0]],
    });

    
    const playedGaara = newState.activeMissions[0].player1Characters.find(
      (c: any) => c.card.id === 'KS-074-C'
    );
    expect(playedGaara).toBeDefined();
    expect(playedGaara!.powerTokens).toBe(2);
  });
});

describe('UPGRADE end-to-end', () => {
  it('Upgrading Naruto 009 to Naruto 108 should trigger MAIN and UPGRADE effects', () => {
    const naruto009 = findCard('KS-009-C')!;
    const naruto108 = findCard('KS-108-R')!;
    expect(naruto009).toBeDefined();
    expect(naruto108).toBeDefined();

    
    expect(naruto009.name_fr.toUpperCase()).toBe(naruto108.name_fr.toUpperCase());
    expect(naruto108.chakra).toBeGreaterThan(naruto009.chakra);

    
    const narutoOnBoard = mockCharInPlay(
      { instanceId: 'naruto-in-play', controlledBy: 'player1', missionIndex: 0 },
      { ...naruto009 },
    );
    
    const enemy = mockCharInPlay(
      { instanceId: 'enemy-1', controlledBy: 'player2', originalOwner: 'player2', missionIndex: 0 },
      { id: 'KS-099-C', name_fr: 'Enemy', power: 3, chakra: 2 },
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

    
    const stateAfterUpgrade = GameEngine.applyAction(state, 'player1', {
      type: 'UPGRADE_CHARACTER',
      cardIndex: 0,
      missionIndex: 0,
      targetInstanceId: 'naruto-in-play',
    });

    
    const upgraded = stateAfterUpgrade.activeMissions[0].player1Characters.find(c => c.instanceId === 'naruto-in-play');
    expect(upgraded).toBeDefined();
    expect(upgraded!.stack.length).toBe(2);
    expect(upgraded!.card.id).toBe('KS-108-R');

    
    const costDiff = naruto108.chakra - naruto009.chakra;
    expect(stateAfterUpgrade.player1.chakra).toBe(20 - costDiff);

    
    expect(stateAfterUpgrade.pendingActions.length).toBeGreaterThan(0);
    const confirmAction = stateAfterUpgrade.pendingActions[0];
    
    expect(confirmAction.options).toContain('naruto-in-play');

    
    const stateAfterConfirm = GameEngine.applyAction(stateAfterUpgrade, 'player1', {
      type: 'SELECT_TARGET',
      pendingActionId: confirmAction.id,
      selectedTargets: ['naruto-in-play'],
    });

    
    expect(stateAfterConfirm.pendingActions.length).toBeGreaterThan(0);
    const modifierAction = stateAfterConfirm.pendingActions[0];

    
    const stateAfterModifier = GameEngine.applyAction(stateAfterConfirm, 'player1', {
      type: 'SELECT_TARGET',
      pendingActionId: modifierAction.id,
      selectedTargets: ['naruto-in-play'],
    });

    
    expect(stateAfterModifier.pendingActions.length).toBeGreaterThan(0);
    const targetAction = stateAfterModifier.pendingActions[0];
    expect(targetAction.options).toContain('enemy-1');

    const finalState = GameEngine.applyAction(stateAfterModifier, 'player1', {
      type: 'SELECT_TARGET',
      pendingActionId: targetAction.id,
      selectedTargets: ['enemy-1'],
    });

    
    const updatedEnemy = finalState.activeMissions[0].player2Characters.find(c => c.instanceId === 'enemy-1');
    expect(updatedEnemy!.isHidden).toBe(true);

    
    const finalUpgraded = finalState.activeMissions[0].player1Characters.find(c => c.instanceId === 'naruto-in-play');
    expect(finalUpgraded!.powerTokens).toBe(3);
  });

  it('Upgrading Gaara 074 to Gaara 120 should prompt to defeat weak enemies (optional per-mission)', () => {
    const gaara074 = findCard('KS-074-C')!;
    const gaara120 = findCard('KS-120-R')!;
    expect(gaara074).toBeDefined();
    expect(gaara120).toBeDefined();

    
    expect(gaara074.name_fr.toUpperCase()).toBe(gaara120.name_fr.toUpperCase());
    expect(gaara120.chakra).toBeGreaterThan(gaara074.chakra);

    
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

    
    const upgraded = newState.activeMissions[0].player1Characters.find(c => c.instanceId === 'gaara-in-play');
    expect(upgraded).toBeDefined();
    expect(upgraded!.stack.length).toBe(2);
    expect(upgraded!.card.id).toBe('KS-120-R');

    
    
    const gaara120Pending = newState.pendingEffects.find(e => e.targetSelectionType === 'GAARA120_CONFIRM_MAIN');
    expect(gaara120Pending).toBeDefined();
    expect(gaara120Pending!.isOptional).toBe(true);
    
    const m0Enemies = newState.activeMissions[0].player2Characters;
    expect(m0Enemies.find(c => c.instanceId === 'weak1')).toBeDefined();
  });

  it('Rock Lee 039 UPGRADE should return CONFIRM popup then POWERUP 2', () => {
    const rockLee = findCard('KS-039-UC')!;
    expect(rockLee).toBeDefined();

    
    const leeOnBoard = mockCharInPlay(
      { instanceId: 'lee-in-play', controlledBy: 'player1', missionIndex: 0, powerTokens: 1 },
      { id: 'KS-039-UC', name_fr: rockLee.name_fr, chakra: rockLee.chakra - 1, power: rockLee.power - 1, keywords: ['Team Guy'], group: 'Leaf Village',
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

    
    expect(newState.pendingEffects.length).toBeGreaterThan(0);
    const confirmPending = newState.pendingEffects.find(p => p.targetSelectionType === 'ROCKLEE039_CONFIRM_UPGRADE');
    expect(confirmPending).toBeDefined();
    const confirmAction = newState.pendingActions.find(a => a.sourceEffectId === confirmPending!.id);
    expect(confirmAction).toBeDefined();

    
    const confirmedState = GameEngine.applyAction(newState, 'player1', {
      type: 'SELECT_TARGET',
      pendingActionId: confirmAction!.id,
      selectedTargets: ['lee-in-play'],
    });

    const upgraded = confirmedState.activeMissions[0].player1Characters.find(c => c.instanceId === 'lee-in-play');
    expect(upgraded).toBeDefined();
    
    expect(upgraded!.powerTokens).toBe(3);
  });
});

describe('Card data integrity for effects', () => {
  it('all cards with EFFECT_CORRECTIONS should have effects loaded', () => {
    const correctedIds = ['KS-108-R', 'KS-120-R', 'KS-133-S', 'KS-137-S', 'KS-109-R', 'KS-112-R', 'KS-135-S'];
    for (const id of correctedIds) {
      const card = findCard(id);
      if (!card) continue; // Card might not be playable
      expect(card.effects, `Card ${id} should have effects`).toBeDefined();
      expect(card.effects!.length, `Card ${id} should have at least 1 effect`).toBeGreaterThan(0);
    }
  });

  it('effect handlers should be registered for key cards', () => {
    const cardsWithHandlers = [
      'KS-001-C', 'KS-003-C', 'KS-007-C', 'KS-009-C', 'KS-011-C', 'KS-013-C', 'KS-015-C',
      'KS-039-UC', 'KS-074-C', 'KS-108-R', 'KS-120-R', 'KS-133-S', 'KS-135-S', 'KS-135-MV', 'KS-136-S', 'KS-136-MV', 'KS-137-S',
    ];
    for (const id of cardsWithHandlers) {
      const handler = getEffectHandler(id, 'MAIN');
      expect(handler, `Card ${id} should have a MAIN handler`).toBeDefined();
    }
  });

  it('Naruto cards should have matching names for upgrade chain', () => {
    const naruto009 = findCard('KS-009-C');
    const naruto108 = findCard('KS-108-R');
    const naruto133 = findCard('KS-133-S');

    if (naruto009 && naruto108) {
      expect(naruto009.name_fr.toUpperCase()).toBe(naruto108.name_fr.toUpperCase());
    }
    if (naruto108 && naruto133) {
      expect(naruto108.name_fr.toUpperCase()).toBe(naruto133.name_fr.toUpperCase());
    }
  });
});
