import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { shuffle } from '@/lib/engine/utils/shuffle';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

describe('le melange du deck est reellement aleatoire', () => {
  it('la carte du dessus n est pas toujours la meme', () => {
    const deck = Array.from({ length: 30 }, (_, i) => i);
    const vus = new Set<number>();
    for (let n = 0; n < 500; n++) vus.add(shuffle(deck)[0]);
    expect(vus.size, 'toutes les cartes peuvent finir sur le dessus').toBe(30);
  });

  it('aucune carte n est favorisee de plus de 25 pour cent', () => {
    const deck = Array.from({ length: 30 }, (_, i) => i);
    const compte = new Array(30).fill(0);
    const tirages = 30000;
    for (let n = 0; n < tirages; n++) compte[shuffle(deck)[0]] += 1;
    const attendu = tirages / 30;
    const ecartMax = Math.max(...compte.map((c) => Math.abs(c - attendu) / attendu));
    expect(ecartMax, 'la distribution reste dans le bruit statistique').toBeLessThan(0.25);
  });
});

describe('le Multiclonage retire bien la carte du deck', () => {
  it('deux poses consecutives ne reposent pas la meme carte', () => {
    const s: GameState = buildSimState({
      p1: [simChar('SS-005-C', { owner: 'player1', instanceId: 'naruto', hidden: true })],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    s.phase = 'action';
    s.player1.deck = ['KS-009-C', 'KS-011-C', 'KS-013-C'].map((i) => getCardById(i) as CharacterCard);

    let courant = GameEngine.applyAction(s, 'player1', {
      type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'naruto',
    } as never);
    let garde = 0;
    while (courant.pendingActions.length > 0 && garde < 8) {
      const q = courant.pendingActions[0];
      courant = GameEngine.applyAction(courant, q.player, {
        type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [q.options[0]],
      } as never);
      garde += 1;
    }

    const poses = courant.activeMissions[0].player1Characters.filter((c) => c.instanceId !== 'naruto');
    expect(poses.length, 'le principal et l embuscade posent deux cartes').toBe(2);
    expect(
      new Set(poses.map((c) => c.instanceId)).size,
      'ce sont deux exemplaires distincts',
    ).toBe(2);
    expect(courant.player1.deck.length, 'le deck a bien perdu deux cartes').toBe(1);
    expect(courant.player1.deck[0].id, 'la troisieme carte reste sur le dessus').toBe('KS-013-C');
  });
});
