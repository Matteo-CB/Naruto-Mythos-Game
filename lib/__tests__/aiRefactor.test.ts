import { describe, it, expect, beforeAll } from 'vitest';
import { GameEngine } from '../engine/GameEngine';
import { AIPlayer } from '../ai/AIPlayer';
import { EasyAI } from '../ai/strategies/EasyAI';
import { MediumAI } from '../ai/strategies/MediumAI';
import { HardAI } from '../ai/strategies/HardAI';
import { ImpossibleAI } from '../ai/strategies/ImpossibleAI';
import { initializeRegistry } from '../effects/EffectRegistry';
import { getAllCards } from '../data/cardLoader';
import { executeStartPhase } from '../engine/phases/StartPhase';
import type { GameConfig, CharacterCard, MissionCard, GameState } from '../engine/types';
import { BASE_CHAKRA_PER_TURN } from '../engine/types';

beforeAll(() => {
  initializeRegistry();
});

function buildDeck(allCards: CharacterCard[]): CharacterCard[] {
  return [...allCards].sort(() => Math.random() - 0.5).slice(0, 30);
}

function buildMissions(allMissions: MissionCard[]): MissionCard[] {
  return [...allMissions].sort(() => Math.random() - 0.5).slice(0, 3);
}

function makeConfig(
  allChars: CharacterCard[],
  allMissions: MissionCard[],
  aiDifficulty: 'easy' | 'medium' | 'hard' | 'impossible',
): GameConfig {
  return {
    player1: {
      userId: 'human',
      isAI: false,
      deck: buildDeck(allChars),
      missionCards: buildMissions(allMissions),
    },
    player2: {
      userId: null,
      isAI: true,
      aiDifficulty,
      deck: buildDeck(allChars),
      missionCards: buildMissions(allMissions),
    },
  };
}

function passMulligan(state: GameState): GameState {
  let s = state;
  if (s.phase === 'mulligan') {
    s = GameEngine.applyAction(s, 'player1', { type: 'MULLIGAN', doMulligan: false });
  }
  if (s.phase === 'mulligan') {
    s = GameEngine.applyAction(s, 'player2', { type: 'MULLIGAN', doMulligan: false });
  }
  return s;
}

