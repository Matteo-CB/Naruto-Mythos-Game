import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { isAdmin } from '@/lib/auth/admins';
import { prisma } from '@/lib/db/prisma';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const ALLOWED_STATUSES = new Set(['pending', 'succeeded', 'failed', 'refunded', 'cancelled']);
const ALLOWED_MODES = new Set(['payment', 'subscription']);

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function clampLimit(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_LIMIT;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, n));
}

function startOfMonth(now: number = Date.now()): Date {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!isAdmin({ username: session?.user?.name ?? null, email: session?.user?.email ?? null })) {
    return NextResponse.json({ errorKey: 'helpUs.admin.error.notAdmin' }, { status: 403 });
  }

  const url = new URL(req.url);
  const sp = url.searchParams;

  const statusParam = sp.get('status');
  const modeParam = sp.get('mode');
  const dateFrom = parseDate(sp.get('dateFrom'));
  const dateTo = parseDate(sp.get('dateTo'));
  const limit = clampLimit(sp.get('limit'));
  const cursor = sp.get('cursor');

  const where: Record<string, unknown> = {};
  if (statusParam && ALLOWED_STATUSES.has(statusParam)) where.status = statusParam;
  if (modeParam && ALLOWED_MODES.has(modeParam)) where.mode = modeParam;
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt.gte = dateFrom;
    if (dateTo) createdAt.lte = dateTo;
    where.createdAt = createdAt;
  }

  let rows;
  if (cursor) {
    rows = await prisma.donation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      cursor: { id: cursor },
      skip: 1,
    });
  } else {
    rows = await prisma.donation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  const monthStart = startOfMonth();
  const [monthAgg, lifetimeAgg, activeSubs] = await Promise.all([
    prisma.donation.aggregate({
      where: { status: 'succeeded', paidAt: { gte: monthStart } },
      _sum: { amountCents: true },
    }),
    prisma.donation.aggregate({
      where: { status: 'succeeded' },
      _sum: { amountCents: true },
    }),
    prisma.donation.findMany({
      where: { isRecurring: true, status: 'succeeded', cancelledAt: null, stripeSubscriptionId: { not: null } },
      select: { stripeSubscriptionId: true },
      distinct: ['stripeSubscriptionId'],
    }),
  ]);

  const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;

  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
      amountCents: r.amountCents,
      currency: r.currency,
      mode: r.mode,
      status: r.status,
      isRecurring: r.isRecurring,
      userId: r.userId,
      userEmail: r.userEmail,
      username: r.username,
      stripeChargeId: r.stripeChargeId,
      stripeSessionId: r.stripeSessionId,
    })),
    nextCursor,
    totals: {
      monthCents: monthAgg._sum.amountCents ?? 0,
      lifetimeCents: lifetimeAgg._sum.amountCents ?? 0,
      activeSubscriptions: activeSubs.length,
    },
  });
}
