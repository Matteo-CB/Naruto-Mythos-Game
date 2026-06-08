import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakeAuth = vi.fn();
vi.mock('@/lib/auth/authOptions', () => ({ auth: (...a: unknown[]) => fakeAuth(...a) }));

const userFindUnique = vi.fn();
const suggestionCount = vi.fn();
const suggestionFindFirst = vi.fn();
const suggestionCreate = vi.fn();
const suggestionGroupBy = vi.fn();
const suggestionFindMany = vi.fn();
const suggestionVoteFindMany = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    suggestion: {
      count: (...a: unknown[]) => suggestionCount(...a),
      findFirst: (...a: unknown[]) => suggestionFindFirst(...a),
      create: (...a: unknown[]) => suggestionCreate(...a),
      groupBy: (...a: unknown[]) => suggestionGroupBy(...a),
      findMany: (...a: unknown[]) => suggestionFindMany(...a),
    },
    suggestionVote: {
      findMany: (...a: unknown[]) => suggestionVoteFindMany(...a),
    },
  },
}));

import { POST, GET } from '@/app/api/suggestions/route';

function postReq(body: unknown): Request {
  return new Request('http://test/api/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getReq(qs: string = ''): Request {
  return new Request(`http://test/api/suggestions${qs}`);
}

const validBody = {
  category: 'bug',
  title: 'Naruto crash on play',
  body: 'Quand je joue Naruto 108 puis Itachi 091, la page freeze trois secondes.',
};

beforeEach(() => {
  fakeAuth.mockReset();
  userFindUnique.mockReset();
  suggestionCount.mockReset();
  suggestionFindFirst.mockReset();
  suggestionCreate.mockReset();
  suggestionGroupBy.mockReset();
  suggestionFindMany.mockReset();
  suggestionVoteFindMany.mockReset();
  suggestionGroupBy.mockResolvedValue([]);
});

describe('POST /api/suggestions (create)', () => {
  it('401 when not connected', async () => {
    fakeAuth.mockResolvedValue(null);
    const res = await POST(postReq(validBody) as never);
    expect(res.status).toBe(401);
  });

  it('400 when category is invalid', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    const res = await POST(postReq({ ...validBody, category: 'xss' }) as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.errorKey).toBe('helpUs.suggestions.error.invalidCategory');
  });

  it('400 when title too short', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    const res = await POST(postReq({ ...validBody, title: 'ab' }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).errorKey).toBe('helpUs.suggestions.error.tooShort');
  });

  it('400 when body too long', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    const res = await POST(postReq({ ...validBody, body: 'x'.repeat(2001) }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).errorKey).toBe('helpUs.suggestions.error.tooLong');
  });

  it('403 when the user is chat-banned', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    userFindUnique.mockResolvedValue({ chatBanned: true, chatBanUntil: null, username: 'u1name' });
    suggestionCount.mockResolvedValue(0);
    suggestionFindFirst.mockResolvedValue(null);
    const res = await POST(postReq(validBody) as never);
    expect(res.status).toBe(403);
    expect((await res.json()).errorKey).toBe('helpUs.suggestions.error.banned');
  });

  it('429 when 3 open suggestions already', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    userFindUnique.mockResolvedValue({ chatBanned: false, chatBanUntil: null, username: 'u1' });
    suggestionCount.mockResolvedValue(3);
    suggestionFindFirst.mockResolvedValue(null);
    const res = await POST(postReq(validBody) as never);
    expect(res.status).toBe(429);
    expect((await res.json()).errorKey).toBe('helpUs.suggestions.error.maxOpen');
  });

  it('429 with Retry-After when sending faster than 60s', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    userFindUnique.mockResolvedValue({ chatBanned: false, chatBanUntil: null, username: 'u1' });
    suggestionCount.mockResolvedValue(0);
    suggestionFindFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 5_000) });
    const res = await POST(postReq(validBody) as never);
    expect(res.status).toBe(429);
    expect((await res.json()).errorKey).toBe('helpUs.suggestions.error.rateLimited');
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('honeypot returns 200 silently and never creates a row', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    const res = await POST(postReq({ ...validBody, honeypot: 'bot' }) as never);
    expect(res.status).toBe(200);
    expect(suggestionCreate).not.toHaveBeenCalled();
  });

  it('201 on the happy path, returns the created row', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    userFindUnique.mockResolvedValue({ chatBanned: false, chatBanUntil: null, username: 'kutxyt' });
    suggestionCount.mockResolvedValue(0);
    suggestionFindFirst.mockResolvedValue(null);
    const fakeRow = {
      id: 'row1',
      userId: 'u1',
      username: 'kutxyt',
      category: 'bug',
      title: validBody.title,
      body: validBody.body,
      status: 'open',
      voteCount: 0,
      createdAt: new Date('2026-06-08T10:00:00Z'),
      updatedAt: new Date('2026-06-08T10:00:00Z'),
    };
    userFindUnique.mockReset();
    userFindUnique
      .mockResolvedValueOnce({ chatBanned: false, chatBanUntil: null })
      .mockResolvedValueOnce({ username: 'kutxyt' });
    suggestionCreate.mockResolvedValue(fakeRow);
    const res = await POST(postReq(validBody) as never);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe('row1');
    expect(json.status).toBe('open');
    expect(json.hasVoted).toBe(false);
  });
});

