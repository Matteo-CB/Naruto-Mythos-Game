import { describe, it, expect, vi, beforeEach } from 'vitest';

const verdictRole = vi.fn();

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
  };
});

const {
  estPalierNwl,
  roleRequisPourPalier,
  refuserSiPalierNwlInterdit,
  formaterClassement,
  cleDuMois,
  NWL_CHUNIN_PARTNER_KEY,
  NWL_KAGE_PARTNER_KEY,
  NWL_KAGE_MAX_PLAYERS,
  NWL_KAGE_STANDINGS_SLOTS,
} = await import('@/lib/tournament/nwlTiers');
const { NWL_CHUNIN_ROLE_ID } = await import('@/lib/tournament/nwlPartner');

function graineKage(discordIds: string[]) {
  bd.siteSettings.findUnique.mockResolvedValue({
    nwlChuninSeed: {
      [cleDuMois(new Date())]: discordIds.map((d, i) => ({
        userId: `u${i}`, username: `Joueur${i}`, discordId: d, wins: 1, losses: 0,
      })),
      [cleDuMoisPrecedent()]: discordIds.map((d, i) => ({
        userId: `u${i}`, username: `Joueur${i}`, discordId: d, wins: 1, losses: 0,
      })),
    },
  } as never);
}

function cleDuMoisPrecedent(): string {
  const maintenant = new Date();
  const precedent = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - 1, 15, 12, 0));
  return cleDuMois(precedent);
}

describe('acces aux tournois prives Chunin et Kage', () => {
  beforeEach(() => {
    verdictRole.mockReset();
  });

  it('reconnait les deux paliers prives et ignore le tournoi Genin public', () => {
    expect(estPalierNwl(NWL_CHUNIN_PARTNER_KEY)).toBe(true);
    expect(estPalierNwl(NWL_KAGE_PARTNER_KEY)).toBe(true);
    expect(estPalierNwl('nwl'), 'le Genin reste ouvert a tous').toBe(false);
    expect(estPalierNwl(null)).toBe(false);
  });

  it('associe chaque palier a son role Discord', () => {
    expect(roleRequisPourPalier(NWL_CHUNIN_PARTNER_KEY)).toBe(NWL_CHUNIN_ROLE_ID);
    expect(roleRequisPourPalier(NWL_KAGE_PARTNER_KEY), 'le Kage ne se lit sur aucun role').toBeNull();
    expect(roleRequisPourPalier('nwl')).toBeNull();
  });

  it('laisse passer un tournoi qui ne fait pas partie des paliers', async () => {
    expect(await refuserSiPalierNwlInterdit('nwl', null)).toBeNull();
    expect(verdictRole).not.toHaveBeenCalled();
  });

  it('exige un compte Discord lie avant meme de contacter Discord', async () => {
    const refus = await refuserSiPalierNwlInterdit(NWL_CHUNIN_PARTNER_KEY, null);
    expect(refus?.errorKey).toBe('tournament.error.linkDiscord');
    expect(verdictRole).not.toHaveBeenCalled();
  });

  it('laisse entrer le porteur du role', async () => {
    verdictRole.mockResolvedValue('has_role');
    expect(await refuserSiPalierNwlInterdit(NWL_CHUNIN_PARTNER_KEY, '42')).toBeNull();
    expect(verdictRole).toHaveBeenCalledWith('42', [NWL_CHUNIN_ROLE_ID]);
  });

  it('refuse le joueur sans le role Chunin', async () => {
    verdictRole.mockResolvedValue('no_role');
    const chunin = await refuserSiPalierNwlInterdit(NWL_CHUNIN_PARTNER_KEY, '42');
    expect(chunin?.errorKey).toBe('tournament.error.nwlNoChuninRole');
    expect(chunin?.status).toBe(403);
  });

  it('renvoie le lien du serveur au joueur qui n en est pas membre', async () => {
    verdictRole.mockResolvedValue('not_member');
    const refus = await refuserSiPalierNwlInterdit(NWL_CHUNIN_PARTNER_KEY, '42');
    expect(refus?.errorKey).toBe('tournament.error.nwlNotMember');
    expect(refus?.inviteUrl).toBe('https://discord.gg/UXQX8McFD3');
  });

  it('le champion en titre entre meme s il n est plus dans les huit', async () => {
    graineKage(['q1', 'q2']);
    bd.tournament.findFirst.mockResolvedValue({ winnerId: 'champion', winnerUsername: 'Champion' } as never);
    bd.user.findUnique = vi.fn(async () => ({ id: 'champion', username: 'Champion', discordId: 'champion-discord' })) as never;

    expect(
      await refuserSiPalierNwlInterdit(NWL_KAGE_PARTNER_KEY, 'champion-discord'),
      'il defend son titre',
    ).toBeNull();

    const { grainePourKage } = await import('@/lib/tournament/nwlTiers');
    expect(await grainePourKage('champion'), 'il est tete de serie, donc exempte du premier tour').toBe(1);

    bd.tournament.findFirst.mockResolvedValue(null as never);
  });

  it('le Kage se decide sur la liste des qualifies, pas sur un role porte au moment de l inscription', async () => {
    graineKage(['111', '222']);
    expect(await refuserSiPalierNwlInterdit(NWL_KAGE_PARTNER_KEY, '111'), 'un qualifie entre').toBeNull();

    const refus = await refuserSiPalierNwlInterdit(NWL_KAGE_PARTNER_KEY, '999');
    expect(refus?.errorKey, 'un non qualifie est refuse').toBe('tournament.error.nwlNoKageRole');
    expect(verdictRole, 'aucun appel Discord n est necessaire pour trancher').not.toHaveBeenCalled();
  });

  it('ne ferme pas la porte quand Discord ne repond pas, il demande de reessayer', async () => {
    verdictRole.mockResolvedValue('unavailable');
    const refus = await refuserSiPalierNwlInterdit(NWL_CHUNIN_PARTNER_KEY, '42');
    expect(refus?.errorKey).toBe('tournament.error.nwlCheckUnavailable');
    expect(refus?.status, 'un 503 invite a reessayer, un 403 est definitif').toBe(503);
  });
});

