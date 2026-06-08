import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakeAuth = vi.fn();
vi.mock('@/lib/auth/authOptions', () => ({ auth: (...a: unknown[]) => fakeAuth(...a) }));

const suggestionFindUnique = vi.fn();
const userFindUnique = vi.fn();
const voteFindUnique = vi.fn();
const voteCreate = vi.fn();
const voteDelete = vi.fn();
const suggestionUpdate = vi.fn();
const transaction = vi.fn(async (ops: unknown[]) => Promise.all(ops));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    suggestion: {
      findUnique: (...a: unknown[]) => suggestionFindUnique(...a),
      update: (...a: unknown[]) => suggestionUpdate(...a),
    },
    suggestionVote: {
      findUnique: (...a: unknown[]) => voteFindUnique(...a),
      create: (...a: unknown[]) => voteCreate(...a),
      delete: (...a: unknown[]) => voteDelete(...a),
    },
    $transaction: (ops: unknown[]) => transaction(ops),
  },
}));

import { POST } from '@/app/api/suggestions/[id]/vote/route';

function req(): Request {
  return new Request('http://test/api/suggestions/abc/vote', { method: 'POST' });
}

beforeEach(() => {
  fakeAuth.mockReset();
  suggestionFindUnique.mockReset();
  userFindUnique.mockReset();
  voteFindUnique.mockReset();
  voteCreate.mockReset();
  voteDelete.mockReset();
  suggestionUpdate.mockReset();
});

describe('POST /api/suggestions/[id]/vote', () => {
  it('401 unauthenticated', async () => {
    fakeAuth.mockResolvedValue(null);
    const res = await POST(req() as never, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(401);
  });

  it('404 when suggestion does not exist', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    suggestionFindUnique.mockResolvedValue(null);
    const res = await POST(req() as never, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(404);
  });

  it('403 when user is chat-banned', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    suggestionFindUnique.mockResolvedValue({ id: 'abc' });
    userFindUnique.mockResolvedValue({ chatBanned: true, chatBanUntil: null });
    const res = await POST(req() as never, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(403);
  });

  it('creates the vote and increments voteCount when not voted before', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    suggestionFindUnique
      .mockResolvedValueOnce({ id: 'abc' })
      .mockResolvedValueOnce({ voteCount: 6 });
    userFindUnique.mockResolvedValue({ chatBanned: false, chatBanUntil: null });
    voteFindUnique.mockResolvedValue(null);
    voteCreate.mockResolvedValue({ id: 'v1' });
    suggestionUpdate.mockResolvedValue({ voteCount: 6 });

    const res = await POST(req() as never, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.voteCount).toBe(6);
    expect(json.hasVoted).toBe(true);
    expect(voteCreate).toHaveBeenCalled();
    expect(voteDelete).not.toHaveBeenCalled();
  });

  it('removes the vote and decrements voteCount when toggling off', async () => {
    fakeAuth.mockResolvedValue({ user: { id: 'u1' } });
    suggestionFindUnique
      .mockResolvedValueOnce({ id: 'abc' })
      .mockResolvedValueOnce({ voteCount: 4 });
    userFindUnique.mockResolvedValue({ chatBanned: false, chatBanUntil: null });
    voteFindUnique.mockResolvedValue({ id: 'v1' });
    voteDelete.mockResolvedValue({ id: 'v1' });
    suggestionUpdate.mockResolvedValue({ voteCount: 4 });

    const res = await POST(req() as never, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.hasVoted).toBe(false);
    expect(voteDelete).toHaveBeenCalled();
    expect(voteCreate).not.toHaveBeenCalled();
  });
});
