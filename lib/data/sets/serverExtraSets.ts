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
import { stripHiddenPrintings } from './hiddenPrintings';

// Server-only bundle of the not-yet-released sets (revealing + coming soon). This module
// is imported ONLY by server code (serverCards.ts) and by the authenticated runtime card
// API. It must NEVER be imported by a client component, otherwise this card data would be
// shipped in the client bundle and the reveal server-lock would leak.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ssCards = stripHiddenPrintings((ssCardData as any).cards ?? {});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const akCards = (akCardData as any).cards ?? {};

export const extraRawCards: Record<string, unknown> = { ...ssCards, ...akCards };

export const extraEffectDescriptions: Record<string, Record<string, string[]>> = {
  fr: stripHiddenPrintings({ ...ssFr, ...akFr }),
  en: stripHiddenPrintings({ ...ssEn, ...akEn }),
  es: stripHiddenPrintings({ ...ssEs, ...akEs }),
  ja: stripHiddenPrintings({ ...ssJa, ...akJa }),
  pt: stripHiddenPrintings({ ...ssPt, ...akPt }),
  it: stripHiddenPrintings({ ...ssIt, ...akIt }),
  pl: stripHiddenPrintings({ ...ssPl, ...akPl }),
};
