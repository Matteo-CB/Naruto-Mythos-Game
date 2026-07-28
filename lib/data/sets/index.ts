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
import {
  cardData as ssCardData,
  effectDescriptionsFr as ssFr,
  effectDescriptionsEn as ssEn,
  effectDescriptionsEs as ssEs,
  effectDescriptionsJa as ssJa,
  effectDescriptionsPt as ssPt,
  effectDescriptionsIt as ssIt,
  effectDescriptionsPl as ssPl,
} from './SS';


// This module exposes released sets plus Shinobi Shiren, whose cards are all revealed.
// Sets still under wraps (coming soon) live in serverExtraSets.ts and are merged at runtime
// by the server (serverCards.ts) or delivered over an authenticated API, so their card data
// never ships in the client bundle. See the card-reveal server-lock design.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ksCards = (ksCardData as any).cards ?? {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ssCards = (ssCardData as any).cards ?? {};
export const allCardData = {
  cards: { ...ksCards, ...ssCards },
};


export const allEffectDescriptionsFr: Record<string, string[]> = { ...ksFr, ...ssFr };
export const allEffectDescriptionsEn: Record<string, string[]> = { ...ksEn, ...ssEn };
export const allEffectDescriptionsEs: Record<string, string[]> = { ...ksEs, ...ssEs };
export const allEffectDescriptionsJa: Record<string, string[]> = { ...ksJa, ...ssJa };
export const allEffectDescriptionsPt: Record<string, string[]> = { ...ksPt, ...ssPt };
export const allEffectDescriptionsIt: Record<string, string[]> = { ...ksIt, ...ssIt };
export const allEffectDescriptionsPl: Record<string, string[]> = { ...ksPl, ...ssPl };
