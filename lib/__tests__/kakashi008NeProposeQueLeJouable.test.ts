import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { buildPlayLessTargets } from '@/lib/effects/handlers/shared/playLess';
import { KAKASHI_008_CATEGORY, KAKASHI_008_REDUCTION } from '@/lib/effects/handlers/SS/kakashi008';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

const NARUTO_PETIT = 'KS-009-C';
const NARUTO_GRAND = 'KS-010-C';

function cibles(state: GameState): string[] {
  return buildPlayLessTargets(state, 'player1', KAKASHI_008_CATEGORY, KAKASHI_008_REDUCTION, true).targets;
}

describe('KAKASHI 008 ne propose que ce qui est jouable sans amelioration', () => {
  it('une carte cachee revelable normalement est proposee', () => {
    const s = buildSimState({
      p1: [simChar(NARUTO_GRAND, { owner: 'player1', instanceId: 'cache', hidden: true })],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    s.phase = 'action';
    expect(cibles(s), 'aucun homonyme visible, la revelation est libre').toContain('HIDDEN_cache');
  });

  it('une carte cachee dont la revelation fusionnerait n est pas proposee', () => {
    const s = buildSimState({
      p1: [
        simChar(NARUTO_GRAND, { owner: 'player1', instanceId: 'cache', hidden: true }),
        simChar(NARUTO_PETIT, { owner: 'player1', instanceId: 'petit' }),
      ],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    s.phase = 'action';
    expect(
      cibles(s),
      'elle ne peut se reveler que sur sa mission, et la ce serait une amelioration',
    ).not.toContain('HIDDEN_cache');
  });

  it('une carte de la main jouable ailleurs reste proposee', () => {
    const s = buildSimState({
      p1: [simChar(NARUTO_PETIT, { owner: 'player1', instanceId: 'petit' })],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    s.phase = 'action';
    s.player1.hand = [getCardById(NARUTO_GRAND) as CharacterCard];
    expect(cibles(s).filter((t) => t.startsWith('HAND_')), 'la seconde mission est libre').toHaveLength(1);
  });

  it('une carte de la main dont la seule pose serait une amelioration est ecartee', () => {
    const s = buildSimState({
      p1: [simChar(NARUTO_PETIT, { owner: 'player1', instanceId: 'petit' })],
      missions: 1, chakra1: 30, edgeHolder: 'player1',
    });
    s.phase = 'action';
    s.player1.hand = [getCardById(NARUTO_GRAND) as CharacterCard];
    expect(cibles(s).filter((t) => t.startsWith('HAND_')), 'aucune mission libre').toEqual([]);
  });
});
