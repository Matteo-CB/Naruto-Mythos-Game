import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { getCardById } from '@/lib/data/cardIndex';
import { simChar } from '@/lib/cards/sim/buildState';
import { getScenario, hasCuratedScenario } from '@/lib/cards/sim/scenarios';
import { awaitsEffectImplementation } from '@/lib/cards/sim/pendingImplementation';
import type { CardData, EffectType, GameState } from '@/lib/engine/types';

registerAllSetHandlers();

const PHASE3 = [
  'SS-003-C', 'SS-004-UC', 'SS-009-C', 'SS-011-C', 'SS-012-C', 'SS-023-C', 'SS-025-C',
  'SS-028-UC', 'SS-029-UC', 'SS-058-UC', 'SS-059-C', 'SS-063-C', 'SS-064-C', 'SS-065-UC',
  'SS-071-C', 'SS-072-C', 'SS-074-C', 'SS-136-R', 'SS-142-S', 'SS-143-S', 'SS-146-S',
];

function estContinu(description: string): boolean {
  return description.includes('[⧗]');
}

function estLigneAttach(description: string): boolean {
  return description.trim().toUpperCase().startsWith('ATTACH');
}

function planteLaCarte(id: string): { state: GameState; instanceId: string } {
  const scenario = getScenario(id);
  const state = (scenario ?? getScenario('SS-003-C')!).build();
  const char = simChar(id, { owner: 'player1', instanceId: `gate-${id}` });
  const missions = state.activeMissions.map((m, i) => i === 0
    ? { ...m, player1Characters: [...m.player1Characters, char] }
    : m);
  return { state: { ...state, activeMissions: missions }, instanceId: `gate-${id}` };
}

function aAgi(avant: GameState, apres: GameState): boolean {
  if (apres.pendingEffects.length > avant.pendingEffects.length) return true;
  return apres.log.length > avant.log.length;
}

describe('phase 3, porte de sortie des 21 cartes', () => {
  it('les 21 cartes sont sorties de la liste des effets en attente', () => {
    const restantes = PHASE3.filter((id) => awaitsEffectImplementation(id));
    expect(restantes, 'aucune carte de la phase 3 ne reste en attente').toEqual([]);
  });

  it('chaque effet imprime non continu a son handler enregistre', () => {
    const manquants: string[] = [];
    for (const id of PHASE3) {
      const carte = getCardById(id) as CardData;
      expect(carte, `${id} existe`).toBeTruthy();
      for (const effet of carte.effects ?? []) {
        if (estContinu(effet.description) || estLigneAttach(effet.description)) continue;
        if (!getEffectHandler(id, effet.type as EffectType)) {
          manquants.push(`${id} ${effet.type}`);
        }
      }
    }
    expect(manquants, 'chaque effet instantane a un handler').toEqual([]);
  });

  it('chaque carte a sa simulation dediee', () => {
    const sans = PHASE3.filter((id) => !hasCuratedScenario(id));
    expect(sans, 'chaque carte de la phase 3 a un scenario').toEqual([]);
  });

  it('chaque carte agit sur le jeu frais, sur l_amelioration et sur la revelation', () => {
    const muettes: string[] = [];
    for (const id of PHASE3) {
      const chemins: Array<[string, (s: GameState, iid: string) => GameState]> = [
        ['frais', (s, iid) => EffectEngine.resolvePlayEffects(s, 'player1', trouve(s, iid), 0, false)],
        ['amelioration', (s, iid) => EffectEngine.resolvePlayEffects(s, 'player1', trouve(s, iid), 0, true)],
        ['revelation', (s, iid) => EffectEngine.resolveRevealEffects(s, 'player1', trouve(s, iid), 0, true)],
      ];
      for (const [nom, executer] of chemins) {
        const { state, instanceId } = planteLaCarte(id);
        const apres = executer(state, instanceId);
        if (!aAgi(state, apres)) muettes.push(`${id} ${nom}`);
      }
    }
    expect(muettes, 'aucune carte ne reste muette sur un chemin de jeu').toEqual([]);
  });
});

function trouve(state: GameState, instanceId: string) {
  for (const m of state.activeMissions) {
    const c = m.player1Characters.find((x) => x.instanceId === instanceId);
    if (c) return c;
  }
  throw new Error(`personnage ${instanceId} introuvable`);
}
