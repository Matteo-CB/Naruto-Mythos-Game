import type { GameState, PlayerID, CardData } from '@/lib/engine/types';
import type { EffectResult } from '@/lib/effects/EffectTypes';
import { logAction } from '@/lib/engine/utils/gameLog';
import {
  findAffordableInHandByPredicate,
  findHiddenOnBoardByPredicate,
  findRevealBlockedByNameRule,
  type HiddenCharTarget,
} from '@/lib/effects/handlers/KS/shared/summonSearch';

export type PlayLessCategory = { kind: 'group' | 'keyword' | 'name'; value: string };

export function predicateForCategory(cat: PlayLessCategory): (card: CardData) => boolean {
  if (cat.kind === 'group') return (c) => (c.group ?? '') === cat.value;
  if (cat.kind === 'name') {
    const wanted = cat.value.toUpperCase();
    return (c) => `${c.name_fr ?? ''} ${c.name_en ?? ''}`.toUpperCase().includes(wanted);
  }
  return (c) => (c.keywords ?? []).includes(cat.value);
}

export function buildPlayLessTargets(
  state: GameState,
  player: PlayerID,
  category: PlayLessCategory,
  costReduction: number,
  noUpgrade = false,
): { targets: string[]; hiddenChars: HiddenCharTarget[] } {
  const predicate = predicateForCategory(category);
  const handIndices = findAffordableInHandByPredicate(state, player, predicate, costReduction, noUpgrade);
  const hiddenChars = findHiddenOnBoardByPredicate(state, player, predicate, costReduction, noUpgrade);
  const targets = [
    ...handIndices.map((i) => `HAND_${i}`),
    ...hiddenChars.map((h) => `HIDDEN_${h.instanceId}`),
  ];
  return { targets, hiddenChars };
}

export function playLessRevealBlockedName(
  state: GameState,
  player: PlayerID,
  category: PlayLessCategory,
): string | null {
  return findRevealBlockedByNameRule(state, player, predicateForCategory(category));
}

export function playLessBlockedRevealResult(
  state: GameState,
  player: PlayerID,
  category: PlayLessCategory,
  sourceLabel: string,
): EffectResult | null {
  const blockedName = playLessRevealBlockedName(state, player, category);
  if (!blockedName) return null;
  return {
    state: {
      ...state,
      log: logAction(
        state.log, state.turn, state.phase, player,
        'EFFECT_BLOCKED',
        `${sourceLabel}: Cannot reveal ${blockedName}, a character with that name is already visible on this mission.`,
        'game.log.effect.duplicateNameReveal',
        { card: blockedName },
      ),
    },
  };
}

export interface PlayLessOptions {
  category: PlayLessCategory;
  costReduction: number;
  sourceName: string;
  sourceId: string;
  textFallback: string;
  descriptionKey: string;
  repeatable?: boolean;
  noUpgrade?: boolean;
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
    noUpgrade: !!opts.noUpgrade,
  });
}

export function playLessSelectionResult(
  state: GameState,
  player: PlayerID,
  opts: PlayLessOptions,
): EffectResult | null {
  const { targets, hiddenChars } = buildPlayLessTargets(
    state, player, opts.category, opts.costReduction, !!opts.noUpgrade,
  );
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
