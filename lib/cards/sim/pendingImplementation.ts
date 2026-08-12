export const PENDING_EFFECT_IMPLEMENTATION: ReadonlySet<string> = new Set([
  'SS-040-UC',
]);

export function awaitsEffectImplementation(cardId: string): boolean {
  return PENDING_EFFECT_IMPLEMENTATION.has(cardId);
}
