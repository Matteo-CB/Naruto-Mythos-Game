import { describe, it, expect } from 'vitest';
import { createActionPhaseState } from './testHelpers';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import type { GameState } from '@/lib/engine/types';

function card(instanceId: string, name: string) {
  return {
    instanceId, id: instanceId, name_fr: name, name_en: name, title_fr: '',
    rarity: 'C', card_type: 'character', chakra: 1, power: 1, keywords: [], group: '', effects: [],
  };
}

describe('REORDER_DISCARD reorders in place; a later-defeated card stays on top (Itachi 140)', () => {
  it('does not move the reordered hand above a character defeated afterward', () => {
    const base = createActionPhaseState({});
    const state: GameState = {
      ...base,
      player2: {
        ...base.player2,
        discardPile: [card('old', 'OLD'), card('h1', 'HAND1'), card('h2', 'HAND2'), card('def', 'DEFEATED')] as never,
      },
    };

    const pendingEffect = {
      id: 'pe', sourceCardId: 'KS-140-S', sourceInstanceId: 'itachi', sourceMissionIndex: 0,
      effectType: 'MAIN' as const, effectDescription: JSON.stringify({ count: 2, discardOwner: 'player2' }),
      targetSelectionType: 'REORDER_DISCARD', sourcePlayer: 'player1' as const,
      requiresTargetSelection: true, validTargets: ['h1', 'h2'], isOptional: false, resolved: false, isUpgrade: false,
    };

    const after = EffectEngine.applyTargetedEffect(state, pendingEffect as never, [JSON.stringify(['h2', 'h1'])]);
    const ids = (after.player2.discardPile as unknown as Array<{ instanceId: string }>).map((c) => c.instanceId);
    expect(ids).toEqual(['old', 'h2', 'h1', 'def']);
  });
});
