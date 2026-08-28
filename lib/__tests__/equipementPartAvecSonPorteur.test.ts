import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { attachCardToCharacter } from '@/lib/effects/attachments';
import { defeatCharacterInPlay } from '@/lib/effects/defeatUtils';
import { getCardById } from '@/lib/data/cardIndex';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { CardData, GameState, PlayerID } from '@/lib/engine/types';

beforeAll(() => {
  initializeRegistry();
});

const PORTEUR = 'KS-001-C';
const AMELIORATION = 'KS-001-C';
const BANDEAU_SABLE = 'SS-092-C';
const BANDEAU_FEUILLE = 'SS-091-C';

function plateau(): GameState {
  return buildSimState({
    p1: [simChar(PORTEUR, { owner: 'player1', instanceId: 'hote' })],
    missions: 1,
    chakra1: 30,
    edgeHolder: 'player1',
  });
}

function equiper(state: GameState, cardId: string, joueur: PlayerID): GameState {
  return attachCardToCharacter(state, joueur, getCardById(cardId) as CardData, 'hote');
}

function vaincre(state: GameState): GameState {
  return defeatCharacterInPlay(state, 0, 'hote', 'player1Characters', false, 'player1');
}

function defausse(state: GameState, joueur: PlayerID): string[] {
  return state[joueur].discardPile.map((c) => c.id);
}

describe('un porteur vaincu emmene son equipement a la defausse, dans l ordre du plateau', () => {
  it('pose l equipement sous le personnage, jamais dessus', () => {
    const state = vaincre(equiper(plateau(), BANDEAU_SABLE, 'player1'));
    expect(defausse(state, 'player1')).toEqual([BANDEAU_SABLE, PORTEUR]);
    expect(state.player1.discardPile.at(-1)?.id, 'le personnage reste sur le dessus').toBe(PORTEUR);
  });

  it('garde la pile d ameliorations telle quelle, l equipement dessous', () => {
    let state = equiper(plateau(), BANDEAU_SABLE, 'player1');
    const hote = state.activeMissions[0].player1Characters[0];
    hote.stack = [getCardById(PORTEUR) as never, getCardById(AMELIORATION) as never];
    state = vaincre(state);
    expect(defausse(state, 'player1')).toEqual([BANDEAU_SABLE, PORTEUR, AMELIORATION]);
  });

  it('empile plusieurs equipements sous le personnage', () => {
    let state = equiper(plateau(), BANDEAU_SABLE, 'player1');
    state = equiper(state, BANDEAU_FEUILLE, 'player2');
    state = vaincre(state);
    expect(defausse(state, 'player1')).toEqual([BANDEAU_SABLE, PORTEUR]);
    expect(defausse(state, 'player2'), 'l equipement adverse rejoint sa propre defausse').toEqual([BANDEAU_FEUILLE]);
  });

  it('ne demande a personne de choisir l ordre', () => {
    const state = vaincre(equiper(plateau(), BANDEAU_SABLE, 'player1'));
    expect(state.pendingActions, 'aucune question posee').toHaveLength(0);
    const reordonner = state.pendingEffects.filter((e) => (e.targetSelectionType ?? '').includes('REORDER'));
    expect(reordonner, 'aucun choix d ordre').toHaveLength(0);
  });

  it('laisse le personnage sur le dessus, la ou KABUTO YAKUSHI 053 va le chercher', () => {
    const state = vaincre(equiper(plateau(), BANDEAU_SABLE, 'player1'));
    expect(state.player1.discardPile.at(-1)?.card_type).toBe('character');
  });

  it('applique le meme ordre a la carte volee defaussee pour repetition de nom', () => {
    const source = readFileSync('lib/effects/EffectEngine.ts', 'utf8');
    const bloc = source.slice(source.indexOf('const cardsToDiscard = targetChar.stack'));
    const posEquipement = bloc.indexOf('att.owner !== owner');
    const posPersonnage = bloc.indexOf('...cardsToDiscard');
    expect(posEquipement, 'l equipement du proprietaire est classe avant le personnage').toBeGreaterThan(-1);
    expect(posEquipement).toBeLessThan(posPersonnage);
  });
});
