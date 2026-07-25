import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { GameEngine } from '../engine/GameEngine';
import { executeStartPhase } from '../engine/phases/StartPhase';
import { AIPlayer, type AIStrategy, type AIDifficulty } from '../ai/AIPlayer';
import { EasyAI } from '../ai/strategies/EasyAI';
import { MediumAI } from '../ai/strategies/MediumAI';
import { HardAI } from '../ai/strategies/HardAI';
import { ImpossibleAI } from '../ai/strategies/ImpossibleAI';
import { NeuralISMCTS } from '../ai/neural/NeuralISMCTS';
import { BoardEvaluator } from '../ai/evaluation/BoardEvaluator';
import { aiSelectTarget } from '../ai/targetSelection';
import { initializeRegistry } from '../effects/EffectRegistry';
import {
  createChessClock,
  arm,
  disarm,
  bankEmpty,
  idleMs,
  hasIdleWarning,
  CHESS_CLOCK_INITIAL_MS,
  CHESS_CLOCK_IDLE_LIMIT_MS,
  CHESS_CLOCK_DISCONNECT_FORFEIT_MS,
  CHESS_CLOCK_MULLIGAN_IDLE_MS,
} from '../timing/chessClock';
import {
  computeChessClockRemainingMs,
  computeChessClockIdleMs,
  buildMatchContextReset,
  useSocketStore,
} from '../socket/client';
import { isQuestAllowedInMode, matchQuestsForEvent } from '../quests/trackProgress';
import { QUESTS, type Quest } from '../quests/questData';
import type { GameMode } from '../quests/hooks';
import { useGameStore } from '@/stores/gameStore';
import {
  createActionPhaseState,
  createTestConfig,
  createTestDeck,
  mockCharacter,
  mockCharInPlay,
  mockMission,
} from './testHelpers';
import type {
  GameState,
  GameAction,
  PlayerID,
  PendingAction,
  PendingEffect,
} from '../engine/types';

const DIFFICULTIES: AIDifficulty[] = ['easy', 'medium', 'hard', 'impossible'];

const MCTS_TIMEOUT = 120_000;

function strategyFor(difficulty: AIDifficulty): AIStrategy {
  return AIPlayer.createStrategy(difficulty);
}

function repoFiles(): string[] {
  return execSync(
    'git ls-files "lib/**/*.ts" "lib/**/*.tsx" "stores/*.ts" "components/**/*.tsx" "components/**/*.ts" "app/**/*.ts" "app/**/*.tsx"',
    { encoding: 'utf8' },
  )
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => !f.includes('__tests__'));
}

function statesWithOnlyPass(activePlayer: PlayerID = 'player2'): GameState {
  const base = createActionPhaseState({ activePlayer });
  return {
    ...base,
    player2: { ...base.player2, hand: [], chakra: 0 },
  };
}

function pendingScoringState(): GameState {
  const base = createActionPhaseState({ activePlayer: 'player2' });
  const charA = mockCharInPlay({ controlledBy: 'player2', originalOwner: 'player2' }, { id: 'KS-201-C', name_fr: 'Scorer A', power: 3 });
  const charB = mockCharInPlay({ controlledBy: 'player2', originalOwner: 'player2' }, { id: 'KS-202-C', name_fr: 'Scorer B', power: 4 });
  const effect: PendingEffect = {
    id: 'pe-score-order',
    sourceCardId: 'KS-201-C',
    sourceInstanceId: charA.instanceId,
    sourceMissionIndex: 0,
    effectType: 'SCORE',
    effectDescription: 'choose the score effect to resolve first',
    targetSelectionType: 'CHOOSE_SCORE_ORDER',
    sourcePlayer: 'player2',
    requiresTargetSelection: true,
    validTargets: [charA.instanceId, charB.instanceId],
    isOptional: false,
    isMandatory: true,
    resolved: false,
    isUpgrade: false,
    selectingPlayer: 'player2',
  };
  const pending: PendingAction = {
    id: 'pa-score-order',
    type: 'SELECT_TARGET',
    player: 'player2',
    description: 'Choose the SCORE effect to resolve first',
    options: [charA.instanceId, charB.instanceId],
    minSelections: 1,
    maxSelections: 1,
    sourceEffectId: effect.id,
  };
  return {
    ...base,
    phase: 'mission',
    activeMissions: [
      {
        ...base.activeMissions[0],
        player2Characters: [charA, charB],
      },
    ],
    pendingEffects: [effect],
    pendingActions: [pending],
  };
}

beforeAll(() => {
  initializeRegistry();
});

