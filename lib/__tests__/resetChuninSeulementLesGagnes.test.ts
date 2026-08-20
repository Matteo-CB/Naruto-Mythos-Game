import { describe, it, expect, vi, beforeEach } from 'vitest';

const bd = {
  siteSettings: { findUnique: vi.fn(), upsert: vi.fn() },
};
vi.mock('@/lib/db/prisma', () => ({ prisma: bd }));

const { grantNwlPodiumRoles, revokeNwlChuninRolesFor, NWL_CHUNIN_ROLE_ID, NWL_GUILD_ID } =
  await import('@/lib/tournament/nwlPartner');
const { lireTagsChunin, ecrireTagsChunin, ajouterTagsChunin, separerTagsExpires, NWL_CHUNIN_TAG_MS } =
  await import('@/lib/tournament/nwlChuninEarned');

const rolesPortes = new Map<string, string[]>();
const retraits: string[] = [];
const ajouts: string[] = [];
let discordEnPanne = false;

function idDansUrl(url: string): string {
  return url.split('/members/')[1]?.split('/')[0] ?? '';
}

beforeEach(() => {
  vi.clearAllMocks();
  rolesPortes.clear();
  retraits.length = 0;
  ajouts.length = 0;
  discordEnPanne = false;
  process.env.NWL_BOT_TOKEN = 'jeton-de-test';

  global.fetch = vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entree);
    const methode = init?.method ?? 'GET';
    if (discordEnPanne) return new Response('', { status: 500 });
    if (!url.includes(NWL_GUILD_ID)) return new Response('', { status: 404 });

    const discordId = idDansUrl(url);
    if (methode === 'GET') {
      return new Response(JSON.stringify({ roles: rolesPortes.get(discordId) ?? [] }), { status: 200 });
    }
    if (methode === 'PUT') {
      ajouts.push(discordId);
      rolesPortes.set(discordId, [...new Set([...(rolesPortes.get(discordId) ?? []), NWL_CHUNIN_ROLE_ID])]);
      return new Response(null, { status: 204 });
    }
    if (methode === 'DELETE') {
      retraits.push(discordId);
      rolesPortes.set(discordId, (rolesPortes.get(discordId) ?? []).filter((r) => r !== NWL_CHUNIN_ROLE_ID));
      return new Response(null, { status: 204 });
    }
    return new Response('', { status: 405 });
  }) as unknown as typeof fetch;
});

function memoireReglages() {
  let stocke: never[] = [];
  bd.siteSettings.findUnique.mockImplementation(async () => ({ nwlChuninEarned: stocke }));
  bd.siteSettings.upsert.mockImplementation(async (args: { update: Record<string, unknown[]> }) => {
    if (args.update.nwlChuninEarned) stocke = args.update.nwlChuninEarned as never[];
    return {};
  });
  return () => stocke;
}

describe('le tag Chunin gagne en tournoi est le seul a sauter le lundi', () => {
  it('celui qui ne portait pas le tag et le gagne est note pour la remise a zero', async () => {
    const lu = memoireReglages();
    const res = await grantNwlPodiumRoles([
      { place: 1, userId: 'u1', username: 'Gagnant', discordId: 'd1' },
      { place: 2, userId: 'u2', username: 'Second', discordId: 'd2' },
    ]);

    expect(ajouts, 'les deux recoivent le role').toEqual(['d1', 'd2']);
    expect(res.gagnesEnTournoi).toEqual(['d1', 'd2']);

    await ajouterTagsChunin(res.gagnesEnTournoi, 1000);
    expect(lu().map((t: { discordId: string }) => t.discordId)).toEqual(['d1', 'd2']);
  });

  it('celui qui portait deja le tag, parce qu il paie, n est jamais note', async () => {
    const lu = memoireReglages();
    rolesPortes.set('abonne', [NWL_CHUNIN_ROLE_ID]);

    const res = await grantNwlPodiumRoles([
      { place: 1, userId: 'u1', username: 'Abonne', discordId: 'abonne' },
      { place: 2, userId: 'u2', username: 'Autre', discordId: 'autre' },
    ]);

    expect(res.grantedEntries.length, 'les deux sont bien traites').toBe(2);
    expect(res.gagnesEnTournoi, 'seul celui qui ne l avait pas est note').toEqual(['autre']);

    await ajouterTagsChunin(res.gagnesEnTournoi, 1000);
    expect(lu().map((t: { discordId: string }) => t.discordId)).toEqual(['autre']);
  });

  it('la remise a zero ne demande le retrait que pour les noms de la liste', async () => {
    rolesPortes.set('abonne', [NWL_CHUNIN_ROLE_ID]);
    rolesPortes.set('gagnant', [NWL_CHUNIN_ROLE_ID]);

    const resultat = await revokeNwlChuninRolesFor(['gagnant']);

    expect(retraits, 'un seul retrait part vers Discord').toEqual(['gagnant']);
    expect(rolesPortes.get('abonne'), 'l abonne garde son tag').toContain(NWL_CHUNIN_ROLE_ID);
    expect(rolesPortes.get('gagnant')).not.toContain(NWL_CHUNIN_ROLE_ID);
    expect(resultat.revoked).toBe(1);
    expect(resultat.restants).toEqual([]);
  });

  it('un retrait impossible reste dans la liste pour le lundi suivant', async () => {
    discordEnPanne = true;
    const resultat = await revokeNwlChuninRolesFor(['injoignable']);
    expect(resultat.restants, 'on le retentera').toEqual(['injoignable']);
    expect(resultat.revoked).toBe(0);
  });

  it('la liste ne garde qu une entree par joueur, la plus lointaine', async () => {
    memoireReglages();
    await ecrireTagsChunin([{ discordId: 'a', expiresAt: 10 }]);
    await ajouterTagsChunin(['a', 'b'], 500);
    const tags = await lireTagsChunin();
    expect(tags.map((t) => t.discordId)).toEqual(['a', 'b']);
    expect(tags.find((t) => t.discordId === 'a')!.expiresAt, 'la date la plus lointaine gagne').toBe(500);
  });

  it('le tag dure trois jours et le tri des expires suit l horloge', () => {
    expect(NWL_CHUNIN_TAG_MS).toBe(3 * 24 * 60 * 60 * 1000);
    const tags = [
      { discordId: 'vieux', expiresAt: 100 },
      { discordId: 'frais', expiresAt: 900 },
    ];
    const { expires, valides } = separerTagsExpires(tags, 500);
    expect(expires.map((t) => t.discordId)).toEqual(['vieux']);
    expect(valides.map((t) => t.discordId)).toEqual(['frais']);
  });
});

describe('le role Jonin se gere sans pouvoir lister les membres du serveur', () => {
  it('accorde aux qualifies, retire a ceux qui sortent, et retient ce qu il a donne', async () => {
    let stocke: string[] = [];
    bd.siteSettings.findUnique.mockImplementation(async () => ({ nwlJoninGranted: stocke }));
    bd.siteSettings.upsert.mockImplementation(async (args: { update: Record<string, string[]> }) => {
      stocke = args.update.nwlJoninGranted ?? stocke;
      return {};
    });

    const { lireJoninAccordes, ecrireJoninAccordes } = await import('@/lib/tournament/nwlChuninEarned');
    await ecrireJoninAccordes(['sortant', 'reste']);
    expect(await lireJoninAccordes()).toEqual(['sortant', 'reste']);
  });
});
