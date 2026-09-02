import { describe, it, expect, vi, beforeEach } from 'vitest';

interface LigneTournoi {
  id: string;
  partner: string;
  status: string;
  scheduledStartAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  startedAt: Date | null;
  winnerId: string | null;
  partnerPrizeAwarded: boolean;
  partnerStandingsRecorded: boolean;
  partnerCodeSentAt: Date | null;
  partnerRoleWaived: boolean;
  joinCode: string | null;
  name: string;
}

interface LigneMatch {
  id: string;
  tournamentId: string;
  player1Id: string | null;
  player2Id: string | null;
  status: string;
  winnerId: string | null;
  round: number;
  isBye: boolean;
}

const reglages: Record<string, unknown> = {};
let tournois: LigneTournoi[] = [];
let matchs: LigneMatch[] = [];

const JOUEURS = [
  { id: 'u-mak', username: 'mak52554', discordId: '765668625318150204' },
  { id: 'u-ilnara', username: 'IlNaRa_ITA', discordId: '1372205418000023555' },
  { id: 'u-imboss', username: 'Im_boss', discordId: '1506059746745122951' },
  { id: 'u-kingkuni', username: 'Kingkuni3', discordId: '1317976323070759024' },
  { id: 'u-stachu', username: 'MrStachu2012', discordId: '459450100117143562' },
  { id: 'u-tedd', username: 'Tedd', discordId: '269167225523535873' },
  { id: 'u-kutxyt', username: 'Kutxyt', discordId: '1201252986396094535' },
  { id: 'u-jordan', username: 'Jordan', discordId: '318819703910957057' },
  { id: 'u-nouveau', username: 'Nouveau', discordId: '999000111222333444' },
];

function correspond(ligne: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [champ, attendu] of Object.entries(where)) {
    if (champ === 'NOT') {
      if (correspond(ligne, attendu as Record<string, unknown>)) return false;
      continue;
    }
    if (champ === 'OR') {
      const branches = attendu as Array<Record<string, unknown>>;
      if (!branches.some((b) => correspond(ligne, b))) return false;
      continue;
    }
    const valeur = ligne[champ];
    if (attendu && typeof attendu === 'object' && 'isSet' in (attendu as Record<string, unknown>)) {
      const present = valeur !== undefined && valeur !== null;
      if (present !== (attendu as { isSet: boolean }).isSet) return false;
      continue;
    }
    if (attendu === null) {
      if (valeur !== null && valeur !== undefined) return false;
      continue;
    }
    if (attendu && typeof attendu === 'object' && !(attendu instanceof Date)) {
      const cond = attendu as Record<string, unknown>;
      if ('in' in cond && !(cond.in as unknown[]).includes(valeur)) return false;
      if ('gte' in cond && !(valeur instanceof Date && valeur >= (cond.gte as Date))) return false;
      if ('lt' in cond && !(valeur instanceof Date && valeur < (cond.lt as Date))) return false;
      continue;
    }
    if (valeur !== attendu) return false;
  }
  return true;
}

const bd = {
  siteSettings: {
    findUnique: vi.fn(async () => ({ ...reglages })),
    upsert: vi.fn(async ({ update }: { update: Record<string, unknown> }) => {
      Object.assign(reglages, update);
      return { ...reglages };
    }),
  },
  tournament: {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      tournois.filter((t) => correspond(t as unknown as Record<string, unknown>, where)).map((t) => ({ ...t }))),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const t = tournois.find((x) => correspond(x as unknown as Record<string, unknown>, where));
      return t ? { ...t } : null;
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const t = tournois.find((x) => x.id === where.id);
      return t ? { ...t } : null;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const cibles = tournois.filter((t) => correspond(t as unknown as Record<string, unknown>, where));
      for (const t of cibles) Object.assign(t, data);
      return { count: cibles.length };
    }),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const avant = tournois.length;
      tournois = tournois.filter((t) => !correspond(t as unknown as Record<string, unknown>, where));
      return { count: avant - tournois.length };
    }),
  },
  tournamentMatch: {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      matchs.filter((m) => correspond(m as unknown as Record<string, unknown>, where)).map((m) => ({ ...m }))),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const avant = matchs.length;
      matchs = matchs.filter((m) => !correspond(m as unknown as Record<string, unknown>, where));
      return { count: avant - matchs.length };
    }),
  },
  tournamentParticipant: {
    findMany: vi.fn(async () => []),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  user: {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      JOUEURS.filter((u) => correspond(u as unknown as Record<string, unknown>, where)).map((u) => ({ ...u }))),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const u = JOUEURS.find((x) => correspond(x as unknown as Record<string, unknown>, where));
      return u ? { ...u } : null;
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const u = JOUEURS.find((x) => x.id === where.id);
      return u ? { ...u } : null;
    }),
  },
  $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
};

