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
import {
  cardData as akCardData,
  effectDescriptionsFr as akFr,
  effectDescriptionsEn as akEn,
  effectDescriptionsEs as akEs,
  effectDescriptionsJa as akJa,
  effectDescriptionsPt as akPt,
  effectDescriptionsIt as akIt,
  effectDescriptionsPl as akPl,
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
export const allEffectDescriptionsPt: Record<string, string[]> = { ...ksPt, ...ssPt, ...akPt };
export const allEffectDescriptionsIt: Record<string, string[]> = { ...ksIt, ...ssIt, ...akIt };
export const allEffectDescriptionsPl: Record<string, string[]> = { ...ksPl, ...ssPl, ...akPl };
