import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

function plateau(): GameState {
  const s = buildSimState({
    p1: [simChar('SS-017-C', { owner: 'player1', instanceId: 'shino', hidden: true })],
    missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  s.phase = 'action';
  s.player2.hand = [getCardById('KS-133-S') as CharacterCard];
  return s;
}

function repondre(state: GameState): GameState {
  let courant = state;
  let garde = 0;
  while (courant.pendingActions.length > 0 && garde < 6) {
    const q = courant.pendingActions[0];
    if (q.descriptionKey === 'game.effect.desc.ss017RevealResult') return courant;
    courant = GameEngine.applyAction(courant, q.player, {
      type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [q.options[0]],
    } as never);
    garde += 1;
  }
  return courant;
}

describe('SHINO ABURAME 017 montre vraiment la carte revelee', () => {
  it('une fenetre presente la carte tiree dans la main adverse', () => {
    const apres = repondre(GameEngine.applyAction(plateau(), 'player1', {
      type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'shino',
    } as never));

    const question = apres.pendingActions[0];
    expect(question?.descriptionKey, 'la fenetre de revelation s ouvre').toBe('game.effect.desc.ss017RevealResult');

    const charge = JSON.parse(apres.pendingEffects[apres.pendingEffects.length - 1].effectDescription);
    expect(charge.cards?.length, 'une carte est transmise au client').toBe(1);
    expect(charge.cards[0].id, 'c est bien la carte de la main adverse').toBe('KS-133-S');
    expect(charge.cards[0].image_file, 'son illustration est fournie').toBeTruthy();
  });

  it('le chakra est gagne quand la carte coute 4 ou plus', () => {
    const apres = repondre(GameEngine.applyAction(plateau(), 'player1', {
      type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'shino',
    } as never));
    expect(
      apres.log.some((l) => l.messageKey === 'game.log.effect.ss017Chakra'),
      'le gain de chakra est journalise',
    ).toBe(true);
  });
});
