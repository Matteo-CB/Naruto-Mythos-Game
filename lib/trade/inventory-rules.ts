export const TRADE_FULLY_EXCLUDED: ReadonlySet<string> = new Set([
  'KS-133-MV',
  'KS-133_2-MV',
  'KS-137-MV',
]);

export const TRADE_TOURNAMENT_GROUP: ReadonlySet<string> = new Set([
  'KS-107-MV',
  'KS-108-MV',
  'KS-120-MV',
  'KS-128-MV',
]);

export const MAX_OFFER_SIZE = 20;

export function isFullyExcluded(cardId: string): boolean {
  return TRADE_FULLY_EXCLUDED.has(cardId);
}

export function isTournamentVariant(cardId: string): boolean {
  return TRADE_TOURNAMENT_GROUP.has(cardId);
}

export type OfferRejectReason =
  | 'too_many'
  | 'fully_excluded'
  | 'mixed_tournament'
  | 'asymmetric_tournament';

export interface OfferValidation {
  valid: boolean;
  reason?: OfferRejectReason;
}

export function validateOffer(creatorOffer: string[], guestOffer: string[]): OfferValidation {
  if (creatorOffer.length > MAX_OFFER_SIZE || guestOffer.length > MAX_OFFER_SIZE) {
    return { valid: false, reason: 'too_many' };
  }

  for (const id of [...creatorOffer, ...guestOffer]) {
    if (isFullyExcluded(id)) {
      return { valid: false, reason: 'fully_excluded' };
    }
  }

  const creatorHasTournament = creatorOffer.some(isTournamentVariant);
  const creatorHasNonTournament = creatorOffer.some((id) => !isTournamentVariant(id));
  const guestHasTournament = guestOffer.some(isTournamentVariant);
  const guestHasNonTournament = guestOffer.some((id) => !isTournamentVariant(id));

  if (creatorHasTournament && creatorHasNonTournament) {
    return { valid: false, reason: 'mixed_tournament' };
  }
  if (guestHasTournament && guestHasNonTournament) {
    return { valid: false, reason: 'mixed_tournament' };
  }

  if (creatorHasTournament && !guestHasTournament && guestOffer.length > 0) {
    return { valid: false, reason: 'asymmetric_tournament' };
  }
  if (guestHasTournament && !creatorHasTournament && creatorOffer.length > 0) {
    return { valid: false, reason: 'asymmetric_tournament' };
  }

  return { valid: true };
}