describe('AI and hotseat: no chess clock is ever armed', () => {
  it('only the online socket surfaces import the chess clock module', () => {
    const importers = repoFiles().filter((f) => readFileSync(f, 'utf8').includes('timing/chessClock'));
    expect(importers.sort()).toEqual(
      ['app/[locale]/replay/[id]/page.tsx', 'lib/socket/server.ts', 'lib/socket/tournamentHandlers.ts'].sort(),
    );
  });

  it('only the online socket server imports the idle-forfeit decision module', () => {
    const importers = repoFiles().filter((f) => readFileSync(f, 'utf8').includes('timing/idleDecision'));
    expect(importers).toEqual(['lib/socket/server.ts']);
  });

  it('the vs-AI, hotseat and training surfaces contain no chess clock reference at all', () => {
    const offenders: string[] = [];
    const surfaces = [
      'stores/gameStore.ts',
      'lib/engine/GameEngine.ts',
      'lib/engine/phases/ActionPhase.ts',
      'lib/ai/AIPlayer.ts',
      'app/[locale]/play/ai/page.tsx',
      'app/[locale]/play/hotseat/page.tsx',
      'app/[locale]/play/training/page.tsx',
    ];
    for (const file of surfaces) {
      const src = readFileSync(file, 'utf8').toLowerCase();
      if (src.includes('chessclock') || src.includes('idlewarning') || src.includes('idle_limit')) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('locks the documented clock constants', () => {
    expect(CHESS_CLOCK_INITIAL_MS).toBe(15 * 60 * 1000);
    expect(CHESS_CLOCK_IDLE_LIMIT_MS).toBe(2 * 60 * 1000);
    expect(CHESS_CLOCK_DISCONNECT_FORFEIT_MS).toBe(2 * 60 * 1000);
    expect(CHESS_CLOCK_MULLIGAN_IDLE_MS).toBe(60 * 1000);
  });

  it('a clock that is never armed can never empty its bank nor accumulate idle time', () => {
    const clock = createChessClock();
    const start = 1_000_000;
    const oneHourLater = start + 60 * 60 * 1000;

    expect(clock.active).toBeNull();
    expect(clock.activeStartedAt).toBeNull();
    expect(clock.idleStartedAt).toBeNull();
    expect(bankEmpty(clock, oneHourLater)).toBe(false);
    expect(idleMs(clock, oneHourLater)).toBe(0);
    expect(clock.player1.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS);
    expect(clock.player2.remainingMs).toBe(CHESS_CLOCK_INITIAL_MS);
    expect(hasIdleWarning(clock, 'player1')).toBe(false);
    expect(hasIdleWarning(clock, 'player2')).toBe(false);
  });

  it('by contrast an armed online clock does drain and does expire', () => {
    const start = 1_000_000;
    const armed = arm(createChessClock(), 'player1', start);
    expect(armed.active).toBe('player1');
    expect(bankEmpty(armed, start + CHESS_CLOCK_INITIAL_MS - 1)).toBe(false);
    expect(bankEmpty(armed, start + CHESS_CLOCK_INITIAL_MS)).toBe(true);
    expect(idleMs(armed, start + CHESS_CLOCK_IDLE_LIMIT_MS)).toBe(CHESS_CLOCK_IDLE_LIMIT_MS);

    const disarmed = disarm(armed, start + 1000);
    expect(disarmed.active).toBeNull();
    expect(bankEmpty(disarmed, start + 60 * 60 * 1000)).toBe(false);
    expect(idleMs(disarmed, start + 60 * 60 * 1000)).toBe(0);
  });

  it('with no online clock broadcast the client helpers report zero, never a countdown', () => {
    expect(computeChessClockRemainingMs(null, 'player1')).toBe(0);
    expect(computeChessClockRemainingMs(null, 'player2')).toBe(0);
    expect(computeChessClockIdleMs(null, 'player1', Date.now())).toBe(0);
    expect(computeChessClockIdleMs(null, 'player2', Date.now())).toBe(0);
  });

  it('the socket store carries no clock outside an online match', () => {
    expect(useSocketStore.getState().chessClock).toBeNull();
    expect(buildMatchContextReset().chessClock).toBeNull();
  });

  it('the clock display renders nothing when no clock exists', () => {
    const src = readFileSync('components/game/ChessClockDisplay.tsx', 'utf8');
    expect(src).toContain('if (!chessClock) return null;');
  });

  it('the idle warning toast is mounted only for online games', () => {
    const src = readFileSync('app/[locale]/game/page.tsx', 'utf8');
    expect(src).toContain('{isOnlineGame && <IdleWarningToast />}');
  });

  it('startAIGame marks the game offline and never touches the socket clock', () => {
    useGameStore.getState().startAIGame(createTestConfig(), 'easy', 'Tester');
    const store = useGameStore.getState();
    expect(store.isAIGame).toBe(true);
    expect(store.isHotseatGame).toBe(false);
    expect(store.isOnlineGame).toBe(false);
    expect(store.aiPlayer).not.toBeNull();
    expect(useSocketStore.getState().chessClock).toBeNull();
  });

  it('startHotseatGame marks the game offline, with no AI and no clock', () => {
    const cfg = createTestConfig({
      player2: {
        userId: 'hotseat-2',
        isAI: false,
        deck: createTestDeck(),
        missionCards: createTestConfig().player2.missionCards,
      },
    });
    useGameStore.getState().startHotseatGame(cfg, 'Player One', 'Player Two');
    const store = useGameStore.getState();
    expect(store.isHotseatGame).toBe(true);
    expect(store.isAIGame).toBe(false);
    expect(store.isOnlineGame).toBe(false);
    expect(store.aiPlayer).toBeNull();
    expect(store.playerDisplayNames).toEqual({ player1: 'Player One', player2: 'Player Two' });
    expect(useSocketStore.getState().chessClock).toBeNull();
  });

  it('the engine state itself carries no timing field', () => {
    const state = GameEngine.createGame(createTestConfig());
    const keys = Object.keys(state);
    const timingKeys = keys.filter((k) => /clock|remainingms|deadline|idle|forfeitat/i.test(k));
    expect(timingKeys).toEqual([]);
    expect(state.consecutiveTimeouts).toEqual({ player1: 0, player2: 0 });
  });
});

describe('vs AI: surrender is the only early end', () => {
  it('FORFEIT is never offered as a valid action in any phase', () => {
    const config = createTestConfig();
    const mulliganState = GameEngine.createGame(config);
    const actionState = createActionPhaseState({ activePlayer: 'player2' });
    const missionState = pendingScoringState();
    const endState: GameState = { ...actionState, phase: 'end' };

    for (const state of [mulliganState, actionState, missionState, endState]) {
      for (const player of ['player1', 'player2'] as const) {
        const actions = GameEngine.getValidActions(state, player);
        expect(actions.every((a) => a.type !== 'FORFEIT')).toBe(true);
      }
    }
  });

  it('an AI never proposes a forfeit for itself', { timeout: MCTS_TIMEOUT }, () => {
    const state = createActionPhaseState({ activePlayer: 'player2' });
    for (const difficulty of DIFFICULTIES) {
      const ai = new AIPlayer(difficulty, 'player2');
      const action = ai.getAction(state);
      expect(action?.type).not.toBe('FORFEIT');
    }
  });

  it('an explicit FORFEIT ends the game instantly and gives the win to the opponent', () => {
    const state = createActionPhaseState({ activePlayer: 'player1' });
    const forfeited = GameEngine.applyAction(state, 'player1', { type: 'FORFEIT', reason: 'abandon' });
    expect(forfeited.phase).toBe('gameOver');
    expect(forfeited.forfeitedBy).toBe('player1');
    expect(GameEngine.getWinner(forfeited)).toBe('player2');

    const other = GameEngine.applyAction(state, 'player2', { type: 'FORFEIT', reason: 'abandon' });
    expect(other.forfeitedBy).toBe('player2');
    expect(GameEngine.getWinner(other)).toBe('player1');
  });

  it('the AI game store surrender hands the win to the AI side', () => {
    useGameStore.getState().startAIGame(createTestConfig(), 'easy', 'Tester');
    const humanPlayer = useGameStore.getState().humanPlayer;
    useGameStore.getState().endAIGameAsForfeit();
    const store = useGameStore.getState();
    expect(store.gameOver).toBe(true);
    expect(store.winner).toBe(humanPlayer === 'player1' ? 'player2' : 'player1');
  });

  it('an AI game played to the end finishes by scoring, never by a clock', { timeout: 240_000 }, () => {
    const config = createTestConfig({
      player1: { userId: null, isAI: true, aiDifficulty: 'easy', deck: createTestDeck(), missionCards: createTestConfig().player1.missionCards },
      player2: { userId: null, isAI: true, aiDifficulty: 'easy', deck: createTestDeck(), missionCards: createTestConfig().player2.missionCards },
    });
    const p1 = new AIPlayer('easy', 'player1');
    const p2 = new AIPlayer('easy', 'player2');
    let state = GameEngine.createGame(config);

    let ticks = 2000;
    while (state.phase !== 'gameOver' && ticks-- > 0) {
      let acted = false;
      for (const pid of ['player1', 'player2'] as const) {
        if (GameEngine.getValidActions(state, pid).length === 0) continue;
        const ai = pid === 'player1' ? p1 : p2;
        const action = ai.getAction(state);
        if (!action) continue;
        state = GameEngine.applyAction(state, pid, action);
        acted = true;
        break;
      }
      if (acted) continue;
      if (state.pendingActions.length === 0 && state.pendingEffects.length === 0) {
        state = GameEngine.applyAction(state, state.activePlayer ?? 'player1', { type: 'ADVANCE_PHASE' });
        continue;
      }
      break;
    }

    expect(state.phase).toBe('gameOver');
    expect(state.turn).toBeGreaterThanOrEqual(4);
    expect(state.forfeitedBy).toBeUndefined();
    expect(state.consecutiveTimeouts).toEqual({ player1: 0, player2: 0 });
    expect(GameEngine.getWinner(state)).not.toBeNull();
  });
});

describe('every AI difficulty always returns a legal action', () => {
  it('returns a member of the valid actions on a normal action phase', { timeout: MCTS_TIMEOUT }, () => {
    const state = createActionPhaseState({ activePlayer: 'player2' });
    const valid = GameEngine.getValidActions(state, 'player2');
    expect(valid.length).toBeGreaterThan(1);
    for (const difficulty of DIFFICULTIES) {
      const action = strategyFor(difficulty).chooseAction(state, 'player2', valid);
      expect(valid).toContainEqual(action);
    }
  });

  it('falls back to PASS when it is handed an empty action list', () => {
    const state = createActionPhaseState({ activePlayer: 'player2' });
    for (const difficulty of DIFFICULTIES) {
      const action = strategyFor(difficulty).chooseAction(state, 'player2', []);
      expect(action).toEqual({ type: 'PASS' });
    }
  });

  it('returns the single legal action untouched when there is only one', () => {
    const state = statesWithOnlyPass();
    const valid = GameEngine.getValidActions(state, 'player2');
    expect(valid).toEqual([{ type: 'PASS' }]);
    for (const difficulty of DIFFICULTIES) {
      expect(strategyFor(difficulty).chooseAction(state, 'player2', valid)).toEqual({ type: 'PASS' });
      expect(new AIPlayer(difficulty, 'player2').getAction(state)).toEqual({ type: 'PASS' });
    }
  });

  it('passes when the hand is empty and no character can be revealed', () => {
    const state = statesWithOnlyPass();
    expect(state.player2.hand).toEqual([]);
    for (const difficulty of DIFFICULTIES) {
      const action = new AIPlayer(difficulty, 'player2').getAction(state);
      expect(action).toEqual({ type: 'PASS' });
    }
  });

  it('passes when it holds cards but has zero chakra, since even a hidden play costs 1', () => {
    const base = createActionPhaseState({ activePlayer: 'player2' });
    const broke: GameState = { ...base, player2: { ...base.player2, chakra: 0 } };
    const valid = GameEngine.getValidActions(broke, 'player2');
    expect(valid).toEqual([{ type: 'PASS' }]);
    for (const difficulty of DIFFICULTIES) {
      expect(new AIPlayer(difficulty, 'player2').getAction(broke)).toEqual({ type: 'PASS' });
    }
  });

  it('never picks an unaffordable face-up play when it can only afford a hidden play', { timeout: MCTS_TIMEOUT }, () => {
    const base = createActionPhaseState({ activePlayer: 'player2' });
    const poor: GameState = {
      ...base,
      player2: {
        ...base.player2,
        chakra: 1,
        hand: [
          mockCharacter({ id: 'KS-301-C', name_fr: 'Expensive One', chakra: 8, power: 8 }),
          mockCharacter({ id: 'KS-302-C', name_fr: 'Expensive Two', chakra: 7, power: 7 }),
        ],
      },
    };
    const valid = GameEngine.getValidActions(poor, 'player2');
    expect(valid.some((a) => a.type === 'PLAY_HIDDEN')).toBe(true);
    expect(valid.some((a) => a.type === 'PLAY_CHARACTER')).toBe(false);
    expect(valid.some((a) => a.type === 'UPGRADE_CHARACTER')).toBe(false);

    for (const difficulty of DIFFICULTIES) {
      const action = new AIPlayer(difficulty, 'player2').getAction(poor);
      expect(action).not.toBeNull();
      expect(valid).toContainEqual(action as GameAction);
      expect(action?.type === 'PLAY_CHARACTER' || action?.type === 'UPGRADE_CHARACTER').toBe(false);
    }
  });

  it('handles an empty hand with a revealable hidden character', { timeout: MCTS_TIMEOUT }, () => {
    const base = createActionPhaseState({ activePlayer: 'player2' });
    const hidden = mockCharInPlay(
      { isHidden: true, wasRevealedAtLeastOnce: false, controlledBy: 'player2', originalOwner: 'player2' },
      { id: 'KS-303-C', name_fr: 'Ambusher', chakra: 3, power: 4 },
    );
    const state: GameState = {
      ...base,
      player2: { ...base.player2, hand: [], chakra: 8 },
      activeMissions: [{ ...base.activeMissions[0], player2Characters: [hidden] }],
    };
    const valid = GameEngine.getValidActions(state, 'player2');
    expect(valid.some((a) => a.type === 'REVEAL_CHARACTER')).toBe(true);
    for (const difficulty of DIFFICULTIES) {
      const action = new AIPlayer(difficulty, 'player2').getAction(state);
      expect(valid).toContainEqual(action as GameAction);
    }
  });

  it('returns null and never crashes when it has no legal action at all', () => {
    const base = createActionPhaseState({ activePlayer: 'player1' });
    const passed: GameState = { ...base, player2: { ...base.player2, hasPassed: true } };
    for (const difficulty of DIFFICULTIES) {
      expect(new AIPlayer(difficulty, 'player2').getAction(passed)).toBeNull();
    }
  });

  it('returns null when it is not its turn and the opponent has not passed', () => {
    const state = createActionPhaseState({ activePlayer: 'player1' });
    for (const difficulty of DIFFICULTIES) {
      expect(new AIPlayer(difficulty, 'player2').getAction(state)).toBeNull();
    }
  });

  it('answers a mission-scoring choice with one of the offered options', { timeout: MCTS_TIMEOUT }, () => {
    const state = pendingScoringState();
    const valid = GameEngine.getValidActions(state, 'player2');
    expect(valid.length).toBe(2);
    expect(valid.every((a) => a.type === 'SELECT_TARGET')).toBe(true);
    for (const difficulty of DIFFICULTIES) {
      const action = new AIPlayer(difficulty, 'player2').getAction(state);
      expect(valid).toContainEqual(action as GameAction);
    }
  });

  it('always answers the mulligan with a MULLIGAN action, hand or no hand', () => {
    const config = createTestConfig();
    const state = GameEngine.createGame(config);
    const valid = GameEngine.getValidActions(state, 'player2');
    expect(valid.length).toBe(2);

    const emptyHand: GameState = { ...state, player2: { ...state.player2, hand: [] } };

    for (const difficulty of DIFFICULTIES) {
      const strategy = strategyFor(difficulty);
      const normal = strategy.chooseAction(state, 'player2', valid);
      expect(normal.type).toBe('MULLIGAN');
      expect(valid).toContainEqual(normal);

      const degenerate = strategy.chooseAction(emptyHand, 'player2', valid);
      expect(degenerate.type).toBe('MULLIGAN');
      expect(valid).toContainEqual(degenerate);
    }
  });

  it('stays legal across a run of consecutive AI decisions', { timeout: 60_000 }, () => {
    for (const difficulty of ['easy', 'medium'] as const) {
      const config = createTestConfig({
        player2: { userId: null, isAI: true, aiDifficulty: difficulty, deck: createTestDeck(), missionCards: createTestConfig().player2.missionCards },
      });
      let state = GameEngine.createGame(config);
      state = GameEngine.applyAction(state, 'player1', { type: 'MULLIGAN', doMulligan: false });
      state = GameEngine.applyAction(state, 'player2', { type: 'MULLIGAN', doMulligan: false });

      const ai = new AIPlayer(difficulty, 'player2');
      let decisions = 0;
      let guard = 40;
      while (decisions < 12 && guard-- > 0) {
        const valid = GameEngine.getValidActions(state, 'player2');
        if (valid.length === 0) {
          if (GameEngine.getValidActions(state, 'player1').length === 0) break;
          state = GameEngine.applyAction(state, 'player1', { type: 'PASS' });
          continue;
        }
        const action = ai.getAction(state);
        expect(action).not.toBeNull();
        expect(valid).toContainEqual(action as GameAction);
        state = GameEngine.applyAction(state, 'player2', action as GameAction);
        decisions++;
      }
      expect(decisions).toBeGreaterThan(0);
    }
  });
});

describe('AI target selection stays inside the offered options', () => {
  const emptyPending = { description: 'choose a target' };

  it('returns an empty string for an empty option list', () => {
    for (const difficulty of DIFFICULTIES) {
      expect(aiSelectTarget([], emptyPending, createActionPhaseState(), 'player2', difficulty)).toBe('');
    }
  });

  it('returns the only option when there is exactly one', () => {
    for (const difficulty of DIFFICULTIES) {
      expect(aiSelectTarget(['solo'], emptyPending, createActionPhaseState(), 'player2', difficulty)).toBe('solo');
    }
  });

  it('always confirms when a confirm option is present', () => {
    for (const difficulty of DIFFICULTIES) {
      expect(aiSelectTarget(['confirm', 'other'], emptyPending, createActionPhaseState(), 'player2', difficulty)).toBe('confirm');
    }
  });

  it('picks the first option for a SCORE resolution order', () => {
    const state = pendingScoringState();
    const options = state.pendingActions[0].options;
    const info = { description: 'score order', sourceEffectId: 'pe-score-order' };
    for (const difficulty of DIFFICULTIES) {
      expect(aiSelectTarget(options, info, state, 'player2', difficulty)).toBe(options[0]);
    }
  });

  it('never leaves the option list for a battery of effect descriptions', () => {
    const state = createActionPhaseState({ activePlayer: 'player2' });
    const charA = mockCharInPlay({ controlledBy: 'player1', originalOwner: 'player1' }, { id: 'KS-401-C', name_fr: 'Target A', power: 5 });
    const charB = mockCharInPlay({ controlledBy: 'player1', originalOwner: 'player1' }, { id: 'KS-402-C', name_fr: 'Target B', power: 2 });
    const withBoard: GameState = {
      ...state,
      activeMissions: [{ ...state.activeMissions[0], player1Characters: [charA, charB] }],
    };
    const options = [charA.instanceId, charB.instanceId];
    const descriptions = [
      'defeat an enemy character',
      'hide an enemy character',
      'move a character to another mission',
      'take control of an enemy character',
      'return a character to its owner hand',
      'discard a card from the opponent hand',
      'powerup a friendly character',
      'choose one of your characters to defeat',
      'select a mission',
      'a description that matches nothing at all',
      '',
    ];
    for (const difficulty of DIFFICULTIES) {
      for (const description of descriptions) {
        const picked = aiSelectTarget(options, { description }, withBoard, 'player2', difficulty);
        expect(options).toContain(picked);
      }
    }
  });

  it('stays inside the options even when they are plain indices rather than instance ids', () => {
    const state = createActionPhaseState({ activePlayer: 'player2' });
    const options = ['0', '1', '2'];
    for (const difficulty of DIFFICULTIES) {
      const picked = aiSelectTarget(options, { description: 'discard a card' }, state, 'player2', difficulty);
      expect(options).toContain(picked);
    }
  });

  it('takes the largest amount when asked how many tokens to remove', () => {
    const state = createActionPhaseState({ activePlayer: 'player2' });
    const info = { description: 'how many tokens', descriptionKey: 'game.effect.desc.chooseTokenAmountRemove' };
    for (const difficulty of DIFFICULTIES) {
      expect(aiSelectTarget(['0', '1', '4', '2'], info, state, 'player2', difficulty)).toBe('4');
    }
  });

  it('orders a multi-defeat as a permutation of the offered targets', () => {
    const base = createActionPhaseState({ activePlayer: 'player2' });
    const a = mockCharInPlay({ controlledBy: 'player1', originalOwner: 'player1' }, { id: 'KS-403-C', name_fr: 'Order A', power: 6 });
    const b = mockCharInPlay({ controlledBy: 'player1', originalOwner: 'player1' }, { id: 'KS-404-C', name_fr: 'Order B', power: 1 });
    const effect: PendingEffect = {
      id: 'pe-ordered',
      sourceCardId: 'KS-403-C',
      sourceInstanceId: a.instanceId,
      sourceMissionIndex: 0,
      effectType: 'MAIN',
      effectDescription: '{}',
      targetSelectionType: 'ORDERED_DEFEAT',
      sourcePlayer: 'player2',
      requiresTargetSelection: true,
      validTargets: [a.instanceId, b.instanceId],
      isOptional: false,
      isMandatory: true,
      resolved: false,
      isUpgrade: false,
    };
    const state: GameState = {
      ...base,
      activeMissions: [{ ...base.activeMissions[0], player1Characters: [a, b] }],
      pendingEffects: [effect],
    };
    const options = [a.instanceId, b.instanceId];
    for (const difficulty of DIFFICULTIES) {
      const raw = aiSelectTarget(options, { description: 'ordered defeat', sourceEffectId: 'pe-ordered' }, state, 'player2', difficulty);
      const parsed = JSON.parse(raw) as string[];
      expect(parsed.slice().sort()).toEqual(options.slice().sort());
    }
  });
});

describe('the strong AIs reason on a sanitized state only', () => {
  function markedState(): GameState {
    const base = createActionPhaseState({ activePlayer: 'player2' });
    const openEnemy = mockCharInPlay(
      { controlledBy: 'player1', originalOwner: 'player1', powerTokens: 2 },
      { id: 'KS-501-C', name_fr: 'PUBLIC_FACEUP', power: 5, chakra: 4 },
    );
    const hiddenEnemy = mockCharInPlay(
      { isHidden: true, wasRevealedAtLeastOnce: false, controlledBy: 'player1', originalOwner: 'player1', powerTokens: 3 },
      { id: 'KS-502-C', name_fr: 'SECRET_FACEDOWN', power: 7, chakra: 6 },
    );
    const ownHidden = mockCharInPlay(
      { isHidden: true, wasRevealedAtLeastOnce: false, controlledBy: 'player2', originalOwner: 'player2', powerTokens: 1 },
      { id: 'KS-503-C', name_fr: 'MY_OWN_FACEDOWN', power: 9, chakra: 5 },
    );
    return {
      ...base,
      player1: {
        ...base.player1,
        hand: [
          mockCharacter({ id: 'KS-504-C', name_fr: 'SECRET_HAND_ONE', chakra: 7, power: 7 }),
          mockCharacter({ id: 'KS-505-C', name_fr: 'SECRET_HAND_TWO', chakra: 6, power: 6 }),
          mockCharacter({ id: 'KS-506-C', name_fr: 'SECRET_HAND_THREE', chakra: 5, power: 5 }),
        ],
      },
      activeMissions: [
        {
          ...base.activeMissions[0],
          player1Characters: [openEnemy, hiddenEnemy],
          player2Characters: [ownHidden],
        },
      ],
    };
  }

  it('replaces the opponent hand with placeholders that carry no card information', () => {
    const state = markedState();
    const sanitized = AIPlayer.sanitizeStateForAI(state, 'player2');

    expect(sanitized.player1.hand).toHaveLength(state.player1.hand.length);
    for (const card of sanitized.player1.hand) {
      expect(card.cardId).toBe('__hidden_hand__');
      expect(card.chakra).toBe(0);
      expect(card.power).toBe(0);
      expect(card.effects).toEqual([]);
      expect(card.keywords).toEqual([]);
      expect(card.group).toBe('');
    }
    const dump = JSON.stringify(sanitized.player1.hand);
    for (const secret of ['SECRET_HAND_ONE', 'SECRET_HAND_TWO', 'SECRET_HAND_THREE', 'KS-504-C', 'KS-505-C', 'KS-506-C']) {
      expect(dump).not.toContain(secret);
    }
  });

  it('blanks the opponent face-down characters while keeping their power tokens', () => {
    const state = markedState();
    const sanitized = AIPlayer.sanitizeStateForAI(state, 'player2');
    const enemies = sanitized.activeMissions[0].player1Characters;
    const hidden = enemies.find((c) => c.isHidden)!;

    expect(hidden.card.id).toBe('hidden');
    expect(hidden.card.power).toBe(0);
    expect(hidden.card.chakra).toBe(0);
    expect(hidden.card.effects).toEqual([]);
    expect(hidden.stack).toEqual([]);
    expect(hidden.powerTokens).toBe(3);
    expect(JSON.stringify(sanitized.activeMissions)).not.toContain('SECRET_FACEDOWN');
  });

  it('leaves the opponent face-up characters fully visible, as public information', () => {
    const state = markedState();
    const sanitized = AIPlayer.sanitizeStateForAI(state, 'player2');
    const open = sanitized.activeMissions[0].player1Characters.find((c) => !c.isHidden)!;
    expect(open.card.name_fr).toBe('PUBLIC_FACEUP');
    expect(open.card.power).toBe(5);
    expect(open.powerTokens).toBe(2);
  });

  it('never hides the AI own hand or its own face-down characters from itself', () => {
    const state = markedState();
    const sanitized = AIPlayer.sanitizeStateForAI(state, 'player2');
    expect(sanitized.player2.hand).toEqual(state.player2.hand);
    const ownHidden = sanitized.activeMissions[0].player2Characters[0];
    expect(ownHidden.card.name_fr).toBe('MY_OWN_FACEDOWN');
    expect(ownHidden.card.power).toBe(9);
    expect(ownHidden.stack.length).toBe(1);
  });

  it('sanitizes symmetrically when the AI sits on player1', () => {
    const state = markedState();
    const sanitized = AIPlayer.sanitizeStateForAI(state, 'player1');
    expect(sanitized.player1.hand).toEqual(state.player1.hand);
    for (const card of sanitized.player2.hand) {
      expect(card.cardId).toBe('__hidden_hand__');
    }
    const ownHidden = sanitized.activeMissions[0].player2Characters[0];
    expect(ownHidden.card.id).toBe('hidden');
    expect(ownHidden.powerTokens).toBe(1);
  });

  it('does not mutate the state it sanitizes', () => {
    const state = markedState();
    const snapshot = JSON.stringify(state);
    AIPlayer.sanitizeStateForAI(state, 'player2');
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('routes every AIPlayer decision through the sanitizer', () => {
    const state = markedState();
    const seen: GameState[] = [];
    const fallback: GameAction = { type: 'PASS' };
    const spy: AIStrategy = {
      difficulty: 'impossible',
      chooseAction: (s) => {
        seen.push(s);
        return fallback;
      },
    };
    const ai = new AIPlayer('impossible', 'player2');
    (ai as unknown as { strategy: AIStrategy }).strategy = spy;

    const action = ai.getAction(state);
    expect(action).toEqual(fallback);
    expect(seen).toHaveLength(1);
    expect(seen[0].player1.hand.every((c) => c.cardId === '__hidden_hand__')).toBe(true);
    expect(JSON.stringify(seen[0].player1.hand)).not.toContain('SECRET_HAND_ONE');
    expect(seen[0].activeMissions[0].player1Characters.find((c) => c.isHidden)!.card.id).toBe('hidden');
  });

  it('scores a placeholder hand by its size only, never by the real cards it stands for', () => {
    const state = markedState();
    const sanitized = AIPlayer.sanitizeStateForAI(state, 'player2');
    const sanitizedQuality = BoardEvaluator.evaluateHandQuality(sanitized, 'player1');
    const realQuality = BoardEvaluator.evaluateHandQuality(state, 'player1');
    expect(sanitizedQuality).toBe(state.player1.hand.length * 0.5);
    expect(sanitizedQuality).not.toBe(realQuality);
  });

  it('resamples the opponent hand from a reshuffled deck instead of reading the real one', () => {
    const state = markedState();
    const sanitized = AIPlayer.sanitizeStateForAI(state, 'player2');
    const mcts = new NeuralISMCTS({ simulations: 1, maxDepth: 1, explorationC: 1, evaluator: null, maxBranching: 4, useBatchedEval: false });
    const determinize = (mcts as unknown as { determinize: (s: GameState, p: PlayerID) => GameState }).determinize.bind(mcts);

    const sampled = determinize(sanitized, 'player2');
    expect(sampled.player1.hand).toHaveLength(state.player1.hand.length);
    expect(sampled.player1.hand.every((c) => c.cardId !== '__hidden_hand__')).toBe(true);
    const realHandIds = new Set(state.player1.hand.map((c) => c.id));
    for (const card of sampled.player1.hand) {
      expect(realHandIds.has(card.id)).toBe(false);
    }
    const deckIds = new Set(state.player1.deck.map((c) => c.id));
    for (const card of sampled.player1.hand) {
      expect(deckIds.has(card.id)).toBe(true);
    }
    expect(sampled.player1.deck).toHaveLength(state.player1.deck.length - state.player1.hand.length);
  });

  it('survives a determinization when the opponent deck is exhausted', () => {
    const base = markedState();
    const noDeck: GameState = { ...base, player1: { ...base.player1, deck: [] } };
    const sanitized = AIPlayer.sanitizeStateForAI(noDeck, 'player2');
    const mcts = new NeuralISMCTS({ simulations: 1, maxDepth: 1, explorationC: 1, evaluator: null, maxBranching: 4, useBatchedEval: false });
    const determinize = (mcts as unknown as { determinize: (s: GameState, p: PlayerID) => GameState }).determinize.bind(mcts);
    const sampled = determinize(sanitized, 'player2');
    expect(sampled.player1.hand).toEqual([]);
  });

  it('the Impossible AI decides on a placeholder hand without crashing', { timeout: MCTS_TIMEOUT }, () => {
    const state = markedState();
    const valid = GameEngine.getValidActions(state, 'player2');
    expect(valid.length).toBeGreaterThan(1);
    const sanitized = AIPlayer.sanitizeStateForAI(state, 'player2');
    const action = new ImpossibleAI().chooseAction(sanitized, 'player2', valid);
    expect(valid).toContainEqual(action);
  });

  it('the Impossible AI decides with an empty opponent hand and an empty opponent deck', { timeout: MCTS_TIMEOUT }, () => {
    const base = markedState();
    const starved: GameState = { ...base, player1: { ...base.player1, hand: [], deck: [] } };
    const valid = GameEngine.getValidActions(starved, 'player2');
    const sanitized = AIPlayer.sanitizeStateForAI(starved, 'player2');
    const action = new ImpossibleAI().chooseAction(sanitized, 'player2', valid);
    expect(valid).toContainEqual(action);
  });
});

describe('Solo v Self never progresses quests, other modes do', () => {
  const OTHER_MODES: GameMode[] = ['ranked', 'casual', 'evolving', 'sealed', 'tournament', 'ai', 'hotseat'];

  it('no shipped quest opts into Solo v Self', () => {
    expect(QUESTS.length).toBeGreaterThan(0);
    expect(QUESTS.filter((q) => q.allowSoloVSelf === true)).toEqual([]);
    for (const quest of QUESTS) {
      expect(isQuestAllowedInMode(quest, 'solo_v_self')).toBe(false);
    }
  });

  it('allows every shipped quest in every other mode and when the mode is unknown', () => {
    for (const quest of QUESTS) {
      for (const mode of OTHER_MODES) {
        expect(isQuestAllowedInMode(quest, mode)).toBe(true);
      }
      expect(isQuestAllowedInMode(quest, undefined)).toBe(true);
    }
  });

  it('honours an explicit opt-in flag if a future quest sets it', () => {
    const optedIn: Quest = {
      id: 'test-solo-opt-in',
      level: 1,
      target: 1,
      hook: 'card.discarded',
      scope: 'cumulative',
      text_fr: 'test',
      text_en: 'test',
      allowSoloVSelf: true,
    };
    expect(isQuestAllowedInMode(optedIn, 'solo_v_self')).toBe(true);
    expect(isQuestAllowedInMode({ ...optedIn, allowSoloVSelf: false }, 'solo_v_self')).toBe(false);
    expect(isQuestAllowedInMode({ ...optedIn, allowSoloVSelf: undefined }, 'solo_v_self')).toBe(false);
  });

  it('matches zero quests for a Solo v Self event', () => {
    expect(matchQuestsForEvent('card.discarded', { gameMode: 'solo_v_self' })).toEqual([]);
    expect(matchQuestsForEvent('card.discarded', { gameMode: 'solo_v_self', delta: 25 })).toEqual([]);
    expect(matchQuestsForEvent('match.played.ai', { gameMode: 'solo_v_self', difficulty: 'easy' })).toEqual([]);
  });

  it('matches quests normally for the other modes', () => {
    for (const mode of OTHER_MODES) {
      expect(matchQuestsForEvent('card.discarded', { gameMode: mode }).length).toBeGreaterThan(0);
    }
    expect(matchQuestsForEvent('card.discarded', undefined).length).toBeGreaterThan(0);
  });

  it('keeps AI-difficulty quests progressing in vs-AI games', () => {
    const easy = matchQuestsForEvent('match.played.ai', { gameMode: 'ai', difficulty: 'easy' });
    expect(easy.length).toBeGreaterThan(0);
    expect(easy.every((m) => m.quest.hook === 'match.played.ai')).toBe(true);
    expect(matchQuestsForEvent('match.played.ai', { gameMode: 'solo_v_self', difficulty: 'easy' })).toEqual([]);
  });
});

describe('hotseat particularities', () => {
  it('gives both human seats the same start-phase chakra, with no Impossible bonus', () => {
    const config = createTestConfig({
      player2: { userId: 'seat-2', isAI: false, deck: createTestDeck(), missionCards: createTestConfig().player2.missionCards },
    });
    let state = GameEngine.createGame(config);
    state = GameEngine.applyAction(state, 'player1', { type: 'MULLIGAN', doMulligan: false });
    state = GameEngine.applyAction(state, 'player2', { type: 'MULLIGAN', doMulligan: false });

    expect(state.phase).toBe('action');
    expect(state.player1.isAI).toBe(false);
    expect(state.player2.isAI).toBe(false);
    expect(state.player1.chakra).toBe(state.player2.chakra);
    expect(state.player1.chakra).toBe(5);
    expect(state.player1.hand).toHaveLength(7);
    expect(state.player2.hand).toHaveLength(7);
  });

  it('counts face-down characters in the start-phase chakra of a hotseat seat', () => {
    const base = createActionPhaseState();
    const hiddenOne = mockCharInPlay({ isHidden: true, controlledBy: 'player1', originalOwner: 'player1' });
    const hiddenTwo = mockCharInPlay({ isHidden: true, controlledBy: 'player1', originalOwner: 'player1' }, { id: 'KS-601-C', name_fr: 'Second Hidden' });
    const openOne = mockCharInPlay({ controlledBy: 'player1', originalOwner: 'player1' }, { id: 'KS-602-C', name_fr: 'Open One' });
    const state: GameState = {
      ...base,
      turn: 2 as GameState['turn'],
      player1: { ...base.player1, chakra: 0, isAI: false },
      player2: { ...base.player2, chakra: 0, isAI: false },
      missionDeck: [mockMission({ id: 'KS-007-MMS', basePoints: 3 })],
      activeMissions: [{ ...base.activeMissions[0], player1Characters: [hiddenOne, hiddenTwo, openOne] }],
    };

    const after = executeStartPhase(state);
    expect(after.player1.chakra).toBe(5 + 3);
    expect(after.player2.chakra).toBe(5);
    expect(after.player1.hand.length - state.player1.hand.length).toBe(2);
    expect(after.player2.hand.length - state.player2.hand.length).toBe(2);
  });

  it('switches the point of view without ever exposing the other seat hand', () => {
    const cfg = createTestConfig({
      player2: { userId: 'seat-2', isAI: false, deck: createTestDeck(), missionCards: createTestConfig().player2.missionCards },
    });
    useGameStore.getState().startHotseatGame(cfg, 'Seat One', 'Seat Two');

    const first = useGameStore.getState();
    expect(first.humanPlayer).toBe('player1');
    expect(first.visibleState?.myPlayer).toBe('player1');
    expect(first.visibleState?.opponentState.id).toBe('player2');
    expect((first.visibleState?.opponentState as unknown as { hand?: unknown }).hand).toBeUndefined();
    expect(first.visibleState?.opponentState.handSize).toBe(first.gameState?.player2.hand.length);

    useGameStore.setState({ hotseatNextPlayer: 'player2' });
    useGameStore.getState().confirmHotseatSwitch();

    const second = useGameStore.getState();
    expect(second.humanPlayer).toBe('player2');
    expect(second.visibleState?.myPlayer).toBe('player2');
    expect(second.visibleState?.opponentState.id).toBe('player1');
    expect((second.visibleState?.opponentState as unknown as { hand?: unknown }).hand).toBeUndefined();
    expect(second.hotseatSwitchPending).toBe(false);
  });

  it('keeps the Impossible chakra bonus strictly for an AI seat', () => {
    const humanCfg = createTestConfig({
      player2: { userId: 'seat-2', isAI: false, deck: createTestDeck(), missionCards: createTestConfig().player2.missionCards },
    });
    const aiCfg = createTestConfig({
      player2: { userId: null, isAI: true, aiDifficulty: 'impossible', deck: createTestDeck(), missionCards: createTestConfig().player2.missionCards },
    });

    const play = (cfg: ReturnType<typeof createTestConfig>): GameState => {
      let s = GameEngine.createGame(cfg);
      s = GameEngine.applyAction(s, 'player1', { type: 'MULLIGAN', doMulligan: false });
      s = GameEngine.applyAction(s, 'player2', { type: 'MULLIGAN', doMulligan: false });
      return s;
    };

    const hotseat = play(humanCfg);
    const versusAi = play(aiCfg);

    expect(hotseat.player2.chakra - hotseat.player1.chakra).toBe(0);
    expect(versusAi.player2.chakra - versusAi.player1.chakra).toBe(5);
  });
});