vi.mock('@/lib/db/prisma', () => ({ prisma: bd }));

const {
  chuninStandings, kageQualifiers, standingsPourJonin, diffuserCodeKage,
  refuserSiPalierNwlInterdit, cloturerPalierNwl, graverAvantPurge,
  bornesDuMois, bornesDuMoisPrecedent, cleDuMois, estPremierDimancheDuMois,
  NWL_CHUNIN_PARTNER_KEY, NWL_KAGE_PARTNER_KEY, NWL_KAGE_STANDINGS_SLOTS,
} = await import('@/lib/tournament/nwlTiers');
const { cleanupOldTournaments } = await import('@/lib/tournament/cleanupOldTournaments');

const KAGE_SEPTEMBRE = new Date(Date.UTC(2026, 8, 6, 19, 0));
const SAMEDI_CHUNIN = new Date(Date.UTC(2026, 8, 5, 20, 0));

const mpEnvoyes: string[] = [];
const salons: Array<{ channelId: string; contenu: string }> = [];

function stubDiscord(): void {
  const canaux = new Map<string, string>();
  global.fetch = vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entree);
    const corps = init?.body ? (JSON.parse(String(init.body)) as Record<string, string>) : {};
    if (url.endsWith('/users/@me/channels')) {
      const canal = `dm-${corps.recipient_id}`;
      canaux.set(canal, corps.recipient_id);
      return new Response(JSON.stringify({ id: canal }), { status: 200 });
    }
    const salon = url.split('/channels/')[1]?.split('/')[0] ?? '';
    if (canaux.has(salon)) mpEnvoyes.push(canaux.get(salon)!);
    else salons.push({ channelId: salon, contenu: corps.content ?? '' });
    return new Response(JSON.stringify({ id: 'msg-1', channel_id: salon }), { status: 200 });
  }) as unknown as typeof fetch;
}

function grainePourAout(): void {
  reglages.nwlChuninSeed = {
    '2026-08': [
      { userId: 'u-mak', username: 'mak52554', discordId: '765668625318150204', wins: 3, losses: 0 },
      { userId: 'u-ilnara', username: 'IlNaRa_ITA', discordId: '1372205418000023555', wins: 2, losses: 0 },
      { userId: 'u-imboss', username: 'Im_boss', discordId: '1506059746745122951', wins: 1, losses: 1 },
      { userId: 'u-kingkuni', username: 'Kingkuni3', discordId: '1317976323070759024', wins: 1, losses: 1 },
      { userId: 'u-stachu', username: 'MrStachu2012', discordId: '459450100117143562', wins: 1, losses: 1 },
      { userId: 'u-tedd', username: 'Tedd', discordId: '269167225523535873', wins: 1, losses: 1 },
      { userId: 'u-kutxyt', username: 'Kutxyt', discordId: '1201252986396094535', wins: 0, losses: 2 },
      { userId: 'u-jordan', username: 'Jordan', discordId: '318819703910957057', wins: 0, losses: 1 },
    ],
  };
  reglages.nwlKageChampions = ['765668625318150204'];
}

