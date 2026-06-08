import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  VALIDATION_ERROR_KEYS,
  isCategory,
  isStatus,
  validateSuggestionPayload,
} from '@/lib/suggestions/validation';
import {
  buildSuggestionWhere,
  checkUserCanCreate,
  compareByStatus,
  getTotalsByStatus,
  type SortOption,
} from '@/lib/suggestions/queries';

function parseSort(value: string | null): SortOption {
  if (value === 'recent' || value === 'status' || value === 'votes') return value;
  return 'votes';
}

function clampLimit(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_PAGE_LIMIT;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_LIMIT;
  return Math.min(MAX_PAGE_LIMIT, Math.max(1, n));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sp = url.searchParams;
  const sort = parseSort(sp.get('sort'));
  const limit = clampLimit(sp.get('limit'));
  const cursor = sp.get('cursor');
  const categoryParam = sp.get('category');
  const statusParam = sp.get('status');
  const q = sp.get('q');

  const where = buildSuggestionWhere({
    category: isCategory(categoryParam) ? categoryParam : null,
    status: isStatus(statusParam) ? statusParam : null,
    q,
  });

  let rows: Array<{
    id: string;
    userId: string;
    username: string;
    category: string;
    title: string;
    body: string;
    status: string;
    voteCount: number;
    createdAt: Date;
    updatedAt: Date;
  }>;

  if (sort === 'status') {
    const all = await prisma.suggestion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: MAX_PAGE_LIMIT * 2,
    });
    rows = all.sort(compareByStatus).slice(0, limit);
  } else {
    const orderBy = sort === 'recent'
      ? [{ createdAt: 'desc' as const }]
      : [{ voteCount: 'desc' as const }, { createdAt: 'desc' as const }];
    if (cursor) {
      rows = await prisma.suggestion.findMany({
        where,
        orderBy,
        take: limit,
        cursor: { id: cursor },
        skip: 1,
      });
    } else {
      rows = await prisma.suggestion.findMany({
        where,
        orderBy,
        take: limit,
      });
    }
  }

  const session = await auth();
  const viewerId = session?.user?.id ?? null;
  let votedSet = new Set<string>();
  if (viewerId && rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const votes = await prisma.suggestionVote.findMany({
      where: { userId: viewerId, suggestionId: { in: ids } },
      select: { suggestionId: true },
    });
    votedSet = new Set(votes.map((v) => v.suggestionId));
  }

  const totalsByStatus = await getTotalsByStatus();
  const nextCursor = sort !== 'status' && rows.length === limit ? rows[rows.length - 1].id : null;

  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      username: r.username,
      category: r.category,
      title: r.title,
      body: r.body,
      status: r.status,
      voteCount: r.voteCount,
      hasVoted: votedSet.has(r.id),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    nextCursor,
    totalsByStatus,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ errorKey: 'helpUs.suggestions.error.loginRequired' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ errorKey: 'helpUs.suggestions.error.invalidCategory' }, { status: 400 });
  }

  if ((payload as { honeypot?: unknown })?.honeypot) {
    return NextResponse.json({ ok: true, honeypot: true });
  }

  const validation = validateSuggestionPayload(payload);
  if (!validation.ok) {
    return NextResponse.json({ errorKey: VALIDATION_ERROR_KEYS[validation.reason] }, { status: 400 });
  }

  const gate = await checkUserCanCreate(userId);
  if (gate.banned) {
    return NextResponse.json({ errorKey: 'helpUs.suggestions.error.banned' }, { status: 403 });
  }
  if (gate.tooManyOpen) {
    return NextResponse.json({ errorKey: 'helpUs.suggestions.error.maxOpen' }, { status: 429 });
  }
  if (gate.rateLimited) {
    return NextResponse.json(
      { errorKey: 'helpUs.suggestions.error.rateLimited' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(gate.retryAfterMs / 1000)) } },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  if (!user) {
    return NextResponse.json({ errorKey: 'helpUs.suggestions.error.banned' }, { status: 403 });
  }

  const created = await prisma.suggestion.create({
    data: {
      userId,
      username: user.username,
      category: validation.data.category,
      title: validation.data.title,
      body: validation.data.body,
      status: 'open',
      voteCount: 0,
    },
  });

  return NextResponse.json(
    {
      id: created.id,
      userId: created.userId,
      username: created.username,
      category: created.category,
      title: created.title,
      body: created.body,
      status: created.status,
      voteCount: created.voteCount,
      hasVoted: false,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    },
    { status: 201 },
  );
}
