import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getFirstStrikeStatus, canUseFirstStrike, getFirstStrikeCandidates } from '@/lib/engine/rules/firstStrike';
import type { GameState } from '@/lib/engine/types';

function board(): GameState {
  const p1 = [
    simChar('SS-049-C', { owner: 'player1', instanceId: 'fs-temari' }),
    simChar('KS-009-C', { owner: 'player1', instanceId: 'fs-ally' }),
  ];
  const p2 = [simChar('KS-005-C', { owner: 'player2', instanceId: 'fs-enemy' })];
  const st = buildSimState({ hand1: ['KS-010-C'], p1, p2, missions: 2, chakra1: 20, edgeHolder: 'player1' });
  st.phase = 'action';
  st.activePlayer = 'player1';
  st.firstStrike = { player1: 'available', player2: 'available' };
  return st;
}

describe('FIRST STRIKE turn flow', () => {
  it('is offered to the player who holds the Edge', () => {
    const st = board();
    expect(canUseFirstStrike(st, 'player1')).toBe(true);
    expect(getFirstStrikeCandidates(st, 'player1').map((c) => c.instanceId)).toContain('fs-temari');
  });

  it('using it consumes the turn, so the opponent plays next', () => {
    let st = board();
    st = GameEngine.applyAction(st, 'player1', { type: 'USE_FIRST_STRIKE', characterInstanceId: 'fs-temari' });
    expect(getFirstStrikeStatus(st, 'player1')).toBe('used');

    while (st.pendingActions.length > 0) {
      const act = st.pendingActions[0];
      st = GameEngine.applyAction(st, act.player, {
        type: 'SELECT_TARGET',
        pendingActionId: act.id,
        selectedTargets: [act.options[0]],
      });
    }

    expect(st.activePlayer).toBe('player2');
    expect(canUseFirstStrike(st, 'player1')).toBe(false);
  });

  it('declining does not consume the turn, the player still acts normally', () => {
    let st = board();
    st = GameEngine.applyAction(st, 'player1', { type: 'DECLINE_FIRST_STRIKE' });

    expect(getFirstStrikeStatus(st, 'player1')).toBe('expired');
    expect(st.activePlayer).toBe('player1');

    const before = st.player1.hand.length;
    st = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    expect(st.player1.hand.length).toBe(before - 1);
    expect(st.activePlayer).toBe('player2');
  });

  it('a normal action expires the window for that round', () => {
    let st = board();
    st = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    expect(getFirstStrikeStatus(st, 'player1')).toBe('expired');
  });

  it('a hidden FIRST STRIKE character offers nothing', () => {
    const st = board();
    const mission = st.activeMissions[0];
    const temari = mission.player1Characters.find((c) => c.instanceId === 'fs-temari')!;
    temari.isHidden = true;
    expect(getFirstStrikeCandidates(st, 'player1')).toHaveLength(0);
    expect(canUseFirstStrike(st, 'player1')).toBe(false);
  });

  it('both players may use their own in the same round', () => {
    const st = board();
    st.activeMissions[0].player2Characters.push(
      simChar('SS-049-C', { owner: 'player2', instanceId: 'fs-temari-p2' }),
    );
    expect(canUseFirstStrike(st, 'player1')).toBe(true);
    st.activePlayer = 'player2';
    expect(canUseFirstStrike(st, 'player2')).toBe(true);
  });
});
