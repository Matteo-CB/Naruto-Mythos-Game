import { getCardById } from '@/lib/data/cardIndex';
import { isSetRankedLegal } from '@/lib/data/sets/registry';

export const STATIC_RANKED_BANNED_CARD_IDS: ReadonlySet<string> = new Set([
  'SS-112-SPV',
  'SS-121-R',
  'SS-134-R',
  'SS-126-SPV',
  'SS-120-CHIBIV',
  'SS-147-POPV',
  'SS-149-L',
  'SS-122-SPV',
  'SS-111-SHINOBIV',
  'SS-112-SHINOBIV',
  'SS-114-SHINOBIV',
  'SS-115-SHINOBIV',
  'SS-121-MV',
  'SS-126-R',
  'SS-031-CHIBIV',
  'SS-999-L',
  'SS-998-L',
  'SS-078-L',
  'SS-002-UC',
  'SS-006-UC',
  'SS-008-C',
  'SS-016-C',
  'SS-033-UC',
  'SS-053-C',
  'SS-079-C',
  'SS-081-C',
  'SS-005-M',
  'SS-114-MV',
  'SS-123-MV',
  'SS-126-MV',
  'SS-137-MV',
  'SS-078-CHIBIV',
  'SS-111-CHIBIV',
  'SS-112-CHIBIV',
  'SS-115-CHIBIV',
  'SS-118-CHIBIV',
  'SS-121-CHIBIV',
  'SS-123-CHIBIV',
  'SS-126-CHIBIV',
  'SS-147-SV',
  'SS-148-SV',
  'SS-149-SV',
  'SS-150-SV',
  'SS-147-S',
  'SS-148-S',
  'SS-149-S',
  'SS-150-S',
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
