import { describe, it, expect } from 'vitest';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterInPlay, GameState } from '@/lib/engine/types';

const NARUTO_133 = 'KS-133-S';
const IMPRESSIONS = ['KS-133-S', 'KS-133-SV', 'KS-133-MV', 'KS-133_2-MV'];

function plateau(): { state: GameState; source: CharacterInPlay } {
  const state = buildSimState({
    p1: [simChar(NARUTO_133, { owner: 'player1', instanceId: 'naruto' })],
    p2: [
      simChar('KS-001-C', { owner: 'player2', instanceId: 'visible' }),
      simChar('KS-001-C', { owner: 'player2', instanceId: 'cache', hidden: true }),
    ],
    missions: 2,
    chakra1: 20,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  const source = state.activeMissions[0].player1Characters[0];
  return { state, source };
}

function resoudre(isUpgrade: boolean) {
  const { state, source } = plateau();
  const handler = getEffectHandler(NARUTO_133, 'MAIN');
  expect(handler, 'la carte a bien un gestionnaire').toBeTruthy();
  return handler!({
    state,
    sourcePlayer: 'player1',
    sourceCard: source,
    sourceMissionIndex: 0,
    isUpgrade,
  } as never);
}

describe('Naruto Uzumaki Rasengan 133 joue en amelioration', () => {
  it('joue normalement, il cache: le mode defaite reste ferme', () => {
    const resultat = resoudre(false);
    const decrit = JSON.parse(resultat.description as string);
    expect(decrit.useDefeat, 'sans amelioration, il cache').toBe(false);
  });

  it('joue en amelioration, il vainc au lieu de cacher', () => {
    const resultat = resoudre(true);
    const decrit = JSON.parse(resultat.description as string);
    expect(decrit.useDefeat, 'l alteration Instead, defeat both of them s applique').toBe(true);
  });

  it('chaque impression de la carte a ses gestionnaires', () => {
    const sans: string[] = [];
    for (const id of IMPRESSIONS) {
      if (!getCardById(id)) continue;
      if (!getEffectHandler(id, 'MAIN')) sans.push(`${id} MAIN`);
      if (!getEffectHandler(id, 'UPGRADE')) sans.push(`${id} UPGRADE`);
    }
    expect(sans, `ces impressions n_ont aucun effet:\n  ${sans.join('\n  ')}`).toEqual([]);
  });
});
