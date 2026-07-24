import { getAllCards, augmentRawCards } from './cardLoader';
import { resetCardIndexCaches, getCardById } from './cardIndex';
import { augmentEffectDescriptions } from './effectDescriptions';
import { extraRawCards, extraEffectDescriptions } from './sets/serverExtraSets';
import type { CardData } from '../engine/types';

// Server-side full card access. Merges the not-yet-released sets (revealing + coming soon)
// into the shared card loader / index so the engine and server code can resolve every card,
// while the client bundle keeps only released sets. Idempotent; safe to call anywhere on the
// server before a card lookup that might target a revealing-set card.

let augmented = false;

export function ensureServerCards(): void {
  if (augmented) return;
  augmented = true;
  augmentRawCards(extraRawCards);
  resetCardIndexCaches();
  augmentEffectDescriptions(extraEffectDescriptions);
}

export function getServerAllCards(): CardData[] {
  ensureServerCards();
  return getAllCards();
}

export function getServerCardById(id: string): CardData | undefined {
  ensureServerCards();
  return getCardById(id);
}

// Raw card records for the not-yet-released sets, used by the runtime card API to deliver
// revealed (public) or all (privileged) revealing-set cards to the client.
export function getExtraRawCards(): Record<string, unknown> {
  return extraRawCards;
}

export function getExtraEffectDescriptions(): Record<string, Record<string, string[]>> {
  return extraEffectDescriptions;
}

// True if the card belongs to a not-in-client-bundle set (its art lives in the private folder
// and must be served through the gated image route, whatever the set status).
export function isExtraSetCard(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(extraRawCards, id);
}
