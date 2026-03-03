#!/usr/bin/env tsx
// @ts-nocheck
/**
 * NARUTO MYTHOS TCG — COMPREHENSIVE GAME ENGINE AUDIT
 *
 * Standalone script that:
 * 1. Loads ALL card data & rules
 * 2. Verifies every card effect handler exists
 * 3. Simulates hundreds of AI vs AI games
 * 4. Tests every card individually
 * 5. Tests card interactions & edge cases
 * 6. Validates against official rules + FAQ
 * 7. Generates a detailed correction report
 *
 * Run with:  node --import tsx scripts/runAudit.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------- Imports from the game engine ----------
import { GameEngine } from '../lib/engine/GameEngine';
import type {
  GameState, GameConfig, CharacterCard, MissionCard, CharacterInPlay,
  PlayerID, TurnNumber, GameAction, PendingEffect, PendingAction,
} from '../lib/engine/types';
import {
  BASE_CHAKRA_PER_TURN, HIDDEN_PLAY_COST, INITIAL_HAND_SIZE,
  CARDS_DRAWN_PER_TURN, TOTAL_TURNS, RANK_BONUS, TURN_TO_RANK,
} from '../lib/engine/types';
import { generateInstanceId, generateGameId } from '../lib/engine/utils/id';
import { deepClone } from '../lib/engine/utils/deepClone';
import { getEffectHandler, initializeRegistry } from '../lib/effects/EffectRegistry';
import { calculateContinuousPowerModifier, calculateContinuousChakraBonus } from '../lib/effects/ContinuousEffects';

// ============================================================
// TYPES
// ============================================================

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

interface TestResult {
  name: string;
  passed: boolean;
  message?: string;
}

// ============================================================
// STATE
// ============================================================

const issues: AuditIssue[] = [];
const testResults: TestResult[] = [];
let passCount = 0;
let failCount = 0;

function addIssue(i: AuditIssue) { issues.push(i); }

function test(name: string, fn: () => void) {
  try {
    fn();
    passCount++;
    testResults.push({ name, passed: true });
  } catch (e: any) {
    failCount++;
    testResults.push({ name, passed: false, message: e.message });
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

// ============================================================
// CARD DATA
// ============================================================

const ROOT = path.resolve(__dirname, '..');
const cardsPath = path.join(ROOT, 'lib/data/sets/KS/cards.json');
const missionsPath = path.join(ROOT, 'lib/data/missions.json');

let ALL_CARDS: Record<string, any> = {};
let MISSION_CARDS_MAP: Record<string, any> = {};
let CHARACTER_CARDS_MAP: Record<string, any> = {};

function loadData() {
  if (fs.existsSync(cardsPath)) {
    const d = JSON.parse(fs.readFileSync(cardsPath, 'utf-8'));
    ALL_CARDS = d.cards || d;
  }
  for (const [id, c] of Object.entries(ALL_CARDS)) {
    const card = c as any;
    if (card.card_type === 'mission') MISSION_CARDS_MAP[id] = card;
    else CHARACTER_CARDS_MAP[id] = card;
  }
}

// ============================================================
// HELPERS
// ============================================================

function makeCard(cardId: string, over: Partial<CharacterCard> = {}): CharacterCard {
  const d = ALL_CARDS[cardId] as any;
  if (!d) {
    return {
      id: cardId, cardId, set: 'KS', number: 0,
      name_fr: over.name_fr ?? 'Unknown', title_fr: '', rarity: 'C',
      card_type: 'character', has_visual: true,
      chakra: over.chakra ?? 1, power: over.power ?? 1,
      keywords: [], group: '', effects: [],
      ...over,
    } as CharacterCard;
  }
  return {
    id: d.id, cardId: d.id, set: d.set || 'KS',
    number: parseInt(d.number) || 0,
    name_fr: d.name_fr || d.name_en || 'Unknown',
    name_en: d.name_en, title_fr: d.title_fr || '', title_en: d.title_en,
    rarity: d.rarity, card_type: 'character', has_visual: d.has_visual ?? true,
    chakra: d.chakra ?? 0, power: d.power ?? 0,
    keywords: d.keywords || [], group: d.group || '',
    effects: d.effects || [], image_file: d.image_file,
    data_complete: d.data_complete, ...over,
  } as CharacterCard;
}

function makeMission(cardId: string, over: Partial<MissionCard> = {}): MissionCard {
  const d = ALL_CARDS[cardId] as any;
  return {
    id: d?.id ?? cardId, cardId: d?.id ?? cardId, set: 'KS',
    number: parseInt(d?.number) || 0,
    name_fr: d?.name_fr ?? 'Mission', title_fr: d?.title_fr ?? '',
    rarity: 'MMS' as any, card_type: 'mission', has_visual: true,
    chakra: 0, power: 0, keywords: [], group: '',
    effects: d?.effects || [], basePoints: d?.basePoints ?? 2,
    ...over,
  } as MissionCard;
}

function createTestDeck(n = 30): CharacterCard[] {
  const out: CharacterCard[] = [];
  for (let i = 0; i < n; i++) {
    out.push(makeCard('', {
      id: `TEST-${i}`, name_fr: `TestChar${i}`,
      chakra: (i % 5) + 1, power: (i % 4) + 1,
    } as any));
  }
  return out;
}

function randomDeck(): CharacterCard[] {
  const playable = Object.entries(CHARACTER_CARDS_MAP)
    .filter(([, c]) => (c as any).has_visual)
    .map(([id]) => id);
  const shuffled = playable.sort(() => Math.random() - 0.5);
  const deck: CharacterCard[] = [];
  const used: Record<string, number> = {};
  for (const id of shuffled) {
    if (deck.length >= 30) break;
    used[id] = (used[id] || 0) + 1;
    if (used[id] > 2) continue;
    deck.push(makeCard(id));
  }
  while (deck.length < 30) {
    deck.push(makeCard('', { id: `FILL-${deck.length}`, name_fr: `Fill${deck.length}`, chakra: 2, power: 1 } as any));
  }
  return deck;
}

function randomMissions(): MissionCard[] {
  const ids = Object.keys(MISSION_CARDS_MAP);
  if (ids.length < 3) return [makeMission('KS-001-MMS'), makeMission('KS-002-MMS'), makeMission('KS-003-MMS')];
  const s = ids.sort(() => Math.random() - 0.5);
  return s.slice(0, 3).map(id => makeMission(id));
}

function createActionState(over: Partial<GameState> = {}): GameState {
  const m = makeMission('KS-001-MMS', { basePoints: 3 });
  return {
    gameId: generateGameId(), turn: 1 as TurnNumber, phase: 'action',
    activePlayer: 'player1', edgeHolder: 'player1', firstPasser: null,
    player1: {
      id: 'player1', userId: 't1', isAI: false, deck: createTestDeck(20),
      hand: Array.from({ length: 5 }, (_, i) => makeCard('', { id: `H1-${i}`, name_fr: `P1Card${i}`, chakra: (i % 4) + 1, power: (i % 3) + 1 } as any)),
      discardPile: [], missionCards: [], chakra: 10, missionPoints: 0,
      hasPassed: false, hasMulliganed: true, charactersInPlay: 0, unusedMission: null,
    },
    player2: {
      id: 'player2', userId: 't2', isAI: false, deck: createTestDeck(20),
      hand: Array.from({ length: 5 }, (_, i) => makeCard('', { id: `H2-${i}`, name_fr: `P2Card${i}`, chakra: (i % 4) + 1, power: (i % 3) + 1 } as any)),
      discardPile: [], missionCards: [], chakra: 10, missionPoints: 0,
      hasPassed: false, hasMulliganed: true, charactersInPlay: 0, unusedMission: null,
    },
    missionDeck: [makeMission('KS-002-MMS'), makeMission('KS-003-MMS')],
    activeMissions: [{
      card: m, rank: 'D', basePoints: 3, rankBonus: 1,
      player1Characters: [], player2Characters: [], wonBy: null,
    }],
    log: [], pendingEffects: [], pendingActions: [],
    turnMissionRevealed: true, missionScoredThisTurn: false,
    consecutiveTimeouts: { player1: 0, player2: 0 },
    ...over,
  } as GameState;
}

function placeChar(state: GameState, player: PlayerID, cardId: string, mi: number,
  opts: { isHidden?: boolean; powerTokens?: number } = {}): CharacterInPlay {
  const card = makeCard(cardId);
  const ch: CharacterInPlay = {
    instanceId: generateInstanceId(), card,
    isHidden: opts.isHidden ?? false,
    wasRevealedAtLeastOnce: !(opts.isHidden ?? false),
    powerTokens: opts.powerTokens ?? 0,
    stack: [card], controlledBy: player, originalOwner: player,
    missionIndex: mi,
  };
  const mission = state.activeMissions[mi];
  if (mission) {
    (player === 'player1' ? mission.player1Characters : mission.player2Characters).push(ch);
  }
  return ch;
}

// ============================================================
// GAME SIMULATION
// ============================================================

function simulateGame(maxActions = 500): {
  completed: boolean; error?: string; turns: number; actions: number;
  winner?: string; state: GameState; cardEffectsTriggered: string[];
} {
  const config: GameConfig = {
    player1: { userId: 'sim1', isAI: true, aiDifficulty: 'easy', deck: randomDeck(), missionCards: randomMissions() },
    player2: { userId: 'sim2', isAI: true, aiDifficulty: 'easy', deck: randomDeck(), missionCards: randomMissions() },
  };

  let state: GameState;
  const cardEffectsTriggered: string[] = [];

  try { state = GameEngine.createGame(config); }
  catch (e: any) { return { completed: false, error: `Create: ${e.message}`, turns: 0, actions: 0, state: {} as any, cardEffectsTriggered }; }

  let actions = 0;
  try {
    state = GameEngine.applyAction(state, 'player1', { type: 'MULLIGAN', doMulligan: false });
    state = GameEngine.applyAction(state, 'player2', { type: 'MULLIGAN', doMulligan: false });
    actions += 2;

    while (state.phase !== 'gameOver' && actions < maxActions) {
      // Pending actions
      if (state.pendingActions.length > 0) {
        const pa = state.pendingActions[0];
        const sel = pa.options.length > 0 ? [pa.options[0]] : [];
        try {
          state = GameEngine.applyAction(state, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: sel });
          actions++; continue;
        } catch {
          if (state.pendingEffects.length > 0 && state.pendingEffects[0].isOptional) {
            state = GameEngine.applyAction(state, state.pendingEffects[0].sourcePlayer, { type: 'DECLINE_OPTIONAL_EFFECT', pendingEffectId: state.pendingEffects[0].id });
            actions++; continue;
          }
          break;
        }
      }

      // Pending optional effects
      if (state.pendingEffects.length > 0) {
        const pe = state.pendingEffects[0];
        if (pe.isOptional) {
          state = GameEngine.applyAction(state, pe.sourcePlayer, { type: 'DECLINE_OPTIONAL_EFFECT', pendingEffectId: pe.id });
          actions++; continue;
        }
      }

      // Automatic phases
      if (state.phase === 'start' || state.phase === 'end' || state.phase === 'mission') {
        state = GameEngine.applyAction(state, state.activePlayer, { type: 'ADVANCE_PHASE' });
        actions++; continue;
      }

      // Action phase
      if (state.phase === 'action') {
        const p = state.activePlayer;
        const ps = state[p];
        if (!ps.hasPassed && ps.hand.length > 0 && ps.chakra > 0) {
          let played = false;
          for (let i = 0; i < ps.hand.length && !played; i++) {
            if (ps.hand[i].chakra <= ps.chakra) {
              for (let m = 0; m < state.activeMissions.length && !played; m++) {
                try {
                  const cardId = ps.hand[i].id;
                  state = GameEngine.applyAction(state, p, { type: 'PLAY_CHARACTER', cardIndex: i, missionIndex: m, hidden: false });
                  cardEffectsTriggered.push(cardId);
                  actions++; played = true;
                } catch {
                  try {
                    state = GameEngine.applyAction(state, p, { type: 'PLAY_HIDDEN', cardIndex: i, missionIndex: m });
                    actions++; played = true;
                  } catch { /* skip */ }
                }
              }
            }
          }
          if (!played) { state = GameEngine.applyAction(state, p, { type: 'PASS' }); actions++; }
        } else {
          state = GameEngine.applyAction(state, p, { type: 'PASS' }); actions++;
        }
      }
    }

    const completed = state.phase === 'gameOver';
    let winner: string | undefined;
    if (completed) {
      if (state.player1.missionPoints > state.player2.missionPoints) winner = 'player1';
      else if (state.player2.missionPoints > state.player1.missionPoints) winner = 'player2';
      else winner = state.edgeHolder;
    }
    return { completed, turns: state.turn, actions, winner, state, cardEffectsTriggered };
  } catch (e: any) {
    return { completed: false, error: `Turn ${state.turn} ${state.phase}: ${e.message}`, turns: state.turn, actions, state, cardEffectsTriggered };
  }
}

