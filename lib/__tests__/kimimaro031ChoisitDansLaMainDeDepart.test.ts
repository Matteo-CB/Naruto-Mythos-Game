import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getCardById } from '@/lib/data/cardIndex';
import { GameEngine } from '@/lib/engine/GameEngine';
import { discardableSoundFour, nomsPresentsALaPose, KIMIMARO_031_BASE_ID } from '@/lib/effects/handlers/SS/kimimaro031';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { CharacterCard, GameState } from '@/lib/engine/types';

const RACINE = process.cwd();
const SAKON = 'SS-037-UC';
const TAYUYA = 'SS-039-C';

function carte(id: string): CharacterCard {
  return getCardById(id) as CharacterCard;
}

function plateau(main: string[], deck: string[]): GameState {
  const state = buildSimState({
    p1: [simChar(KIMIMARO_031_BASE_ID, { owner: 'player1', instanceId: 'kimimaro' })],
    p2: [],
    missions: 2,
    chakra1: 20,
  });
  state.player1.hand = main.map(carte);
  state.player1.deck = deck.map(carte);
  state.activePlayer = 'player1';
  state.phase = 'action';
  return state;
}

function lanceLaChaine(state: GameState): GameState {
  const effetId = 'k31-confirm';
  const actionId = 'k31-confirm-act';
  const prepare = {
    ...state,
    pendingEffects: [{
      id: effetId, sourceCardId: KIMIMARO_031_BASE_ID, sourceInstanceId: 'kimimaro', sourceMissionIndex: 0,
      effectType: 'MAIN', effectDescription: JSON.stringify({ used: [] }),
      targetSelectionType: 'SS031_CONFIRM_MAIN', sourcePlayer: 'player1',
      requiresTargetSelection: true, validTargets: ['kimimaro'],
      isOptional: true, isMandatory: false, resolved: false, isUpgrade: false,
    }],
    pendingActions: [{
      id: actionId, type: 'SELECT_TARGET', player: 'player1', description: 'Confirm',
      options: ['kimimaro'], minSelections: 1, maxSelections: 1, sourceEffectId: effetId,
    }],
  } as unknown as GameState;
  return GameEngine.applyAction(prepare, 'player1', {
    type: 'SELECT_TARGET', pendingActionId: actionId, selectedTargets: ['kimimaro'],
  } as never);
}

describe('KIMIMARO 031 choisit dans la main qu il avait en arrivant', () => {
  beforeAll(() => { initializeRegistry(); });

  it('les deux cartes du scenario portent bien les noms attendus', () => {
    expect(carte(SAKON).name_en?.toUpperCase()).toContain('SAKON');
    expect(carte(TAYUYA).name_en?.toUpperCase()).toContain('TAYUYA');
  });

  it('la main de depart est figee sur les noms reellement presents', () => {
    const state = plateau([SAKON], [TAYUYA, TAYUYA]);
    expect(nomsPresentsALaPose(state, 'player1')).toEqual(['SAKON']);
  });

  it('le scenario signale: une Tayuya piochee par Sakon ne devient pas defaussable', () => {
    const depart = plateau([SAKON], [TAYUYA, TAYUYA]);
    const apresPioche = plateau([SAKON, TAYUYA, TAYUYA], []);

    expect(
      discardableSoundFour(apresPioche, 'player1', ['SAKON'], ['SAKON']).map((c) => c.name),
      'main figee sur Sakon seul, la Tayuya piochee est hors jeu',
    ).toEqual([]);

    expect(
      discardableSoundFour(apresPioche, 'player1', ['SAKON']).map((c) => c.name),
      'sans main figee, l ancien defaut reapparait',
    ).toContain('TAYUYA');

    expect(nomsPresentsALaPose(depart, 'player1')).toEqual(['SAKON']);
  });

  it('une carte deja en main au depart reste defaussable apres la pioche', () => {
    const apres = plateau([TAYUYA, TAYUYA], []);
    expect(
      discardableSoundFour(apres, 'player1', ['SAKON'], ['SAKON', 'TAYUYA']).map((c) => c.name),
      'la Tayuya tenue des le depart reste un choix valable',
    ).toEqual(['TAYUYA', 'TAYUYA']);
  });

  it('un nom deja utilise ne revient pas, meme present deux fois au depart', () => {
    const state = plateau([TAYUYA, TAYUYA], []);
    expect(discardableSoundFour(state, 'player1', ['TAYUYA'], ['TAYUYA'])).toEqual([]);
  });

  it('la chaine reelle n ouvre le choix que sur les noms de depart', () => {
    const apres = lanceLaChaine(plateau([SAKON], [TAYUYA, TAYUYA]));
    const choix = apres.pendingEffects.find((e) => e.targetSelectionType === 'SS031_CHOOSE_DISCARD');
    expect(choix, 'le choix de defausse est ouvert').toBeTruthy();
    const charge = JSON.parse(choix?.effectDescription ?? '{}');
    expect(charge.nomsDeDepart, 'la main de depart voyage avec la chaine').toEqual(['SAKON']);
  });

  it('chaque maillon de la chaine transporte la main de depart', () => {
    const moteur = readFileSync(join(RACINE, 'lib/effects/EffectEngine.ts'), 'utf8');
    for (const cas of ['SS031_CONFIRM_MAIN', 'SS031_CHOOSE_DISCARD', 'SS031_MOVE_DESTINATION']) {
      const debut = moteur.indexOf(`case '${cas}'`);
      expect(debut, `${cas} existe`).toBeGreaterThan(0);
      const bloc = moteur.slice(debut, debut + 2600);
      expect(bloc, `${cas} respecte la main de depart`).toContain('nomsDeDepart');
    }
    expect(moteur, 'la file porte la main de depart').toContain('JSON.stringify({ used, nomsDeDepart })');
  });
});
