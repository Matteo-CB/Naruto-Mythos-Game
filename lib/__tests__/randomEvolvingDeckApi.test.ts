import { describe, it, expect } from 'vitest';
import { GET as GetRandomDeck } from '../../app/api/random-evolving-deck/route';
import { computeDeckEvolvingPoints, extractSetFromCardId } from '@/lib/evolving/computePoints';
import { EVOLVING_MAX_POINTS } from '@/lib/evolving/constants';

function makeReq(): Request {
  return new Request('http://localhost/api/random-evolving-deck');
}

describe('Phase 7 — GET /api/random-evolving-deck', () => {
  it('returns a deck with 30 character cards', async () => {
    const res = await GetRandomDeck(makeReq() as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.cardIds.length).toBeGreaterThanOrEqual(30);
  });

  it('returns a deck with exactly 3 missions', async () => {
    const res = await GetRandomDeck(makeReq() as never);
    const data = await res.json();
    expect(data.missionIds.length).toBe(3);
  });

  it('every card is from the KS set', async () => {
    const res = await GetRandomDeck(makeReq() as never);
    const data = await res.json();
    for (const id of data.cardIds) {
      expect(extractSetFromCardId(id)).toBe('KS');
    }
    for (const id of data.missionIds) {
      expect(extractSetFromCardId(id)).toBe('KS');
    }
  });

  it('the deck is Evolving-compatible (evolvingPoints <= 5)', async () => {
    const res = await GetRandomDeck(makeReq() as never);
    const data = await res.json();
    expect(data.evolvingPoints).toBeLessThanOrEqual(EVOLVING_MAX_POINTS);
    expect(computeDeckEvolvingPoints(data.cardIds)).toBe(data.evolvingPoints);
  });

  it('the deck is 0pt by construction (no Hero cards included)', async () => {
    const res = await GetRandomDeck(makeReq() as never);
    const data = await res.json();
    expect(data.evolvingPoints).toBe(0);
  });

  it('no version has more than 2 copies', async () => {
    const res = await GetRandomDeck(makeReq() as never);
    const data = await res.json();
    const counts = new Map<string, number>();
    for (const id of data.cardIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const [, count] of counts) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it('returns a name field for the deck', async () => {
    const res = await GetRandomDeck(makeReq() as never);
    const data = await res.json();
    expect(typeof data.name).toBe('string');
    expect(data.name.length).toBeGreaterThan(0);
  });
});
