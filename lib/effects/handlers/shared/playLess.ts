import type { GameState, PlayerID, CardData } from '@/lib/engine/types';
import type { EffectResult } from '@/lib/effects/EffectTypes';
import {
  findAffordableInHandByPredicate,
  findHiddenOnBoardByPredicate,
  type HiddenCharTarget,
} from '@/lib/effects/handlers/KS/shared/summonSearch';

export type PlayLessCategory = { kind: 'group' | 'keyword'; value: string };

export function predicateForCategory(cat: PlayLessCategory): (card: CardData) => boolean {
  if (cat.kind === 'group') return (c) => (c.group ?? '') === cat.value;
  return (c) => (c.keywords ?? []).includes(cat.value);
}

export function buildPlayLessTargets(
  state: GameState,
  player: PlayerID,
  category: PlayLessCategory,
  costReduction: number,
): { targets: string[]; hiddenChars: HiddenCharTarget[] } {
  const predicate = predicateForCategory(category);
  const handIndices = findAffordableInHandByPredicate(state, player, predicate, costReduction);
  const hiddenChars = findHiddenOnBoardByPredicate(state, player, predicate, costReduction);
  const targets = [
    ...handIndices.map((i) => `HAND_${i}`),
    ...hiddenChars.map((h) => `HIDDEN_${h.instanceId}`),
  ];
  return { targets, hiddenChars };
}

export interface PlayLessOptions {
  category: PlayLessCategory;
  costReduction: number;
  sourceName: string;
  sourceId: string;
  textFallback: string;
  descriptionKey: string;
  repeatable?: boolean;
}

export function encodePlayLessDescription(
  opts: PlayLessOptions,
  hiddenChars: HiddenCharTarget[],
): string {
  return JSON.stringify({
    text: opts.textFallback,
    hiddenChars,
    costReduction: opts.costReduction,
    category: opts.category,
    sourceName: opts.sourceName,
    sourceId: opts.sourceId,
    repeatable: !!opts.repeatable,
  });
}

export function playLessSelectionResult(
  state: GameState,
  player: PlayerID,
  opts: PlayLessOptions,
): EffectResult | null {
  const { targets, hiddenChars } = buildPlayLessTargets(state, player, opts.category, opts.costReduction);
  if (targets.length === 0) return null;
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'PLAY_LESS_CATEGORY',
    validTargets: targets,
    isOptional: true,
    description: encodePlayLessDescription(opts, hiddenChars),
    descriptionKey: opts.descriptionKey,
    descriptionParams: { reduction: opts.costReduction },
  };
}
