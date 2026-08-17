import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

function perso(state: GameState) {
  const vue = GameEngine.getVisibleState(state, 'player1');
  return vue.activeMissions[0].player1Characters[0];
}

describe('apres une amelioration, le joueur voit la carte du dessus et sa puissance', () => {
  it('Kakashi 016 pose sur le Kakashi 008, qui a une puissance plus faible', () => {
    const depart = buildSimState({
      p1: [simChar('SS-008-C', { owner: 'player1', instanceId: 'kakashi' })],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    depart.phase = 'action';
    depart.player1.hand = [getCardById('KS-016-UC') as CharacterCard];
    expect(perso(depart).effectivePower, 'la carte du dessous vaut 2').toBe(2);

    const apres = GameEngine.applyAction(depart, 'player1', {
      type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'kakashi',
    } as never);

    const vu = perso(apres);
    expect(vu.card?.id, 'la carte envoyee au client est celle du dessus').toBe('KS-016-UC');
    expect(vu.topCard?.id, 'et le sommet de pile aussi').toBe('KS-016-UC');
    expect(vu.stackSize, 'la pile compte deux cartes').toBe(2);
    expect(vu.effectivePower, 'la puissance est celle du dessus, jamais celle du dessous').toBe(4);
  });

  it('Itachi revele en amelioration sur un Itachi de puissance plus faible', () => {
    const depart = buildSimState({
      p1: [
        simChar('KS-090-C', { owner: 'player1', instanceId: 'itachi' }),
        simChar('SS-137-R', { owner: 'player1', instanceId: 'cache', hidden: true }),
      ],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    depart.phase = 'action';

    const apres = GameEngine.applyAction(depart, 'player1', {
      type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'cache',
    } as never);

    const vu = perso(apres);
    expect(vu.topCard?.id, 'la revelation en amelioration coiffe bien la pile').toBe('SS-137-R');
    expect(vu.stackSize, 'la pile compte deux cartes').toBe(2);
    expect(vu.effectivePower, 'la puissance passe de 3 a 6').toBe(6);
  });

  it('un effet sans cible legale se refuse en le journalisant', () => {
    const depart = buildSimState({
      p1: [simChar('SS-008-C', { owner: 'player1', instanceId: 'kakashi' })],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    depart.phase = 'action';
    depart.player1.hand = [getCardById('KS-016-UC') as CharacterCard];

    const apres = GameEngine.applyAction(depart, 'player1', {
      type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'kakashi',
    } as never);

    expect(apres.pendingActions.length, 'aucune question posee, faute de cible').toBe(0);
    expect(
      apres.log.some((l) => l.messageKey === 'game.log.effect.noTarget'),
      'le refus est ecrit dans le journal, il ne disparait pas en silence',
    ).toBe(true);
  });
});
