import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakeAuth = vi.fn();
vi.mock('@/lib/auth/authOptions', () => ({ auth: (...a: unknown[]) => fakeAuth(...a) }));

const findMany = vi.fn();
const aggregate = vi.fn();
const distinctFindMany = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    donation: {
      findMany: (args: { distinct?: unknown }) => {
        if (args?.distinct) return distinctFindMany(args);
        return findMany(args);
      },
      aggregate: (...a: unknown[]) => aggregate(...a),
    },
  },
}));

import { GET } from '@/app/api/admin/donations/route';

function getReq(qs: string = ''): Request {
  return new Request(`http://test/api/admin/donations${qs}`);
}

const adminSession = { user: { id: 'admin', name: 'Kutxyt', email: null } };
const nonAdminSession = { user: { id: 'normal', name: 'someone', email: 'someone@b.c' } };

beforeEach(() => {
  fakeAuth.mockReset();
  findMany.mockReset();
  aggregate.mockReset();
  distinctFindMany.mockReset();
});

describe('GET /api/admin/donations', () => {
  it('returns 403 for non-admin', async () => {
    fakeAuth.mockResolvedValue(nonAdminSession);
    const res = await GET(getReq() as never);
    expect(res.status).toBe(403);
  });

  it('returns 403 for unauthenticated', async () => {
    fakeAuth.mockResolvedValue(null);
    const res = await GET(getReq() as never);
    expect(res.status).toBe(403);
  });

  it('returns rows + totals on the happy path', async () => {
    fakeAuth.mockResolvedValue(adminSession);
    const rows = [
      {
        id: 'd1',
        createdAt: new Date('2026-06-08T10:00:00Z'),
        paidAt: new Date('2026-06-08T10:01:00Z'),
        amountCents: 500,
        currency: 'eur',
        mode: 'payment',
        status: 'succeeded',
        isRecurring: false,
        userId: 'u1',
        userEmail: 'a@b.c',
        username: 'kut',
        stripeChargeId: 'ch_x',
        stripeSessionId: 'cs_x',
      },
    ];
    findMany.mockResolvedValue(rows);
    aggregate
      .mockResolvedValueOnce({ _sum: { amountCents: 1500 } })
      .mockResolvedValueOnce({ _sum: { amountCents: 999_999 } });
    distinctFindMany.mockResolvedValue([{ stripeSubscriptionId: 'sub_1' }, { stripeSubscriptionId: 'sub_2' }]);

    const res = await GET(getReq() as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0].stripeChargeId).toBe('ch_x');
    expect(json.totals.monthCents).toBe(1500);
    expect(json.totals.lifetimeCents).toBe(999_999);
    expect(json.totals.activeSubscriptions).toBe(2);
    expect(json.nextCursor).toBeNull();
  });

  it('applies status / mode / date filters from query string', async () => {
    fakeAuth.mockResolvedValue(adminSession);
    findMany.mockResolvedValue([]);
    aggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
    distinctFindMany.mockResolvedValue([]);

    await GET(getReq('?status=succeeded&mode=subscription&dateFrom=2026-01-01T00:00:00Z&dateTo=2026-06-01T00:00:00Z') as never);

    const where = (findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.status).toBe('succeeded');
    expect(where.mode).toBe('subscription');
    const range = where.createdAt as { gte: Date; lte: Date };
    expect(range.gte).toBeInstanceOf(Date);
    expect(range.lte).toBeInstanceOf(Date);
    expect(range.gte.getUTCFullYear()).toBe(2026);
  });

  it('ignores unknown status values silently', async () => {
    fakeAuth.mockResolvedValue(adminSession);
    findMany.mockResolvedValue([]);
    aggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
    distinctFindMany.mockResolvedValue([]);

    await GET(getReq('?status=xss&mode=foobar') as never);

    const where = (findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.status).toBeUndefined();
    expect(where.mode).toBeUndefined();
  });

  it('returns nextCursor when rows.length === limit', async () => {
    fakeAuth.mockResolvedValue(adminSession);
    const rows = Array.from({ length: 50 }, (_, i) => ({
      id: `d${i}`,
      createdAt: new Date(i),
      paidAt: null,
      amountCents: 100,
      currency: 'eur',
      mode: 'payment',
      status: 'pending',
      isRecurring: false,
      userId: null,
      userEmail: null,
      username: null,
      stripeChargeId: null,
      stripeSessionId: `cs_${i}`,
    }));
    findMany.mockResolvedValue(rows);
    aggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
    distinctFindMany.mockResolvedValue([]);

    const res = await GET(getReq() as never);
    const json = await res.json();
    expect(json.nextCursor).toBe('d49');
  });

  it('applies cursor pagination params when cursor provided', async () => {
    fakeAuth.mockResolvedValue(adminSession);
    findMany.mockResolvedValue([]);
    aggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
    distinctFindMany.mockResolvedValue([]);

    await GET(getReq('?cursor=d10') as never);

    const arg = findMany.mock.calls[0][0] as { cursor: { id: string }; skip: number };
    expect(arg.cursor).toEqual({ id: 'd10' });
    expect(arg.skip).toBe(1);
  });
});
