import {
  cardData as ksCardData,
  effectDescriptionsFr as ksFr,
  effectDescriptionsEn as ksEn,
  effectDescriptionsEs as ksEs,
  effectDescriptionsJa as ksJa,
} from './KS';
import {
  cardData as ssCardData,
  effectDescriptionsFr as ssFr,
  effectDescriptionsEn as ssEn,
  effectDescriptionsEs as ssEs,
  effectDescriptionsJa as ssJa,
} from './SS';
import {
  cardData as akCardData,
  effectDescriptionsFr as akFr,
  effectDescriptionsEn as akEn,
  effectDescriptionsEs as akEs,
  effectDescriptionsJa as akJa,
} from './AK';


// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ksCards = (ksCardData as any).cards ?? {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ssCards = (ssCardData as any).cards ?? {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const akCards = (akCardData as any).cards ?? {};
export const allCardData = {
  cards: { ...ksCards, ...ssCards, ...akCards },
};


export const allEffectDescriptionsFr: Record<string, string[]> = { ...ksFr, ...ssFr, ...akFr };
export const allEffectDescriptionsEn: Record<string, string[]> = { ...ksEn, ...ssEn, ...akEn };
export const allEffectDescriptionsEs: Record<string, string[]> = { ...ksEs, ...ssEs, ...akEs };
export const allEffectDescriptionsJa: Record<string, string[]> = { ...ksJa, ...ssJa, ...akJa };
