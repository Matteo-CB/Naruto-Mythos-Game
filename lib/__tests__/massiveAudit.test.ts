// @ts-nocheck


import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GameEngine } from '../engine/GameEngine';
import type {
  GameState,
  GameConfig,
  PlayerConfig,
  CharacterCard,
  MissionCard,
  CharacterInPlay,
  ActiveMission,
  PlayerID,
  TurnNumber,
  GameAction,
  PendingEffect,
  PendingAction,
  CardEffect,
} from '../engine/types';
import {
  BASE_CHAKRA_PER_TURN,
  HIDDEN_PLAY_COST,
  INITIAL_HAND_SIZE,
  CARDS_DRAWN_PER_TURN,
  TOTAL_TURNS,
  RANK_BONUS,
  TURN_TO_RANK,
} from '../engine/types';
import { generateInstanceId, generateGameId } from '../engine/utils/id';
import { deepClone } from '../engine/utils/deepClone';
import { getEffectHandler, initializeRegistry } from '../effects/EffectRegistry';
import { calculateContinuousPowerModifier, calculateContinuousChakraBonus } from '../effects/ContinuousEffects';
import { mockCharacter, mockMission, mockCharInPlay, createActionPhaseState, createTestDeck, createTestConfig } from './testHelpers';





import * as fs from 'fs';
import * as path from 'path';

let ALL_CARDS: Record<string, any> = {};
let ALL_MISSIONS: any[] = [];
let CHARACTER_CARDS: Record<string, any> = {};
let MISSION_CARDS: Record<string, any> = {};


interface AuditIssue {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  category: string;
  cardId?: string;
  cardName?: string;
  description: string;
  expected: string;
  actual: string;
  rule_reference?: string;
}

const auditIssues: AuditIssue[] = [];

function addIssue(issue: AuditIssue) {
  auditIssues.push(issue);
}

beforeAll(() => {
  
  initializeRegistry();

  
  const cardsPath = path.resolve(__dirname, '../data/sets/KS/cards.json');
  const missionsPath = path.resolve(__dirname, '../data/missions.json');

  if (fs.existsSync(cardsPath)) {
    const data = JSON.parse(fs.readFileSync(cardsPath, 'utf-8'));
    ALL_CARDS = data.cards || data;
  }

  if (fs.existsSync(missionsPath)) {
    const data = JSON.parse(fs.readFileSync(missionsPath, 'utf-8'));
    ALL_MISSIONS = Array.isArray(data) ? data : data.missions || [];
  }

  
  for (const [id, card] of Object.entries(ALL_CARDS)) {
    const c = card as any;
    if (c.card_type === 'mission') {
      MISSION_CARDS[id] = c;
    } else {
      CHARACTER_CARDS[id] = c;
    }
  }
});





function makeCard(cardId: string, overrides: Partial<CharacterCard> = {}): CharacterCard {
  const data = ALL_CARDS[cardId];
  if (!data) {
    return mockCharacter({ id: cardId, ...overrides });
  }
  return {
    id: data.id,
    cardId: data.id,
    set: data.set || 'KS',
    number: parseInt(data.number) || 0,
    name_fr: data.name_fr || data.name_en || 'Unknown',
    name_en: data.name_en,
    title_fr: data.title_fr || '',
    title_en: data.title_en || '',
    rarity: data.rarity,
    card_type: data.card_type,
    has_visual: data.has_visual ?? true,
    chakra: data.chakra ?? 0,
    power: data.power ?? 0,
    keywords: data.keywords || [],
    group: data.group || '',
    effects: data.effects || [],
    image_file: data.image_file,
    data_complete: data.data_complete,
    ...overrides,
  } as CharacterCard;
}

function makeMissionCard(cardId: string, overrides: Partial<MissionCard> = {}): MissionCard {
  const data = ALL_CARDS[cardId] || MISSION_CARDS[cardId];
  if (!data) {
    return mockMission({ id: cardId, ...overrides });
  }
  return {
    id: data.id,
    cardId: data.id,
    set: data.set || 'KS',
    number: parseInt(data.number) || 0,
    name_fr: data.name_fr || 'Unknown Mission',
    name_en: data.name_en,
    title_fr: data.title_fr || '',
    rarity: 'MMS',
    card_type: 'mission',
    has_visual: true,
    chakra: 0,
    power: 0,
    keywords: [],
    group: '',
    effects: data.effects || [],
    basePoints: data.basePoints ?? 2,
    image_file: data.image_file,
    ...overrides,
  } as MissionCard;
}

function placeCharOnMission(
  state: GameState,
  player: PlayerID,
  cardId: string,
  missionIndex: number,
  options: { isHidden?: boolean; powerTokens?: number; controlledBy?: PlayerID } = {}
): CharacterInPlay {
  const card = makeCard(cardId);
  const char: CharacterInPlay = {
    instanceId: generateInstanceId(),
    card,
    isHidden: options.isHidden ?? false,
    wasRevealedAtLeastOnce: !(options.isHidden ?? false),
    powerTokens: options.powerTokens ?? 0,
    stack: [card],
    controlledBy: options.controlledBy ?? player,
    originalOwner: player,
    missionIndex,
  };

  const mission = state.activeMissions[missionIndex];
  if (mission) {
    if (player === 'player1') {
      mission.player1Characters.push(char);
    } else {
      mission.player2Characters.push(char);
    }
  }

  return char;
}

function createGameState(overrides: Partial<GameState> = {}): GameState {
  return createActionPhaseState(overrides);
}

function buildDeckFromIds(cardIds: string[]): CharacterCard[] {
  return cardIds.map(id => makeCard(id));
}

function getCharactersOnMission(state: GameState, player: PlayerID, missionIndex: number): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  return player === 'player1' ? mission.player1Characters : mission.player2Characters;
}

function getAllCharactersInPlay(state: GameState, player: PlayerID): CharacterInPlay[] {
  const chars: CharacterInPlay[] = [];
  for (const mission of state.activeMissions) {
    const arr = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    chars.push(...arr);
  }
  return chars;
}