function poserChuninDuSamedi(): void {
  tournois.push({
    id: 't-chunin-05',
    partner: NWL_CHUNIN_PARTNER_KEY,
    status: 'completed',
    scheduledStartAt: SAMEDI_CHUNIN,
    createdAt: SAMEDI_CHUNIN,
    completedAt: new Date(SAMEDI_CHUNIN.getTime() + 2 * 60 * 60 * 1000),
    startedAt: SAMEDI_CHUNIN,
    winnerId: 'u-nouveau',
    partnerPrizeAwarded: false,
    partnerStandingsRecorded: false,
    partnerCodeSentAt: null,
    partnerRoleWaived: false,
    joinCode: 'CHU123',
    name: 'Saturday Chunin Tag Tournament',
  });
  matchs.push(
    { id: 'm1', tournamentId: 't-chunin-05', player1Id: 'u-nouveau', player2Id: 'u-jordan', status: 'completed', winnerId: 'u-nouveau', round: 1, isBye: false },
    { id: 'm2', tournamentId: 't-chunin-05', player1Id: 'u-nouveau', player2Id: 'u-kutxyt', status: 'completed', winnerId: 'u-nouveau', round: 2, isBye: false },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(reglages)) delete reglages[k];
  tournois = [];
  matchs = [];
  mpEnvoyes.length = 0;
  salons.length = 0;
  process.env.NWL_BOT_TOKEN = 'jeton-de-test';
  stubDiscord();
  grainePourAout();
});

