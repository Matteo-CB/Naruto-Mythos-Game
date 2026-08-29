import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const verdictRole = vi.fn();
const verdictPresence = vi.fn();

const bd = {
  siteSettings: { findUnique: vi.fn(async () => ({ nwlChuninSeed: {} })), upsert: vi.fn() },
  tournament: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) },
  user: { findMany: vi.fn(async () => []), findUnique: vi.fn(async () => null) },
  tournamentMatch: { findMany: vi.fn(async () => []) },
};
vi.mock('@/lib/db/prisma', () => ({ prisma: bd }));

vi.mock('@/lib/tournament/nwlPartner', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/tournament/nwlPartner')>();
  return {
    ...reel,
    checkNwlAnyRole: (discordId: string | null | undefined, roleIds: string[]) => verdictRole(discordId, roleIds),
    checkNwlMembership: (discordId: string | null | undefined) => verdictPresence(discordId),
  };
});

const { refuserSiPalierNwlInterdit, NWL_CHUNIN_PARTNER_KEY } = await import('@/lib/tournament/nwlTiers');

const RACINE = process.cwd();

describe('la levee du role est exceptionnelle, portee par le tournoi et non par la regle', () => {
  beforeEach(() => {
    verdictRole.mockReset();
    verdictPresence.mockReset();
  });

  it('sans levee, le role Chunin reste exige', async () => {
    verdictRole.mockResolvedValue('no_role');
    const refus = await refuserSiPalierNwlInterdit(NWL_CHUNIN_PARTNER_KEY, 'discord-1');
    expect(refus?.errorKey).toBe('tournament.error.nwlNoChuninRole');
  });

  it('avec la levee, un membre du serveur sans le role entre', async () => {
    verdictPresence.mockResolvedValue('member');
    const refus = await refuserSiPalierNwlInterdit(NWL_CHUNIN_PARTNER_KEY, 'discord-1', true);
    expect(refus).toBeNull();
    expect(verdictRole).not.toHaveBeenCalled();
  });

  it('avec la levee, il faut toujours etre sur le serveur New World Loot', async () => {
    verdictPresence.mockResolvedValue('not_member');
    const refus = await refuserSiPalierNwlInterdit(NWL_CHUNIN_PARTNER_KEY, 'discord-1', true);
    expect(refus?.errorKey).toBe('tournament.error.nwlNotMember');
  });

  it('avec la levee, il faut toujours avoir lie son compte Discord', async () => {
    const refus = await refuserSiPalierNwlInterdit(NWL_CHUNIN_PARTNER_KEY, null, true);
    expect(refus?.errorKey).toBe('tournament.error.linkDiscord');
  });

  it('une verification indisponible refuse toujours, meme avec la levee', async () => {
    verdictPresence.mockResolvedValue('unavailable');
    const refus = await refuserSiPalierNwlInterdit(NWL_CHUNIN_PARTNER_KEY, 'discord-1', true);
    expect(refus?.status).toBe(503);
  });

  it('la levee ne vaut que pour la ligne de tournoi qui la porte', () => {
    const schema = readFileSync(join(RACINE, 'prisma/schema.prisma'), 'utf8');
    expect(schema).toContain('partnerRoleWaived   Boolean                 @default(false)');

    const creation = readFileSync(join(RACINE, 'lib/tournament/nwlTiers.ts'), 'utf8');
    const bloc = creation.slice(creation.indexOf('createNwlChuninTournamentIfNeeded'));
    expect(bloc.slice(0, 3000), 'la creation hebdomadaire ne pose jamais la levee').not.toContain('partnerRoleWaived');
  });

  it('les deux routes d inscription transmettent la levee du tournoi', () => {
    for (const route of ['app/api/tournaments/[id]/join/route.ts', 'app/api/tournaments/join-by-code/route.ts']) {
      const source = readFileSync(join(RACINE, route), 'utf8');
      expect(source, route).toContain('refuserSiPalierNwlInterdit(tournament.partner, user?.discordId, tournament.partnerRoleWaived)');
    }
  });
});
