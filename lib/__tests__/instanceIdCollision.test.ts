import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { resetIdCounter, seedIdCounterFromState, generateInstanceId } from '@/lib/engine/utils/id';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { GameState } from '@/lib/engine/types';

function allInstanceIds(state: GameState): string[] {
  const ids: string[] = [];
  for (const mission of state.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const char of mission[side]) ids.push(char.instanceId);
    }
  }
  return ids;
}

function duplicatesIn(ids: string[]): string[] {
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) dups.push(id);
    seen.add(id);
  }
  return dups;
}

describe('a concurrent game must never make another game reuse an instance id', () => {
  it('playing a card after the shared counter was reset keeps every id unique', () => {
    const state = buildSimState({
      hand1: ['KS-003-C'],
      p1: [simChar('KS-001-C', { owner: 'player1', instanceId: 'inst_1' })],
      p2: [simChar('KS-002-UC', { owner: 'player2', instanceId: 'inst_2' })],
      missions: 2,
      chakra1: 20,
      edgeHolder: 'player1',
    });
    state.phase = 'action';

    resetIdCounter();

    const after = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER',
      cardIndex: 0,
      missionIndex: 0,
      hidden: false,
    } as never);

    const ids = allInstanceIds(after);
    expect(ids.length, 'the played card must be on the board').toBe(3);
    expect(duplicatesIn(ids), `duplicate instance ids: ${ids.join(', ')}`).toEqual([]);
  });

  it('the seed never hands out an id that is already in play', () => {
    const state = buildSimState({
      p1: [simChar('KS-001-C', { owner: 'player1', instanceId: 'inst_18' })],
      p2: [simChar('KS-002-UC', { owner: 'player2', instanceId: 'inst_7' })],
      missions: 2,
      edgeHolder: 'player1',
    });

    resetIdCounter();
    seedIdCounterFromState(state);

    const fresh = generateInstanceId();
    expect(allInstanceIds(state)).not.toContain(fresh);
    expect(fresh).toBe('inst_19');
  });

  it('the high water mark stops a defeated character id from being handed out twice', () => {
    const state = buildSimState({
      p1: [simChar('KS-001-C', { owner: 'player1', instanceId: 'inst_4' })],
      missions: 2,
      edgeHolder: 'player1',
    });
    state.instanceSeq = 40;

    resetIdCounter();
    seedIdCounterFromState(state);

    expect(generateInstanceId()).toBe('inst_41');
  });
});