describe('le Chunin du samedi compte pour le Kage suivant, jamais pour celui du lendemain', () => {
  it('le 6 septembre 2026 est bien un premier dimanche', () => {
    expect(estPremierDimancheDuMois(2026, 9, 6)).toBe(true);
    expect(estPremierDimancheDuMois(2026, 9, 13), 'le deuxieme dimanche ne compte pas').toBe(false);
    expect(estPremierDimancheDuMois(2026, 10, 4), 'le Kage suivant est le 4 octobre').toBe(true);
  });

  it('le Kage du dimanche lit le mois precedent, pas le samedi de la veille', async () => {
    poserChuninDuSamedi();

    const bornes = bornesDuMoisPrecedent(KAGE_SEPTEMBRE);
    expect(cleDuMois(bornes.debut), 'le Kage de septembre lit aout').toBe('2026-08');

    const qualifies = await kageQualifiers(KAGE_SEPTEMBRE);
    const noms = qualifies.map((q) => q.username);

    expect(noms.length, 'huit places').toBe(8);
    expect(noms[0], 'le champion en titre ouvre la liste').toBe('mak52554');
    expect(
      noms,
      'le vainqueur du samedi 5 septembre ne rentre pas au Kage du 6',
    ).not.toContain('Nouveau');
    expect(noms).toEqual([
      'mak52554', 'IlNaRa_ITA', 'Im_boss', 'Kingkuni3', 'MrStachu2012', 'Tedd', 'Kutxyt', 'Jordan',
    ]);
  });

  it('ce meme samedi alimente bien le classement de septembre, donc le Kage d octobre', async () => {
    poserChuninDuSamedi();
    const septembre = bornesDuMois(KAGE_SEPTEMBRE);
    const classement = await chuninStandings(septembre.debut, septembre.fin);

    expect(classement.map((e) => e.username), 'les matchs du samedi comptent des maintenant').toContain('Nouveau');
    const gagnant = classement.find((e) => e.username === 'Nouveau');
    expect(gagnant?.wins).toBe(2);
    expect(gagnant?.points, 'trois points par victoire').toBe(6);

    const octobre = await kageQualifiers(new Date(Date.UTC(2026, 9, 4, 19, 0)));
    expect(octobre.map((q) => q.username), 'et le voila au Kage d octobre').toContain('Nouveau');
  });

  it('le classement de septembre survit a la purge du tournoi du samedi', async () => {
    poserChuninDuSamedi();
    const septembre = bornesDuMois(KAGE_SEPTEMBRE);

    const deuxJoursApres = Date.UTC(2026, 8, 7, 23, 0);
    const purge = await cleanupOldTournaments(deuxJoursApres);
    expect(purge.deleted, 'le tournoi est bien efface').toBe(1);
    expect(purge.classementsGraves, 'mais son classement a ete grave avant').toBe(1);
    expect(tournois.length).toBe(0);
    expect(matchs.length, 'les matchs partent avec lui').toBe(0);

    const apres = await chuninStandings(septembre.debut, septembre.fin);
    expect(apres.map((e) => e.username), 'le vainqueur est toujours la').toContain('Nouveau');
    expect(apres.find((e) => e.username === 'Nouveau')?.wins).toBe(2);
  });

  it('un tournoi bloque sans vainqueur laisse quand meme ses matchs joues au classement', async () => {
    tournois.push({
      id: 't-bloque',
      partner: NWL_CHUNIN_PARTNER_KEY,
      status: 'in_progress',
      scheduledStartAt: SAMEDI_CHUNIN,
      createdAt: SAMEDI_CHUNIN,
      completedAt: null,
      startedAt: SAMEDI_CHUNIN,
      winnerId: null,
      partnerPrizeAwarded: false,
      partnerStandingsRecorded: false,
      partnerCodeSentAt: null,
      partnerRoleWaived: false,
      joinCode: 'BLQ123',
      name: 'Saturday Chunin Tag Tournament',
    });
    matchs.push(
      { id: 'b1', tournamentId: 't-bloque', player1Id: 'u-tedd', player2Id: 'u-jordan', status: 'completed', winnerId: 'u-tedd', round: 1, isBye: false },
      { id: 'b2', tournamentId: 't-bloque', player1Id: 'u-kutxyt', player2Id: 'u-imboss', status: 'in_progress', winnerId: null, round: 1, isBye: false },
    );

    expect(await cloturerPalierNwl('t-bloque'), 'la ceremonie ne peut pas se tenir').toBe(false);

    const purge = await cleanupOldTournaments(Date.UTC(2026, 8, 7, 23, 0));
    expect(purge.classementsGraves, 'la purge grave malgre tout').toBe(1);

    const septembre = bornesDuMois(KAGE_SEPTEMBRE);
    const classement = await chuninStandings(septembre.debut, septembre.fin);
    const tedd = classement.find((e) => e.username === 'Tedd');
    expect(tedd?.wins, 'la victoire jouee compte').toBe(1);
    expect(
      classement.map((e) => e.username),
      'le match jamais termine ne compte pas, ses deux joueurs restent hors du classement de septembre',
    ).not.toContain('Kutxyt');
    expect(classement.map((e) => e.username)).not.toContain('Im_boss');
  });

  it('rien n est compte deux fois quand la gravure a deja eu lieu', async () => {
    poserChuninDuSamedi();
    const septembre = bornesDuMois(KAGE_SEPTEMBRE);

    expect(await graverAvantPurge(['t-chunin-05'])).toBe(1);
    const premier = await chuninStandings(septembre.debut, septembre.fin);
    expect(await graverAvantPurge(['t-chunin-05']), 'une deuxieme gravure ne fait rien').toBe(0);
    const second = await chuninStandings(septembre.debut, septembre.fin);

    expect(second.find((e) => e.username === 'Nouveau')?.wins).toBe(2);
    expect(second).toEqual(premier);
  });

  it('le role Jonin suit septembre une fois le Kage joue, et n y revient pas apres la purge', async () => {
    poserChuninDuSamedi();
    tournois.push({
      id: 't-kage-06',
      partner: NWL_KAGE_PARTNER_KEY,
      status: 'completed',
      scheduledStartAt: KAGE_SEPTEMBRE,
      createdAt: KAGE_SEPTEMBRE,
      completedAt: new Date(KAGE_SEPTEMBRE.getTime() + 2 * 60 * 60 * 1000),
      startedAt: KAGE_SEPTEMBRE,
      winnerId: 'u-tedd',
      partnerPrizeAwarded: true,
      partnerStandingsRecorded: false,
      partnerCodeSentAt: null,
      partnerRoleWaived: false,
      joinCode: 'KAG123',
      name: 'Monthly Kage Only Tournament',
    });
    reglages.nwlKageJoues = ['2026-09'];

    const lundi = new Date(Date.UTC(2026, 8, 7, 10, 0));
    const avecLaLigne = await standingsPourJonin(lundi);
    expect(avecLaLigne.map((e) => e.username), 'le Kage est joue, on suit septembre').toContain('Nouveau');

    tournois = tournois.filter((t) => t.id !== 't-kage-06');
    const apresPurge = await standingsPourJonin(new Date(Date.UTC(2026, 8, 9, 10, 0)));
    expect(
      apresPurge.map((e) => e.username),
      'la ligne du Kage a disparu, le role ne doit pas retomber sur aout',
    ).toContain('Nouveau');
  });
});

