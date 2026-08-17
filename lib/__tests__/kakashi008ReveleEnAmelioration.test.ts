import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { buildPlayLessTargets } from '@/lib/effects/handlers/shared/playLess';
import { KAKASHI_008_CATEGORY, KAKASHI_008_REDUCTION } from '@/lib/effects/handlers/SS/kakashi008';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

const NARUTO_BAS = 'KS-009-C';
const NARUTO_HAUT = 'KS-010-C';

function plateau(cacheId: string, avecJumeauVisible: boolean): GameState {
  const p1 = [simChar(cacheId, { owner: 'player1', instanceId: 'cache', hidden: true })];
  if (avecJumeauVisible) p1.push(simChar(NARUTO_BAS, { owner: 'player1', instanceId: 'visible' }));
  const s = buildSimState({ p1, missions: 2, chakra1: 30, edgeHolder: 'player1' });
  s.phase = 'action';
  s.player1.hand = [getCardById('SS-008-C') as CharacterCard];
  return s;
}

function cibles(state: GameState): string[] {
  return buildPlayLessTargets(state, 'player1', KAKASHI_008_CATEGORY, KAKASHI_008_REDUCTION, true).targets;
}

describe('KAKASHI 008 peut reveler un Team 7 cache meme si cela fusionne', () => {
  it('sans jumeau visible, le cache est propose', () => {
    expect(cibles(plateau(NARUTO_HAUT, false)), 'la carte cachee est jouable').toContain('HIDDEN_cache');
  });

  it('avec un jumeau visible moins cher, la revelation en amelioration reste proposee', () => {
    expect(
      cibles(plateau(NARUTO_HAUT, true)),
      'reveler une carte deja posee n est pas la poser en amelioration depuis la main',
    ).toContain('HIDDEN_cache');
  });

  it('la restriction reste appliquee aux cartes de la main', () => {
    const p1 = [simChar(NARUTO_BAS, { owner: 'player1', instanceId: 'visible' })];
    const state = buildSimState({ p1, missions: 1, chakra1: 30, edgeHolder: 'player1' });
    state.phase = 'action';
    state.player1.hand = [getCardById(NARUTO_HAUT) as CharacterCard];
    expect(
      cibles(state).filter((t) => t.startsWith('HAND_')),
      'la seule pose possible serait une amelioration, donc la carte n est pas proposee',
    ).toEqual([]);
  });
});
