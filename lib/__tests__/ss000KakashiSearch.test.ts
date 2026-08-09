import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getCharacterById } from '@/lib/data/cardIndex';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { GameState } from '@/lib/engine/types';

function assertHandOptionsAreReal(s: GameState): void {
  for (const pa of s.pendingActions) {
    for (const opt of pa.options) {
      if (opt.startsWith('HAND_')) {
        const idx = parseInt(opt.slice(5), 10);
        expect(idx).toBeLessThan(s.player1.hand.length);
      }
    }
  }
}

function firstPending(s: GameState) {
  return s.pendingActions[0];
}

function pendingTst(s: GameState): string {
  const pa = firstPending(s);
  if (!pa) return '';
  return s.pendingEffects.find((e) => e.id === pa.sourceEffectId)?.targetSelectionType ?? '';
}

describe('Kakashi SS-149-L search and play UI flow', () => {
  beforeAll(async () => { await initializeRegistry(); });

  function baseState(deckIds: string[], handIds: string[] = []) {
    const st = buildSimState({
      hand1: ['SS-149-L', ...handIds],
      p1: [],
      p2: [],
      missions: 2,
      chakra1: 12,
    });
    st.player1.deck = deckIds.map((id) => getCharacterById(id)!);
    return st;
  }

  function confirmFirst(s: GameState): GameState {
    expect(pendingTst(s)).toBe('SS000_CONFIRM_MAIN');
    const pa = firstPending(s);
    return GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pa.options[0]] });
  }

  it('declining the initial confirm skips the whole effect', () => {
    const st = baseState(['KS-099-C', 'KS-100-C']);
    let s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    expect(pendingTst(s)).toBe('SS000_CONFIRM_MAIN');
    const pe = s.pendingEffects.find((e) => e.id === firstPending(s).sourceEffectId)!;
    s = GameEngine.applyAction(s, 'player1', { type: 'DECLINE_OPTIONAL_EFFECT', pendingEffectId: pe.id });
    expect(s.pendingActions.length).toBe(0);
    expect(s.player1.hand.length).toBe(0);
    expect(s.player1.deck.map((c) => c.id)).toEqual(['KS-099-C', 'KS-100-C']);
  });

  it('lets the player choose which Ninja Hounds to draw, one by one, up to 2', () => {
    const st = baseState(['KS-005-C', 'KS-099-C', 'KS-011-C', 'KS-100-C', 'KS-099-C']);
    let s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    s = confirmFirst(s);

    expect(pendingTst(s)).toBe('SS000_CHOOSE_HOUNDS');
    expect(firstPending(s).options.length).toBe(3);

    const firstChoice = firstPending(s).options.find((o) => o === 'DECK_1')!;
    s = GameEngine.applyAction(s, 'player1', { type: 'SELECT_TARGET', pendingActionId: firstPending(s).id, selectedTargets: [firstChoice] });
    expect(s.player1.hand.some((c) => c.id === 'KS-099-C')).toBe(true);
    expect(s.log.some((l) => l.messageKey === 'game.log.effect.ss000Reveal')).toBe(true);

    expect(pendingTst(s)).toBe('SS000_CHOOSE_HOUNDS');
    expect(firstPending(s).options.length).toBe(2);

    s = GameEngine.applyAction(s, 'player1', { type: 'SELECT_TARGET', pendingActionId: firstPending(s).id, selectedTargets: [firstPending(s).options[0]] });

    expect(s.player1.hand.filter((c) => (c.keywords ?? []).includes('Ninja Hound')).length).toBe(2);
    expect(s.player1.deck.length).toBe(3);
    expect(s.log.some((l) => l.messageKey === 'game.log.effect.ss000Search')).toBe(true);

    expect(pendingTst(s)).toBe('PLAY_LESS_CATEGORY');
    assertHandOptionsAreReal(s);
  });

  it('cancelling the search still shuffles and still offers to play hand Ninja Hounds', () => {
    const st = baseState(['KS-099-C', 'KS-005-C'], ['KS-100-C']);
    let s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    s = confirmFirst(s);

    expect(pendingTst(s)).toBe('SS000_CHOOSE_HOUNDS');
    const pe = s.pendingEffects.find((e) => e.id === firstPending(s).sourceEffectId)!;
    s = GameEngine.applyAction(s, 'player1', { type: 'DECLINE_OPTIONAL_EFFECT', pendingEffectId: pe.id });

    expect(s.player1.deck.length).toBe(2);
    expect(s.player1.hand.some((c) => c.id === 'KS-100-C')).toBe(true);
    expect(pendingTst(s)).toBe('PLAY_LESS_CATEGORY');
    assertHandOptionsAreReal(s);
  });

  it('plays any number of hounds and every play window only lists cards really in hand', () => {
    const st = baseState(['KS-099-C', 'KS-100-C', 'KS-005-C']);
    let s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });

    let guard = 0;
    let playedHounds = 0;
    while (s.pendingActions.length > 0 && guard++ < 20) {
      assertHandOptionsAreReal(s);
      const pa = firstPending(s);
      const tst = pendingTst(s);
      if (tst === 'SS000_CONFIRM_MAIN' || tst === 'SS000_CHOOSE_HOUNDS' || tst === 'PLAY_LESS_CATEGORY' || tst === 'GENERIC_CHOOSE_PLAY_MISSION') {
        if (tst === 'PLAY_LESS_CATEGORY') playedHounds++;
        s = GameEngine.applyAction(s, 'player1', { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pa.options[0]] });
      } else {
        break;
      }
    }

    expect(playedHounds).toBe(2);
    const onBoard = s.activeMissions.flatMap((m) => m.player1Characters).filter((c) => (c.card.keywords ?? []).includes('Ninja Hound'));
    expect(onBoard.length).toBe(2);
  });

  it('DUEL repeat: second search window never lists ghost cards missing from hand', () => {
    const st = buildSimState({
      hand1: ['SS-149-L'],
      p1: [],
      p2: [simChar('KS-086-C', { owner: 'player2', instanceId: 'zabuza' })],
      missions: 2,
      chakra1: 12,
    });
    st.player1.deck = ['KS-099-C', 'KS-100-C', 'KS-099-C', 'KS-005-C'].map((id) => getCharacterById(id)!);

    let s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });

    let guard = 0;
    let searchRounds = 0;
    while (s.pendingActions.length > 0 && guard++ < 30) {
      assertHandOptionsAreReal(s);
      const pa = firstPending(s);
      const tst = pendingTst(s);
      if (tst === 'SS000_CONFIRM_MAIN' || tst === 'SS000_CHOOSE_HOUNDS') {
        s = GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pa.options[0]] });
      } else if (tst === 'PLAY_LESS_CATEGORY') {
        searchRounds++;
        const pe = s.pendingEffects.find((e) => e.id === pa.sourceEffectId)!;
        s = GameEngine.applyAction(s, 'player1', { type: 'DECLINE_OPTIONAL_EFFECT', pendingEffectId: pe.id });
      } else {
        s = GameEngine.applyAction(s, 'player1', { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pa.options[0]] });
      }
    }

    expect(searchRounds).toBeGreaterThanOrEqual(1);
    const houndsInHand = s.player1.hand.filter((c) => (c.keywords ?? []).includes('Ninja Hound')).length;
    expect(houndsInHand).toBeGreaterThanOrEqual(2);
    expect(s.pendingActions.length).toBe(0);
  });
});