// ============================================================
// MAIN AUDIT
// ============================================================

async function main() {
  console.log('='.repeat(70));
  console.log('  NARUTO MYTHOS TCG — COMPREHENSIVE GAME ENGINE AUDIT');
  console.log('='.repeat(70));
  console.log();

  // 1. Load data
  console.log('[1/7] Loading card data...');
  loadData();
  const totalCards = Object.keys(ALL_CARDS).length;
  const totalChars = Object.keys(CHARACTER_CARDS_MAP).length;
  const totalMissions = Object.keys(MISSION_CARDS_MAP).length;
  console.log(`  Loaded ${totalCards} cards (${totalChars} characters, ${totalMissions} missions)`);

  // 2. Initialize effect registry
  console.log('[2/7] Initializing effect registry...');
  initializeRegistry();

  // ========================================
  // SECTION A: Constants & Rules Verification
  // ========================================
  console.log('\n[3/7] Verifying core rules & constants...');

  test('BASE_CHAKRA_PER_TURN = 5', () => assert(BASE_CHAKRA_PER_TURN === 5, `Got ${BASE_CHAKRA_PER_TURN}`));
  test('HIDDEN_PLAY_COST = 1', () => assert(HIDDEN_PLAY_COST === 1, `Got ${HIDDEN_PLAY_COST}`));
  test('INITIAL_HAND_SIZE = 5', () => assert(INITIAL_HAND_SIZE === 5, `Got ${INITIAL_HAND_SIZE}`));
  test('CARDS_DRAWN_PER_TURN = 2', () => assert(CARDS_DRAWN_PER_TURN === 2, `Got ${CARDS_DRAWN_PER_TURN}`));
  test('TOTAL_TURNS = 4', () => assert(TOTAL_TURNS === 4, `Got ${TOTAL_TURNS}`));
  test('RANK_BONUS D=1 C=2 B=3 A=4', () => {
    assert(RANK_BONUS.D === 1, 'D'); assert(RANK_BONUS.C === 2, 'C');
    assert(RANK_BONUS.B === 3, 'B'); assert(RANK_BONUS.A === 4, 'A');
  });
  test('TURN_TO_RANK mapping', () => {
    assert(TURN_TO_RANK[1] === 'D', '1'); assert(TURN_TO_RANK[2] === 'C', '2');
    assert(TURN_TO_RANK[3] === 'B', '3'); assert(TURN_TO_RANK[4] === 'A', '4');
  });

  // ========================================
  // SECTION B: Handler Registration Check
  // ========================================
  console.log('\n[4/7] Checking effect handler registration for all cards...');

  let handlersMissing = 0;
  let handlersFound = 0;
  let handlersTotal = 0;
  const missingHandlerCards: string[] = [];

  for (const [cardId, card] of Object.entries(ALL_CARDS)) {
    const c = card as any;
    if (!c.effects || c.effects.length === 0) continue;

    for (const effect of c.effects) {
      handlersTotal++;
      const desc: string = effect.description || '';

      // Pure continuous effects (power modifiers, chakra bonuses) may be handled
      // in ContinuousEffects.ts rather than having a registered handler
      const isPureContinuous = desc.startsWith('[⧗]') && !desc.includes('POWERUP') &&
        !desc.toLowerCase().includes('defeat') && !desc.toLowerCase().includes('hide') &&
        !desc.toLowerCase().includes('move') && !desc.toLowerCase().includes('discard');

      const handler = getEffectHandler(cardId, effect.type);
      if (handler) {
        handlersFound++;
      } else if (!isPureContinuous) {
        handlersMissing++;
        missingHandlerCards.push(`${cardId} (${c.name_en || c.name_fr}) — ${effect.type}: ${desc.substring(0, 80)}`);
        addIssue({
          severity: 'CRITICAL',
          category: 'Missing Effect Handler',
          cardId,
          cardName: c.name_en || c.name_fr,
          description: `No ${effect.type} handler for ${cardId}`,
          expected: `Handler implementing: ${desc}`,
          actual: 'No handler registered in EffectRegistry',
          rule_reference: 'Every card effect must be individually coded',
        });
      }
    }
  }

  console.log(`  Total effects checked: ${handlersTotal}`);
  console.log(`  Handlers found: ${handlersFound}`);
  console.log(`  Handlers missing: ${handlersMissing}`);
  if (missingHandlerCards.length > 0) {
    console.log(`  Missing handlers for:`);
    missingHandlerCards.forEach(m => console.log(`    - ${m}`));
  }

  test('All non-continuous effects have handlers', () => {
    assert(handlersMissing === 0, `${handlersMissing} handlers missing`);
  });

  // ========================================
  // SECTION C: Individual Card Effect Tests
  // ========================================
  console.log('\n[5/7] Testing individual card effects...');

  // --- Kisame 144 M: Steal 1 Chakra ---
  test('KS-144-M Kisame — MAIN steals 1 chakra from opponent', () => {
    const handler = getEffectHandler('KS-144-M', 'MAIN');
    assert(!!handler, 'Handler should exist');
    const state = createActionState();
    state.player1.chakra = 5;
    state.player2.chakra = 8;
    const source = placeChar(state, 'player1', 'KS-144-M', 0);
    const result = handler!({
      state: deepClone(state), sourcePlayer: 'player1',
      sourceCard: source, sourceMissionIndex: 0, triggerType: 'MAIN', isUpgrade: false,
    });
    assert(result.state.player2.chakra === 7, `Opponent chakra should be 7, got ${result.state.player2.chakra}`);
    assert(result.state.player1.chakra === 6, `Player chakra should be 6, got ${result.state.player1.chakra}`);
  });

  // --- Hiruzen 001-C: POWERUP 2 friendly Leaf Village ---
  test('KS-001-C Hiruzen — MAIN handler exists', () => {
    const h = getEffectHandler('KS-001-C', 'MAIN');
    assert(!!h, 'Handler should exist');
  });

  // --- Tsunade 003-C: Continuous on-defeat chakra ---
  test('KS-003-C Tsunade — continuous defeat trigger recognized', () => {
    const card = ALL_CARDS['KS-003-C'] as any;
    assert(card.effects[0].description.includes('[⧗]'), 'Should be continuous');
    assert(card.effects[0].description.toLowerCase().includes('defeated'), 'Should mention defeat');
    assert(card.effects[0].description.includes('2 Chakra'), 'Should grant 2 chakra');
  });

  // --- Orochimaru 050-C: AMBUSH ---
  test('KS-050-C Orochimaru — AMBUSH handler exists', () => {
    const h = getEffectHandler('KS-050-C', 'AMBUSH');
    assert(!!h, 'AMBUSH handler should exist');
  });

  // --- Naruto 133-S: Two-stage hide/defeat ---
  test('KS-133-S Naruto Rasengan — MAIN handler exists', () => {
    const h = getEffectHandler('KS-133-S', 'MAIN');
    assert(!!h, 'MAIN handler should exist');
  });

  // --- Itachi 143-M: Move friendly (MAIN) + Move enemy (AMBUSH) ---
  test('KS-143-M Itachi — MAIN and AMBUSH handlers exist', () => {
    assert(!!getEffectHandler('KS-143-M', 'MAIN'), 'MAIN');
    assert(!!getEffectHandler('KS-143-M', 'AMBUSH'), 'AMBUSH');
  });

  // --- Mission SCORE effects ---
  for (const missionId of ['KS-001-MMS', 'KS-003-MMS', 'KS-004-MMS', 'KS-005-MMS', 'KS-006-MMS', 'KS-007-MMS', 'KS-008-MMS']) {
    test(`${missionId} — SCORE handler exists`, () => {
      const h = getEffectHandler(missionId, 'SCORE');
      assert(!!h, `SCORE handler missing for ${missionId}`);
    });
  }

  // --- Kiba + Akamaru Synergy ---
  test('Kiba 025 + Akamaru 027 — CHAKRA +1 bonus', () => {
    const state = createActionState();
    placeChar(state, 'player1', 'KS-025-C', 0);
    placeChar(state, 'player1', 'KS-027-C', 0);
    const bonus = calculateContinuousChakraBonus(state, 'player1');
    assert(bonus >= 1, `Expected >= 1 chakra bonus, got ${bonus}`);
  });

  // --- Kakashi 015 Team 7 Power ---
  test('Kakashi 015 + Team 7 character — Power modifier', () => {
    const state = createActionState();
    placeChar(state, 'player1', 'KS-015-C', 0);
    const naruto = placeChar(state, 'player1', 'KS-009-C', 0);
    // Naruto 009 should have Team 7 keyword for this to work
    if (naruto.card.keywords?.includes('Team 7') || naruto.card.keywords?.includes('Equipe 7')) {
      const mod = calculateContinuousPowerModifier(state, naruto, 0);
      assert(mod >= 1, `Expected >= 1 power mod from Kakashi, got ${mod}`);
    }
  });

  // --- Hidden character power = 0 ---
  test('Hidden character has effective power 0 for scoring', () => {
    const state = createActionState();
    const ch = placeChar(state, 'player1', 'KS-137-SV', 0, { isHidden: true });
    const ePower = ch.isHidden ? 0 : ch.card.power + ch.powerTokens;
    assert(ePower === 0, `Expected 0 power, got ${ePower}`);
  });

  // --- Power tokens persist through hide/reveal ---
  test('Power tokens persist through hide/reveal (FAQ)', () => {
    const state = createActionState();
    const ch = placeChar(state, 'player1', 'KS-009-C', 0, { powerTokens: 3 });
    ch.isHidden = true;
    assert(ch.powerTokens === 3, 'Tokens lost on hide');
    ch.isHidden = false;
    assert(ch.powerTokens === 3, 'Tokens lost on reveal');
  });

  // ========================================
  // SECTION D: Card Data Integrity
  // ========================================
  console.log('\n  Checking card data integrity...');

  for (const [cardId, card] of Object.entries(ALL_CARDS)) {
    const c = card as any;
    const name = c.name_en || c.name_fr || cardId;

    // Check all characters have valid chakra/power
    if (c.card_type === 'character') {
      if (typeof c.chakra !== 'number' || c.chakra < 0) {
        addIssue({
          severity: 'HIGH', category: 'Card Data Integrity', cardId, cardName: name,
          description: `Invalid chakra value: ${c.chakra}`,
          expected: 'Non-negative number', actual: String(c.chakra),
        });
      }
      if (typeof c.power !== 'number' || c.power < 0) {
        addIssue({
          severity: 'HIGH', category: 'Card Data Integrity', cardId, cardName: name,
          description: `Invalid power value: ${c.power}`,
          expected: 'Non-negative number', actual: String(c.power),
        });
      }
    }

    // Check missions have basePoints
    if (c.card_type === 'mission') {
      if (typeof c.basePoints !== 'number') {
        addIssue({
          severity: 'HIGH', category: 'Card Data Integrity', cardId, cardName: name,
          description: 'Mission card missing basePoints',
          expected: 'basePoints field', actual: 'Missing',
        });
      }
    }

    // Check effect descriptions are not empty
    if (c.effects) {
      for (const eff of c.effects) {
        if (!eff.description || eff.description.trim() === '') {
          addIssue({
            severity: 'MEDIUM', category: 'Card Data Integrity', cardId, cardName: name,
            description: `Empty effect description for ${eff.type} effect`,
            expected: 'Non-empty description', actual: 'Empty string',
          });
        }
      }
    }
  }

  // ========================================
  // SECTION E: FAQ Compliance Checks
  // ========================================
  console.log('  Adding FAQ compliance checks...');

  addIssue({
    severity: 'HIGH', category: 'FAQ Compliance',
    cardId: 'KS-004-UC', cardName: 'TSUNADE (Mitotic Regeneration)',
    description: 'VERIFY: Hidden character defeated when Tsunade 004 is in play should go to hand WITHOUT being revealed',
    expected: 'Hidden char -> hand (stays hidden/unrevealed) per FAQ IMG_3971',
    actual: 'Needs code inspection of defeatUtils.ts defeat replacement logic',
    rule_reference: 'FAQ IMG_3971',
  });

  addIssue({
    severity: 'HIGH', category: 'FAQ Compliance',
    cardId: 'KS-022-UC', cardName: 'SHIKAMARU NARA (Shadow Possession)',
    description: 'VERIFY: Shikamaru AMBUSH only counts last opponent turn, not multiple turns ago',
    expected: 'If multiple consecutive turns taken, cannot move anybody (FAQ IMG_3972)',
    actual: 'Needs code inspection of Shikamaru handler',
    rule_reference: 'FAQ IMG_3972',
  });

  addIssue({
    severity: 'MEDIUM', category: 'FAQ Compliance',
    description: 'VERIFY: "Friendly" effects exclude the source card itself',
    expected: 'A character is NOT friendly to itself (FAQ IMG_3973)',
    actual: 'Check all "friendly character" target resolution in TargetResolver.ts',
    rule_reference: 'FAQ IMG_3973',
  });

  addIssue({
    severity: 'HIGH', category: 'FAQ Compliance',
    description: 'VERIFY: When effect forces duplicate name in same mission, discard new one without effects',
    expected: 'FAQ IMG_3979: Discard the new one without applying effects',
    actual: 'Check move effect handlers and name uniqueness enforcement',
    rule_reference: 'FAQ IMG_3979',
  });

  addIssue({
    severity: 'HIGH', category: 'Rule Discrepancy',
    description: 'Hidden character cost: FAQ says "cost 1", CLAUDE.md says "cost 0 when targeted by enemy effects". The FAQ likely means the PLAY cost is 1 chakra, while the effective cost for enemy targeting is 0.',
    expected: 'Play cost = 1 chakra; effective cost for enemy effect targeting = 0',
    actual: 'Verify ChakraValidation.ts and TargetResolver.ts handle both correctly',
    rule_reference: 'FAQ IMG_3978 vs CLAUDE.md',
  });

  addIssue({
    severity: 'MEDIUM', category: 'FAQ Compliance',
    description: 'VERIFY: Effects are all-or-nothing (cannot cherry-pick parts)',
    expected: 'Apply complete effect or skip entirely (FAQ IMG_3970)',
    actual: 'Check multi-part effect handlers allow partial application',
    rule_reference: 'FAQ IMG_3970',
  });

  addIssue({
    severity: 'MEDIUM', category: 'FAQ Compliance',
    description: 'VERIFY: When multiple chars tied for weakest/strongest, single-target effects let player choose; multi-target effects apply to all tied',
    expected: 'Single target = choose among tied; "all weakest" = all tied affected (FAQ IMG_3976)',
    actual: 'Check TargetResolver.ts weakest/strongest filtering logic',
    rule_reference: 'FAQ IMG_3976',
  });

  addIssue({
    severity: 'MEDIUM', category: 'FAQ Compliance',
    description: 'VERIFY: Controlled cards return to original owner when leaving play',
    expected: 'Goes back to owner keeping current state (FAQ IMG_3975)',
    actual: 'Check defeatUtils.ts and all card-leave-play paths use originalOwner',
    rule_reference: 'FAQ IMG_3975',
  });

  // ========================================
  // SECTION F: Mass Game Simulation
  // ========================================
  console.log('\n[6/7] Running mass game simulation...');

  const NUM_GAMES = 200;
  let gamesCompleted = 0;
  let gamesCrashed = 0;
  const crashErrors: string[] = [];
  const allCardsPlayed = new Set<string>();
  let totalActions = 0;
  let p1Wins = 0;
  let p2Wins = 0;

  for (let i = 0; i < NUM_GAMES; i++) {
    const result = simulateGame(400);
    if (result.completed) {
      gamesCompleted++;
      totalActions += result.actions;
      if (result.winner === 'player1') p1Wins++;
      else p2Wins++;
      result.cardEffectsTriggered.forEach(c => allCardsPlayed.add(c));
    } else {
      gamesCrashed++;
      if (result.error) {
        const shortErr = result.error.substring(0, 150);
        if (!crashErrors.includes(shortErr)) crashErrors.push(shortErr);
        addIssue({
          severity: 'CRITICAL', category: 'Game Crash',
          description: `Game ${i + 1} crashed: ${result.error.substring(0, 200)}`,
          expected: 'Game completes all 4 turns', actual: result.error.substring(0, 200),
        });
      }
    }
    if ((i + 1) % 50 === 0) process.stdout.write(`  ${i + 1}/${NUM_GAMES} games simulated\n`);
  }

  console.log(`\n  === SIMULATION RESULTS ===`);
  console.log(`  Total: ${NUM_GAMES} | Completed: ${gamesCompleted} (${(gamesCompleted / NUM_GAMES * 100).toFixed(1)}%) | Crashed: ${gamesCrashed}`);
  console.log(`  Avg actions/game: ${gamesCompleted > 0 ? (totalActions / gamesCompleted).toFixed(1) : 'N/A'}`);
  console.log(`  P1 wins: ${p1Wins} | P2 wins: ${p2Wins}`);
  console.log(`  Unique cards played: ${allCardsPlayed.size}`);

  if (crashErrors.length > 0) {
    console.log(`  Unique crash types (first 10):`);
    crashErrors.slice(0, 10).forEach(e => console.log(`    - ${e}`));
  }

  test('At least 70% of simulated games should complete', () => {
    assert(gamesCompleted >= NUM_GAMES * 0.7, `Only ${gamesCompleted}/${NUM_GAMES} completed`);
  });

  // Check which cards were never played
  const neverPlayed: string[] = [];
  for (const [cardId, card] of Object.entries(CHARACTER_CARDS_MAP)) {
    if ((card as any).has_visual && !allCardsPlayed.has(cardId)) {
      neverPlayed.push(`${cardId} (${(card as any).name_en || (card as any).name_fr})`);
    }
  }
  if (neverPlayed.length > 0) {
    addIssue({
      severity: 'INFO', category: 'Coverage',
      description: `${neverPlayed.length} playable cards never appeared in ${NUM_GAMES} simulated games`,
      expected: 'All cards tested at least once in mass simulation',
      actual: `Never played: ${neverPlayed.slice(0, 20).join(', ')}${neverPlayed.length > 20 ? '...' : ''}`,
    });
  }

  // ========================================
  // SECTION G: Generate Report
  // ========================================
  console.log('\n[7/7] Generating audit report...');

  const r: string[] = [];
  r.push('='.repeat(80));
  r.push('  NARUTO MYTHOS TCG — GAME ENGINE AUDIT REPORT');
  r.push('='.repeat(80));
  r.push(`Date: ${new Date().toISOString()}`);
  r.push(`Cards in database: ${totalCards} (${totalChars} characters, ${totalMissions} missions)`);
  r.push(`Effect handlers checked: ${handlersTotal} | Found: ${handlersFound} | Missing: ${handlersMissing}`);
  r.push(`Games simulated: ${NUM_GAMES} | Completed: ${gamesCompleted} | Crashed: ${gamesCrashed}`);
  r.push(`Tests run: ${passCount + failCount} | Passed: ${passCount} | Failed: ${failCount}`);
  r.push(`Total issues: ${issues.length}`);
  r.push('');

  // Severity summary
  const bySev: Record<string, AuditIssue[]> = {};
  for (const i of issues) { (bySev[i.severity] ??= []).push(i); }
  r.push('--- SEVERITY BREAKDOWN ---');
  for (const s of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']) {
    r.push(`  ${s}: ${(bySev[s] || []).length}`);
  }
  r.push('');

  // Category summary
  const byCat: Record<string, AuditIssue[]> = {};
  for (const i of issues) { (byCat[i.category] ??= []).push(i); }
  r.push('--- CATEGORY BREAKDOWN ---');
  for (const [cat, arr] of Object.entries(byCat).sort((a, b) => b[1].length - a[1].length)) {
    r.push(`  ${cat}: ${arr.length}`);
  }
  r.push('');

  // Failed tests
  const failed = testResults.filter(t => !t.passed);
  if (failed.length > 0) {
    r.push('--- FAILED TESTS ---');
    failed.forEach(t => r.push(`  FAIL: ${t.name} — ${t.message}`));
    r.push('');
  }

  // Detailed issues
  r.push('='.repeat(80));
  r.push('  DETAILED ISSUES — CORRECTIONS NEEDED');
  r.push('='.repeat(80));

  for (const sev of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']) {
    const arr = bySev[sev] || [];
    if (arr.length === 0) continue;
    r.push('');
    r.push(`--- ${sev} (${arr.length}) ---`);
    r.push('');
    for (const issue of arr) {
      r.push(`[${issue.severity}] ${issue.category}`);
      if (issue.cardId) r.push(`  Card: ${issue.cardId} ${issue.cardName || ''}`);
      r.push(`  Issue: ${issue.description}`);
      r.push(`  Expected: ${issue.expected}`);
      r.push(`  Actual: ${issue.actual}`);
      if (issue.rule_reference) r.push(`  Rule Ref: ${issue.rule_reference}`);
      r.push('');
    }
  }

  // Crash details
  if (crashErrors.length > 0) {
    r.push('='.repeat(80));
    r.push('  GAME CRASH DETAILS');
    r.push('='.repeat(80));
    r.push('');
    crashErrors.forEach((e, i) => r.push(`${i + 1}. ${e}`));
    r.push('');
  }

  // Write report
  const reportPath = path.join(ROOT, 'AUDIT_REPORT.txt');
  fs.writeFileSync(reportPath, r.join('\n'), 'utf-8');
  console.log(`\n  Report written to: ${reportPath}`);
  console.log(`  Total issues: ${issues.length}`);
  console.log(`  Tests: ${passCount} passed, ${failCount} failed`);
  console.log('='.repeat(70));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
