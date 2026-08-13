import { getAllCards } from '@/lib/data/cardLoader';
import { getEffectHandler, getRegisteredCardIds, getRegisteredEffectTypes, registerEffect } from '@/lib/effects/EffectRegistry';
import type { EffectType } from '@/lib/engine/types';

function cleDImpression(card: { set?: string; card_type?: string; number?: number | string }): string {
  return `${card.set ?? ''}#${card.card_type ?? ''}#${Number(card.number ?? -1)}`;
}

export function propagateHandlersAcrossPrintings(): void {
  const parCle = new Map<string, string[]>();
  for (const card of getAllCards()) {
    const cle = cleDImpression(card);
    const liste = parCle.get(cle) ?? [];
    liste.push(card.id);
    parCle.set(cle, liste);
  }

  const enregistrees = new Set(getRegisteredCardIds());
  for (const impressions of parCle.values()) {
    if (impressions.length < 2) continue;
    const types = new Set<EffectType>();
    for (const id of impressions) {
      if (enregistrees.has(id)) for (const t of getRegisteredEffectTypes(id)) types.add(t);
    }
    for (const type of types) {
      let source: ReturnType<typeof getEffectHandler>;
      for (const id of impressions) {
        if (!enregistrees.has(id)) continue;
        const h = getEffectHandler(id, type);
        if (h) { source = h; break; }
      }
      if (!source) continue;
      for (const id of impressions) {
        if (getEffectHandler(id, type)) continue;
        registerEffect(id, type, source);
      }
    }
  }
}