describe('classement mensuel Chunin', () => {
  it('classe par points et annonce le nombre de qualifies', () => {
    const texte = formaterClassement(
      [
        { userId: 'a', username: 'Ako', discordId: null, wins: 3, losses: 1, points: 10 },
        { userId: 'b', username: 'Bee', discordId: null, wins: 1, losses: 2, points: 5 },
      ],
      'Chunin standings',
    );
    expect(texte).toContain('Ako');
    expect(texte.indexOf('Ako')).toBeLessThan(texte.indexOf('Bee'));
    expect(texte).toContain('10 pts');
    expect(texte, 'le nombre de qualifies suit le nombre de joueurs classes').toContain('The top 2 qualify');
    expect(
      formaterClassement([{ userId: 'a', username: 'Seul', discordId: null, wins: 1, losses: 0, points: 3 }], 'Chunin'),
      'un seul joueur classe ne donne pas une phrase bancale',
    ).toContain('The top player qualifies');
  });

  it('ne plafonne le nombre de qualifies qu au nombre de places du classement', () => {
    const entrees = Array.from({ length: NWL_KAGE_MAX_PLAYERS + 4 }, (_, i) => ({
      userId: `u${i}`,
      username: `Joueur${i}`,
      discordId: null,
      wins: 10 - i,
      losses: 0,
      points: (10 - i) * 3,
    }));
    expect(formaterClassement(entrees, 'Chunin standings')).toContain(`The top ${NWL_KAGE_STANDINGS_SLOTS} qualify`);
  });

  it('dit clairement quand aucun match n a encore ete joue', () => {
    expect(formaterClassement([], 'Chunin standings')).toContain('No match played yet');
  });
});

describe('le role paye du Chunin', () => {
  it('la liste des roles acceptes est prete a accueillir un role d abonne', async () => {
    const { rolesAcceptesPourPalier } = await import('@/lib/tournament/nwlTiers');
    const { NWL_CHUNIN_SUBSCRIBER_ROLE_ID } = await import('@/lib/tournament/nwlPartner');
    const acceptes = rolesAcceptesPourPalier(NWL_CHUNIN_PARTNER_KEY);
    expect(acceptes, 'le role hebdomadaire est toujours accepte').toContain(NWL_CHUNIN_ROLE_ID);
    expect(
      acceptes.length,
      'tant que New World Loot n a pas cree le role d abonne, seul l hebdomadaire compte',
    ).toBe(NWL_CHUNIN_SUBSCRIBER_ROLE_ID ? 2 : 1);
    expect(acceptes.every(Boolean), 'aucun identifiant vide ne part vers Discord').toBe(true);
  });

  it('le Kage ne s ouvre jamais avec un role de Chunin', async () => {
    const { rolesAcceptesPourPalier } = await import('@/lib/tournament/nwlTiers');
    expect(rolesAcceptesPourPalier(NWL_KAGE_PARTNER_KEY), 'aucun role n ouvre le Kage, seule la liste des qualifies compte').toEqual([]);
  });
});