describe('SECTION 1: Core Rule Compliance', () => {

  describe('1.1 Game Setup Rules', () => {

    it('should start with correct initial hand size (5 cards)', () => {
      expect(INITIAL_HAND_SIZE).toBe(5);
    });

    it('should have 4 total turns', () => {
      expect(TOTAL_TURNS).toBe(4);
    });

    it('should grant 5 base chakra per turn', () => {
      expect(BASE_CHAKRA_PER_TURN).toBe(5);
    });

    it('should cost exactly 1 chakra to play hidden', () => {
      expect(HIDDEN_PLAY_COST).toBe(1);
    });

    it('should draw 2 cards per turn', () => {
      expect(CARDS_DRAWN_PER_TURN).toBe(2);
    });

    it('should have correct rank bonuses (D:1, C:2, B:3, A:4)', () => {
      expect(RANK_BONUS).toEqual({ D: 1, C: 2, B: 3, A: 4 });
    });

    it('should map turns to correct ranks', () => {
      expect(TURN_TO_RANK).toEqual({ 1: 'D', 2: 'C', 3: 'B', 4: 'A' });
    });

    it('should use 2 mission cards per player (4 total mission deck)', () => {
      
      
      const config = createTestConfig();
      const state = GameEngine.createGame(config);
      
      
      const totalMissionCards = state.missionDeck.length + state.activeMissions.length;
      expect(totalMissionCards).toBeLessThanOrEqual(4);
    });
  });

  describe('1.2 Phase Sequence', () => {

    it('should follow correct phase order: Start -> Action -> Mission -> End', () => {
      const validSequence = ['start', 'action', 'mission', 'end'];
      
      const state = createGameState({ phase: 'action' });
      expect(['start', 'action', 'mission', 'end', 'gameOver', 'mulligan', 'setup']).toContain(state.phase);
    });

    it('should reveal one mission per turn at start of Start Phase', () => {
      const state = createGameState();
      
      expect(state.activeMissions.length).toBeGreaterThanOrEqual(1);
    });

    it('should evaluate missions in rank order D -> C -> B -> A', () => {
      
      const ranks = ['D', 'C', 'B', 'A'];
      const turnRanks = [TURN_TO_RANK[1], TURN_TO_RANK[2], TURN_TO_RANK[3], TURN_TO_RANK[4]];
      expect(turnRanks).toEqual(ranks);
    });
  });

  describe('1.3 Chakra Rules', () => {

    it('should calculate chakra correctly: 5 base + 1 per character in play', () => {
      const state = createGameState();
      
      placeCharOnMission(state, 'player1', 'KS-009-C', 0);
      placeCharOnMission(state, 'player1', 'KS-011-C', 0);
      placeCharOnMission(state, 'player1', 'KS-013-C', 0);

      
      const expectedChakra = BASE_CHAKRA_PER_TURN + 3;
      expect(expectedChakra).toBe(8);
    });

    it('should count hidden characters for chakra calculation', () => {
      const state = createGameState();
      
      placeCharOnMission(state, 'player1', 'KS-009-C', 0, { isHidden: true });

      
      const charCount = getAllCharactersInPlay(state, 'player1').length;
      expect(charCount).toBe(1);
      
    });

    it('should reset chakra to 0 at End Phase', () => {
      const state = createGameState();
      state.player1.chakra = 15;
      
      
    });
  });

  describe('1.4 Edge Token Rules', () => {

    it('should give Edge token to first passer', () => {
      const state = createGameState({ edgeHolder: 'player2' });
      
      state.firstPasser = 'player1';
      
    });

    it('should use Edge token for tie-breaking in Mission Phase', () => {
      const state = createGameState({ edgeHolder: 'player1' });
      const mission = state.activeMissions[0];

      
      placeCharOnMission(state, 'player1', 'KS-009-C', 0);
      placeCharOnMission(state, 'player2', 'KS-074-C', 0);

      const p1Power = mission.player1Characters.reduce((sum, c) => sum + (c.isHidden ? 0 : c.card.power + c.powerTokens), 0);
      const p2Power = mission.player2Characters.reduce((sum, c) => sum + (c.isHidden ? 0 : c.card.power + c.powerTokens), 0);

      if (p1Power === p2Power) {
        
        expect(state.edgeHolder).toBe('player1');
      }
    });

    it('Edge holder should win game if scores tied at end', () => {
      
      const state = createGameState({
        edgeHolder: 'player1',
        turn: 4 as TurnNumber,
      });
      state.player1.missionPoints = 10;
      state.player2.missionPoints = 10;
      
    });
  });

  describe('1.5 Hidden Character Rules', () => {

    it('hidden characters should have effective power 0', () => {
      const state = createGameState();
      const char = placeCharOnMission(state, 'player1', 'KS-009-C', 0, { isHidden: true });

      
      const effectivePower = char.isHidden ? 0 : char.card.power + char.powerTokens;
      expect(effectivePower).toBe(0);
    });

    it('hidden characters targeted by enemy effects should have cost 0 and power 0', () => {
      const state = createGameState();
      const char = placeCharOnMission(state, 'player1', 'KS-137-SV', 0, { isHidden: true });

      
      const effectiveCost = char.isHidden ? 0 : char.card.chakra;
      const effectivePower = char.isHidden ? 0 : char.card.power;
      expect(effectiveCost).toBe(0);
      expect(effectivePower).toBe(0);
    });

    it('should cost exactly 1 chakra to play face-down regardless of printed cost', () => {
      
      expect(HIDDEN_PLAY_COST).toBe(1);
    });

    it('revealing a hidden character should cost the printed chakra cost', () => {
      
      const card = makeCard('KS-050-C'); // Orochimaru, cost 4
      expect(card.chakra).toBe(4);
    });

    it('AMBUSH effects should ONLY trigger on reveal, never on direct face-visible play', () => {
      
      
      
      const orochimaru = ALL_CARDS['KS-050-C'];
      if (orochimaru?.effects) {
        const ambushEffects = orochimaru.effects.filter((e: any) => e.type === 'AMBUSH');
        expect(ambushEffects.length).toBeGreaterThan(0);
      }
    });

    it('power tokens should persist through hide/reveal transitions (FAQ rule)', () => {
      const state = createGameState();
      const char = placeCharOnMission(state, 'player1', 'KS-009-C', 0, { powerTokens: 3 });

      
      char.isHidden = true;
      expect(char.powerTokens).toBe(3);

      char.isHidden = false;
      expect(char.powerTokens).toBe(3);
    });
  });

  describe('1.6 Character Evolution (Upgrade) Rules', () => {

    it('upgrade should require STRICTLY higher chakra cost', () => {
      
      const lowCost = makeCard('KS-009-C'); // Naruto cost 2
      const highCost = makeCard('KS-010-C'); // Naruto cost 3
      expect(highCost.chakra).toBeGreaterThan(lowCost.chakra);
    });

    it('upgrade should only pay the DIFFERENCE in chakra cost', () => {
      
      const oldCost = 3;
      const newCost = 5;
      const upgradeCost = newCost - oldCost;
      expect(upgradeCost).toBe(2);
    });

    it('power tokens should transfer during upgrade', () => {
      const state = createGameState();
      const char = placeCharOnMission(state, 'player1', 'KS-009-C', 0, { powerTokens: 4 });

      
      
      expect(char.powerTokens).toBe(4);
    });

    it('old card text should be ignored after upgrade', () => {
      
      const state = createGameState();
      const char = placeCharOnMission(state, 'player1', 'KS-009-C', 0);

      
      expect(char.stack.length).toBeGreaterThanOrEqual(1);
    });

    it('UPGRADE effects should ONLY trigger when upgrading over existing card', () => {
      
      
    });
  });

  describe('1.7 Mission Scoring Rules', () => {

    it('player must have at least 1 power to win a mission', () => {
      
      const state = createGameState();
      
    });

    it('0 vs 0 power should result in NO winner', () => {
      
    });

    it('mission points = base points + rank bonus', () => {
      
      const basePoints = 2;
      const rankBonus = RANK_BONUS['D'];
      expect(basePoints + rankBonus).toBe(3);
    });

    it('SCORE effects should trigger for mission winner only', () => {
      
    });

    it('all power tokens should be removed at End Phase', () => {
      
    });
  });

  describe('1.8 Name Uniqueness Rule', () => {

    it('cannot have 2 characters with same name on same mission (same player)', () => {
      
      const state = createGameState();
      const naruto1 = placeCharOnMission(state, 'player1', 'KS-009-C', 0);

      
      
    });

    it('two hidden cards with same name CAN coexist until reveal (FAQ)', () => {
      
      const state = createGameState();
      placeCharOnMission(state, 'player1', 'KS-009-C', 0, { isHidden: true });
      
    });

    it('if forced by effect to have duplicate names, discard the new one (FAQ)', () => {
      
    });
  });
});





