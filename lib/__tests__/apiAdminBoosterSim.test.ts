import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakeAuth = vi.fn();
vi.mock('@/lib/auth/authOptions', () => ({ auth: (...a: unknown[]) => fakeAuth(...a) }));

const findUniqueUser = vi.fn();
vi.mock('@/lib/db/prisma', () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => findUniqueUser(...a) } },
}));

import { POST } from '@/app/api/admin/booster-simulator/route';
import { VARIANT_PACK_SIZE } from '@/lib/variants/constants';

function makeReq(body: unknown): Request {
  return new Request('http://test/api/admin/booster-simulator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/booster-simulator', () => {
  beforeEach(() => {
    fakeAuth.mockReset();
    findUniqueUser.mockReset();
  });

  it('returns 401 unauthenticated', async () => {
    fakeAuth.mockResolvedValue(null);
    const res = await POST(makeReq({ setId: 'KS', mode: 'normal', count: 10 }) as never);
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u-normal' } });
    findUniqueUser.mockResolvedValue({ username: 'randomplayer', email: 'random@example.com' });
    const res = await POST(makeReq({ setId: 'KS', mode: 'normal', count: 10 }) as never);
    expect(res.status).toBe(403);
  });

  it('returns 400 if setId is missing or unavailable', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u-admin' } });
    findUniqueUser.mockResolvedValue({ username: 'Kutxyt', email: null });
    const res = await POST(makeReq({ setId: 'XX', mode: 'normal', count: 10 }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 if count is not in the whitelist', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u-admin' } });
    findUniqueUser.mockResolvedValue({ username: 'Kutxyt', email: null });
    const res = await POST(makeReq({ setId: 'KS', mode: 'normal', count: 7 }) as never);
    expect(res.status).toBe(400);
  });

  it('returns simulation data for valid admin request (count=10, mode=normal)', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u-admin' } });
    findUniqueUser.mockResolvedValue({ username: 'Kutxyt', email: null });
    const res = await POST(makeReq({ setId: 'KS', mode: 'normal', count: 10 }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.setId).toBe('KS');
    expect(body.mode).toBe('normal');
    expect(body.count).toBe(10);
    expect(body.totalSlots).toBe(10 * VARIANT_PACK_SIZE);
    expect(body.perRarityCounts).toHaveProperty('RA');
    expect(body.perRarityCounts).toHaveProperty('MV');
    expect(body.perRarityCounts).toHaveProperty('SV');
    expect(body.perRarityCounts).toHaveProperty('L');
    expect(body.perRarityCounts).toHaveProperty('HOLO_C');
    expect(body.perRarityCounts).toHaveProperty('HOLO_UC');
    expect(body.perRarityExpected.RA).toBeGreaterThan(10);
    expect(body.perRarityExpected.HOLO_C).toBeGreaterThan(40);
    expect(body.sampleBoosterCardIds.length).toBeGreaterThan(0);
  });

  it('forceL mode produces at least `count` Legendary cards', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u-admin' } });
    findUniqueUser.mockResolvedValue({ username: 'Kutxyt', email: null });
    const res = await POST(makeReq({ setId: 'KS', mode: 'forceL', count: 100 }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.perRarityCounts.L).toBeGreaterThanOrEqual(100);
    expect(body.perRarityExpected.L).toBeGreaterThanOrEqual(100);
  });

  it('forceSV mode produces at least `count` Secret Variant cards', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u-admin' } });
    findUniqueUser.mockResolvedValue({ username: 'Kutxyt', email: null });
    const res = await POST(makeReq({ setId: 'KS', mode: 'forceSV', count: 100 }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.perRarityCounts.SV).toBeGreaterThanOrEqual(100);
    expect(body.perRarityExpected.SV).toBeGreaterThanOrEqual(100);
  });

  it('admin by email is also accepted', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u-admin-by-email' } });
    findUniqueUser.mockResolvedValue({ username: 'whoever', email: 'matteo.biyikli3224@gmail.com' });
    const res = await POST(makeReq({ setId: 'KS', mode: 'normal', count: 1 }) as never);
    expect(res.status).toBe(200);
  });

  it('returns 400 on invalid body json', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u-admin' } });
    findUniqueUser.mockResolvedValue({ username: 'Kutxyt', email: null });
    const req = new Request('http://test/api/admin/booster-simulator', { method: 'POST', body: 'not-json' });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});
