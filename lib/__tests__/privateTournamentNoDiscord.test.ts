import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendTournamentResults } from '@/lib/discord/tournamentWebhook';
import { sendTournamentCreated } from '@/lib/discord/tournamentCreatedWebhook';

vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { findUnique: async () => null } } }));
vi.mock('@/lib/discord/tournamentRoles', () => ({ isDiscordMember: async () => false }));

const podium = [{ userId: 'u1', username: 'Alice', place: 1 as const }];

function created(isPublic: boolean | undefined) {
  return {
    name: 'Cup', format: 'swiss', gameMode: 'classic', maxPlayers: 8,
    scheduledStartAt: null, creatorUsername: 'Someone', isPublic,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.TOURNOI_WINNER_WEBHOOK = 'https://discord.com/api/webhooks/fake/token';
  process.env.TOURNAMENT_PLANNING_WEBHOOK = 'https://discord.com/api/webhooks/fake/token';
  fetchMock = vi.fn(async () => ({ ok: true, status: 204, text: async () => '' }));
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => { vi.restoreAllMocks(); });

describe('a private tournament never reaches the Discord bots', () => {
  it('announces the creation of a public tournament', async () => {
    await sendTournamentCreated(created(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the tournament is private', async () => {
    await sendTournamentCreated(created(false));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays silent when the visibility is unknown, rather than guessing public', async () => {
    await sendTournamentCreated(created(undefined));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('announces the results of a public tournament', async () => {
    await sendTournamentResults('Cup', podium, 8, null, true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never announces the results of a private tournament', async () => {
    await sendTournamentResults('Cup', podium, 8, null, false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never announces results when the visibility is unknown', async () => {
    await sendTournamentResults('Cup', podium, 8, null, undefined);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
