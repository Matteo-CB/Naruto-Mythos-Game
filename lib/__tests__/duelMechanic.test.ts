import { GameEngine } from '@/lib/engine/GameEngine';
import { describe, it, expect, beforeAll } from 'vitest';
import { mockCharInPlay, mockMission, createActionPhaseState } from './testHelpers';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { parseDuelCharacterName, isDuelConditionMet } from '@/lib/effects/duelUtils';
import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { GameState } from '@/lib/engine/types';

const DUEL_CARD_ID = 'SS-901-POP';

beforeAll(() => {
  registerEffect(DUEL_CARD_ID, 'DUEL', (ctx: EffectContext): EffectResult => {
    const s = ctx.state;
    const ps = { ...s[ctx.sourcePlayer] };
    if (ps.deck.length > 0) {
      ps.hand = [...ps.hand, ps.deck[0]];
      ps.deck = ps.deck.slice(1);
    }
    return { state: { ...s, [ctx.sourcePlayer]: ps } };
  });
});

function missionWith(p1: ReturnType<typeof mockCharInPlay>[], p2: ReturnType<typeof mockCharInPlay>[]) {
  return { card: mockMission({ id: 'm0' }), rank: 'D' as const, basePoints: 3, rankBonus: 1, player1Characters: p1, player2Characters: p2, wonBy: null };
}

function duelChar() {
  return mockCharInPlay(
    { instanceId: 'duelcard', missionIndex: 0, controlledBy: 'player1', originalOwner: 'player1' },
    { id: DUEL_CARD_ID, number: 901, power: 5, name_fr: 'MINATO NAMIKAZE',
      effects: [{ type: 'DUEL', description: 'DUEL Naruto Uzumaki, draw a card.' }] },
  );
}

function repondreOui(state: GameState): GameState {
  let courant = state;
  let garde = 0;
  while (courant.pendingActions.length > 0 && garde < 8) {
    const q = courant.pendingActions[0];
    courant = GameEngine.applyAction(courant, q.player, {
      type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [q.options[0]],
    } as never);
    garde += 1;
  }
  return courant;
}

describe('DUEL effect parsing + presence helpers', () => {
  it('parses the named character from the DUEL text (markers stripped)', () => {
    expect(parseDuelCharacterName('DUEL Naruto Uzumaki, draw a card.')).toBe('Naruto Uzumaki');
    expect(parseDuelCharacterName('[↯] DUEL Naruto Uzumaki, draw.')).toBe('Naruto Uzumaki');
    expect(parseDuelCharacterName('')).toBeNull();
  });

  it('condition met when a VISIBLE same-name character is in the mission (either side), not when hidden/absent', () => {
    const desc = 'DUEL Naruto Uzumaki, draw a card.';
    const naruto = mockCharInPlay({ instanceId: 'nar', missionIndex: 0, controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'NARUTO UZUMAKI', power: 4 });
    const present = createActionPhaseState({ activeMissions: [missionWith([duelChar()], [naruto])] });
    expect(isDuelConditionMet(present, 0, desc)).toBe(true);

    const hidden = mockCharInPlay({ instanceId: 'narH', missionIndex: 0, isHidden: true, controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'NARUTO UZUMAKI', power: 4 });
    const hiddenState = createActionPhaseState({ activeMissions: [missionWith([duelChar()], [hidden])] });
    expect(isDuelConditionMet(hiddenState, 0, desc)).toBe(false);

    const absent = createActionPhaseState({ activeMissions: [missionWith([duelChar()], [])] });
    expect(isDuelConditionMet(absent, 0, desc)).toBe(false);
  });
});

describe('DUEL resolves on play only when the named character is present', () => {
  it('runs the DUEL effect (draw) when Naruto is in the mission', () => {
    const naruto = mockCharInPlay({ instanceId: 'nar', missionIndex: 0, controlledBy: 'player1', originalOwner: 'player1' }, { name_fr: 'NARUTO UZUMAKI', power: 4 });
    const card = duelChar();
    const state = createActionPhaseState({ activeMissions: [missionWith([card, naruto], [])] }) as GameState;
    const handBefore = state.player1.hand.length;
    const after = repondreOui(EffectEngine.resolvePlayEffects(state, 'player1', card, 0, false));
    expect(after.player1.hand.length).toBe(handBefore + 1);
  });

  it('does NOT run the DUEL effect when Naruto is absent', () => {
    const card = duelChar();
    const state = createActionPhaseState({ activeMissions: [missionWith([card], [])] }) as GameState;
    const handBefore = state.player1.hand.length;
    const after = EffectEngine.resolvePlayEffects(state, 'player1', card, 0, false);
    expect(after.player1.hand.length).toBe(handBefore);
  });
});
