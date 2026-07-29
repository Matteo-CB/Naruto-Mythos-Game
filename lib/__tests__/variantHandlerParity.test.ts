import { describe, it, expect } from 'vitest';
import { initializeRegistry, hasHandler } from '@/lib/effects/EffectRegistry';
import { getAllCards } from '@/lib/data/cardLoader';
import type { EffectType } from '@/lib/engine/types';

const HANDLED_TYPES: EffectType[] = ['MAIN', 'AMBUSH', 'UPGRADE', 'SCORE', 'DUEL', 'FIRST_STRIKE'] as EffectType[];

interface Sibling {
  id: string;
  effectTypes: EffectType[];
}

function siblingGroups(): Map<string, Sibling[]> {
  const groups = new Map<string, Sibling[]>();
  for (const card of getAllCards()) {
    if (!card.effects || card.effects.length === 0) continue;
    const key = `${card.set ?? 'KS'}#${card.card_type}#${String(card.number)}`;
    const effectTypes = HANDLED_TYPES.filter((t) => card.effects!.some((e) => e.type === t));
    if (effectTypes.length === 0) continue;
    const list = groups.get(key) ?? [];
    list.push({ id: card.id, effectTypes });
    groups.set(key, list);
  }
  return groups;
}

describe('every variant of a card carries the same handlers as its base card', () => {
  it('no printing of a card is left without the handler its siblings have', () => {
    initializeRegistry();
    const gaps: string[] = [];

    for (const [key, siblings] of siblingGroups()) {
      if (siblings.length < 2) continue;

      for (const type of HANDLED_TYPES) {
        const withType = siblings.filter((s) => s.effectTypes.includes(type));
        if (withType.length < 2) continue;

        const registered = withType.filter((s) => hasHandler(s.id, type));
        if (registered.length === 0) continue;

        const missing = withType.filter((s) => !hasHandler(s.id, type));
        for (const m of missing) {
          gaps.push(`${key} ${type}: ${m.id} has no handler while ${registered[0].id} does`);
        }
      }
    }

    expect(gaps, `variant printings missing a handler:\n  ${gaps.join('\n  ')}`).toEqual([]);
  });
});
