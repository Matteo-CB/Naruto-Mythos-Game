

import {
  cardData as ksCardData,
  effectDescriptionsFr as ksFr,
  effectDescriptionsEn as ksEn,
} from './KS';


// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ksCards = (ksCardData as any).cards ?? {};
export const allCardData = {
  cards: { ...ksCards },
};


export const allEffectDescriptionsFr: Record<string, string[]> = { ...ksFr };
export const allEffectDescriptionsEn: Record<string, string[]> = { ...ksEn };
