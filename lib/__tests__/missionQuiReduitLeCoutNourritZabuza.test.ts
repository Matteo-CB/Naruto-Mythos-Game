import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { ennemisJouesMoinsCher } from '@/lib/effects/handlers/SS/zabuza136';
import { buildSimState } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

const JOUE = 'KS-011-C';

function plateau(texteMission: string | null): GameState {
  const state = buildSimState({ missions: 2, chakra1: 30, edgeHolder: 'player2' });
  state.phase = 'action';
  state.activePlayer = 'player2';
  state.player2.chakra = 30;
  state.player2.hand = [getCardById(JOUE) as CharacterCard];
  if (texteMission !== null) {
    state.activeMissions[0].card = {
      ...state.activeMissions[0].card,
      effects: [{ type: 'MAIN', description: texteMission }],
    };
  }
  return state;
}

describe('une mission qui reduirait un cout doit nourrir Zabuza 136', () => {
  it('sans texte de remise, rien ne change', () => {
    const state = plateau(null);
    const carte = getCardById(JOUE) as CharacterCard;
    expect(calculateEffectiveCost(state, 'player2', carte, 0, false)).toBe(carte.chakra);
  });

  it('une mission qui baisse le cout est appliquee et rend la cible vulnerable', () => {
    const state = plateau('[⧗] Characters cost 1 less to play in this mission.');
    const carte = getCardById(JOUE) as CharacterCard;
    expect(
      calculateEffectiveCost(state, 'player2', carte, 0, false),
      'la remise ecrite sur la mission est prise en compte',
    ).toBe(carte.chakra - 1);

    const apres = GameEngine.applyAction(state, 'player2', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    } as never);
    const pose = apres.activeMissions[0].player2Characters[0];
    expect(pose.playedBelowPrintedCost, 'il est marque comme paye moins cher').toBe(true);

    const tourSuivant: GameState = {
      ...apres,
      lastTurnPlayedIds: { player1: [], player2: apres.turnPlayedIds ?? [] },
    };
    expect(
      ennemisJouesMoinsCher(tourSuivant, 'player1', 0).map((c) => c.instanceId),
      'Zabuza peut le vaincre',
    ).toContain(pose.instanceId);
  });

  it('la portee ecrite sur la mission est respectee', () => {
    const state = plateau('[⧗] Sand Village characters cost 1 less to play in this mission.');
    const carte = getCardById(JOUE) as CharacterCard;
    expect(
      calculateEffectiveCost(state, 'player2', carte, 0, false),
      'un personnage hors du groupe cite ne profite pas de la remise',
    ).toBe(carte.chakra);
  });
});
