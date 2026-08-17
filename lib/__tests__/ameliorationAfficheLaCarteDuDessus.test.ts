import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

const BASE = 'KS-128-R';
const SOMMET = 'KS-140-S';

const FICHIERS_QUI_AFFICHENT_UN_PERSONNAGE = [
  'components/game/MissionLane.tsx',
  'components/game/TargetSelector.tsx',
];

function ameliore(): GameState {
  const state = buildSimState({
    p1: [simChar(BASE, { owner: 'player1', instanceId: 'itachi' })],
    missions: 2,
    chakra1: 40,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  state.player1.hand = [getCardById(SOMMET) as CharacterCard];
  state.player2.hand = [];

  let courant = GameEngine.applyAction(state, 'player1', {
    type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'itachi',
  } as never);
  let garde = 0;
  while (courant.pendingActions.length > 0 && garde < 10) {
    const question = courant.pendingActions[0];
    courant = GameEngine.applyAction(courant, question.player, {
      type: 'SELECT_TARGET', pendingActionId: question.id, selectedTargets: [question.options[0]],
    } as never);
    garde += 1;
  }
  return courant;
}

describe('un personnage ameliore doit s afficher avec la carte du dessus', () => {
  it('topCard suit toujours le sommet de la pile', () => {
    const apres = ameliore();
    const enJeu = apres.activeMissions[0].player1Characters.find((c) => c.instanceId === 'itachi')!;
    expect(enJeu.stack.map((c) => c.id), 'la pile a bien grandi').toEqual([BASE, SOMMET]);

    const vue = GameEngine.getVisibleState(apres, 'player1');
    const perso = vue.activeMissions[0].player1Characters.find((c) => c.instanceId === 'itachi')!;
    expect(perso.topCard?.id, 'seul topCard est garanti a jour, pas card').toBe(SOMMET);
    expect(perso.stackSize, 'la pile est signalee au client').toBe(2);
  });

  it('aucun ecran de jeu ne lit card sans passer par topCard', () => {
    const fautifs: string[] = [];
    for (const fichier of FICHIERS_QUI_AFFICHENT_UN_PERSONNAGE) {
      const source = readFileSync(join(process.cwd(), fichier), 'utf8');
      source.split('\n').forEach((ligne, index) => {
        if (ligne.includes('topCard')) return;
        if (/\bhasCardData\s*=/.test(ligne)) return;
        if (ligne.includes('prev.') || ligne.includes('next.')) return;
        if (!/\b(character|c)\.card\b/.test(ligne)) return;
        fautifs.push(`${fichier}:${index + 1} ${ligne.trim()}`);
      });
    }
    expect(
      fautifs,
      `ces lignes affichent la carte du dessous d une pile amelioree:\n  ${fautifs.join('\n  ')}`,
    ).toEqual([]);
  });
});
