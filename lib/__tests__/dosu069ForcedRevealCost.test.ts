import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { GameState } from '@/lib/engine/types';

function walkDosuForcedReveal(st: GameState): GameState {
  let s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
  let guard = 0;
  while (s.pendingActions.length > 0 && guard++ < 10) {
    const pa = s.pendingActions[0];
    s = GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pa.options[0]] });
  }
  return s;
}

describe('Dosu 069 forced reveal: effective cost and effect activation', () => {
  beforeAll(() => { initializeRegistry(); });

  it('forced reveal pays the effective cost plus 2 and triggers the revealed MAIN effect', () => {
    const st = buildSimState({
      hand1: ['KS-069-UC'],
      p1: [],
      p2: [simChar('KS-032-C', { owner: 'player2', instanceId: 'shino32', hidden: true })],
      missions: 2,
      chakra1: 10,
    });
    st.player2.chakra = 10;
    st.player1.deck = [st.player1.deck[0] ?? st.player1.hand[0]].filter(Boolean) as typeof st.player1.deck;
    const p1Hand = st.player1.hand.length;
    const p2Hand = st.player2.hand.length;
    const s = walkDosuForcedReveal(st);
    const shino = s.activeMissions[0].player2Characters.find((c) => c.instanceId === 'shino32');
    expect(shino?.isHidden).toBe(false);
    expect(s.player2.chakra).toBe(10 - (2 + 2));
    expect(s.player1.hand.length + s.player2.hand.length).toBeGreaterThan(p1Hand - 1 + p2Hand);
  });

  it('Shino 033 forced reveal with an enemy Jutsu in the mission pays 4 less (2 total, not 6)', () => {
    const st = buildSimState({
      hand1: ['KS-069-UC'],
      p1: [simChar('KS-010-C', { owner: 'player1', instanceId: 'jutsu-naruto' })],
      p2: [simChar('KS-033-UC', { owner: 'player2', instanceId: 'shino33', hidden: true })],
      missions: 2,
      chakra1: 10,
    });
    st.player2.chakra = 10;
    const s = walkDosuForcedReveal(st);
    const shino = s.activeMissions[0].player2Characters.find((c) => c.instanceId === 'shino33');
    expect(shino?.isHidden).toBe(false);
    expect(s.player2.chakra).toBe(10 - 2);
  });

  it('manual reveal of Shino 033 with an enemy Jutsu in the mission costs 0', () => {
    const st = buildSimState({
      p1: [simChar('KS-033-UC', { owner: 'player1', instanceId: 'shino33', hidden: true })],
      p2: [simChar('KS-010-C', { owner: 'player2', instanceId: 'jutsu-naruto' })],
      missions: 2,
      chakra1: 5,
    });
    st.player1.chakra = 5;
    const s = GameEngine.applyAction(st, 'player1', { type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'shino33' });
    const shino = s.activeMissions[0].player1Characters.find((c) => c.instanceId === 'shino33');
    expect(shino?.isHidden).toBe(false);
    expect(s.player1.chakra).toBe(5);
  });
});
