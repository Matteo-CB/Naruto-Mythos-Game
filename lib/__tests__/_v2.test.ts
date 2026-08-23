import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';
import { GameEngine } from '@/lib/engine/GameEngine';

beforeAll(() => { initializeRegistry(); });

describe('KIMIMARO 077 avec deux exemplaires en jeu', () => {
  it('chaque exemplaire propose son sacrifice quand on passe', () => {
    const s = buildSimState({
      p1: [simChar('SS-077-UC', { owner: 'player1', instanceId: 'kimi-a' })],
      p2: [simChar('KS-019-C', { owner: 'player2', instanceId: 'e1' })],
      missions: 2, chakra1: 40, edgeHolder: 'player1',
    });
    s.phase = 'action';
    s.activePlayer = 'player1';
    s.activeMissions[1].player1Characters.push(
      simChar('SS-077-UC', { owner: 'player1', instanceId: 'kimi-b', missionIndex: 1 }) as never,
    );
    s.activeMissions[1].player2Characters.push(
      simChar('KS-005-C', { owner: 'player2', instanceId: 'e2', missionIndex: 1 }) as never,
    );

    const apres = GameEngine.applyAction(s, 'player1', { type: 'PASS' } as never);
    const prompts = apres.pendingActions.filter((p) => p.descriptionKey?.includes('ss077Confirm'));
    console.log('propositions de sacrifice =', prompts.length,
      '| sources =', JSON.stringify(prompts.map((p) => p.options)));
    expect(prompts.length, 'un par Kimimaro en jeu').toBe(2);
  });
});

describe('KIMIMARO 031 defausse au plus un exemplaire de chaque nom', () => {
  it('deux Jirobo en main ne donnent qu une seule defausse de Jirobo', () => {
    const s = buildSimState({
      p1: [simChar('SS-032-C', { owner: 'player1', instanceId: 'ally' })],
      p2: [], missions: 2, chakra1: 40, edgeHolder: 'player1',
    });
    s.phase = 'action';
    s.activePlayer = 'player1';
    s.player1.hand = [
      getCardById('SS-031-UC') as CharacterCard,
      getCardById('SS-032-C') as CharacterCard,
      getCardById('SS-032-C') as CharacterCard,
      getCardById('SS-039-C') as CharacterCard,
    ];

    let etat: GameState = GameEngine.applyAction(s, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0,
    } as never);

    const defausses: string[] = [];
    let garde = 0;
    while (etat.pendingActions.length > 0 && garde < 12) {
      const q = etat.pendingActions[0];
      if (q.descriptionKey === 'game.effect.desc.ss031ChooseDiscard') {
        defausses.push(JSON.stringify(q.options));
      }
      etat = GameEngine.applyAction(etat, q.player, {
        type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [q.options[0]],
      } as never);
      garde += 1;
    }
    console.log('fenetres de defausse =', defausses.join(' puis '));
    console.log('defausse finale =', etat.player1.discardPile.map((c) => c.name_fr).join(', '));
    const noms = etat.player1.discardPile.map((c) => c.name_fr);
    expect(noms.filter((n) => n === 'JIRÔBÔ').length, 'un seul Jirobo defausse').toBeLessThanOrEqual(1);
  });
});
