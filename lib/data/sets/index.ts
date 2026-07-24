import {
  cardData as ksCardData,
  effectDescriptionsFr as ksFr,
  effectDescriptionsEn as ksEn,
  effectDescriptionsEs as ksEs,
  effectDescriptionsJa as ksJa,
  effectDescriptionsPt as ksPt,
  effectDescriptionsIt as ksIt,
  effectDescriptionsPl as ksPl,
} from './KS';


// This module is client-safe: it exposes ONLY released sets. Not-yet-released sets
// (revealing / coming soon) live in serverExtraSets.ts and are merged at runtime by the
// server (serverCards.ts) or delivered over an authenticated API, so their card data
// never ships in the client bundle. See the card-reveal server-lock design.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ksCards = (ksCardData as any).cards ?? {};
export const allCardData = {
  cards: { ...ksCards },
};


export const allEffectDescriptionsFr: Record<string, string[]> = { ...ksFr };
export const allEffectDescriptionsEn: Record<string, string[]> = { ...ksEn };
export const allEffectDescriptionsEs: Record<string, string[]> = { ...ksEs };
export const allEffectDescriptionsJa: Record<string, string[]> = { ...ksJa };
export const allEffectDescriptionsPt: Record<string, string[]> = { ...ksPt };
export const allEffectDescriptionsIt: Record<string, string[]> = { ...ksIt };
export const allEffectDescriptionsPl: Record<string, string[]> = { ...ksPl };
