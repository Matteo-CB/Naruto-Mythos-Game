import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getCardById } from '@/lib/data/cardIndex';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { CharacterCard, GameState } from '@/lib/engine/types';

const RACINE = process.cwd();
const EBISU = 'KS-046-C';
const RENFORTS = 'SS-001-MMS';
const ALLIE = 'KS-085-UC';

function plateau(): GameState {
  const state = buildSimState({
    p1: [simChar(ALLIE, { owner: 'player1', instanceId: 'allie' })],
    p2: [],
    missions: 2,
    chakra1: 30,
    missionIds: [RENFORTS, 'KS-006-MMS'],
  } as never);
  state.player1.hand = [getCardById(EBISU) as CharacterCard];
  state.player1.deck = [getCardById('KS-005-C') as CharacterCard, getCardById('KS-009-C') as CharacterCard];
  state.activePlayer = 'player1';
  state.phase = 'action';
  return state;
}

describe('un effet lit le plateau tel qu il est apres les declencheurs de pose', () => {
  beforeAll(() => { initializeRegistry(); });

  it('la mission Renforts donne bien POWERUP 2 a la carte jouee', () => {
    const state = plateau();
    const apres = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, faceDown: false,
    } as never);
    const ebisu = apres.activeMissions[0].player1Characters.find(
      (c) => c.card.id === EBISU,
    );
    expect(ebisu, 'Ebisu est bien en jeu').toBeDefined();
    expect(ebisu?.powerTokens, 'les Renforts lui ont donne 2 jetons').toBe(2);
  });

  it('EBISU 046 voit sa propre puissance renforcee et propose donc sa pioche', () => {
    const state = plateau();
    const allie = getCardById(ALLIE) as CharacterCard;
    const ebisu = getCardById(EBISU) as CharacterCard;
    expect(ebisu.power, 'Ebisu imprime 3').toBe(3);
    expect(allie.power, 'l allie imprime 4, donc plus fort qu Ebisu nu').toBeGreaterThan(ebisu.power ?? 0);

    const apres = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, faceDown: false,
    } as never);

    const refus = apres.log.some((l) => l.messageKey === 'game.log.effect.noTarget' && String(l.messageParams?.id) === EBISU);
    expect(refus, 'Ebisu ne doit pas se declarer sans cible: renforce il vaut 5 contre 4').toBe(false);
    expect(
      apres.pendingEffects.some((e) => e.targetSelectionType === 'EBISU046_CONFIRM_MAIN'),
      'la pioche est proposee',
    ).toBe(true);
  });

  it('les trois resolveurs relisent le personnage dans l etat courant', () => {
    const source = readFileSync(join(RACINE, 'lib/effects/EffectEngine.ts'), 'utf8');
    expect(
      source,
      'relire seulement a partir du deuxieme effet laisse le premier lire un etat perime',
    ).not.toContain('i > 0 ? EffectEngine.findCharByInstanceId(newState, character.instanceId) : null');
    expect(
      (source.match(/EffectEngine\.findCharByInstanceId\(newState, character\.instanceId\)/g) ?? []).length,
      'jeu, revelation et revelation-amelioration relisent chacun leur source',
    ).toBeGreaterThanOrEqual(4);
  });
});
