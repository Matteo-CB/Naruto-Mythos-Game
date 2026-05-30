import { describe, it, expect } from 'vitest';
import {
  findHiddenSoundVillageOnBoard,
  findHiddenSummonsOnBoard,
  findHiddenLeafOnBoard,
} from '@/lib/effects/handlers/KS/shared/summonSearch';
import type { GameState } from '@/lib/engine/types';

function makeBaseState(): GameState {
  return {
    gameId: 'g1',
    gameMode: 'casual',
    turn: 1,
    phase: 'action',
    activePlayer: 'player1',
    edgeHolder: 'player1',
    firstPasser: null,
    player1: {
      userId: 'u1',
      isAI: false,
      aiDifficulty: null,
      hand: [],
      deck: [],
      discardPile: [],
      missionCards: [],
      missionPoints: 0,
      chakra: 10,
      unusedMission: null,
      cardsDrawnThisTurn: 0,
    } as never,
    player2: {
      userId: 'u2',
      isAI: false,
      aiDifficulty: null,
      hand: [],
      deck: [],
      discardPile: [],
      missionCards: [],
      missionPoints: 0,
      chakra: 10,
      unusedMission: null,
      cardsDrawnThisTurn: 0,
    } as never,
    missionDeck: [],
    activeMissions: [],
    log: [],
    pendingEffects: [],
    pendingActions: [],
    turnMissionRevealed: false,
    consecutiveTimeouts: { player1: 0, player2: 0 },
    actionHistory: [],
  } as never;
}

function makeHiddenChar(opts: {
  instanceId: string;
  group?: string;
  keywords?: string[];
  chakra?: number;
  name?: string;
}) {
  return {
    instanceId: opts.instanceId,
    isHidden: true,
    controlledBy: 'player1',
    originalOwner: 'player1',
    powerTokens: 0,
    stack: [],
    wasRevealedAtLeastOnce: false,
    card: {
      id: `card-${opts.instanceId}`,
      cardId: `card-${opts.instanceId}`,
      name_fr: opts.name ?? 'TestChar',
      name_en: opts.name ?? 'TestChar',
      title_fr: '',
      title_en: '',
      rarity: 'C' as const,
      number: '001',
      set: 'KS',
      card_type: 'character' as const,
      chakra: opts.chakra ?? 3,
      power: 1,
      group: opts.group ?? 'Sound Village',
      keywords: opts.keywords ?? [],
      effects: [],
      image_file: '',
      has_visual: false,
    },
  } as never;
}

function makeMission(p1Chars: ReturnType<typeof makeHiddenChar>[] = [], p2Chars: ReturnType<typeof makeHiddenChar>[] = []) {
  return {
    card: {} as never,
    rank: 'D' as const,
    revealedAtTurn: 1,
    wonBy: null,
    player1Characters: p1Chars,
    player2Characters: p2Chars,
  };
}

describe('findHiddenSoundVillageOnBoard', () => {
  it('returns hidden Sound Village characters on the player\'s side', () => {
    const state = makeBaseState();
    state.activeMissions = [makeMission([
      makeHiddenChar({ instanceId: 'tayuya-hidden-1', group: 'Sound Village', chakra: 5, name: 'TAYUYA-VARIANT' }),
    ])] as never;
    const targets = findHiddenSoundVillageOnBoard(state, 'player1', 2);
    expect(targets).toHaveLength(1);
    expect(targets[0].instanceId).toBe('tayuya-hidden-1');
  });

  it('excludes hidden characters whose group is NOT Sound Village', () => {
    const state = makeBaseState();
    state.activeMissions = [makeMission([
      makeHiddenChar({ instanceId: 'leaf-hidden', group: 'Leaf Village', chakra: 5 }),
      makeHiddenChar({ instanceId: 'sand-hidden', group: 'Sand Village', chakra: 5 }),
    ])] as never;
    const targets = findHiddenSoundVillageOnBoard(state, 'player1', 2);
    expect(targets).toHaveLength(0);
  });

  it('excludes face-up Sound Village characters (only hidden ones)', () => {
    const state = makeBaseState();
    const visibleChar = makeHiddenChar({ instanceId: 'visible-sound', group: 'Sound Village', chakra: 5 }) as unknown as { isHidden: boolean };
    visibleChar.isHidden = false;
    state.activeMissions = [makeMission([visibleChar as never])] as never;
    const targets = findHiddenSoundVillageOnBoard(state, 'player1', 2);
    expect(targets).toHaveLength(0);
  });

  it('excludes enemy hidden Sound Village (only friendly)', () => {
    const state = makeBaseState();
    state.activeMissions = [makeMission(
      [],
      [makeHiddenChar({ instanceId: 'enemy-sound-hidden', group: 'Sound Village', chakra: 5 })],
    )] as never;
    const targets = findHiddenSoundVillageOnBoard(state, 'player1', 2);
    expect(targets).toHaveLength(0);
  });

  it('respects the cost reduction when checking affordability', () => {
    const state = makeBaseState();
    state.player1.chakra = 3;
    state.activeMissions = [makeMission([
      makeHiddenChar({ instanceId: 'sound-expensive', group: 'Sound Village', chakra: 6 }),
    ])] as never;
    const targetsNoReduction = findHiddenSoundVillageOnBoard(state, 'player1', 0);
    expect(targetsNoReduction).toHaveLength(0);
    const targetsCostMinus2 = findHiddenSoundVillageOnBoard(state, 'player1', 2);
    expect(targetsCostMinus2).toHaveLength(0);
    const targetsCostMinus3 = findHiddenSoundVillageOnBoard(state, 'player1', 3);
    expect(targetsCostMinus3).toHaveLength(1);
  });

  it('Tayuya is independent of the Jiraiya Summon-only and Hiruzen Leaf-only helpers', () => {
    const state = makeBaseState();
    state.activeMissions = [makeMission([
      makeHiddenChar({ instanceId: 'sound-jutsu', group: 'Sound Village', keywords: ['Jutsu'], chakra: 4 }),
      makeHiddenChar({ instanceId: 'leaf-sannin', group: 'Leaf Village', keywords: ['Sannin'], chakra: 4 }),
      makeHiddenChar({ instanceId: 'summon-akimaru', group: 'Independent', keywords: ['Summon'], chakra: 4 }),
    ])] as never;
    expect(findHiddenSoundVillageOnBoard(state, 'player1', 2).map((t) => t.instanceId)).toEqual(['sound-jutsu']);
    expect(findHiddenLeafOnBoard(state, 'player1', 2).map((t) => t.instanceId)).toEqual(['leaf-sannin']);
    expect(findHiddenSummonsOnBoard(state, 'player1', 2).map((t) => t.instanceId)).toEqual(['summon-akimaru']);
  });
});
