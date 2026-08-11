import { describe, it, expect, vi, beforeEach } from 'vitest';

const findFirstUser = vi.fn();
vi.mock('@/lib/db/prisma', () => ({
  prisma: { user: { findFirst: (...a: unknown[]) => findFirstUser(...a) } },
}));

import { findTournamentOwner } from '@/lib/tournament/tournamentOwner';
import { TOURNAMENT_OWNER_USERNAME, ADMIN_USERNAMES } from '@/lib/auth/admins';

const KUTXYT = { id: 'id-kutxyt', username: 'Kutxyt' };
const AUTRE_ADMIN = { id: 'id-daiki', username: 'Daiki0' };

describe('createur des tournois automatiques', () => {
  beforeEach(() => {
    findFirstUser.mockReset();
  });

  it('the configured owner is an admin', () => {
    expect(ADMIN_USERNAMES).toContain(TOURNAMENT_OWNER_USERNAME);
  });

  it('picks the configured owner even when another admin exists', async () => {
    findFirstUser.mockResolvedValueOnce(KUTXYT);
    const proprietaire = await findTournamentOwner();

    expect(proprietaire).toEqual(KUTXYT);
    expect(findFirstUser).toHaveBeenCalledTimes(1);
    const where = findFirstUser.mock.calls[0][0].where;
    expect(where.username.equals).toBe(TOURNAMENT_OWNER_USERNAME);
  });

  it('matches the owner whatever the stored casing', async () => {
    findFirstUser.mockResolvedValueOnce({ id: 'id-kutxyt', username: 'kutxyt' });
    await findTournamentOwner();

    expect(findFirstUser.mock.calls[0][0].where.username.mode).toBe('insensitive');
  });

  it('falls back to any admin when the owner account is missing', async () => {
    findFirstUser.mockResolvedValueOnce(null).mockResolvedValueOnce(AUTRE_ADMIN);
    const proprietaire = await findTournamentOwner();

    expect(proprietaire).toEqual(AUTRE_ADMIN);
    expect(findFirstUser).toHaveBeenCalledTimes(2);
  });

  it('returns null when no admin account exists at all', async () => {
    findFirstUser.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    expect(await findTournamentOwner()).toBeNull();
  });
});
