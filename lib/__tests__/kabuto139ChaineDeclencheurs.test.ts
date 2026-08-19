import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { kabuto139PiocheEtDefausse } from '@/lib/effects/ContinuousEffects';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

function plateau(cartesEnMain: number, deck: number): GameState {
  const s = buildSimState({
    p1: [simChar('SS-139-R', { owner: 'player1', instanceId: 'kabuto2' })],
    missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  s.phase = 'action';
  s.player1.hand = Array.from({ length: cartesEnMain }, () => getCardById('KS-011-C') as CharacterCard);
  s.player1.deck = Array.from({ length: deck }, () => getCardById('KS-013-C') as CharacterCard);
  return s;
}

function repondre(state: GameState): GameState {
  let courant = state;
  let garde = 0;
  while (courant.pendingActions.length > 0 && garde < 12) {
    const q = courant.pendingActions[0];
    courant = GameEngine.applyAction(courant, q.player, {
      type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [q.options[0]],
    } as never);
    garde += 1;
  }
  return courant;
}

describe('KABUTO 139 enchaine ses pioches et defausses sans en perdre', () => {
  it('un seul declenchement laisse la main inchangee', () => {
    const depart = plateau(2, 5);
    const apres = repondre(kabuto139PiocheEtDefausse(depart, 'player1', 1));
    expect(apres.player1.hand.length, 'une pioche puis une defausse').toBe(2);
    expect(apres.player1.deck.length, 'une carte piochee').toBe(4);
    expect(apres.player1.discardPile.length, 'une carte defaussee').toBe(1);
  });

  it('trois declenchements enchaines laissent aussi la main inchangee', () => {
    const depart = plateau(2, 5);
    const apres = repondre(kabuto139PiocheEtDefausse(depart, 'player1', 3));
    expect(apres.player1.hand.length, 'trois pioches et trois defausses').toBe(2);
    expect(apres.player1.deck.length, 'trois cartes piochees').toBe(2);
    expect(apres.player1.discardPile.length, 'trois cartes defaussees').toBe(3);
    expect(apres.pendingActions.length, 'plus aucune question en suspens').toBe(0);
  });

  it('avec un deck vide, aucune pioche fantome', () => {
    const depart = plateau(1, 0);
    const apres = repondre(kabuto139PiocheEtDefausse(depart, 'player1', 2));
    expect(apres.player1.hand.length, 'la main ne bouge pas').toBe(1);
    expect(
      apres.log.some((l) => l.messageKey === 'game.log.effect.noTarget'),
      'le deck vide est journalise',
    ).toBe(true);
  });
});
