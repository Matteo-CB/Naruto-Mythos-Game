import type { EffectResult } from '@/lib/effects/EffectTypes';

export function confirmFirst(
  result: EffectResult,
  sourceInstanceId: string,
  confirmType: string,
): EffectResult {
  return {
    state: result.state,
    requiresTargetSelection: true,
    targetSelectionType: confirmType,
    validTargets: [sourceInstanceId],
    isOptional: true,
    description: JSON.stringify({
      nextType: result.targetSelectionType,
      targets: result.validTargets ?? [],
      nextKey: result.descriptionKey,
      nextText: typeof result.description === 'string' ? result.description : '',
      nextMin: result.minSelections,
      nextMax: result.maxSelections,
    }),
    descriptionKey: result.descriptionKey,
  };
}
