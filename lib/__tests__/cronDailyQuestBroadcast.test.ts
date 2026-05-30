import { describe, it, expect, vi, beforeEach } from 'vitest';

const ensureMock = vi.fn();
vi.mock('@/lib/quests/dailyAssignment', () => ({
  ensureTodaysDailyQuest: (...a: unknown[]) => ensureMock(...a),
}));

const ioEmit = vi.fn();
const getIOMock = vi.fn();
vi.mock('@/lib/socket/io', () => ({
  getIO: () => getIOMock(),
}));

import { GET, POST } from '@/app/api/cron/daily-quest/route';

function makeReq(secret: string | null): Request {
  const headers: Record<string, string> = {};
  if (secret) headers['authorization'] = `Bearer ${secret}`;
  return new Request('http://test/api/cron/daily-quest', { method: 'POST', headers });
}

describe('GET/POST /api/cron/daily-quest', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    ensureMock.mockReset();
    ioEmit.mockReset();
    getIOMock.mockReset();
    process.env.CRON_SECRET = 'test-secret-123';
  });

  it('returns 401 without authorization header', async () => {
    const res = await POST(makeReq(null) as never);
    expect(res.status).toBe(401);
    expect(ensureMock).not.toHaveBeenCalled();
  });

  it('returns 401 with wrong secret', async () => {
    const res = await POST(makeReq('wrong-secret') as never);
    expect(res.status).toBe(401);
  });

  it('returns 200 with correct secret and assignment data', async () => {
    ensureMock.mockResolvedValue({
      date: '2026-05-26',
      quest: { id: 'discard-10', level: 1 },
      created: true,
    });
    getIOMock.mockReturnValue({ emit: ioEmit });
    const res = await POST(makeReq('test-secret-123') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.date).toBe('2026-05-26');
    expect(body.questId).toBe('discard-10');
    expect(body.level).toBe(1);
    expect(body.created).toBe(true);
  });

  it('broadcasts daily-quest:rotated when a NEW assignment was created', async () => {
    ensureMock.mockResolvedValue({
      date: '2026-05-26',
      quest: { id: 'discard-10', level: 1 },
      created: true,
    });
    getIOMock.mockReturnValue({ emit: ioEmit });
    await POST(makeReq('test-secret-123') as never);
    expect(ioEmit).toHaveBeenCalledWith('daily-quest:rotated', expect.objectContaining({
      date: '2026-05-26',
      questId: 'discard-10',
    }));
  });

  it('does NOT broadcast when assignment was already there (created=false)', async () => {
    ensureMock.mockResolvedValue({
      date: '2026-05-26',
      quest: { id: 'discard-10', level: 1 },
      created: false,
    });
    getIOMock.mockReturnValue({ emit: ioEmit });
    await POST(makeReq('test-secret-123') as never);
    expect(ioEmit).not.toHaveBeenCalled();
  });

  it('does NOT throw when IO is not available (e.g. early boot)', async () => {
    ensureMock.mockResolvedValue({
      date: '2026-05-26',
      quest: { id: 'discard-10', level: 1 },
      created: true,
    });
    getIOMock.mockReturnValue(null);
    const res = await POST(makeReq('test-secret-123') as never);
    expect(res.status).toBe(200);
  });

  it('GET also works (same handler)', async () => {
    ensureMock.mockResolvedValue({
      date: '2026-05-26',
      quest: { id: 'discard-10', level: 1 },
      created: true,
    });
    getIOMock.mockReturnValue({ emit: ioEmit });
    const res = await GET(makeReq('test-secret-123') as never);
    expect(res.status).toBe(200);
  });

  it('returns 500 when ensureTodaysDailyQuest throws', async () => {
    ensureMock.mockRejectedValue(new Error('boom'));
    const res = await POST(makeReq('test-secret-123') as never);
    expect(res.status).toBe(500);
  });

  afterAll();

  function afterAll() {
    process.env.CRON_SECRET = originalSecret;
  }
});