describe('GET /api/suggestions (list)', () => {
  it('returns rows + totalsByStatus + nextCursor null when fewer than limit', async () => {
    fakeAuth.mockResolvedValue(null);
    suggestionFindMany.mockResolvedValue([
      {
        id: 'a',
        userId: 'u',
        username: 'u',
        category: 'bug',
        title: 't',
        body: 'b',
        status: 'open',
        voteCount: 3,
        createdAt: new Date(1000),
        updatedAt: new Date(1000),
      },
    ]);
    suggestionGroupBy.mockResolvedValue([
      { status: 'open', _count: { _all: 5 } },
      { status: 'done', _count: { _all: 2 } },
    ]);
    const res = await GET(getReq('?sort=votes') as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0].hasVoted).toBe(false);
    expect(json.totalsByStatus.open).toBe(5);
    expect(json.totalsByStatus.done).toBe(2);
    expect(json.nextCursor).toBeNull();
  });

  it('returns nextCursor when rows.length === limit', async () => {
    fakeAuth.mockResolvedValue(null);
    const arr = Array.from({ length: 20 }, (_, i) => ({
      id: `id${i}`,
      userId: 'u',
      username: 'u',
      category: 'bug',
      title: 't',
      body: 'b',
      status: 'open',
      voteCount: 0,
      createdAt: new Date(i),
      updatedAt: new Date(i),
    }));
    suggestionFindMany.mockResolvedValue(arr);
    suggestionGroupBy.mockResolvedValue([]);
    const res = await GET(getReq('?limit=20') as never);
    const json = await res.json();
    expect(json.nextCursor).toBe('id19');
  });

  it('marks hasVoted=true for the viewer rows that have a vote', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'viewer' } });
    suggestionFindMany.mockResolvedValue([
      { id: 'a', userId: 'u', username: 'u', category: 'bug', title: 't', body: 'b', status: 'open', voteCount: 1, createdAt: new Date(1), updatedAt: new Date(1) },
      { id: 'b', userId: 'u', username: 'u', category: 'bug', title: 't', body: 'b', status: 'open', voteCount: 2, createdAt: new Date(2), updatedAt: new Date(2) },
    ]);
    suggestionVoteFindMany.mockResolvedValue([{ suggestionId: 'b' }]);
    suggestionGroupBy.mockResolvedValue([]);
    const res = await GET(getReq('') as never);
    const json = await res.json();
    expect(json.rows.find((r: { id: string; hasVoted: boolean }) => r.id === 'a').hasVoted).toBe(false);
    expect(json.rows.find((r: { id: string; hasVoted: boolean }) => r.id === 'b').hasVoted).toBe(true);
  });
});
