import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    quizScore: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/db/prisma';
import { GET } from '../../app/api/quiz/leaderboard/route';

const p = prisma as unknown as {
  quizScore: { findMany: ReturnType<typeof vi.fn> };
  user: { findMany: ReturnType<typeof vi.fn> };
};

function makeReq(qs: string): Request {
  return new Request(`http://localhost/api/quiz/leaderboard${qs}`);
}

beforeEach(() => {
  p.quizScore.findMany.mockReset();
  p.user.findMany.mockReset();
});

describe('GET /api/quiz/leaderboard — data shape contract', () => {
  it('returns entries with completedAt (ISO string) and accuracy as 0-1 decimal', async () => {
    p.quizScore.findMany.mockResolvedValue([
      {
        userId: 'u1',
        bestByDiff: {
          '1': { score: 100, correct: 8, total: 10, bestStreak: 5, at: Date.UTC(2026, 0, 15) },
          '3': { score: 250, correct: 18, total: 20, bestStreak: 10, at: Date.UTC(2026, 0, 16) },
        },
        totalRuns: 2,
        updatedAt: new Date(),
      },
    ]);
    p.user.findMany.mockResolvedValue([{ id: 'u1', username: 'Alice' }]);

    const res = await GET(makeReq('') as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.entries)).toBe(true);
    expect(data.entries.length).toBe(2);

    const top = data.entries[0];
    expect(top.username).toBe('Alice');
    expect(top.score).toBe(250);
    expect(top.difficulty).toBe(3);
    expect(top.correct).toBe(18);
    expect(top.total).toBe(20);
    expect(top.bestStreak).toBe(10);
    expect(top.rank).toBe(1);
    expect(typeof top.completedAt).toBe('string');
    expect(top.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof top.accuracy).toBe('number');
    expect(top.accuracy).toBeGreaterThan(0);
    expect(top.accuracy).toBeLessThanOrEqual(1);
    expect(top.accuracy).toBeCloseTo(0.9, 5);
  });

  it('filters by difficulty when difficulty=3', async () => {
    p.quizScore.findMany.mockResolvedValue([
      {
        userId: 'u1',
        bestByDiff: {
          '1': { score: 100, correct: 8, total: 10, bestStreak: 5, at: Date.now() },
          '3': { score: 250, correct: 18, total: 20, bestStreak: 10, at: Date.now() },
        },
        totalRuns: 2,
        updatedAt: new Date(),
      },
    ]);
    p.user.findMany.mockResolvedValue([{ id: 'u1', username: 'Alice' }]);

    const res = await GET(makeReq('?difficulty=3') as never);
    const data = await res.json();
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].difficulty).toBe(3);
    expect(data.entries[0].score).toBe(250);
  });

  it('returns 400 for invalid difficulty', async () => {
    const res = await GET(makeReq('?difficulty=9') as never);
    expect(res.status).toBe(400);
  });

  it('sorts entries by score descending', async () => {
    p.quizScore.findMany.mockResolvedValue([
      {
        userId: 'u1',
        bestByDiff: { '1': { score: 100, correct: 8, total: 10, bestStreak: 5, at: Date.now() } },
        totalRuns: 1, updatedAt: new Date(),
      },
      {
        userId: 'u2',
        bestByDiff: { '1': { score: 300, correct: 10, total: 10, bestStreak: 10, at: Date.now() } },
        totalRuns: 1, updatedAt: new Date(),
      },
      {
        userId: 'u3',
        bestByDiff: { '1': { score: 200, correct: 9, total: 10, bestStreak: 8, at: Date.now() } },
        totalRuns: 1, updatedAt: new Date(),
      },
    ]);
    p.user.findMany.mockResolvedValue([
      { id: 'u1', username: 'Alice' },
      { id: 'u2', username: 'Bob' },
      { id: 'u3', username: 'Carol' },
    ]);

    const res = await GET(makeReq('?difficulty=1') as never);
    const data = await res.json();
    expect(data.entries.map((e: { username: string }) => e.username)).toEqual(['Bob', 'Carol', 'Alice']);
    expect(data.entries[0].rank).toBe(1);
    expect(data.entries[1].rank).toBe(2);
    expect(data.entries[2].rank).toBe(3);
  });

  it('handles edge case: zero accuracy (no correct answers)', async () => {
    p.quizScore.findMany.mockResolvedValue([
      {
        userId: 'u1',
        bestByDiff: { '1': { score: 0, correct: 0, total: 10, bestStreak: 0, at: Date.now() } },
        totalRuns: 1, updatedAt: new Date(),
      },
    ]);
    p.user.findMany.mockResolvedValue([{ id: 'u1', username: 'Alice' }]);

    const res = await GET(makeReq('') as never);
    const data = await res.json();
    expect(data.entries[0].accuracy).toBe(0);
  });

  it('handles edge case: perfect accuracy', async () => {
    p.quizScore.findMany.mockResolvedValue([
      {
        userId: 'u1',
        bestByDiff: { '1': { score: 500, correct: 10, total: 10, bestStreak: 10, at: Date.now() } },
        totalRuns: 1, updatedAt: new Date(),
      },
    ]);
    p.user.findMany.mockResolvedValue([{ id: 'u1', username: 'Alice' }]);

    const res = await GET(makeReq('') as never);
    const data = await res.json();
    expect(data.entries[0].accuracy).toBe(1);
  });

  it('paginates with limit and offset', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      userId: `u${i}`,
      bestByDiff: { '1': { score: (10 - i) * 10, correct: i, total: 10, bestStreak: i, at: Date.now() } },
      totalRuns: 1, updatedAt: new Date(),
    }));
    p.quizScore.findMany.mockResolvedValue(rows);
    p.user.findMany.mockResolvedValue(rows.map((r, i) => ({ id: r.userId, username: `User${i}` })));

    const res = await GET(makeReq('?limit=3&offset=2') as never);
    const data = await res.json();
    expect(data.entries).toHaveLength(3);
    expect(data.total).toBe(10);
    expect(data.limit).toBe(3);
    expect(data.offset).toBe(2);
    expect(data.entries[0].rank).toBe(3);
  });

  it('skips entries with no matching user', async () => {
    p.quizScore.findMany.mockResolvedValue([
      {
        userId: 'u_ghost',
        bestByDiff: { '1': { score: 999, correct: 10, total: 10, bestStreak: 10, at: Date.now() } },
        totalRuns: 1, updatedAt: new Date(),
      },
      {
        userId: 'u1',
        bestByDiff: { '1': { score: 100, correct: 5, total: 10, bestStreak: 3, at: Date.now() } },
        totalRuns: 1, updatedAt: new Date(),
      },
    ]);
    p.user.findMany.mockResolvedValue([{ id: 'u1', username: 'Alice' }]);

    const res = await GET(makeReq('') as never);
    const data = await res.json();
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].username).toBe('Alice');
  });
});
