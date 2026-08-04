import { describe, expect, it } from 'vitest';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { defeatEnemyCharacter, defeatFriendlyCharacter } from '@/lib/effects/defeatUtils';
import type { GameState } from '@/lib/engine/types';

const LEE = 'SS-115-SHINOBIV';
const GAARA = 'SS-046-UC';
const PREY = 'KS-005-C';

function boardWith(opts: { gaara?: boolean; gaaraMission?: number; leeMission?: number } = {}): GameState {
  const state = buildSimState({
    missionIds: ['KS-001-MMS', 'KS-006-MMS'],
    p1: [simChar(LEE, { owner: 'player1', instanceId: 'my-lee' })],
    p2: [simChar(PREY, { owner: 'player2', instanceId: 'enemy-1' })],
  });

  if (opts.gaara !== false) {
    const index = opts.gaaraMission ?? 0;
    state.activeMissions[index].player2Characters.push(
      simChar(GAARA, { owner: 'player2', instanceId: 'enemy-gaara', missionIndex: index }),
    );
  }
  return state;
}

function tokensOf(state: GameState, instanceId: string): number {
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (char.instanceId === instanceId) return char.powerTokens;
    }
  }
  return -1;
}

function defeatEnemy(state: GameState, instanceId: string): GameState {
  const located = state.activeMissions
    .flatMap((m, idx) => m.player2Characters.map((c) => ({ c, idx })))
    .find((x) => x.c.instanceId === instanceId)!;
  return defeatEnemyCharacter(state, located.idx, instanceId, 'player1');
}

describe('Rock Lee 115: his continuous DUEL powers him up on every enemy he defeats', () => {
  it('with a Gaara in the same mission, defeating an enemy gives POWERUP 2', () => {
    const after = defeatEnemy(boardWith(), 'enemy-1');
    expect(tokensOf(after, 'my-lee'), 'the continuous DUEL is always on while Gaara is here').toBe(2);
  });

  it('it fires again on every further defeat, it is not once per game', () => {
    let state = boardWith();
    state.activeMissions[0].player2Characters.push(
      simChar(PREY, { owner: 'player2', instanceId: 'enemy-2', missionIndex: 0 }),
    );

    state = defeatEnemy(state, 'enemy-1');
    expect(tokensOf(state, 'my-lee')).toBe(2);

    state = defeatEnemy(state, 'enemy-2');
    expect(tokensOf(state, 'my-lee'), 'twice defeated, twice powered up').toBe(4);
  });

  it('no Gaara in the mission means no bonus at all', () => {
    const after = defeatEnemy(boardWith({ gaara: false }), 'enemy-1');
    expect(tokensOf(after, 'my-lee'), 'the DUEL partner is missing').toBe(0);
  });

  it('a Gaara standing on another mission does not count', () => {
    const state = boardWith({ gaara: false });
    state.activeMissions[1].player2Characters.push(
      simChar(GAARA, { owner: 'player2', instanceId: 'far-gaara', missionIndex: 1 }),
    );

    const after = defeatEnemy(state, 'enemy-1');
    expect(tokensOf(after, 'my-lee'), 'the partner must share the mission').toBe(0);
  });

  it('a friendly Gaara also satisfies the DUEL, the card does not say enemy', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      p1: [
        simChar(LEE, { owner: 'player1', instanceId: 'my-lee' }),
        simChar(GAARA, { owner: 'player1', instanceId: 'ally-gaara' }),
      ],
      p2: [simChar(PREY, { owner: 'player2', instanceId: 'enemy-1' })],
    });

    const after = defeatEnemy(state, 'enemy-1');
    expect(tokensOf(after, 'my-lee')).toBe(2);
  });

  it('defeating a friendly character gives Rock Lee nothing', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      p1: [
        simChar(LEE, { owner: 'player1', instanceId: 'my-lee' }),
        simChar(PREY, { owner: 'player1', instanceId: 'ally-prey' }),
      ],
      p2: [simChar(GAARA, { owner: 'player2', instanceId: 'enemy-gaara' })],
    });

    const after = defeatFriendlyCharacter(state, 0, 'ally-prey', 'player1');
    expect(tokensOf(after, 'my-lee'), 'only enemies count').toBe(0);
  });

  it('a hidden Rock Lee stays out of it', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      p1: [simChar(LEE, { owner: 'player1', instanceId: 'my-lee', hidden: true })],
      p2: [
        simChar(PREY, { owner: 'player2', instanceId: 'enemy-1' }),
        simChar(GAARA, { owner: 'player2', instanceId: 'enemy-gaara' }),
      ],
    });

    const after = defeatEnemy(state, 'enemy-1');
    expect(tokensOf(after, 'my-lee'), 'a face-down card has no visible ability').toBe(0);
  });
});
