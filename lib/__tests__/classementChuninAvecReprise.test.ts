import { describe, it, expect, vi, beforeEach } from 'vitest';

const bd = {
  siteSettings: { findUnique: vi.fn(), upsert: vi.fn() },
  tournament: { findMany: vi.fn() },
  tournamentMatch: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
};

vi.mock('@/lib/db/prisma', () => ({ prisma: bd }));

const { chuninStandings, cleDuMois, bornesDuMois, NWL_POINTS_PER_WIN, NWL_POINTS_PER_LOSS } =
  await import('@/lib/tournament/nwlTiers');

const MAK = { userId: 'u-mak', username: 'mak52554', discordId: '765668625318150204' };
const JORDAN = { userId: 'u-jordan', username: 'Jordan', discordId: '318819703910957057' };

const AOUT = new Date('2026-08-20T09:00:00Z');

function graineDaout() {
  return {
    [cleDuMois(AOUT)]: [
      { ...MAK, wins: 1, losses: 0 },
      { ...JORDAN, wins: 0, losses: 1 },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bd.siteSettings.findUnique.mockResolvedValue({ nwlChuninSeed: graineDaout() });
  bd.tournament.findMany.mockResolvedValue([]);
  bd.tournamentMatch.findMany.mockResolvedValue([]);
  bd.user.findMany.mockResolvedValue([]);
});

describe('le classement Chunin repart des points fournis par New World Loot', () => {
  it('affiche les joueurs et leurs points alors qu aucun match n a ete joue sur le simulateur', async () => {
    const { debut, fin } = bornesDuMois(AOUT);
    const classement = await chuninStandings(debut, fin);

    expect(classement.map((e) => e.username)).toEqual(['mak52554', 'Jordan']);
    expect(classement[0].points, 'une victoire vaut trois points').toBe(NWL_POINTS_PER_WIN);
    expect(classement[1].points, 'une defaite en vaut un').toBe(NWL_POINTS_PER_LOSS);
    expect(classement[0].discordId, 'le Discord est conserve pour le role et le message prive').toBe(MAK.discordId);
  });

  it('les matchs joues sur le simulateur s ajoutent a la reprise, ils ne la remplacent pas', async () => {
    bd.tournament.findMany.mockResolvedValue([{ id: 't1' }]);
    bd.tournamentMatch.findMany.mockResolvedValue([
      { player1Id: MAK.userId, player2Id: JORDAN.userId, winnerId: JORDAN.userId },
    ]);
    bd.user.findMany.mockResolvedValue([
      { id: MAK.userId, username: MAK.username, discordId: MAK.discordId },
      { id: JORDAN.userId, username: JORDAN.username, discordId: JORDAN.discordId },
    ]);

    const { debut, fin } = bornesDuMois(AOUT);
    const classement = await chuninStandings(debut, fin);
    const parNom = new Map(classement.map((e) => [e.username, e]));

    expect(parNom.get('mak52554')!.wins).toBe(1);
    expect(parNom.get('mak52554')!.losses, 'sa defaite du samedi s ajoute').toBe(1);
    expect(parNom.get('Jordan')!.wins, 'sa victoire du samedi s ajoute').toBe(1);
    expect(parNom.get('Jordan')!.losses).toBe(1);
    expect(parNom.get('Jordan')!.points).toBe(NWL_POINTS_PER_WIN + NWL_POINTS_PER_LOSS);
    expect(classement.length, 'personne n est compte deux fois').toBe(2);
  });

  it('un mois sans reprise ni match reste vide, il n invente personne', async () => {
    bd.siteSettings.findUnique.mockResolvedValue({ nwlChuninSeed: {} });
    const { debut, fin } = bornesDuMois(AOUT);
    expect(await chuninStandings(debut, fin)).toEqual([]);
  });

  it('la reprise est rangee par mois, celle d aout ne deteint pas sur septembre', async () => {
    const { debut, fin } = bornesDuMois(new Date('2026-09-10T09:00:00Z'));
    expect(cleDuMois(debut)).toBe('2026-09');
    expect(await chuninStandings(debut, fin), 'septembre demarre a zero').toEqual([]);
  });
});
