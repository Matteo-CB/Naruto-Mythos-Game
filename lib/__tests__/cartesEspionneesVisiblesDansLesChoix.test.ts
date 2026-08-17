import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { attachCardToCharacter } from '@/lib/effects/attachments';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData, GameState } from '@/lib/engine/types';

void EffectEngine;

const FICHES = 'SS-100-C';

function plateau(avecFiches: boolean): GameState {
  let state = buildSimState({
    p1: [simChar('KS-011-C', { owner: 'player1', instanceId: 'porteur' })],
    p2: [simChar('KS-133-S', { owner: 'player2', instanceId: 'espionne', hidden: true })],
    missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  state.phase = 'action';
  if (avecFiches) {
    state = attachCardToCharacter(state, 'player1', getCardById(FICHES) as CardData, 'porteur');
  }
  return state;
}

function carteVue(state: GameState): string | undefined {
  const vue = GameEngine.getVisibleState(state, 'player1');
  const cible = vue.activeMissions[0].player2Characters.find((c) => c.instanceId === 'espionne');
  return cible?.topCard?.id ?? cible?.card?.id;
}

describe('les cartes cachees espionnees restent visibles partout', () => {
  it('sans les fiches, la carte adverse cachee reste inconnue', () => {
    expect(carteVue(plateau(false)), 'rien ne doit filtrer').toBeUndefined();
  });

  it('avec les FICHES DE RENSEIGNEMENT 100, le serveur transmet la carte', () => {
    expect(carteVue(plateau(true)), 'la carte espionnee est transmise').toBe('KS-133-S');
  });

  it('le selecteur de cible se fie a la carte transmise, pas au seul fait qu elle ait ete revelee', () => {
    const source = readFileSync(join(process.cwd(), 'components/game/TargetSelector.tsx'), 'utf8');
    const fautives = source.split('\n').filter((ligne) =>
      /canSeeCard\s*=/.test(ligne) && /wasRevealedAtLeastOnce/.test(ligne));
    expect(
      fautives,
      'une carte transmise par le serveur doit toujours etre affichee dans les choix',
    ).toEqual([]);
  });
});
