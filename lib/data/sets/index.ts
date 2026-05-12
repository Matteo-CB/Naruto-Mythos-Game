import {
  cardData as ksCardData,
  effectDescriptionsFr as ksFr,
  effectDescriptionsEn as ksEn,
} from './KS';
import {
  cardData as ssCardData,
  effectDescriptionsFr as ssFr,
  effectDescriptionsEn as ssEn,
} from './SS';


// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ksCards = (ksCardData as any).cards ?? {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ssCards = (ssCardData as any).cards ?? {};
export const allCardData = {
  cards: { ...ksCards, ...ssCards },
};


export const allEffectDescriptionsFr: Record<string, string[]> = { ...ksFr, ...ssFr };
export const allEffectDescriptionsEn: Record<string, string[]> = { ...ksEn, ...ssEn };
