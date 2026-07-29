import { describe, it, expect } from 'vitest';
import { getEffectHandler, initializeRegistry } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { EffectType, GameState } from '@/lib/engine/types';

const GAARA_COST_4 = 'SS-078-UC';
const NEJI = 'SS-112-SPV';

function relayedTargets(result: { description?: unknown; validTargets?: string[] }): string[] {
  try {
    const parsed = JSON.parse(String(result.description)) as { targets?: string[] };
    if (Array.isArray(parsed.targets)) return parsed.targets;
  } catch {}
  return result.validTargets ?? [];
}

function runHandler(cardId: string, trigger: EffectType, state: GameState, sourceInstanceId: string, missionIndex = 0) {
  initializeRegistry();
  const handler = getEffectHandler(cardId, trigger);
  if (!handler) throw new Error(`no ${trigger} handler for ${cardId}`);
  const side = state.activeMissions[missionIndex].player1Characters;
  const source = side.find((c) => c.instanceId === sourceInstanceId)!;
  return handler({
    state, sourcePlayer: 'player1', sourceCard: source,
    sourceMissionIndex: missionIndex, triggerType: trigger, isUpgrade: false,
  });
}

describe('a hidden character is a legal target when the text does not exclude it', () => {
  it('Gaara SS-078 (cost 4) can defeat a hidden enemy, whose cost counts as 0', () => {
    const state = buildSimState({
      p1: [simChar(GAARA_COST_4, { owner: 'player1', instanceId: 'gaara' })],
      p2: [
        simChar('KS-133-S', { owner: 'player2', instanceId: 'hidden-expensive', hidden: true }),
        simChar('KS-001-C', { owner: 'player2', instanceId: 'visible-cheap' }),
      ],
      missions: 2,
      chakra1: 20,
      edgeHolder: 'player1',
    });
    state.phase = 'action';

    const targets = relayedTargets(runHandler(GAARA_COST_4, 'DUEL' as EffectType, state, 'gaara'));
    expect(targets, 'a hidden enemy has cost 0, so it satisfies "cost 2 or less"').toContain('hidden-expensive');
  });

  it('Neji SS-112 can strip power tokens from a hidden enemy that carries some', () => {
    const state = buildSimState({
      p1: [simChar(NEJI, { owner: 'player1', instanceId: 'neji' })],
      p2: [simChar('KS-001-C', { owner: 'player2', instanceId: 'hidden-tokens', hidden: true, powerTokens: 2 })],
      missions: 2,
      chakra1: 20,
      edgeHolder: 'player1',
    });
    state.phase = 'action';

    const result = runHandler(NEJI, 'UPGRADE' as EffectType, state, 'neji');
    expect(
      result.requiresTargetSelection,
      'the only enemy is hidden with tokens, so the effect must still find a target',
    ).toBe(true);
  });
});
