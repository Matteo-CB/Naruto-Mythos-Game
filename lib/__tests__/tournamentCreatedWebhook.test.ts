import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendTournamentCreated, buildRestrictionSummary } from '@/lib/discord/tournamentCreatedWebhook';

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_PLANNING_ENV = process.env.TOURNAMENT_PLANNING_WEBHOOK;
const ORIGINAL_ROLE_ID = process.env.TOURNAMENT_ROLE_ID;

function makeFetchMock() {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => '',
  })) as unknown as typeof fetch;
}

function baseTournament(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test Cup',
    isPublic: true,
    format: 'swiss',
    gameMode: 'classic',
    maxPlayers: 16,
    scheduledStartAt: null as Date | null,
    creatorUsername: 'Kutayt',
    allowedLeagues: [],
    bannedCardIds: [],
    allowedGroups: [],
    bannedGroups: [],
    allowedKeywords: [],
    bannedKeywords: [],
    allowedRarities: [],
    bannedRarities: [],
    maxCopiesPerCard: null,
    minDeckSize: null,
    maxDeckSize: null,
    maxChakraCost: null,
    restrictionNote: null,
    ...overrides,
  };
}

describe('buildRestrictionSummary', () => {
  it('returns null when no restrictions are set', () => {
    const summary = buildRestrictionSummary(baseTournament());
    expect(summary).toBeNull();
  });

  it('includes allowedLeagues when present', () => {
    const summary = buildRestrictionSummary(baseTournament({ allowedLeagues: ['chunin', 'jonin'] }));
    expect(summary).toContain('Leagues allowed: chunin, jonin');
  });

  it('includes banned cards count', () => {
    const summary = buildRestrictionSummary(baseTournament({ bannedCardIds: ['KS-001-C', 'KS-002-UC', 'KS-003-R'] }));
    expect(summary).toContain('3 cards banned');
  });

  it('combines multiple restrictions with ". "', () => {
    const summary = buildRestrictionSummary(baseTournament({
      allowedLeagues: ['chunin'],
      maxCopiesPerCard: 1,
      restrictionNote: 'Test note',
    }));
    expect(summary).toContain('Leagues allowed: chunin');
    expect(summary).toContain('Max 1 copies per card');
    expect(summary).toContain('Test note');
  });
});

describe('sendTournamentCreated', () => {
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
    if (ORIGINAL_PLANNING_ENV === undefined) delete process.env.TOURNAMENT_PLANNING_WEBHOOK;
    else process.env.TOURNAMENT_PLANNING_WEBHOOK = ORIGINAL_PLANNING_ENV;
    if (ORIGINAL_ROLE_ID === undefined) delete process.env.TOURNAMENT_ROLE_ID;
    else process.env.TOURNAMENT_ROLE_ID = ORIGINAL_ROLE_ID;
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('warns and skips when TOURNAMENT_PLANNING_WEBHOOK is not set', async () => {
    delete process.env.TOURNAMENT_PLANNING_WEBHOOK;
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock;

    await sendTournamentCreated(baseTournament());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('TOURNAMENT_PLANNING_WEBHOOK not set'));
  });

  it('posts an embed with format, game mode and max players', async () => {
    process.env.TOURNAMENT_PLANNING_WEBHOOK = 'https://discord.com/api/webhooks/fake/token';
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock;

    await sendTournamentCreated(baseTournament({ format: 'elimination', gameMode: 'evolving', maxPlayers: 8 }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    const fields = body.embeds[0].fields;
    expect(fields.find((f: { name: string }) => f.name === 'Format').value).toBe('Single Elimination');
    expect(fields.find((f: { name: string }) => f.name === 'Game mode').value).toBe('Evolving');
    expect(fields.find((f: { name: string }) => f.name === 'Max players').value).toBe('8');
  });

  it('injects Discord <t:UNIX:F> and <t:UNIX:R> timestamps when scheduledStartAt is set', async () => {
    process.env.TOURNAMENT_PLANNING_WEBHOOK = 'https://discord.com/api/webhooks/fake/token';
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock;

    const start = new Date('2026-05-17T18:00:00Z');
    const expectedUnix = Math.floor(start.getTime() / 1000);

    await sendTournamentCreated(baseTournament({ scheduledStartAt: start }));

    const body = JSON.parse((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    const fields = body.embeds[0].fields;
    const startsField = fields.find((f: { name: string }) => f.name === 'Starts');
    const countdownField = fields.find((f: { name: string }) => f.name === 'Countdown');
    expect(startsField.value).toBe(`<t:${expectedUnix}:F>`);
    expect(countdownField.value).toBe(`<t:${expectedUnix}:R>`);
  });

  it('omits Starts/Countdown fields when scheduledStartAt is null', async () => {
    process.env.TOURNAMENT_PLANNING_WEBHOOK = 'https://discord.com/api/webhooks/fake/token';
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock;

    await sendTournamentCreated(baseTournament({ scheduledStartAt: null }));

    const body = JSON.parse((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    const fields = body.embeds[0].fields;
    expect(fields.find((f: { name: string }) => f.name === 'Starts')).toBeUndefined();
    expect(fields.find((f: { name: string }) => f.name === 'Countdown')).toBeUndefined();
    expect(body.embeds[0].description).toContain('Start time will be announced soon');
  });

  it('adds Restrictions field when restrictions are set', async () => {
    process.env.TOURNAMENT_PLANNING_WEBHOOK = 'https://discord.com/api/webhooks/fake/token';
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock;

    await sendTournamentCreated(baseTournament({ allowedLeagues: ['chunin'], maxCopiesPerCard: 1 }));

    const body = JSON.parse((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    const fields = body.embeds[0].fields;
    const restrictionsField = fields.find((f: { name: string }) => f.name === 'Restrictions');
    expect(restrictionsField).toBeDefined();
    expect(restrictionsField.value).toContain('Leagues allowed: chunin');
    expect(restrictionsField.value).toContain('Max 1 copies per card');
  });

  it('mentions the Tournament role when TOURNAMENT_ROLE_ID is set', async () => {
    process.env.TOURNAMENT_PLANNING_WEBHOOK = 'https://discord.com/api/webhooks/fake/token';
    process.env.TOURNAMENT_ROLE_ID = '1234567890';
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock;

    await sendTournamentCreated(baseTournament());

    const body = JSON.parse((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body.content).toBe('<@&1234567890>');
    expect(body.allowed_mentions).toEqual({ roles: ['1234567890'] });
  });

  it('skips role mention when TOURNAMENT_ROLE_ID is not set', async () => {
    process.env.TOURNAMENT_PLANNING_WEBHOOK = 'https://discord.com/api/webhooks/fake/token';
    delete process.env.TOURNAMENT_ROLE_ID;
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock;

    await sendTournamentCreated(baseTournament());

    const body = JSON.parse((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body.content).toBeUndefined();
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });

  it('logs CRITICAL on 401/404', async () => {
    process.env.TOURNAMENT_PLANNING_WEBHOOK = 'https://discord.com/api/webhooks/fake/token';
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      text: async () => 'unknown webhook',
    })) as unknown as typeof fetch;

    await sendTournamentCreated(baseTournament());

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CRITICAL'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('404'));
  });

  it('reads env at call time (set after module init)', async () => {
    delete process.env.TOURNAMENT_PLANNING_WEBHOOK;
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock;

    await sendTournamentCreated(baseTournament());
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.TOURNAMENT_PLANNING_WEBHOOK = 'https://discord.com/api/webhooks/fake/token';
    await sendTournamentCreated(baseTournament());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