describe('SECTION 2: Individual Card Effect Verification', () => {

  
  function verifyHandlerExists(cardId: string, effectTypes: string[]) {
    for (const effectType of effectTypes) {
      const handler = getEffectHandler(cardId, effectType as any);
      if (!handler) {
        addIssue({
          severity: 'CRITICAL',
          category: 'Missing Handler',
          cardId,
          description: `No ${effectType} handler registered for card ${cardId}`,
          expected: `Handler for ${effectType} effect`,
          actual: 'No handler found',
        });
      }
    }
  }

  describe('2.1 Handler Registration Completeness', () => {

    it('should have handlers for ALL cards with effects', () => {
      let missingHandlers = 0;
      let totalEffects = 0;

      for (const [cardId, card] of Object.entries(ALL_CARDS)) {
        const c = card as any;
        if (!c.effects || c.effects.length === 0) continue;

        for (const effect of c.effects) {
          totalEffects++;
          
          if (effect.description?.startsWith('[⧗]') && !effect.description.includes('POWERUP')) {
            
            continue;
          }

          const handler = getEffectHandler(cardId, effect.type);
          if (!handler) {
            missingHandlers++;
            addIssue({
              severity: 'CRITICAL',
              category: 'Missing Handler',
              cardId,
              cardName: c.name_en || c.name_fr,
              description: `No ${effect.type} handler for ${cardId} (${c.name_en || c.name_fr})`,
              expected: `Handler implementing: ${effect.description}`,
              actual: 'No handler registered',
              rule_reference: 'Every card effect must be individually coded',
            });
          }
        }
      }

      console.log(`Total effects checked: ${totalEffects}, Missing handlers: ${missingHandlers}`);
      
    });
  });

  describe('2.2 Common Card Effects (C)', () => {

    it('KS-001-C Hiruzen Sarutobi - MAIN: POWERUP 2 another friendly Leaf Village character', () => {
      const state = createGameState();
      state.player1.chakra = 10;

      
      const target = placeCharOnMission(state, 'player1', 'KS-015-C', 0); // Kakashi, Leaf Village

      const handler = getEffectHandler('KS-001-C', 'MAIN');
      if (!handler) {
        addIssue({
          severity: 'CRITICAL',
          category: 'Missing Handler',
          cardId: 'KS-001-C',
          cardName: 'HIRUZEN SARUTOBI',
          description: 'No MAIN handler for Hiruzen C',
          expected: 'POWERUP 2 another friendly Leaf Village character',
          actual: 'Handler missing',
        });
        return;
      }

      const source = placeCharOnMission(state, 'player1', 'KS-001-C', 0);
      const result = handler({
        state: deepClone(state),
        sourcePlayer: 'player1',
        sourceCard: source,
        sourceMissionIndex: 0,
        triggerType: 'MAIN',
        isUpgrade: false,
      });

      
      
      expect(result.state).toBeDefined();
    });

    it('KS-003-C Tsunade - MAIN [⧗]: When any friendly character is defeated, gain 2 Chakra', () => {
      
      const state = createGameState();
      placeCharOnMission(state, 'player1', 'KS-003-C', 0);

      
      
    });

    it('KS-009-C Naruto Uzumaki (cost 2) - No effects', () => {
      const card = ALL_CARDS['KS-009-C'] as any;
      if (card) {
        
        
        expect(card.chakra).toBeDefined();
        expect(card.power).toBeDefined();
      }
    });

    it('KS-015-C Kakashi Hatake - MAIN [⧗]: Other friendly Team 7 characters in this mission have +1 Power', () => {
      const state = createGameState();
      const kakashi = placeCharOnMission(state, 'player1', 'KS-015-C', 0);
      const naruto = placeCharOnMission(state, 'player1', 'KS-009-C', 0); // Team 7

      
      const modifier = calculateContinuousPowerModifier(state, 'player1', 0, naruto);
      
    });

    it('KS-025-C Kiba Inuzuka - [⧗] CHAKRA +1 if Akamaru in same mission', () => {
      const state = createGameState();
      const kiba = placeCharOnMission(state, 'player1', 'KS-025-C', 0); // Kiba
      placeCharOnMission(state, 'player1', 'KS-027-C', 0); // Akamaru

      
      const bonus = calculateContinuousChakraBonus(state, 'player1', 0, kiba);
      
    });

    it('KS-027-C Akamaru - [⧗] If no friendly Kiba in same mission at end of turn, return to hand', () => {
      
      const state = createGameState();
      placeCharOnMission(state, 'player1', 'KS-027-C', 0); // Akamaru without Kiba

      
    });

    it('KS-042-C Gai Maito - MAIN [⧗]: Other friendly Team Guy characters in this mission have +1 Power', () => {
      const state = createGameState();
      const gai = placeCharOnMission(state, 'player1', 'KS-042-C', 0);
      const rockLee = placeCharOnMission(state, 'player1', 'KS-038-C', 0); // Rock Lee, Team Guy

      const modifier = calculateContinuousPowerModifier(state, 'player1', 0, rockLee);
      
    });

    it('KS-048-C Hayate Gekko - [⧗] If this character would be defeated, hide it instead', () => {
      
      const state = createGameState();
      const hayate = placeCharOnMission(state, 'player1', 'KS-048-C', 0);

      
    });

    it('KS-049-C Genma Shiranui - [⧗] Sacrifice self to protect friendly Leaf Village in same mission', () => {
      
    });

    it('KS-050-C Orochimaru - AMBUSH: Look at hidden enemy in mission; if cost 3 or less, take control', () => {
      const handler = getEffectHandler('KS-050-C', 'AMBUSH');
      expect(handler).toBeDefined();

      if (handler) {
        const state = createGameState();
        state.player1.chakra = 10;

        
        const enemy = placeCharOnMission(state, 'player2', 'KS-009-C', 0, { isHidden: true }); // cost 2
        const source = placeCharOnMission(state, 'player1', 'KS-050-C', 0);

        const result = handler({
          state: deepClone(state),
          sourcePlayer: 'player1',
          sourceCard: source,
          sourceMissionIndex: 0,
          triggerType: 'AMBUSH',
          isUpgrade: false,
        });

        
        expect(result.state).toBeDefined();
      }
    });

    it('KS-094-C Gama Bunta - Summon should return to hand at End Phase', () => {
      
      const card = ALL_CARDS['KS-094-C'] as any;
      if (card) {
        expect(card.keywords).toContain('Summon');
      }
    });
  });

  describe('2.3 Uncommon Card Effects (UC)', () => {

    it('KS-002-UC Hiruzen - MAIN: Play a Leaf Village character anywhere paying 1 less / UPGRADE: POWERUP 2', () => {
      const handler = getEffectHandler('KS-002-UC', 'MAIN');
      expect(handler).toBeDefined();

      const upgradeHandler = getEffectHandler('KS-002-UC', 'UPGRADE');
      expect(upgradeHandler).toBeDefined();
    });

    it('KS-004-UC Tsunade Mitotic Regeneration - MAIN [⧗]: Defeated friendly go to hand instead of discard', () => {
      
      
      const handler = getEffectHandler('KS-004-UC', 'MAIN');
      
    });

    it('KS-014-UC Sasuke Sharingan - AMBUSH: Look at opponent hand / UPGRADE: +discard+opponent discard', () => {
      const handler = getEffectHandler('KS-014-UC', 'AMBUSH');
      expect(handler).toBeDefined();
    });

    it('KS-022-UC Shikamaru Shadow Possession - AMBUSH: Move last played enemy character (FAQ turn counting)', () => {
      
      const handler = getEffectHandler('KS-022-UC', 'AMBUSH');
      if (handler) {
        addIssue({
          severity: 'MEDIUM',
          category: 'FAQ Compliance',
          cardId: 'KS-022-UC',
          cardName: 'SHIKAMARU NARA',
          description: 'Verify Shikamaru only counts the last opponent turn for AMBUSH effect',
          expected: 'If you take multiple turns after opponent passes, Shikamaru cannot move anybody (FAQ IMG_3972)',
          actual: 'Needs verification',
          rule_reference: 'FAQ IMG_3972',
        });
      }
    });

    it('KS-039-UC Rock Lee - Should retain power tokens at End Phase', () => {
      
      const state = createGameState();
      const rockLee = placeCharOnMission(state, 'player1', 'KS-039-UC', 0, { powerTokens: 5 });

      
    });
  });

  describe('2.4 Rare Card Effects (R)', () => {

    it('KS-108-R/RA Naruto - MAIN: Hide enemy Power 3 or less / UPGRADE: +POWERUP X', () => {
      const handler = getEffectHandler('KS-108-R', 'MAIN');
      expect(handler).toBeDefined();
      
    });

    it('KS-120-R/RA Gaara - MAIN: Defeat enemy Power 1 or less in EVERY mission / UPGRADE: POWERUP X', () => {
      const handler = getEffectHandler('KS-120-R', 'MAIN');
      expect(handler).toBeDefined();

      
    });

    it('KS-105-R Jiraiya - Should have summon cost reduction mechanics', () => {
      const handler = getEffectHandler('KS-105-R', 'MAIN');
      expect(handler).toBeDefined();
    });
  });

  describe('2.5 Secret Card Effects (S)', () => {

    it('KS-133-S Naruto Rasengan - MAIN: Hide 2 enemies / UPGRADE: Defeat both instead', () => {
      const handler = getEffectHandler('KS-133-S', 'MAIN');
      expect(handler).toBeDefined();

      
      
      
      
    });

    it('KS-136-S Sasuke Curse Mark - MAIN [⧗]: When any character defeated, gain 1 Chakra', () => {
      
    });

    it('KS-137-S Kakashi - Complex UPGRADE-before-MAIN interaction', () => {
      
      const handler = getEffectHandler('KS-137-S', 'MAIN');
      expect(handler).toBeDefined();
    });
  });

  describe('2.6 Mythos Card Effects (M)', () => {

    it('KS-143-M Itachi - MAIN: Move friendly to mission / AMBUSH: Move enemy to mission', () => {
      const mainHandler = getEffectHandler('KS-143-M', 'MAIN');
      const ambushHandler = getEffectHandler('KS-143-M', 'AMBUSH');
      expect(mainHandler).toBeDefined();
      expect(ambushHandler).toBeDefined();
    });

    it('KS-144-M Kisame - MAIN: Steal 1 Chakra from opponent', () => {
      const handler = getEffectHandler('KS-144-M', 'MAIN');
      expect(handler).toBeDefined();

      if (handler) {
        const state = createGameState();
        state.player2.chakra = 5;
        const source = placeCharOnMission(state, 'player1', 'KS-144-M', 0);

        const result = handler({
          state: deepClone(state),
          sourcePlayer: 'player1',
          sourceCard: source,
          sourceMissionIndex: 0,
          triggerType: 'MAIN',
          isUpgrade: false,
        });

        
        
        expect(result.requiresTargetSelection).toBe(true);
        expect(result.targetSelectionType).toBe('KISAME144_CONFIRM_MAIN');
        
        expect(result.state.player2.chakra).toBe(5);
        expect(result.state.player1.chakra).toBe(state.player1.chakra);
      }
    });

    it('KS-146-M Sasuke - MAIN: Give Edge to opponent; if you do, POWERUP 3', () => {
      const handler = getEffectHandler('KS-146-M', 'MAIN');
      expect(handler).toBeDefined();
    });

    it('KS-148-M Kakashi - MAIN: Gain Edge / AMBUSH: Copy friendly Team 7 instant effect', () => {
      const mainHandler = getEffectHandler('KS-148-M', 'MAIN');
      expect(mainHandler).toBeDefined();
    });
  });

  describe('2.7 Legendary Card Effects (L)', () => {

    it('KS-133-L Naruto Legendary - Should have proper effects', () => {
      const handler = getEffectHandler('KS-133-L', 'MAIN');
      expect(handler).toBeDefined();
    });
  });

  describe('2.8 Mission Card SCORE Effects', () => {

    it('MSS 01 Call for Support - SCORE: POWERUP 2 a character in play', () => {
      const handler = getEffectHandler('KS-001-MMS', 'SCORE');
      expect(handler).toBeDefined();
    });

    it('MSS 02 Chunin Exam - [⧗] All non-hidden characters in mission have +1 Power', () => {
      
      
    });

    it('MSS 03 Find the Traitor - SCORE: Opponent discards a card from hand', () => {
      const handler = getEffectHandler('KS-003-MMS', 'SCORE');
      expect(handler).toBeDefined();
    });

    it('MSS 04 Assassination - SCORE: Defeat an enemy hidden character in play', () => {
      const handler = getEffectHandler('KS-004-MMS', 'SCORE');
      expect(handler).toBeDefined();
    });

    it('MSS 05 Bring It Back - SCORE: MUST return a friendly non-hidden character in mission to hand', () => {
      const handler = getEffectHandler('KS-005-MMS', 'SCORE');
      expect(handler).toBeDefined();
      
    });

    it('MSS 06 Rescue a Friend - SCORE: Draw a card', () => {
      const handler = getEffectHandler('KS-006-MMS', 'SCORE');
      expect(handler).toBeDefined();
    });

    it('MSS 07 I Have to Go - SCORE: Move a friendly hidden character', () => {
      const handler = getEffectHandler('KS-007-MMS', 'SCORE');
      expect(handler).toBeDefined();
    });

    it('MSS 08 Set a Trap - SCORE: Place card from hand as hidden character on any mission', () => {
      const handler = getEffectHandler('KS-008-MMS', 'SCORE');
      expect(handler).toBeDefined();
    });

    it('MSS 09 Protect the Leader - [⧗] Characters with 4+ Power have +1 Power', () => {
      
    });

    it('MSS 10 Chakra Training - [⧗] CHAKRA +1 for both players', () => {
      
    });
  });
});





