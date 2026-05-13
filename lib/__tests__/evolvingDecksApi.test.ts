import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    deck: { findMany: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  },
}));

vi.mock('@/lib/auth/authOptions', () => ({ auth: vi.fn() }));

import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/authOptions';
import { GET as GetDecks } from '../../app/api/decks/route';

const p = prisma as unknown as { deck: { findMany: ReturnType<typeof vi.fn> } };
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

function makeReq(qs = ''): Request {
  return new Request(`http://localhost/api/decks${qs}`);
}

beforeEach(() => {
  authMock.mockReset();
  p.deck.findMany.mockReset();
});

describe('Phase 7 — GET /api/decks ?evolving=true filter', () => {
  it('returns 401 without auth', async () => {
    authMock.mockResolvedValue(null);
    const res = await GetDecks(makeReq('?evolving=true') as never);
    expect(res.status).toBe(401);
  });

  it('without ?evolving=true, returns all decks (no evolving filter applied)', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.deck.findMany.mockResolvedValue([
      { id: 'd1', name: 'D1', evolvingPoints: 3, evolvingCompatible: true, cardIds: ['KS-001-C'], missionIds: ['KS-MSS-01'] },
      { id: 'd2', name: 'D2', evolvingPoints: 8, evolvingCompatible: false, cardIds: ['KS-001-C'], missionIds: ['KS-MSS-01'] },
    ]);
    const res = await GetDecks(makeReq('') as never);
    expect(res.status).toBe(200);
    const call = p.deck.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ userId: 'u1' });
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it('with ?evolving=true, filters to evolvingCompatible decks only (in JS)', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.deck.findMany.mockResolvedValue([
      { id: 'd1', name: 'D1', evolvingPoints: 3, evolvingCompatible: true, cardIds: ['KS-001-C'], missionIds: ['KS-MSS-01'] },
      { id: 'd2', name: 'D2', evolvingPoints: 8, evolvingCompatible: false, cardIds: ['KS-001-C'], missionIds: ['KS-MSS-01'] },
    ]);
    const res = await GetDecks(makeReq('?evolving=true') as never);
    const call = p.deck.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ userId: 'u1' });
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('d1');
  });

  it('with ?evolving=false explicitly, does NOT filter', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.deck.findMany.mockResolvedValue([]);
    await GetDecks(makeReq('?evolving=false') as never);
    const call = p.deck.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ userId: 'u1' });
  });

  it('backfills evolvingCompatible on the fly for KS-only decks whose flag was never computed', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    const fakeDecks = [
      { id: 'd1', name: 'D1', evolvingPoints: 3, evolvingCompatible: false, cardIds: ['KS-001-C'], missionIds: ['KS-MSS-01'] },
      { id: 'd2', name: 'D2', evolvingPoints: 5, evolvingCompatible: true, cardIds: ['KS-002-C'], missionIds: ['KS-MSS-01'] },
    ];
    p.deck.findMany.mockResolvedValue(fakeDecks);
    const res = await GetDecks(makeReq('?evolving=true') as never);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body.find((d: { id: string }) => d.id === 'd1').evolvingCompatible).toBe(true);
  });
});