describe('le role Kage recompense les derniers champions', () => {
  it('le vainqueur rejoint la liste et le plus ancien sort quand elle deborde', async () => {
    const { championsApresVictoire } = await import('@/lib/tournament/nwlTiers');
    const { NWL_KAGE_CHAMPIONS_MAX } = await import('@/lib/tournament/nwlPartner');
    expect(NWL_KAGE_CHAMPIONS_MAX, 'trois champions au plus, comme demande').toBe(3);

    let liste: string[] = [];
    for (const vainqueur of ['a', 'b', 'c']) {
      liste = championsApresVictoire(liste, vainqueur, NWL_KAGE_CHAMPIONS_MAX);
    }
    expect(liste).toEqual(['a', 'b', 'c']);

    liste = championsApresVictoire(liste, 'd', NWL_KAGE_CHAMPIONS_MAX);
    expect(liste, 'le premier sacre laisse sa place au nouveau').toEqual(['b', 'c', 'd']);
  });

  it('un champion qui gagne a nouveau ne prend pas deux places', async () => {
    const { championsApresVictoire } = await import('@/lib/tournament/nwlTiers');
    const liste = championsApresVictoire(['a', 'b', 'c'], 'b', 3);
    expect(liste).toEqual(['a', 'c', 'b']);
    expect(new Set(liste).size, 'aucun doublon').toBe(3);
  });
});

describe('le Kage ne s ouvre qu aux qualifies du mois ecoule', () => {
  it('un ancien vainqueur qui n est plus dans le top 8 ne peut pas s inscrire', async () => {
    graineKage(['qualifie1', 'qualifie2']);
    const refus = await refuserSiPalierNwlInterdit(NWL_KAGE_PARTNER_KEY, 'ancien-champion');
    expect(refus?.errorKey, 'le titre de champion n est pas un laissez-passer').toBe('tournament.error.nwlNoKageRole');
  });

  it('sans aucun qualifie, personne n entre', async () => {
    bd.siteSettings.findUnique.mockResolvedValue({ nwlChuninSeed: {} } as never);
    const refus = await refuserSiPalierNwlInterdit(NWL_KAGE_PARTNER_KEY, 'nimporte-qui');
    expect(refus?.errorKey, 'un classement vide ne laisse pas la porte ouverte').toBe('tournament.error.nwlNoKageRole');
  });
});

describe('le Kage se joue a huit, sept qualifies et le champion', () => {
  it('le tournoi ouvre huit places et se joue au meilleur des trois', async () => {
    const { NWL_KAGE_MAX_PLAYERS: places, NWL_KAGE_STANDINGS_SLOTS: qualifies, NWL_KAGE_BEST_OF: manches } =
      await import('@/lib/tournament/nwlTiers');
    expect(places, 'huit joueurs sur l affiche').toBe(8);
    expect(qualifies, 'sept viennent du classement').toBe(7);
    expect(qualifies + 1, 'le champion complete le tableau').toBe(places);
    expect(manches, 'au meilleur des trois').toBe(3);
  });

  it('sans champion en titre, le classement remplit les huit places', async () => {
    graineKage(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
    bd.tournament.findFirst.mockResolvedValue(null as never);
    const { kageQualifiers } = await import('@/lib/tournament/nwlTiers');
    const liste = await kageQualifiers();
    expect(liste.length, 'huit joueurs quand personne ne defend son titre').toBe(8);
  });

  it('avec un champion en titre, il prend la premiere place et sept qualifies suivent', async () => {
    graineKage(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
    bd.tournament.findFirst.mockResolvedValue({ winnerId: 'champion', winnerUsername: 'Champion' } as never);
    bd.user.findUnique = vi.fn(async () => ({ id: 'champion', username: 'Champion', discordId: 'champion-discord' })) as never;

    const { kageQualifiers } = await import('@/lib/tournament/nwlTiers');
    const liste = await kageQualifiers();
    expect(liste.length, 'toujours huit joueurs').toBe(8);
    expect(liste[0].userId, 'le champion ouvre la liste').toBe('champion');
    bd.tournament.findFirst.mockResolvedValue(null as never);
  });
});
