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

const PHASE4 = ['SS-018-UC', 'SS-022-UC', 'SS-138-R', 'SS-140-R', 'SS-141-S', 'SS-144-S'];

function instantsDe(id: string, type: EffectType): boolean {
  const carte = getCardById(id) as CardData;
  return (carte.effects ?? []).some((e) => e.type === type && !e.description.includes('[⧗]'));
}

function planteLaCarte(id: string): { state: GameState; instanceId: string } {
  const scenario = getScenario(id);
  const state = (scenario ?? getScenario('SS-003-C')!).build();
  const char = simChar(id, { owner: 'player1', instanceId: `gate4-${id}` });
  const missions = state.activeMissions.map((m, i) => i === 0
    ? { ...m, player1Characters: [...m.player1Characters, char] }
    : m);
  return { state: { ...state, activeMissions: missions }, instanceId: `gate4-${id}` };
}

function trouve(state: GameState, instanceId: string) {
  for (const m of state.activeMissions) {
    const c = m.player1Characters.find((x) => x.instanceId === instanceId);
    if (c) return c;
  }
  throw new Error(`personnage ${instanceId} introuvable`);
}

function aAgi(avant: GameState, apres: GameState): boolean {
  return apres.pendingEffects.length > avant.pendingEffects.length || apres.log.length > avant.log.length;
}

describe('phase 4, porte de sortie des six ameliorations', () => {
  it('les six cartes sont sorties de la liste des effets en attente', () => {
    expect(PHASE4.filter((id) => awaitsEffectImplementation(id)), 'aucune en attente').toEqual([]);
  });

  it('chaque effet imprime non continu a son handler enregistre', () => {
    const manquants: string[] = [];
    for (const id of PHASE4) {
      for (const effet of (getCardById(id) as CardData).effects ?? []) {
        if (effet.description.includes('[⧗]')) continue;
        if (!getEffectHandler(id, effet.type as EffectType)) manquants.push(`${id} ${effet.type}`);
      }
    }
    expect(manquants, 'chaque effet instantane a un handler').toEqual([]);
  });

  it('chaque carte a sa simulation dediee', () => {
    expect(PHASE4.filter((id) => !hasCuratedScenario(id)), 'chaque carte a un scenario').toEqual([]);
  });

  it('chaque MAIN instantane agit sur le jeu frais et sur la revelation', () => {
    const muettes: string[] = [];
    for (const id of PHASE4.filter((x) => instantsDe(x, 'MAIN'))) {
      const chemins: Array<[string, (s: GameState, iid: string) => GameState]> = [
        ['frais', (s, iid) => EffectEngine.resolvePlayEffects(s, 'player1', trouve(s, iid), 0, false)],
        ['revelation', (s, iid) => EffectEngine.resolveRevealEffects(s, 'player1', trouve(s, iid), 0, true)],
      ];
      for (const [nom, executer] of chemins) {
        const { state, instanceId } = planteLaCarte(id);
        if (!aAgi(state, executer(state, instanceId))) muettes.push(`${id} ${nom}`);
      }
    }
    expect(muettes, 'aucun MAIN muet').toEqual([]);
  });

  it('chaque UPGRADE agit sur le jeu en amelioration', () => {
    const muettes: string[] = [];
    for (const id of PHASE4.filter((x) => instantsDe(x, 'UPGRADE'))) {
      const { state, instanceId } = planteLaCarte(id);
      const apres = EffectEngine.resolvePlayEffects(state, 'player1', trouve(state, instanceId), 0, true);
      if (!aAgi(state, apres)) muettes.push(id);
    }
    expect(muettes, 'aucun UPGRADE muet').toEqual([]);
  });

  it('aucun UPGRADE de la phase 4 n_est copiable', async () => {
    const { isCopyableEffect } = await import('@/lib/effects/handlers/KS/shared/copyExclusions');
    for (const id of PHASE4) {
      for (const effet of (getCardById(id) as CardData).effects ?? []) {
        if (effet.type !== 'UPGRADE') continue;
        expect(isCopyableEffect(effet, { wasRevealed: true, wasFirstCard: true }),
          `${id} UPGRADE reste incopiable`).toBe(false);
      }
    }
  });
});
