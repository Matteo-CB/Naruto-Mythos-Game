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
import { stripHiddenPrintings } from './hiddenPrintings';


// This module exposes released sets plus Shinobi Shiren, whose cards are all revealed.
// Sets still under wraps (coming soon) live in serverExtraSets.ts and are merged at runtime
// by the server (serverCards.ts) or delivered over an authenticated API, so their card data
// never ships in the client bundle. See the card-reveal server-lock design.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ksCards = (ksCardData as any).cards ?? {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ssCards = stripHiddenPrintings((ssCardData as any).cards ?? {});
export const allCardData = {
  cards: { ...ksCards, ...ssCards },
};


export const allEffectDescriptionsFr: Record<string, string[]> = stripHiddenPrintings({ ...ksFr, ...ssFr });
export const allEffectDescriptionsEn: Record<string, string[]> = stripHiddenPrintings({ ...ksEn, ...ssEn });
export const allEffectDescriptionsEs: Record<string, string[]> = stripHiddenPrintings({ ...ksEs, ...ssEs });
export const allEffectDescriptionsJa: Record<string, string[]> = stripHiddenPrintings({ ...ksJa, ...ssJa });
export const allEffectDescriptionsPt: Record<string, string[]> = stripHiddenPrintings({ ...ksPt, ...ssPt });
export const allEffectDescriptionsIt: Record<string, string[]> = stripHiddenPrintings({ ...ksIt, ...ssIt });
export const allEffectDescriptionsPl: Record<string, string[]> = stripHiddenPrintings({ ...ksPl, ...ssPl });
