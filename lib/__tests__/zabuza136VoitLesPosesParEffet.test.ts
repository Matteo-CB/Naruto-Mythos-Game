import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { ennemisJouesMoinsCher } from '@/lib/effects/handlers/SS/zabuza136';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

function repondre(state: GameState, choix: (options: string[], cle?: string) => string): GameState {
  let courant = state;
  let garde = 0;
  while (courant.pendingActions.length > 0 && garde < 12) {
    const q = courant.pendingActions[0];
    courant = GameEngine.applyAction(courant, q.player, {
      type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [choix(q.options, q.descriptionKey)],
    } as never);
    garde += 1;
  }
  return courant;
}

function tourSuivant(state: GameState): GameState {
  return { ...state, lastTurnPlayedIds: { player1: [], player2: state.turnPlayedIds ?? [] } };
}

describe('ZABUZA 136 voit les personnages posés par un effet a prix reduit', () => {
  it('une invocation posee par JIRAIYA 007 devient une cible', () => {
    const s: GameState = buildSimState({ missions: 2, chakra1: 30, edgeHolder: 'player2' });
    s.phase = 'action';
    s.activePlayer = 'player2';
    s.player2.chakra = 30;
    s.player2.hand = [getCardById('KS-007-C') as CharacterCard, getCardById('KS-066-UC') as CharacterCard];

    const apres = repondre(GameEngine.applyAction(s, 'player2', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    } as never), (options, cle) => (cle === 'game.effect.desc.chooseMissionPlayReduced' ? '0' : options[0]));

    const invocation = apres.activeMissions[0].player2Characters.find((c) => c.card.id === 'KS-066-UC');
    expect(invocation, 'l invocation est bien posee sur la mission visee').toBeDefined();
    expect(invocation!.playedBelowPrintedCost, 'elle est marquee comme payee moins cher').toBe(true);
    expect(
      ennemisJouesMoinsCher(tourSuivant(apres), 'player1', 0).map((c) => c.instanceId),
      'Zabuza peut la vaincre au tour suivant',
    ).toContain(invocation!.instanceId);
  });

  it('un personnage pose plein tarif par le meme chemin n est pas une cible', () => {
    const s: GameState = buildSimState({
      p2: [simChar('KS-011-C', { owner: 'player2', instanceId: 'plein' })],
      missions: 2, chakra1: 30, edgeHolder: 'player2',
    });
    s.phase = 'action';
    expect(
      ennemisJouesMoinsCher({ ...s, lastTurnPlayedIds: { player1: [], player2: ['plein'] } }, 'player1', 0),
      'sans remise, aucune cible',
    ).toEqual([]);
  });
});