describe('seuls les qualifies entrent au Kage, et ils recoivent le code', () => {
  it('les huit qualifies recoivent un message prive avec le code', async () => {
    const envoi = await diffuserCodeKage('KAGE42', KAGE_SEPTEMBRE);

    expect(envoi.mp, 'un message prive par qualifie').toBe(8);
    expect(new Set(mpEnvoyes).size).toBe(8);
    expect(mpEnvoyes, 'le champion en titre est prevenu lui aussi').toContain('765668625318150204');
    expect(mpEnvoyes, 'et le huitieme du classement').toContain('318819703910957057');
    expect(mpEnvoyes, 'un non qualifie n est pas contacte').not.toContain('999000111222333444');

    expect(envoi.salon, 'le code est aussi annonce dans le salon').toBe(true);
    const annonce = salons.find((s) => s.contenu.includes('KAGE42'));
    expect(annonce, 'le message contient bien le code').toBeTruthy();
    expect(annonce?.contenu, 'et l heure de depart en heure locale britannique').toContain('20:00 BST');
  });

  it('un qualifie injoignable en prive est signale aux organisateurs', async () => {
    const dur = '1201252986396094535';
    global.fetch = vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entree);
      const corps = init?.body ? (JSON.parse(String(init.body)) as Record<string, string>) : {};
      if (url.endsWith('/users/@me/channels')) {
        if (corps.recipient_id === dur) return new Response('', { status: 403 });
        return new Response(JSON.stringify({ id: `dm-${corps.recipient_id}` }), { status: 200 });
      }
      const salon = url.split('/channels/')[1]?.split('/')[0] ?? '';
      if (!salon.startsWith('dm-')) salons.push({ channelId: salon, contenu: corps.content ?? '' });
      return new Response(JSON.stringify({ id: 'msg-1', channel_id: salon }), { status: 200 });
    }) as unknown as typeof fetch;

    const envoi = await diffuserCodeKage('KAGE42', KAGE_SEPTEMBRE);
    expect(envoi.mp, 'sept sur huit ont recu leur code').toBe(7);

    const alerte = salons.find((s) => s.contenu.includes('could not be reached'));
    expect(alerte, 'les organisateurs sont prevenus').toBeTruthy();
    expect(alerte?.contenu, 'le joueur concerne est nomme').toContain('Kutxyt');
  });

  it('un joueur non qualifie qui recupere le code est refuse', async () => {
    const refus = await refuserSiPalierNwlInterdit(NWL_KAGE_PARTNER_KEY, '999000111222333444');
    expect(refus, 'la porte se ferme').toBeTruthy();
    expect(refus?.status).toBe(403);
    expect(refus?.errorKey).toBe('tournament.error.nwlNoKageRole');
  });

  it('chacun des huit qualifies passe la porte', async () => {
    const qualifies = await kageQualifiers(KAGE_SEPTEMBRE);
    for (const q of qualifies) {
      expect(
        await refuserSiPalierNwlInterdit(NWL_KAGE_PARTNER_KEY, q.discordId),
        `${q.username} doit pouvoir entrer`,
      ).toBeNull();
    }
    expect(qualifies.length).toBe(NWL_KAGE_STANDINGS_SLOTS + 1);
  });

  it('un joueur sans Discord lie ne passe pas, et on lui dit pourquoi', async () => {
    const refus = await refuserSiPalierNwlInterdit(NWL_KAGE_PARTNER_KEY, null);
    expect(refus?.errorKey).toBe('tournament.error.linkDiscord');
  });
});
