import { describe, expect, it } from 'vitest';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { defeatEnemyCharacter } from '@/lib/effects/defeatUtils';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { getCharacterById } from '@/lib/data/cardIndex';
import type { GameState } from '@/lib/engine/types';

const GAARA_078 = 'SS-078-UC';
const ROCK_LEE = 'SS-115-SHINOBIV';
const GAARA_PARTNER = 'SS-046-UC';
const TSUNADE = 'KS-003-C';
const PREY = 'KS-005-C';

function drawPrompt(state: GameState): boolean {
  return state.pendingActions.some((a) => a.descriptionKey === 'game.effect.desc.ss078ConfirmDraw');
}

function tokensOf(state: GameState, instanceId: string): number {
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (char.instanceId === instanceId) return char.powerTokens;
    }
  }
  return -1;
}

describe('Gaara 078 only draws for enemies its own controller defeats', () => {
  it('drawing is offered when the Gaara owner defeats an enemy', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      p1: [simChar(GAARA_078, { owner: 'player1', instanceId: 'my-gaara' })],
      p2: [simChar(PREY, { owner: 'player2', instanceId: 'enemy-1' })],
    });
    state.player1.deck = [getCharacterById(PREY)!];
    state.player1.chakra = 5;

    const after = defeatEnemyCharacter(state, 0, 'enemy-1', 'player1');
    expect(drawPrompt(after), 'my Gaara, my kill').toBe(true);
    expect(after.pendingActions[0].player).toBe('player1');
  });

  it('nothing is offered when the opponent defeats one of their own characters', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      p1: [simChar(GAARA_078, { owner: 'player1', instanceId: 'my-gaara' })],
      p2: [simChar(PREY, { owner: 'player2', instanceId: 'their-own' })],
    });

    const after = EffectEngine.defeatCharacter(state, 'their-own', 'player2');
    expect(drawPrompt(after), 'they killed their own card, that is not my doing').toBe(false);
  });

  it('nothing is offered when the opponent defeats my Gaara itself', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      p1: [simChar(GAARA_078, { owner: 'player1', instanceId: 'my-gaara' })],
      p2: [simChar(PREY, { owner: 'player2', instanceId: 'enemy-1' })],
    });

    const after = EffectEngine.defeatCharacter(state, 'my-gaara', 'player2');
    expect(drawPrompt(after), 'being killed is not defeating').toBe(false);
  });

  it('the reported case: an enemy Sasuke kills my Gaara and one of their own cards', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      p1: [simChar(GAARA_078, { owner: 'player1', instanceId: 'my-gaara' })],
      p2: [
        simChar(PREY, { owner: 'player2', instanceId: 'their-sacrifice' }),
        simChar(PREY, { owner: 'player2', instanceId: 'their-sasuke' }),
      ],
    });

    const after = EffectEngine.defeatSimultaneously(state, ['their-sacrifice', 'my-gaara'], 'player2');

    expect(drawPrompt(after), 'no window may open on my side').toBe(false);
    expect(after.pendingActions.length, 'and nothing steals my turn').toBe(0);
  });

  it('a Gaara dying in the same batch never triggers, like Tsunade', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      p1: [simChar(GAARA_078, { owner: 'player1', instanceId: 'my-gaara' })],
      p2: [simChar(PREY, { owner: 'player2', instanceId: 'enemy-1' })],
    });

    const after = EffectEngine.defeatSimultaneously(state, ['enemy-1', 'my-gaara'], 'player1');
    expect(drawPrompt(after), 'my Gaara fell at the same instant').toBe(false);
  });
});

describe('Tsunade 003 keeps the same simultaneous rule', () => {
  it('gains chakra when a friendly dies alone', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      p1: [
        simChar(TSUNADE, { owner: 'player1', instanceId: 'my-tsunade' }),
        simChar(PREY, { owner: 'player1', instanceId: 'my-ally' }),
      ],
    });
    const before = state.player1.chakra;

    const after = EffectEngine.defeatCharacter(state, 'my-ally', 'player2');
    expect(after.player1.chakra - before).toBe(2);
  });

  it('gains nothing when it dies in the same batch as the friendly', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      p1: [
        simChar(TSUNADE, { owner: 'player1', instanceId: 'my-tsunade' }),
        simChar(PREY, { owner: 'player1', instanceId: 'my-ally' }),
      ],
    });
    const before = state.player1.chakra;

    const after = EffectEngine.defeatSimultaneously(state, ['my-ally', 'my-tsunade'], 'player2');
    expect(after.player1.chakra - before, 'it died at the same instant').toBe(0);
  });
});

describe('Rock Lee 115 follows the same ownership rule', () => {
  function leeBoard(): GameState {
    return buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      p1: [simChar(ROCK_LEE, { owner: 'player1', instanceId: 'my-lee' })],
      p2: [
        simChar(GAARA_PARTNER, { owner: 'player2', instanceId: 'enemy-gaara' }),
        simChar(PREY, { owner: 'player2', instanceId: 'enemy-prey' }),
      ],
    });
  }

  it('powers up when its controller defeats an enemy', () => {
    const after = defeatEnemyCharacter(leeBoard(), 0, 'enemy-prey', 'player1');
    expect(tokensOf(after, 'my-lee')).toBe(2);
  });

  it('stays untouched when the opponent defeats their own character', () => {
    const after = EffectEngine.defeatCharacter(leeBoard(), 'enemy-prey', 'player2');
    expect(tokensOf(after, 'my-lee'), 'their kill, not mine').toBe(0);
  });

  it('stays untouched when it falls in the same batch as its victim', () => {
    const after = EffectEngine.defeatSimultaneously(leeBoard(), ['enemy-prey', 'my-lee'], 'player1');
    expect(tokensOf(after, 'my-lee'), 'gone at the same instant').toBe(-1);
  });
});
