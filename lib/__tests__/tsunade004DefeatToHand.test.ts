import { describe, it, expect } from 'vitest';
import { mockCharInPlay, mockMission, createActionPhaseState } from './testHelpers';
import { defeatFriendlyCharacter } from '../effects/defeatUtils';
import type { CharacterInPlay } from '../engine/types';

function makeMission(p1: CharacterInPlay[] = [], p2: CharacterInPlay[] = []) {
  return { card: mockMission(), rank: 'D' as const, basePoints: 3, rankBonus: 1, wonBy: null, player1Characters: p1, player2Characters: p2 };
}

const TSUNADE004 = {
  id: 'KS-004-UC', number: 4, rarity: 'UC' as const, name_fr: 'TSUNADE',
  group: 'Leaf Village',
  effects: [{ type: 'MAIN' as const, description: '[⧗] Defeated friendly characters go into your hand instead of your discard pile.' }],
};

describe('Tsunade 004 redirect on friendly defeat (defeatUtils path)', () => {
  it('a friendly defeated via defeatFriendlyCharacter (e.g. Yashamaru self-defeat) goes to HAND when Tsunade 004 is active', () => {
    const yash = mockCharInPlay({ instanceId: 'yash-1' }, { id: 'KS-085-UC', number: 85, name_fr: 'YASHAMARU' });
    const tsunade = mockCharInPlay({ instanceId: 'tsu-1' }, TSUNADE004);
    const state = createActionPhaseState({ activeMissions: [makeMission([yash, tsunade])] });
    state.player1.hand = [];
    state.player1.discardPile = [];

    const next = defeatFriendlyCharacter(state, 0, 'yash-1', 'player1');

    expect(next.activeMissions[0].player1Characters.some((c) => c.instanceId === 'yash-1')).toBe(false);
    expect(next.player1.hand.some((c) => c.id === 'KS-085-UC')).toBe(true);
    expect(next.player1.discardPile.some((c) => c.id === 'KS-085-UC')).toBe(false);
  });

  it('the same friendly goes to the DISCARD pile when Tsunade 004 is absent', () => {
    const yash = mockCharInPlay({ instanceId: 'yash-1' }, { id: 'KS-085-UC', number: 85, name_fr: 'YASHAMARU' });
    const state = createActionPhaseState({ activeMissions: [makeMission([yash])] });
    state.player1.hand = [];
    state.player1.discardPile = [];

    const next = defeatFriendlyCharacter(state, 0, 'yash-1', 'player1');

    expect(next.player1.discardPile.some((c) => c.id === 'KS-085-UC')).toBe(true);
    expect(next.player1.hand.some((c) => c.id === 'KS-085-UC')).toBe(false);
  });
});