describe('AI refactor sanity', () => {
  const allCards = getAllCards();
  const allChars = allCards.filter((c) => c.card_type === 'character') as CharacterCard[];
  const allMissions = allCards.filter((c) => c.card_type === 'mission') as MissionCard[];

  it('Impossible AI grants +5 chakra above the base in Start phase', () => {
    const config = makeConfig(allChars, allMissions, 'impossible');
    const state = GameEngine.createGame(config);
    const afterMulligan = passMulligan(state);

    expect(afterMulligan.phase).toBe('action');
    expect(afterMulligan.player2.isAI).toBe(true);
    expect(afterMulligan.player2.aiDifficulty).toBe('impossible');

    const humanChakra = afterMulligan.player1.chakra;
    const aiChakra = afterMulligan.player2.chakra;
    expect(aiChakra - humanChakra).toBe(5);
    expect(aiChakra).toBeGreaterThanOrEqual(BASE_CHAKRA_PER_TURN + 5);
  });

  it('Hard AI receives the same chakra as the human (no Impossible bonus)', () => {
    const config = makeConfig(allChars, allMissions, 'hard');
    const state = GameEngine.createGame(config);
    const afterMulligan = passMulligan(state);

    expect(afterMulligan.player2.chakra).toBe(afterMulligan.player1.chakra);
    expect(afterMulligan.player1.chakra).toBeGreaterThanOrEqual(BASE_CHAKRA_PER_TURN);
  });

  it('All four strategies expose the right difficulty tag', () => {
    expect(new EasyAI().difficulty).toBe('easy');
    expect(new MediumAI().difficulty).toBe('medium');
    expect(new HardAI().difficulty).toBe('hard');
    expect(new ImpossibleAI().difficulty).toBe('impossible');
  });

  it('AIPlayer.createStrategy returns the right instance per level', () => {
    expect(AIPlayer.createStrategy('easy')).toBeInstanceOf(EasyAI);
    expect(AIPlayer.createStrategy('medium')).toBeInstanceOf(MediumAI);
    expect(AIPlayer.createStrategy('hard')).toBeInstanceOf(HardAI);
    expect(AIPlayer.createStrategy('impossible')).toBeInstanceOf(ImpossibleAI);
  });

  it('Hard AI returns a legal action when it is its turn', { timeout: 20000 }, () => {
    const config = makeConfig(allChars, allMissions, 'hard');
    const state = GameEngine.createGame(config);
    let s = passMulligan(state);
    if (s.activePlayer === 'player1') {
      s = GameEngine.applyAction(s, 'player1', { type: 'PASS' });
    }
    expect(s.activePlayer).toBe('player2');

    const ai = new AIPlayer('hard', 'player2');
    const validBefore = GameEngine.getValidActions(s, 'player2');
    expect(validBefore.length).toBeGreaterThan(0);

    const action = ai.getAction(s);
    expect(action).not.toBeNull();
    if (!action) return;
    expect(() => GameEngine.applyAction(s, 'player2', action)).not.toThrow();
  });

  it('Easy AI returns a legal action when it is its turn', () => {
    const config = makeConfig(allChars, allMissions, 'easy');
    const state = GameEngine.createGame(config);
    let s = passMulligan(state);
    if (s.activePlayer === 'player1') {
      s = GameEngine.applyAction(s, 'player1', { type: 'PASS' });
    }
    const ai = new AIPlayer('easy', 'player2');
    const action = ai.getAction(s);
    expect(action).not.toBeNull();
    if (!action) return;
    expect(() => GameEngine.applyAction(s, 'player2', action)).not.toThrow();
  });

  it('Impossible AI starts with more chakra than Hard AI in turn 1', () => {
    const impConfig = makeConfig(allChars, allMissions, 'impossible');
    const hardConfig = makeConfig(allChars, allMissions, 'hard');
    const impState = passMulligan(GameEngine.createGame(impConfig));
    const hardState = passMulligan(GameEngine.createGame(hardConfig));
    expect(impState.player2.chakra).toBeGreaterThan(hardState.player2.chakra);
  });

  it('Impossible chakra bonus applies on every Start phase (turn 2 and 3, not just turn 1)', () => {
    const config = makeConfig(allChars, allMissions, 'impossible');
    const state = GameEngine.createGame(config);
    let s = passMulligan(state);

    expect(s.turn).toBe(1);
    const t1Chakra = s.player2.chakra;
    expect(t1Chakra - s.player1.chakra).toBe(5);

    s = { ...s, player1: { ...s.player1, chakra: 0 }, player2: { ...s.player2, chakra: 0 }, turn: 2 } as typeof s;
    s = executeStartPhase(s);
    expect(s.player2.chakra - s.player1.chakra).toBe(5);

    s = { ...s, player1: { ...s.player1, chakra: 0 }, player2: { ...s.player2, chakra: 0 }, turn: 3 } as typeof s;
    s = executeStartPhase(s);
    expect(s.player2.chakra - s.player1.chakra).toBe(5);
  });

  it('Hard AI completes a full game vs Easy AI without crashing', { timeout: 240_000 }, () => {
    const config: GameConfig = {
      player1: {
        userId: null,
        isAI: true,
        aiDifficulty: 'hard',
        deck: buildDeck(allChars),
        missionCards: buildMissions(allMissions),
      },
      player2: {
        userId: null,
        isAI: true,
        aiDifficulty: 'easy',
        deck: buildDeck(allChars),
        missionCards: buildMissions(allMissions),
      },
    };
    const hardAI = new AIPlayer('hard', 'player1');
    const easyAI = new AIPlayer('easy', 'player2');
    let s = GameEngine.createGame(config);

    let safetyTicks = 1500;
    while (s.phase !== 'gameOver' && safetyTicks-- > 0) {
      let acted = false;
      for (const pid of ['player1', 'player2'] as const) {
        const valid = GameEngine.getValidActions(s, pid);
        if (valid.length === 0) continue;
        const ai = pid === 'player1' ? hardAI : easyAI;
        const action = ai.getAction(s);
        if (!action) continue;
        s = GameEngine.applyAction(s, pid, action);
        acted = true;
        break;
      }
      if (!acted) {
        if (
          (s.phase === 'mission' || s.phase === 'end' || s.phase === 'start') &&
          s.pendingActions.length === 0 &&
          s.pendingEffects.length === 0
        ) {
          s = GameEngine.applyAction(s, s.activePlayer ?? 'player1', { type: 'ADVANCE_PHASE' });
          continue;
        }
        break;
      }
    }

    expect(s.phase).toBe('gameOver');
    expect(s.turn).toBeGreaterThanOrEqual(4);
  });
});
