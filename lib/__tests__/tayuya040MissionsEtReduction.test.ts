import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { tayuya040Missions, tayuya040Reductions } from '@/lib/effects/handlers/SS/tayuya040';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
void EffectEngine;
import type { GameState } from '@/lib/engine/types';

const TAYUYA_040 = 'SS-040-UC';
const TAYUYA_039 = 'SS-039-C';
const SOUND_FOUR_AUTRE = 'SS-036-C';

function plateau(): GameState {
  const state = buildSimState({
    p1: [simChar(TAYUYA_040, { owner: 'player1', instanceId: 'source' })],
    missions: 4,
    chakra1: 30,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  return state;
}

function poser(state: GameState, missionIndex: number, cardId: string, instanceId: string): void {
  const carte = simChar(cardId, { owner: 'player1', instanceId });
  state.activeMissions[missionIndex].player1Characters.push(carte as never);
}

describe('Tayuya 040 ne joue des invocations que la ou une Tayuya alliee se trouve', () => {
  it('la mission source compte, meme sans autre Tayuya', () => {
    const missions = tayuya040Missions(plateau(), 'player1', 0, 'source');
    expect(missions, 'seule la mission ou elle vient d etre amelioree').toEqual([0]);
  });

  it('une mission sans Tayuya alliee n est jamais retenue', () => {
    const state = plateau();
    poser(state, 2, SOUND_FOUR_AUTRE, 'autreSon');
    const missions = tayuya040Missions(state, 'player1', 0, 'source');
    expect(missions, 'un Quatuor du Son ne suffit pas, il faut une Tayuya').toEqual([0]);
  });

  it('une seconde Tayuya alliee ouvre sa mission', () => {
    const state = plateau();
    poser(state, 2, TAYUYA_039, 'tayuyaBis');
    const missions = tayuya040Missions(state, 'player1', 0, 'source');
    expect(missions).toEqual([0, 2]);
  });

  it('une Tayuya cachee n ouvre pas sa mission', () => {
    const state = plateau();
    const cachee = simChar(TAYUYA_039, { owner: 'player1', instanceId: 'tayuyaCachee', hidden: true });
    state.activeMissions[3].player1Characters.push(cachee as never);
    expect(tayuya040Missions(state, 'player1', 0, 'source')).toEqual([0]);
  });

  it('la reduction se compte mission par mission, pas globalement', () => {
    const state = plateau();
    poser(state, 2, TAYUYA_039, 'tayuyaBis');
    poser(state, 0, SOUND_FOUR_AUTRE, 'son1');
    poser(state, 0, TAYUYA_039, 'son2');

    const missions = tayuya040Missions(state, 'player1', 0, 'source');
    const reductions = tayuya040Reductions(state, 'player1', missions);

    expect(reductions[0], 'trois Quatuor du Son dans la mission source').toBe(3);
    expect(reductions[2], 'une seule Tayuya dans l autre mission').toBe(1);
    expect(reductions[0]).not.toBe(reductions[2]);
  });
});