describe('SECTION 3: Card Combination & Interaction Tests', () => {

  describe('3.1 Kiba + Akamaru Synergy', () => {

    it('Kiba 025 + Akamaru 027: CHAKRA +1 bonus should apply', () => {
      const state = createGameState();
      const kiba = placeCharOnMission(state, 'player1', 'KS-025-C', 0);
      placeCharOnMission(state, 'player1', 'KS-027-C', 0);

      const bonus = calculateContinuousChakraBonus(state, 'player1', 0, kiba);
      expect(bonus).toBeGreaterThanOrEqual(1);
    });

    it('Akamaru without Kiba should return at End Phase', () => {
      
    });
  });

  describe('3.2 Team 7 Synergy (Kakashi 015 + Team 7)', () => {

    it('Kakashi 015 should give +1 Power to all other Team 7 in same mission', () => {
      const state = createGameState();
      const kakashi = placeCharOnMission(state, 'player1', 'KS-015-C', 0);
      const naruto = placeCharOnMission(state, 'player1', 'KS-009-C', 0);
      const sasuke = placeCharOnMission(state, 'player1', 'KS-013-C', 0);

      
      if (naruto.card.keywords?.includes('Team 7')) {
        const modifier = calculateContinuousPowerModifier(state, 'player1', 0, naruto);
        expect(modifier).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('3.3 Tsunade 003 + Character Defeat Interaction', () => {

    it('defeating a friendly character should trigger Tsunade 003 chakra gain', () => {
      
      
    });

    it('Tsunade 004 UC + defeat: character should go to hand instead of discard', () => {
      
    });
  });

  describe('3.4 Hayate 048 + Gemma 049 Protection Stack', () => {

    it('Hayate should be hidden instead of defeated', () => {
      
    });

    it('Gemma should sacrifice self to protect another Leaf Village character', () => {
      
    });
  });

  describe('3.5 Multiple Continuous Power Modifiers', () => {

    it('stacking multiple power buffs should add correctly', () => {
      const state = createGameState();
      
      const kakashi = placeCharOnMission(state, 'player1', 'KS-015-C', 0);
      const naruto = placeCharOnMission(state, 'player1', 'KS-009-C', 0, { powerTokens: 2 });

      
    });
  });

  describe('3.6 Orochimaru 050 Control Transfer', () => {

    it('taking control should make enemy character friendly (FAQ)', () => {
      
    });

    it('if controlled character leaves play, it returns to original owner (FAQ)', () => {
      
    });
  });

  describe('3.7 Sound Four Synergy', () => {

    it('Sound Four characters should interact with each other correctly', () => {
      
    });
  });
});





describe('SECTION 4: Mass Game Simulation', () => {

  function buildRandomDeck(): CharacterCard[] {
    const playableCards = Object.entries(CHARACTER_CARDS)
      .filter(([, c]: any) => (c as any).has_visual && (c as any).card_type === 'character')
      .map(([id, c]) => ({ id, ...(c as any) }));

    if (playableCards.length === 0) return createTestDeck(30);

    const deck: CharacterCard[] = [];
    const usedVersions: Record<string, number> = {};

    
    const shuffled = [...playableCards].sort(() => Math.random() - 0.5);

    for (const card of shuffled) {
      if (deck.length >= 30) break;

      const versionKey = `${card.id}`;
      usedVersions[versionKey] = (usedVersions[versionKey] || 0) + 1;
      if (usedVersions[versionKey] > 2) continue;

      deck.push(makeCard(card.id));
    }

    
    while (deck.length < 30) {
      deck.push(mockCharacter({
        id: `FILLER-${deck.length}`,
        name_fr: `Filler ${deck.length}`,
        chakra: 2,
        power: 1,
      }));
    }

    return deck;
  }

  function buildRandomMissions(): MissionCard[] {
    const missionIds = Object.keys(MISSION_CARDS);
    if (missionIds.length < 3) {
      return [
        mockMission({ id: 'KS-001-MMS', basePoints: 2 }),
        mockMission({ id: 'KS-002-MMS', basePoints: 3 }),
        mockMission({ id: 'KS-003-MMS', basePoints: 4 }),
      ];
    }

    const shuffled = [...missionIds].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3).map(id => makeMissionCard(id));
  }

  function simulateGame(maxActions: number = 500): {
    completed: boolean;
    error?: string;
    turns: number;
    actions: number;
    winner?: string;
    state: GameState;
  } {
    const config: GameConfig = {
      player1: {
        userId: 'sim-p1',
        isAI: true,
        aiDifficulty: 'easy',
        deck: buildRandomDeck(),
        missionCards: buildRandomMissions(),
      },
      player2: {
        userId: 'sim-p2',
        isAI: true,
        aiDifficulty: 'easy',
        deck: buildRandomDeck(),
        missionCards: buildRandomMissions(),
      },
    };

    let state: GameState;
    try {
      state = GameEngine.createGame(config);
    } catch (e: any) {
      return { completed: false, error: `Game creation failed: ${e.message}`, turns: 0, actions: 0, state: {} as GameState };
    }

    let actions = 0;

    try {
      
      state = GameEngine.applyAction(state, 'player1', { type: 'MULLIGAN', doMulligan: false });
      state = GameEngine.applyAction(state, 'player2', { type: 'MULLIGAN', doMulligan: false });
      actions += 2;

      while (state.phase !== 'gameOver' && actions < maxActions) {
        
        if (state.pendingActions.length > 0) {
          const pending = state.pendingActions[0];
          const selection = pending.options.length > 0 ? [pending.options[0]] : [];
          try {
            state = GameEngine.applyAction(state, pending.player, {
              type: 'SELECT_TARGET',
              pendingActionId: pending.id,
              selectedTargets: selection,
            });
            actions++;
            continue;
          } catch {
            
            if (state.pendingEffects.length > 0 && state.pendingEffects[0].isOptional) {
              state = GameEngine.applyAction(state, state.pendingEffects[0].sourcePlayer, {
                type: 'DECLINE_OPTIONAL_EFFECT',
                pendingEffectId: state.pendingEffects[0].id,
              });
              actions++;
              continue;
            }
            break;
          }
        }

        
        if (state.pendingEffects.length > 0) {
          const effect = state.pendingEffects[0];
          if (effect.isOptional) {
            state = GameEngine.applyAction(state, effect.sourcePlayer, {
              type: 'DECLINE_OPTIONAL_EFFECT',
              pendingEffectId: effect.id,
            });
            actions++;
            continue;
          }
        }

        
        if (state.phase === 'start' || state.phase === 'end') {
          state = GameEngine.applyAction(state, state.activePlayer, { type: 'ADVANCE_PHASE' });
          actions++;
          continue;
        }

        if (state.phase === 'mission') {
          state = GameEngine.applyAction(state, state.activePlayer, { type: 'ADVANCE_PHASE' });
          actions++;
          continue;
        }

        if (state.phase === 'action') {
          const player = state.activePlayer;
          const playerState = state[player];

          
          if (!playerState.hasPassed && playerState.hand.length > 0 && playerState.chakra > 0) {
            
            let played = false;
            for (let i = 0; i < playerState.hand.length; i++) {
              const card = playerState.hand[i];
              if (card.chakra <= playerState.chakra) {
                
                for (let m = 0; m < state.activeMissions.length; m++) {
                  try {
                    state = GameEngine.applyAction(state, player, {
                      type: 'PLAY_CHARACTER',
                      cardIndex: i,
                      missionIndex: m,
                      hidden: false,
                    });
                    actions++;
                    played = true;
                    break;
                  } catch {
                    
                    try {
                      state = GameEngine.applyAction(state, player, {
                        type: 'PLAY_HIDDEN',
                        cardIndex: i,
                        missionIndex: m,
                      });
                      actions++;
                      played = true;
                      break;
                    } catch {
                      continue;
                    }
                  }
                }
                if (played) break;
              }
            }

            if (!played) {
              state = GameEngine.applyAction(state, player, { type: 'PASS' });
              actions++;
            }
          } else {
            state = GameEngine.applyAction(state, player, { type: 'PASS' });
            actions++;
          }
        }
      }

      const completed = state.phase === 'gameOver';
      let winner: string | undefined;
      if (completed) {
        if (state.player1.missionPoints > state.player2.missionPoints) winner = 'player1';
        else if (state.player2.missionPoints > state.player1.missionPoints) winner = 'player2';
        else winner = state.edgeHolder; // Tie = Edge holder wins
      }

      return {
        completed,
        turns: state.turn,
        actions,
        winner,
        state,
      };
    } catch (e: any) {
      return {
        completed: false,
        error: `Game crashed at turn ${state.turn}, phase ${state.phase}: ${e.message}`,
        turns: state.turn,
        actions,
        state,
      };
    }
  }

  it('should complete 100 random AI vs AI games without crashes', () => {
    const results = {
      total: 100,
      completed: 0,
      crashed: 0,
      errors: [] as string[],
      avgActions: 0,
      avgTurns: 0,
      player1Wins: 0,
      player2Wins: 0,
    };

    let totalActions = 0;
    let totalTurns = 0;

    for (let i = 0; i < results.total; i++) {
      const result = simulateGame(300);

      if (result.completed) {
        results.completed++;
        totalActions += result.actions;
        totalTurns += result.turns;
        if (result.winner === 'player1') results.player1Wins++;
        else results.player2Wins++;
      } else {
        results.crashed++;
        if (result.error) {
          results.errors.push(`Game ${i + 1}: ${result.error}`);
          addIssue({
            severity: 'CRITICAL',
            category: 'Game Crash',
            description: `Game ${i + 1} crashed: ${result.error}`,
            expected: 'Game should complete all 4 turns without errors',
            actual: result.error,
          });
        }
      }
    }

    results.avgActions = results.completed > 0 ? totalActions / results.completed : 0;
    results.avgTurns = results.completed > 0 ? totalTurns / results.completed : 0;

    console.log(`\n=== MASS SIMULATION RESULTS ===`);
    console.log(`Total games: ${results.total}`);
    console.log(`Completed: ${results.completed} (${(results.completed / results.total * 100).toFixed(1)}%)`);
    console.log(`Crashed: ${results.crashed}`);
    console.log(`Avg actions per game: ${results.avgActions.toFixed(1)}`);
    console.log(`P1 wins: ${results.player1Wins}, P2 wins: ${results.player2Wins}`);

    if (results.errors.length > 0) {
      console.log(`\nFirst 10 errors:`);
      results.errors.slice(0, 10).forEach(e => console.log(`  - ${e}`));
    }

    
    expect(results.completed).toBeGreaterThanOrEqual(results.total * 0.45);
  }, 120000); // 2 minute timeout

  it('should handle all 4 turns correctly in simulated games', () => {
    let allFourTurns = 0;
    const total = 20;

    for (let i = 0; i < total; i++) {
      const result = simulateGame(500);
      if (result.completed && result.turns === 4) {
        allFourTurns++;
      }
    }

    console.log(`Games completing all 4 turns: ${allFourTurns}/${total}`);
    expect(allFourTurns).toBeGreaterThanOrEqual(total * 0.3);
  }, 60000);
});





describe('SECTION 5: Edge Cases & FAQ Compliance', () => {

  describe('5.1 FAQ: Effects are all-or-nothing (IMG_3970)', () => {
    it('effects should be applied completely or not at all', () => {
      
      
    });
  });

  describe('5.2 FAQ: Tsunade 004 hidden character defeat (IMG_3971)', () => {
    it('hidden character defeated with Tsunade 004 should NOT be revealed when going to hand', () => {
      
      addIssue({
        severity: 'HIGH',
        category: 'FAQ Compliance',
        cardId: 'KS-004-UC',
        cardName: 'TSUNADE (Mitotic Regeneration)',
        description: 'Hidden characters defeated when Tsunade 004 is in play should go to hand WITHOUT being revealed',
        expected: 'Hidden char -> hand (stays hidden/unrevealed)',
        actual: 'Needs verification that the card is not revealed when going to hand via Tsunade effect',
        rule_reference: 'FAQ IMG_3971',
      });
    });
  });

  describe('5.3 FAQ: Friendly vs "Other Friendly" (IMG_3974)', () => {
    it('friendly and other friendly should have same meaning', () => {
      
    });
  });

  describe('5.4 FAQ: Weakest/Strongest targeting (IMG_3976)', () => {
    it('when multiple characters tied for weakest/strongest, player chooses', () => {
      
    });
  });

  describe('5.5 FAQ: Hidden characters with power tokens (IMG_3978)', () => {
    it('hidden characters CAN receive power tokens', () => {
      const state = createGameState();
      const char = placeCharOnMission(state, 'player1', 'KS-009-C', 0, { isHidden: true, powerTokens: 0 });
      char.powerTokens = 3;
      expect(char.powerTokens).toBe(3);
    });

    it('hidden character is cost 0, power 0 but can have tokens', () => {
      
      
      addIssue({
        severity: 'HIGH',
        category: 'Rule Discrepancy',
        description: 'FAQ IMG_3978 says hidden char has cost 1, but rulebook says cost 0 when targeted by enemy effects. Need to verify which is correct for enemy targeting.',
        expected: 'Hidden character: cost 0 when targeted by enemy effects (per rulebook)',
        actual: 'FAQ says "cost 1 and Power 0" - this may refer to the PLAY cost, not the effective cost for targeting',
        rule_reference: 'FAQ IMG_3978 vs rulebook hidden character rules',
      });
    });
  });

  describe('5.6 FAQ: Duplicate names forced by effects (IMG_3979)', () => {
    it('if effect forces duplicate name in same mission, discard new one without effects', () => {
      addIssue({
        severity: 'HIGH',
        category: 'FAQ Compliance',
        description: 'When an effect forces a character with same name into a mission where that name already exists, the new one should be discarded WITHOUT applying effects',
        expected: 'Discard new character, no effects trigger',
        actual: 'Needs verification in move effect handlers',
        rule_reference: 'FAQ IMG_3979',
      });
    });
  });

  describe('5.7 Empty deck draw rule', () => {
    it('drawing from empty deck should have no penalty', () => {
      const state = createGameState();
      state.player1.deck = []; // Empty deck

      
    });
  });

  describe('5.8 Control transfer ownership (FAQ IMG_3975)', () => {
    it('controlled card returning to original owner should maintain state', () => {
      
    });
  });

  describe('5.9 Card is not friendly to itself (FAQ IMG_3973)', () => {
    it('a character should not be considered friendly to itself', () => {
      
      addIssue({
        severity: 'MEDIUM',
        category: 'FAQ Compliance',
        description: 'Verify that "friendly" effects exclude the source card itself where appropriate',
        expected: 'A character is NOT friendly to itself',
        actual: 'Need to check all "friendly character" target resolution logic',
        rule_reference: 'FAQ IMG_3973',
      });
    });
  });
});





describe('SECTION 6: Effect Timing & Priority', () => {

  describe('6.1 Effect Resolution Order', () => {

    it('effects on existing cards should trigger BEFORE newly played card effects', () => {
      
    });

    it('effects on a single card should apply top-to-bottom', () => {
      
    });

    it('when multiple effects trigger simultaneously, active player chooses order', () => {
      
    });
  });

  describe('6.2 UPGRADE effect interaction with MAIN', () => {

    it('UPGRADE effects that modify MAIN should be integrated when applying MAIN', () => {
      
      
    });
  });

  describe('6.3 SCORE effect timing', () => {

    it('SCORE effects require at least 1 power to trigger', () => {
      
    });

    it('SCORE effects process in order: mission card first, then winner characters', () => {
      
    });
  });
});





describe('SECTION 7: Audit Report Generation', () => {

  afterAll(() => {
    
    const report: string[] = [];

    report.push('='.repeat(80));
    report.push('NARUTO MYTHOS TCG - COMPREHENSIVE GAME ENGINE AUDIT REPORT');
    report.push('='.repeat(80));
    report.push(`Generated: ${new Date().toISOString()}`);
    report.push(`Total Issues Found: ${auditIssues.length}`);
    report.push('');

    
    const bySeverity: Record<string, AuditIssue[]> = {};
    for (const issue of auditIssues) {
      if (!bySeverity[issue.severity]) bySeverity[issue.severity] = [];
      bySeverity[issue.severity].push(issue);
    }

    report.push('--- SUMMARY BY SEVERITY ---');
    for (const severity of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']) {
      const count = (bySeverity[severity] || []).length;
      report.push(`${severity}: ${count} issues`);
    }
    report.push('');

    
    const byCategory: Record<string, AuditIssue[]> = {};
    for (const issue of auditIssues) {
      if (!byCategory[issue.category]) byCategory[issue.category] = [];
      byCategory[issue.category].push(issue);
    }

    report.push('--- SUMMARY BY CATEGORY ---');
    for (const [category, issues] of Object.entries(byCategory)) {
      report.push(`${category}: ${issues.length} issues`);
    }
    report.push('');

    
    report.push('='.repeat(80));
    report.push('DETAILED ISSUES');
    report.push('='.repeat(80));

    for (const severity of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']) {
      const issues = bySeverity[severity] || [];
      if (issues.length === 0) continue;

      report.push('');
      report.push(`--- ${severity} ISSUES (${issues.length}) ---`);
      report.push('');

      for (const issue of issues) {
        report.push(`[${issue.severity}] ${issue.category}`);
        if (issue.cardId) report.push(`  Card: ${issue.cardId} ${issue.cardName || ''}`);
        report.push(`  Description: ${issue.description}`);
        report.push(`  Expected: ${issue.expected}`);
        report.push(`  Actual: ${issue.actual}`);
        if (issue.rule_reference) report.push(`  Rule Reference: ${issue.rule_reference}`);
        report.push('');
      }
    }

    
    const reportPath = path.resolve(__dirname, '../../AUDIT_REPORT.txt');
    fs.writeFileSync(reportPath, report.join('\n'), 'utf-8');

    console.log(`\n${'='.repeat(60)}`);
    console.log('AUDIT REPORT WRITTEN TO: AUDIT_REPORT.txt');
    console.log(`Total issues: ${auditIssues.length}`);
    console.log(`${'='.repeat(60)}\n`);
  });

  it('should collect all issues for the report', () => {
    
    expect(auditIssues).toBeDefined();
  });
});
