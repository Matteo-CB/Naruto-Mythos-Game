import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { reparerPilesVides } from '@/lib/engine/rules/discountedPlay';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

const BAS = 'KS-007-C';
const HAUT = 'KS-008-UC';

function plateauAvecPileVide(): GameState {
  const state = buildSimState({
    p1: [simChar(BAS, { owner: 'player1', instanceId: 'jiraiya', hidden: true })],
    missions: 2, chakra1: 40, edgeHolder: 'player1',
  });
  state.phase = 'action';
  state.activeMissions[0].player1Characters[0].stack = [];
  return state;
}

describe('une pile vide ne peut plus desynchroniser la carte et la puissance', () => {
  it('le filet central la repare', () => {
    const abime = plateauAvecPileVide();
    const repare = reparerPilesVides(abime);
    const perso = repare.activeMissions[0].player1Characters[0];
    expect(perso.stack.map((c) => c.id), 'la pile porte de nouveau sa carte').toEqual([BAS]);
  });

  it('apres une amelioration, le cout et la puissance viennent de la meme carte', () => {
    const state = plateauAvecPileVide();
    state.activeMissions[0].player1Characters[0].isHidden = false;
    state.activeMissions[0].player1Characters[0].wasRevealedAtLeastOnce = true;
    state.player1.hand = [getCardById(HAUT) as CharacterCard];

    const apres = GameEngine.applyAction(state, 'player1', {
      type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'jiraiya',
    } as never);

    const perso = apres.activeMissions[0].player1Characters.find((c) => c.instanceId === 'jiraiya')!;
    const sommet = perso.stack[perso.stack.length - 1];
    const attendu = getCardById(HAUT) as CharacterCard;

    expect(sommet.id, 'le sommet de pile est bien la carte posee').toBe(HAUT);
    expect(perso.card.id, 'la carte de reference suit le sommet').toBe(HAUT);
    expect(sommet.chakra, 'le cout affiche vient de cette carte').toBe(attendu.chakra);
    expect(sommet.power, 'et sa puissance aussi, plus jamais celle du dessous').toBe(attendu.power);
  });
});
