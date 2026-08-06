import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  SEALED_BUILD_WINDOW_MS,
  SEALED_BUILD_RESERVATION_MS,
  isSealedRegistrationExpired,
} from '@/lib/tournament/sealedRegistration';

const ROUTE = readFileSync('app/api/tournaments/[id]/sealed-deck/route.ts', 'utf8');
const LOCALES = ['en', 'fr', 'es', 'ja', 'pt', 'it', 'pl'];

describe('a finished sealed deck never vanishes with its seat', () => {
  it('a released seat is taken back from the stored pool instead of a bare rejection', () => {
    const missing = ROUTE.indexOf('if (!participant) {');
    expect(missing, 'the route handles a missing participant').toBeGreaterThan(-1);

    const block = ROUTE.slice(missing, ROUTE.indexOf('const pool = participant.sealedPool'));
    expect(block, 'it looks for the pool kept aside').toContain('sealedPoolClaim.findUnique');
    expect(block, 'and recreates the seat with it').toContain('tournamentParticipant.create');
    expect(block, 'reusing the very pool they built from').toContain('sealedPool: claim.pool');
  });

  it('a full tournament answers with a clear reason, not a raw 404', () => {
    const missing = ROUTE.indexOf('if (!participant) {');
    const block = ROUTE.slice(missing, ROUTE.indexOf('const pool = participant.sealedPool'));
    expect(block).toContain('tournament.error.sealedSeatLost');
    expect(block).toContain('seatsTaken >= tournament.maxPlayers');
  });

  it('a player with no pool at all still gets a named error', () => {
    const missing = ROUTE.indexOf('if (!participant) {');
    const block = ROUTE.slice(missing, ROUTE.indexOf('const pool = participant.sealedPool'));
    expect(block).toContain('tournament.error.notParticipant');
  });

  it('both messages exist in every language', () => {
    for (const loc of LOCALES) {
      const messages = JSON.parse(readFileSync(`messages/${loc}.json`, 'utf8'));
      expect(messages.tournament.error.sealedSeatLost, `${loc} seat lost`).toBeTruthy();
      expect(messages.tournament.error.notParticipant, `${loc} not participant`).toBeTruthy();
    }
  });
});

describe('the sealed build reservation itself', () => {
  it('grants a grace period on top of the build window', () => {
    expect(SEALED_BUILD_RESERVATION_MS).toBeGreaterThan(SEALED_BUILD_WINDOW_MS);
  });

  it('a confirmed deck is never treated as expired, however late', () => {
    const longAgo = new Date(Date.now() - SEALED_BUILD_RESERVATION_MS * 10);
    expect(isSealedRegistrationExpired({ joinedAt: longAgo, deckValid: true })).toBe(false);
  });

  it('an unconfirmed seat does expire, which is what releases it', () => {
    const longAgo = new Date(Date.now() - SEALED_BUILD_RESERVATION_MS - 1000);
    expect(isSealedRegistrationExpired({ joinedAt: longAgo, deckValid: false })).toBe(true);
  });
});
