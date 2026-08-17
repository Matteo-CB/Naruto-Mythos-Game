import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { attachCardToMission } from '@/lib/effects/attachments';
import { forestOfDeathActive, missionPointBonus } from '@/lib/effects/handlers/SS/attachmentStatics';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData, CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

const FORET = 'SS-107-C';
const RANG = 'SS-103-UC';
const AVEC_AMBUSH = 'KS-016-UC';

function plateau(poseurDeLaForet: 'player1' | 'player2' | null): GameState {
  let state = buildSimState({
    p2: [simChar('KS-013-C', { owner: 'player2', instanceId: 'ennemi' })],
    missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  state.phase = 'action';
  state.player1.chakra = 30;
  if (poseurDeLaForet) {
    state = attachCardToMission(state, poseurDeLaForet, getCardById(FORET) as CardData, 0);
  }
  return state;
}

describe('les equipements de mission qui ne disent pas votre camp valent pour les deux', () => {
  it('la Foret de la Mort agit quel que soit le camp qui l a posee', () => {
    expect(forestOfDeathActive(plateau(null).activeMissions[0]), 'absente').toBe(false);
    expect(forestOfDeathActive(plateau('player1').activeMissions[0]), 'posee par moi').toBe(true);
    expect(forestOfDeathActive(plateau('player2').activeMissions[0]), 'posee par l adversaire').toBe(true);
  });

  it('un personnage joue par l adversaire declenche son AMBUSH dans la Foret', () => {
    const state = plateau('player2');
    state.player1.hand = [getCardById(AVEC_AMBUSH) as CharacterCard];
    const apres = GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    } as never);
    expect(
      apres.pendingActions.length > 0 || apres.log.some((l) => l.messageKey === 'game.log.effect.noTarget'),
      'l AMBUSH a bien ete tentee malgre le camp du poseur',
    ).toBe(true);
  });

  it('le Changement de Rang de Mission vaut pour les deux camps', () => {
    const state = attachCardToMission(plateau(null), 'player2', getCardById(RANG) as CardData, 0);
    expect(missionPointBonus(state.activeMissions[0]), 'un point de plus, sans distinction de camp').toBe(1);
  });
});
