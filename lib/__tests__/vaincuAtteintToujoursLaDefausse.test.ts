import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterInPlay, GameState } from '@/lib/engine/types';

const SAKURA_135_IMPRESSIONS = ['KS-135-S', 'KS-135-SV', 'KS-135-MV'];

function plateau(): GameState {
  const state = buildSimState({
    p1: [simChar('KS-001-C', { owner: 'player1', instanceId: 'moi' })],
    p2: [
      simChar('KS-001-C', { owner: 'player2', instanceId: 'avecPile' }),
      simChar('KS-001-C', { owner: 'player2', instanceId: 'sansPile' }),
    ],
    missions: 2,
    chakra1: 20,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  return state;
}

function viderLaPile(state: GameState, instanceId: string): void {
  for (const mission of state.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const trouve = mission[side].find((c: CharacterInPlay) => c.instanceId === instanceId);
      if (trouve) trouve.stack = [];
    }
  }
}

describe('un personnage vaincu atteint toujours la defausse de son proprietaire', () => {
  it('meme quand sa pile est vide, sa carte est bien defaussee', () => {
    const state = plateau();
    viderLaPile(state, 'sansPile');

    const apres = EffectEngine.defeatCharacter(state, 'sansPile', 'player1');
    expect(apres.player2.discardPile.length, 'la carte ne disparait pas dans le vide').toBe(1);
  });

  it('deux defaites simultanees produisent deux cartes, pile vide ou non', () => {
    const state = plateau();
    viderLaPile(state, 'sansPile');

    const apres = EffectEngine.defeatSimultaneously(state, ['avecPile', 'sansPile'], 'player1');
    expect(apres.player2.discardPile.length, 'autant de cartes que de personnages vaincus').toBe(2);
  });

  it('chaque impression de Sakura 135 possede ses deux gestionnaires', () => {
    const sans: string[] = [];
    for (const id of SAKURA_135_IMPRESSIONS) {
      if (!getCardById(id)) continue;
      if (!getEffectHandler(id, 'MAIN')) sans.push(`${id} MAIN`);
      if (!getEffectHandler(id, 'UPGRADE')) sans.push(`${id} UPGRADE`);
    }
    expect(sans, `ces impressions resolvent l effet de la carte du dessous:\n  ${sans.join('\n  ')}`).toEqual([]);
  });
});
