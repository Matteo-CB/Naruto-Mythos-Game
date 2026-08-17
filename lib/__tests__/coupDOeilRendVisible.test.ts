import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { GameEngine } from '@/lib/engine/GameEngine';
import { rememberPeek } from '@/lib/effects/handlers/SS/hiddenPeek';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { GameState } from '@/lib/engine/types';

function plateau(): GameState {
  const state = buildSimState({
    p1: [simChar('KS-001-C', { owner: 'player1', instanceId: 'moi' })],
    p2: [simChar('KS-001-C', { owner: 'player2', instanceId: 'cache', hidden: true })],
    missions: 2,
    chakra1: 20,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  return state;
}

function carteVue(state: GameState, joueur: 'player1' | 'player2', instanceId: string) {
  const vue = GameEngine.getVisibleState(state, joueur);
  for (const mission of vue.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const trouve = mission[side].find((c) => c.instanceId === instanceId);
      if (trouve) return trouve;
    }
  }
  return null;
}

describe('regarder un personnage cache le rend visible a celui qui a regarde', () => {
  it('avant le coup d oeil, l ennemi cache reste inconnu', () => {
    const vu = carteVue(plateau(), 'player1', 'cache');
    expect(vu, 'le personnage est bien sur le plateau').toBeTruthy();
    expect(vu!.card, 'sa carte n est pas transmise').toBeFalsy();
  });

  it('apres le coup d oeil, sa carte est transmise a celui qui a regarde', () => {
    const apres = rememberPeek(plateau(), 'player1', 'cache');
    const vu = carteVue(apres, 'player1', 'cache');
    expect(vu!.card, 'celui qui a regarde voit desormais la carte').toBeTruthy();
    expect(vu!.isHidden, 'elle reste cachee pour le reste des regles').toBe(true);
  });

  it('le plateau montre la face des que la carte est transmise, pas seulement apres une revelation', () => {
    const source = readFileSync('components/game/MissionLane.tsx', 'utf8');
    expect(
      source,
      'un ennemi cache dont on a recu la carte doit montrer sa face grisee, sinon regarder ne sert a rien',
    ).toContain('character.wasRevealedAtLeastOnce || (!isOwn && hasCardData)');
    expect(
      source,
      'et il ne doit plus etre traite comme inconnu, sinon il reste non cliquable',
    ).toContain('const isUnknownHiddenEnemy = isHidden && !isOwn && !hasCardData;');
  });

  it('l adversaire ne profite pas du coup d oeil', () => {
    const apres = rememberPeek(plateau(), 'player1', 'cache');
    const vuParLAutre = carteVue(apres, 'player2', 'cache');
    expect(vuParLAutre!.card, 'son proprietaire la voyait deja').toBeTruthy();

    const inverse = rememberPeek(plateau(), 'player2', 'cache');
    const vuParP1 = carteVue(inverse, 'player1', 'cache');
    expect(vuParP1!.card, 'un coup d oeil de l adversaire ne montre rien au joueur 1').toBeFalsy();
  });
});
