export const STATIC_RANKED_BANNED_CARD_IDS: ReadonlySet<string> = new Set([
  'SS-112-SPV',
  'SS-121-R',
  'SS-134-R',
  'SS-126-SPV',
  'SS-120-CHIBIV',
  'SS-147-POPV',
  'SS-000-L',
  'SS-122-SPV',
]);

export function isStaticRankedBanned(cardId: string): boolean {
  return STATIC_RANKED_BANNED_CARD_IDS.has(cardId);
}
