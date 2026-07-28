import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { getCardById } from '@/lib/data/cardIndex';
import type { GameState, PlayerID, EffectType } from '@/lib/engine/types';

const HAND_ACTION_TYPES = new Set(['DISCARD_CARD', 'CHOOSE_CARD_FROM_LIST', 'PUT_CARD_ON_DECK']);

function looksLikeHandIndex(opts: string[]): boolean {
  return opts.length > 0 && opts.every((o) => /^\d+$/.test(o));
}

function collectInstanceIds(state: GameState): Set<string> {
  const ids = new Set<string>();
  for (const m of state.activeMissions) {
    for (const c of [...m.player1Characters, ...m.player2Characters]) ids.add(c.instanceId);
  }
  return ids;
}

type PopupKind = 'board' | 'hand' | 'confirm';

interface Case {
  cardId: string;
  effect: EffectType;
  expected: PopupKind;
  build: () => GameState;
}

function baseBoard(handIds: string[], p1Ids: string[], p2Ids: string[]): GameState {
  const p1 = p1Ids.map((id, i) => simChar(id, { owner: 'player1', instanceId: `f${i}` }));
  const p2 = p2Ids.map((id, i) => simChar(id, { owner: 'player2', instanceId: `e${i}` }));
  const st = buildSimState({ hand1: handIds, p1, p2, missions: 2, chakra1: 20, edgeHolder: 'player1' });
  st.phase = 'action';
  return st;
}

const CASES: Case[] = [
  { cardId: 'SS-046-UC', effect: 'MAIN', expected: 'confirm', build: () => baseBoard([], ['SS-046-UC'], []) },
  { cardId: 'SS-047-UC', effect: 'UPGRADE', expected: 'board', build: () => baseBoard([], ['SS-047-UC'], ['KS-005-C']) },
  { cardId: 'SS-049-C', effect: 'FIRST_STRIKE', expected: 'board', build: () => baseBoard([], ['SS-049-C'], ['KS-005-C']) },
  { cardId: 'SS-078-UC', effect: 'DUEL', expected: 'board', build: () => baseBoard([], ['SS-078-UC'], ['KS-005-C']) },
  { cardId: 'SS-114-R', effect: 'MAIN', expected: 'hand', build: () => baseBoard(['SS-046-UC'], ['SS-114-R'], ['KS-005-C']) },
  { cardId: 'SS-117-R', effect: 'DUEL', expected: 'board', build: () => baseBoard([], ['SS-117-R'], []) },
  { cardId: 'SS-119-R', effect: 'MAIN', expected: 'board', build: () => baseBoard([], ['SS-119-R'], ['KS-005-C']) },
  { cardId: 'SS-119-R', effect: 'DUEL', expected: 'confirm', build: () => baseBoard([], ['SS-119-R'], []) },
  { cardId: 'SS-085-UC', effect: 'MAIN', expected: 'board', build: () => baseBoard([], ['KS-074-C'], ['KS-005-C']) },
  { cardId: 'SS-099-UC', effect: 'MAIN', expected: 'board', build: () => baseBoard([], ['KS-009-C'], ['KS-005-C']) },
];

describe('set 2 selection popups match the nature of their options', () => {
  for (const c of CASES) {
    it(`${c.cardId} ${c.effect} opens the right popup`, () => {
      const handler = getEffectHandler(c.cardId, c.effect);
      expect(handler, `no handler for ${c.cardId} ${c.effect}`).toBeTruthy();
      if (!handler) return;

      const state = c.build();
      const mission = state.activeMissions[0];
      const source = mission.player1Characters[0];
      const player: PlayerID = 'player1';

      const result = handler({
        state,
        sourcePlayer: player,
        sourceCard: source,
        sourceMissionIndex: 0,
        triggerType: c.effect,
        isUpgrade: c.effect === 'UPGRADE',
      });

      if (!result.requiresTargetSelection || !result.validTargets?.length) return;

      const next = EffectEngine.createPendingTargetSelection(
        result.state, player, source, 0, c.effect, false, result, [],
      );
      const action = next.pendingActions[next.pendingActions.length - 1];
      expect(action, 'a pending action must be created').toBeTruthy();

      const opts = action.options;
      const boardIds = collectInstanceIds(next);
      const opensHand = HAND_ACTION_TYPES.has(action.type);

      if (c.expected === 'hand') {
        expect(opensHand, `${c.cardId} ${c.effect}: must open the hand popup`).toBe(true);
        expect(looksLikeHandIndex(opts), `${c.cardId}: hand options must be indices`).toBe(true);
      } else {
        expect(opensHand, `${c.cardId} ${c.effect}: must NOT open the hand popup`).toBe(false);
        if (c.expected === 'board') {
          expect(opts.every((o) => boardIds.has(o)), `${c.cardId}: options must be board instance ids`).toBe(true);
        }
      }

      expect(action.descriptionKey, `${c.cardId} ${c.effect} must carry a translation key`).toBeTruthy();
    });
  }

  it('Gaara SS-114 discard opens the hand, not the board', () => {
    const handler = getEffectHandler('SS-114-R', 'MAIN')!;
    const state = baseBoard(['SS-046-UC'], ['SS-114-R'], ['KS-005-C']);
    const source = state.activeMissions[0].player1Characters[0];
    const result = handler({
      state, sourcePlayer: 'player1', sourceCard: source,
      sourceMissionIndex: 0, triggerType: 'MAIN', isUpgrade: false,
    });
    expect(result.requiresTargetSelection).toBe(true);
    expect(result.validTargets).toEqual(['0']);

    const next = EffectEngine.createPendingTargetSelection(
      result.state, 'player1', source, 0, 'MAIN', false, result, [],
    );
    const action = next.pendingActions[next.pendingActions.length - 1];
    expect(action.type).toBe('DISCARD_CARD');
  });

  it('every set 2 card id used above resolves to a real card', () => {
    for (const c of CASES) expect(getCardById(c.cardId), c.cardId).toBeTruthy();
  });
});
