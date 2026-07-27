import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => null),
    },
  },
}));

vi.mock('@/lib/discord/tournamentRoles', () => ({
  isDiscordMember: vi.fn(async () => false),
}));

import { sendTournamentResults } from '@/lib/discord/tournamentWebhook';

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_WEBHOOK_ENV = process.env.TOURNOI_WINNER_WEBHOOK;

function makeFetchMock() {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => '',
  })) as unknown as typeof fetch;
}

describe('sendTournamentResults: regression-proof contract', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_WEBHOOK_ENV === undefined) delete process.env.TOURNOI_WINNER_WEBHOOK;
    else process.env.TOURNOI_WINNER_WEBHOOK = ORIGINAL_WEBHOOK_ENV;
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('warns and skips when TOURNOI_WINNER_WEBHOOK is not set', async () => {
    delete process.env.TOURNOI_WINNER_WEBHOOK;
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock;

    await sendTournamentResults('Test Cup', [{ userId: 'u1', username: 'Alice', place: 1 }], 8, 'Tournament Winner 1', true);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('TOURNOI_WINNER_WEBHOOK not set'));
  });

  it('warns and skips when podium is empty', async () => {
    process.env.TOURNOI_WINNER_WEBHOOK = 'https://discord.com/api/webhooks/fake/token';
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock;

    await sendTournamentResults('Test Cup', [], 0, null, true);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Empty podium'));
  });

  it('warns and skips when podium has no 1st place', async () => {
    process.env.TOURNOI_WINNER_WEBHOOK = 'https://discord.com/api/webhooks/fake/token';
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock;

    await sendTournamentResults('Test Cup', [{ userId: 'u2', username: 'Bob', place: 2 }], 4, null, true);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No 1st place'));
  });

  it('posts the embed when podium has a winner', async () => {
    process.env.TOURNOI_WINNER_WEBHOOK = 'https://discord.com/api/webhooks/fake/token';
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock;

    await sendTournamentResults(
      'Test Cup',
      [
        { userId: 'u1', username: 'Alice', place: 1 },
        { userId: 'u2', username: 'Bob', place: 2 },
      ],
      8,
      'Tournament Winner 1',
      true,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toBe('https://discord.com/api/webhooks/fake/token');
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.embeds[0].title).toBe('Tournament Results');
    expect(body.embeds[0].description).toContain('Test Cup');
    expect(body.embeds[0].description).toContain('Alice');
    expect(body.embeds[0].description).toContain('Bob');
    expect(body.embeds[0].description).toContain('Tournament Winner 1');
  });

  it('logs CRITICAL on 401 (webhook revoked)', async () => {
    process.env.TOURNOI_WINNER_WEBHOOK = 'https://discord.com/api/webhooks/fake/token';
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'invalid token',
    })) as unknown as typeof fetch;

    await sendTournamentResults('Test Cup', [{ userId: 'u1', username: 'Alice', place: 1 }], 4, null, true);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CRITICAL'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('401'));
  });

  it('logs CRITICAL on 404 (webhook deleted)', async () => {
    process.env.TOURNOI_WINNER_WEBHOOK = 'https://discord.com/api/webhooks/fake/token';
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      text: async () => 'unknown webhook',
    })) as unknown as typeof fetch;

    await sendTournamentResults('Test Cup', [{ userId: 'u1', username: 'Alice', place: 1 }], 4, null, true);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CRITICAL'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('404'));
  });

  it('logs non-critical error on 500', async () => {
    process.env.TOURNOI_WINNER_WEBHOOK = 'https://discord.com/api/webhooks/fake/token';
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => 'server error',
    })) as unknown as typeof fetch;

    await sendTournamentResults('Test Cup', [{ userId: 'u1', username: 'Alice', place: 1 }], 4, null, true);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to send'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('500'));
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('CRITICAL'));
  });

  it('catches network error gracefully', async () => {
    process.env.TOURNOI_WINNER_WEBHOOK = 'https://discord.com/api/webhooks/fake/token';
    global.fetch = vi.fn(async () => {
      throw new Error('Network unreachable');
    }) as unknown as typeof fetch;

    await sendTournamentResults('Test Cup', [{ userId: 'u1', username: 'Alice', place: 1 }], 4, null, true);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Network error'), expect.any(String));
  });

  it('reads TOURNOI_WINNER_WEBHOOK at call time (env loaded after module init)', async () => {
    delete process.env.TOURNOI_WINNER_WEBHOOK;
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock;

    await sendTournamentResults('Test Cup', [{ userId: 'u1', username: 'Alice', place: 1 }], 4, null, true);
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.TOURNOI_WINNER_WEBHOOK = 'https://discord.com/api/webhooks/fake/token';
    await sendTournamentResults('Test Cup', [{ userId: 'u1', username: 'Alice', place: 1 }], 4, null, true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('handles podium with only 1st place (no 2nd, no 3rd)', async () => {
    process.env.TOURNOI_WINNER_WEBHOOK = 'https://discord.com/api/webhooks/fake/token';
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock;

    await sendTournamentResults('Solo Cup', [{ userId: 'u1', username: 'Alice', place: 1 }], 2, null, true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body.embeds[0].description).toContain('1st');
    expect(body.embeds[0].description).not.toContain('2nd');
    expect(body.embeds[0].description).not.toContain('3rd');
  });
});
