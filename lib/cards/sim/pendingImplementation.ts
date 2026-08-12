export const PENDING_EFFECT_IMPLEMENTATION: ReadonlySet<string> = new Set([
  'SS-030-C',
  'SS-032-C',
  'SS-034-C',
  'SS-035-UC',
  'SS-036-C',
  'SS-037-UC',
  'SS-040-UC',
  'SS-042-UC',
  'SS-043-UC',
  'SS-044-UC',
  'SS-045-C',
  'SS-077-UC',
  'SS-093-C',
  'SS-101-UC',
  'SS-125-R',
  'SS-127-R',
  'SS-130-R',
  'SS-139-R',
]);

export function awaitsEffectImplementation(cardId: string): boolean {
  return PENDING_EFFECT_IMPLEMENTATION.has(cardId);
}
