export const PENDING_EFFECT_IMPLEMENTATION: ReadonlySet<string> = new Set([
]);

export function awaitsEffectImplementation(cardId: string): boolean {
  return PENDING_EFFECT_IMPLEMENTATION.has(cardId);
}
