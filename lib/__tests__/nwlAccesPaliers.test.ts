import { describe, it, expect, vi, beforeEach } from 'vitest';

const verdictRole = vi.fn();

vi.mock('@/lib/tournament/nwlPartner', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/tournament/nwlPartner')>();
  return {
    ...reel,
    checkNwlRole: (discordId: string | null | undefined, roleId: string) => verdictRole(discordId, roleId),
  };
});

const {
  estPalierNwl,
  roleRequisPourPalier,
  refuserSiPalierNwlInterdit,
  formaterClassement,
  NWL_CHUNIN_PARTNER_KEY,
  NWL_KAGE_PARTNER_KEY,
  NWL_KAGE_MAX_PLAYERS,
} = await import('@/lib/tournament/nwlTiers');
const { NWL_CHUNIN_ROLE_ID, NWL_KAGE_ROLE_ID } = await import('@/lib/tournament/nwlPartner');

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
    expect(roleRequisPourPalier(NWL_KAGE_PARTNER_KEY)).toBe(NWL_KAGE_ROLE_ID);
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
    expect(verdictRole).toHaveBeenCalledWith('42', NWL_CHUNIN_ROLE_ID);
  });

  it('refuse le joueur sans le role, avec un message propre a chaque palier', async () => {
    verdictRole.mockResolvedValue('no_role');
    const chunin = await refuserSiPalierNwlInterdit(NWL_CHUNIN_PARTNER_KEY, '42');
    expect(chunin?.errorKey).toBe('tournament.error.nwlNoChuninRole');
    expect(chunin?.status).toBe(403);

    const kage = await refuserSiPalierNwlInterdit(NWL_KAGE_PARTNER_KEY, '42');
    expect(kage?.errorKey).toBe('tournament.error.nwlNoKageRole');
    expect(verdictRole).toHaveBeenLastCalledWith('42', NWL_KAGE_ROLE_ID);
  });

  it('renvoie le lien du serveur au joueur qui n en est pas membre', async () => {
    verdictRole.mockResolvedValue('not_member');
    const refus = await refuserSiPalierNwlInterdit(NWL_KAGE_PARTNER_KEY, '42');
    expect(refus?.errorKey).toBe('tournament.error.nwlNotMember');
    expect(refus?.inviteUrl).toBe('https://discord.gg/UXQX8McFD3');
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
  });

  it('ne plafonne le nombre de qualifies qu au nombre de places Kage', () => {
    const entrees = Array.from({ length: NWL_KAGE_MAX_PLAYERS + 4 }, (_, i) => ({
      userId: `u${i}`,
      username: `Joueur${i}`,
      discordId: null,
      wins: 10 - i,
      losses: 0,
      points: (10 - i) * 3,
    }));
    expect(formaterClassement(entrees, 'Chunin standings')).toContain(`The top ${NWL_KAGE_MAX_PLAYERS} qualify`);
  });

  it('dit clairement quand aucun match n a encore ete joue', () => {
    expect(formaterClassement([], 'Chunin standings')).toContain('No match played yet');
  });
});
