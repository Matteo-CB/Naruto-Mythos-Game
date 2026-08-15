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

const PHASE5 = ['SS-017-C', 'SS-052-C', 'SS-068-UC', 'SS-073-C', 'SS-013-UC', 'SS-055-UC',
  'SS-056-UC', 'SS-145-S', 'SS-014-C', 'SS-021-C', 'SS-060-UC', 'SS-076-UC'];

function effetsDe(id: string, type: EffectType) {
  return ((getCardById(id) as CardData).effects ?? [])
    .filter((e) => e.type === type && !e.description.includes('[⧗]'));
}

function planteLaCarte(id: string): { state: GameState; instanceId: string } {
  const scenario = getScenario(id);
  const state = (scenario ?? getScenario('SS-003-C')!).build();
  const char = simChar(id, { owner: 'player1', instanceId: `gate5-${id}` });
  const missions = state.activeMissions.map((m, i) => i === 0
    ? { ...m, player1Characters: [...m.player1Characters, char] }
    : m);
  return { state: { ...state, activeMissions: missions }, instanceId: `gate5-${id}` };
}

function trouve(state: GameState, instanceId: string) {
  for (const m of state.activeMissions) {
    const c = m.player1Characters.find((x) => x.instanceId === instanceId);
    if (c) return c;
  }
  throw new Error(`personnage ${instanceId} introuvable`);
}

describe('phase 5, porte de sortie des douze declenchements', () => {
  it('les douze cartes sont sorties de la liste des effets en attente', () => {
    expect(PHASE5.filter((id) => awaitsEffectImplementation(id)), 'aucune en attente').toEqual([]);
  });

  it('chaque effet imprime non continu a son handler enregistre', () => {
    const manquants: string[] = [];
    for (const id of PHASE5) {
      for (const effet of (getCardById(id) as CardData).effects ?? []) {
        if (effet.description.includes('[⧗]')) continue;
        if (!getEffectHandler(id, effet.type as EffectType)) manquants.push(`${id} ${effet.type}`);
      }
    }
    expect(manquants, 'chaque effet a un handler').toEqual([]);
  });

  it('chaque carte a sa simulation dediee', () => {
    expect(PHASE5.filter((id) => !hasCuratedScenario(id)), 'chaque carte a un scenario').toEqual([]);
  });

  it('une AMBUSH jouee face visible reste totalement silencieuse', () => {
    const bavardes: string[] = [];
    for (const id of PHASE5) {
      if (effetsDe(id, 'AMBUSH').length === 0) continue;
      if (effetsDe(id, 'MAIN').length > 0) continue;
      const { state, instanceId } = planteLaCarte(id);
      const apres = EffectEngine.resolvePlayEffects(state, 'player1', trouve(state, instanceId), 0, false);
      if (apres.pendingEffects.length > state.pendingEffects.length || apres.log.length > state.log.length) {
        bavardes.push(id);
      }
    }
    expect(bavardes, 'hors revelation, une AMBUSH ne dit rien').toEqual([]);
  });

  it('chaque AMBUSH agit bien a la revelation', () => {
    const muettes: string[] = [];
    for (const id of PHASE5) {
      if (effetsDe(id, 'AMBUSH').length === 0) continue;
      const { state, instanceId } = planteLaCarte(id);
      const apres = EffectEngine.resolveRevealEffects(state, 'player1', trouve(state, instanceId), 0, true);
      if (apres.pendingEffects.length === state.pendingEffects.length && apres.log.length === state.log.length) {
        muettes.push(id);
      }
    }
    expect(muettes, 'aucune AMBUSH muette a la revelation').toEqual([]);
  });

  it('chaque SCORE de la phase a son handler et se lit au decompte', () => {
    for (const id of PHASE5) {
      if (effetsDe(id, 'SCORE').length === 0) continue;
      expect(getEffectHandler(id, 'SCORE'), `${id} a son SCORE`).toBeTruthy();
    }
  });
});
