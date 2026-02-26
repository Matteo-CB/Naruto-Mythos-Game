/**
 * Multi-set aggregator.
 * Imports card data, effect translations, and effect descriptions from each set
 * and merges them into unified exports.
 *
 * To add a new set:
 * 1. Create lib/data/sets/{SET_CODE}/cards.json, translations-fr.ts, descriptions-en.ts, index.ts
 * 2. Import and spread below
 */

import {
  cardData as ksCardData,
  effectDescriptionsFr as ksFr,
  effectDescriptionsEn as ksEn,
} from './KS';

// Merge all sets' card data
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ksCards = (ksCardData as any).cards ?? {};
export const allCardData = {
  cards: { ...ksCards },
};

// Merge all sets' effect descriptions
export const allEffectDescriptionsFr: Record<string, string[]> = { ...ksFr };
export const allEffectDescriptionsEn: Record<string, string[]> = { ...ksEn };
