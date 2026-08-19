import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData, CharacterCard, GameState } from '@/lib/engine/types';

const FUMIGENE = 'SS-086-C';
const HOTE = 'KS-011-C';

function plateauAvecFumigene(): GameState {
  const state = buildSimState({
    p1: [simChar(HOTE, { owner: 'player1', instanceId: 'hote', hidden: true })],
    missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  state.phase = 'action';
  state.activeMissions[0].player1Characters[0].attachments = [{
    instanceId: 'fumigene', card: getCardById(FUMIGENE) as CardData, owner: 'player1',
  }];
  return state;
}

describe('le bouton de revelation annonce la remise', () => {
  it('le cout affiche tient compte de l equipement porte', () => {
    const state = plateauAvecFumigene();
    const hote = state.activeMissions[0].player1Characters[0];
    const carte = getCardById(HOTE) as CharacterCard;
    const affiche = calculateEffectiveCost(state, 'player1', carte, 0, true, hote);
    expect(affiche, 'le calcul du bouton voit la remise').toBe(carte.chakra - 1);
  });

  it('la barre d action passe bien le personnage au calcul de prix', () => {
    const source = readFileSync(join(process.cwd(), 'components/game/ActionBar.tsx'), 'utf8');
    expect(
      source.includes('calculateEffectiveCost(visibleState, myPlayer, hiddenTopCard, mi, true, target)'),
      'sans le personnage, les equipements portes sont ignores',
    ).toBe(true);
  });

  it('les trois boutons de cout affichent un ecart quand il y en a un', () => {
    const source = readFileSync(join(process.cwd(), 'components/game/ActionBar.tsx'), 'utf8');
    for (const libelle of ['costLabel', 'revealCostLabel', 'libelleCout', 'libelleUpg']) {
      expect(source.includes(`chakraCost={${libelle}}`), `${libelle} doit alimenter un bouton`).toBe(true);
    }
  });
});
