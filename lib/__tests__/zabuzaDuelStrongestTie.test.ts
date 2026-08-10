import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { strongestEnemiesIn } from '@/lib/effects/handlers/SS/secretVariants';
import type { GameState } from '@/lib/engine/types';

registerAllSetHandlers();

const ZABUZA = 'SS-150-SV';
const KAKASHI = 'KS-015-C';
const KYUBI = 'KS-129-R';
const ICHIBI = 'KS-130-R';
const SASUKE = 'KS-136-S';
const SMALL = 'KS-021-C';

function play(state: GameState, cardId: string, missionIndex = 0): GameState {
  const cardIndex = state.player1.hand.findIndex((c) => c.id === cardId);
  return GameEngine.applyAction(state, 'player1', {
    type: 'PLAY_CHARACTER', cardIndex, missionIndex,
  } as never);
}

function answer(state: GameState, target?: string): GameState {
  const action = state.pendingActions[0];
  if (!action) return state;
  return GameEngine.applyAction(state, action.player, {
    type: 'SELECT_TARGET', pendingActionId: action.id, selectedTargets: [target ?? action.options[0]],
  } as never);
}

function missionOf(state: GameState, instanceId: string): number {
  for (let i = 0; i < state.activeMissions.length; i++) {
    const m = state.activeMissions[i];
    if ([...m.player1Characters, ...m.player2Characters].some((c) => c.instanceId === instanceId)) return i;
  }
  return -1;
}

function lastKeys(before: GameState, after: GameState): string[] {
  return after.log.slice(before.log.length).map((l) => l.messageKey ?? '');
}

function board(near: Array<[string, string]>, far: Array<[string, string]>): GameState {
  const state = buildSimState({
    missionIds: ['KS-001-MMS', 'KS-006-MMS'],
    hand1: [ZABUZA],
    p1: [simChar(KAKASHI, { owner: 'player1', instanceId: 'kakashi' })],
    p2: near.map(([id, instanceId]) => simChar(id, { owner: 'player2', instanceId })),
    chakra1: 20,
  });
  for (const [id, instanceId] of far) {
    state.activeMissions[1].player2Characters.push(
      simChar(id, { owner: 'player2', instanceId, missionIndex: 1 }),
    );
  }
  return state;
}

describe('Zabuza 150 duel: a tie for strongest must not cancel the effect', () => {
  it('every enemy tied for strongest is a candidate, not just the first one found', () => {
    const state = board([[KYUBI, 'surplace']], [[ICHIBI, 'ailleurs']]);
    const tied = strongestEnemiesIn(state, 'player1').map((c) => c.instanceId).sort();
    expect(tied, 'both have 10 Power').toEqual(['ailleurs', 'surplace']);
  });

  it('with one tied enemy already here and one elsewhere, the duel still fires on the movable one', () => {
    const played = play(board([[KYUBI, 'surplace']], [[ICHIBI, 'ailleurs']]), ZABUZA);

    expect(played.pendingActions.length, 'the duel must offer its prompt').toBe(1);
    expect(played.pendingActions[0].descriptionKey).toBe('game.effect.desc.ss150PullStrongest');

    let state = answer(played);
    state = answer(state, 'ailleurs');
    expect(missionOf(state, 'ailleurs'), 'dragged to Zabuza').toBe(0);
    expect(missionOf(state, 'surplace'), 'the one already here does not move').toBe(0);
  });

  it('the one already in the mission is never offered as a target', () => {
    const played = play(board([[KYUBI, 'surplace']], [[ICHIBI, 'ailleurs']]), ZABUZA);
    const confirmed = answer(played);
    expect(confirmed.pendingActions[0]?.options ?? []).toEqual(['ailleurs']);
  });

  it('when every tied enemy is already here, the duel says so instead of staying silent', () => {
    const start = board([[KYUBI, 'a'], [ICHIBI, 'b']], []);
    const played = play(start, ZABUZA);

    expect(played.pendingActions.length).toBe(0);
    expect(lastKeys(start, played)).toContain('game.log.effect.noTarget');
  });

  it('a move that No Repetition forbids is refused, and the refusal is written down', () => {
    const start = board([[SASUKE, 'jumeau']], [[SASUKE, 'lointain']]);
    const played = play(start, ZABUZA);

    expect(played.pendingActions.length, 'the only candidate cannot legally arrive').toBe(0);
    expect(lastKeys(start, played)).toContain('game.log.effect.noTarget');
    expect(missionOf(played, 'lointain'), 'it stayed where it was').toBe(1);
  });

  it('the ordinary case is untouched', () => {
    let state = play(board([[SMALL, 'petit']], [[SASUKE, 'fort']]), ZABUZA);
    state = answer(state);
    state = answer(state, 'fort');
    expect(missionOf(state, 'fort')).toBe(0);
  });
});
