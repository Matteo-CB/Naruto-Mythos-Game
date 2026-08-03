import { getCardById } from '@/lib/data/cardIndex';
import { isSetRankedLegal } from '@/lib/data/sets/registry';

export const STATIC_RANKED_BANNED_CARD_IDS: ReadonlySet<string> = new Set([
  'SS-112-SPV',
  'SS-121-R',
  'SS-134-R',
  'SS-126-SPV',
  'SS-120-CHIBIV',
  'SS-147-POPV',
  'SS-000-L',
  'SS-122-SPV',
  'SS-111-SHINOBIV',
  'SS-112-SHINOBIV',
  'SS-114-SHINOBIV',
  'SS-115-SHINOBIV',
]);

// A card is auto-banned from ranked if it is on the explicit list, OR if its set is
// not ranked-legal (i.e. still revealing or coming soon). This automatically bans every
// card from a revealing set without maintaining a per-card list.
export function isStaticRankedBanned(cardId: string): boolean {
  if (STATIC_RANKED_BANNED_CARD_IDS.has(cardId)) return true;
  const card = getCardById(cardId);
  if (card && !isSetRankedLegal(card.set)) return true;
  return false;
}
