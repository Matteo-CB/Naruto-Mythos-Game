export const SEALED_BUILD_WINDOW_MS = 15 * 60 * 1000;

export const SEALED_BUILD_SUBMIT_GRACE_MS = 60 * 1000;

export const SEALED_BUILD_RESERVATION_MS = SEALED_BUILD_WINDOW_MS + SEALED_BUILD_SUBMIT_GRACE_MS;

export const SEALED_MAX_JOIN_ATTEMPTS = 2;

export function canJoinSealedAgain(previousJoinCount: number): boolean {
  return previousJoinCount < SEALED_MAX_JOIN_ATTEMPTS;
}

export interface SealedRegistrationState {
  joinedAt: Date | string;
  deckValid: boolean;
}

export function sealedBuildDeadline(joinedAt: Date | string): number {
  return new Date(joinedAt).getTime() + SEALED_BUILD_RESERVATION_MS;
}

export function isSealedRegistrationExpired(
  registration: SealedRegistrationState,
  now: Date = new Date(),
): boolean {
  if (registration.deckValid) return false;
  return now.getTime() >= sealedBuildDeadline(registration.joinedAt);
}

export function countConfirmedOrReserved(
  registrations: SealedRegistrationState[],
  now: Date = new Date(),
): number {
  return registrations.filter((r) => !isSealedRegistrationExpired(r, now)).length;
}

export function findBannedCardInSealedDeck(
  bannedCardIds: Iterable<string>,
  cardIds: string[],
  missionIds: string[],
): string | null {
  const banned = new Set(bannedCardIds);
  if (banned.size === 0) return null;
  for (const id of [...cardIds, ...missionIds]) {
    if (banned.has(id)) return id;
  }
  return null;
}

export type SealedDeckRejection =
  | 'tournament.error.sealedDeckLocked'
  | 'tournament.error.sealedDeckTooSmall'
  | 'tournament.error.sealedMissionCount'
  | 'tournament.error.sealedCardNotInPool';

export interface SealedDeckCheck {
  valid: boolean;
  errorKey?: SealedDeckRejection;
  offendingCardId?: string;
}

export const SEALED_MIN_DECK_SIZE = 30;
export const SEALED_REQUIRED_MISSIONS = 3;

export function checkSealedDeckAgainstPool(
  poolCardIds: string[],
  cardIds: string[],
  missionIds: string[],
): SealedDeckCheck {
  if (cardIds.length < SEALED_MIN_DECK_SIZE) {
    return { valid: false, errorKey: 'tournament.error.sealedDeckTooSmall' };
  }
  if (missionIds.length !== SEALED_REQUIRED_MISSIONS) {
    return { valid: false, errorKey: 'tournament.error.sealedMissionCount' };
  }
  const remaining = new Map<string, number>();
  for (const id of poolCardIds) remaining.set(id, (remaining.get(id) ?? 0) + 1);
  for (const id of [...cardIds, ...missionIds]) {
    const left = remaining.get(id) ?? 0;
    if (left <= 0) {
      return { valid: false, errorKey: 'tournament.error.sealedCardNotInPool', offendingCardId: id };
    }
    remaining.set(id, left - 1);
  }
  return { valid: true };
}
