import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

interface Ligne { [k: string]: unknown }

const bd = vi.hoisted(() => ({
  tournois: [] as Ligne[],
  matchs: [] as Ligne[],
  participants: [] as Ligne[],
  users: [] as Ligne[],
  timersArmes: [] as string[],
}));

function correspond(ligne: Ligne, where: Ligne): boolean {
  for (const [champ, attendu] of Object.entries(where)) {
    if (champ === 'NOT') { if (correspond(ligne, attendu as Ligne)) return false; continue; }
    if (champ === 'OR') {
      if (!(attendu as Ligne[]).some((b) => correspond(ligne, b))) return false;
      continue;
    }
    if (champ === 'AND') {
      if (!(attendu as Ligne[]).every((b) => correspond(ligne, b))) return false;
      continue;
    }
    const v = ligne[champ];
    if (attendu === null) { if (v !== null && v !== undefined) return false; continue; }
    if (attendu && typeof attendu === 'object' && !(attendu instanceof Date)) {
      const c = attendu as Ligne;
      if ('in' in c && !(c.in as unknown[]).includes(v)) return false;
      if ('notIn' in c && (c.notIn as unknown[]).includes(v)) return false;
      if ('not' in c) {
        const n = c.not;
        if (n === null) { if (v === null || v === undefined) return false; }
        else if (v === n) return false;
      }
      if ('isSet' in c) {
        const present = v !== undefined && v !== null;
        if (present !== c.isSet) return false;
      }
      if ('gte' in c && !(v instanceof Date && v >= (c.gte as Date))) return false;
      if ('lt' in c && !(v instanceof Date && v < (c.lt as Date))) return false;
      continue;
    }
    if (v !== attendu) return false;
  }
  return true;
}

function cleComposee(where: Ligne): Ligne | null {
  const k = where.tournamentId_bracket_round_matchIndex as Ligne | undefined;
  return k ?? null;
}

function table(rows: Ligne[]) {
  return {
    findMany: vi.fn(async ({ where }: { where?: Ligne } = {}) =>
      rows.filter((r) => correspond(r, where ?? {})).map((r) => ({ ...r }))),
    findFirst: vi.fn(async ({ where }: { where?: Ligne } = {}) => {
      const r = rows.find((x) => correspond(x, where ?? {}));
      return r ? { ...r } : null;
    }),
    findUnique: vi.fn(async ({ where }: { where: Ligne }) => {
      const k = cleComposee(where);
      const cible = k ? rows.find((r) => correspond(r, k)) : rows.find((r) => r.id === where.id);
      return cible ? { ...cible } : null;
    }),
    count: vi.fn(async ({ where }: { where?: Ligne } = {}) => rows.filter((r) => correspond(r, where ?? {})).length),
    update: vi.fn(async ({ where, data }: { where: Ligne; data: Ligne }) => {
      const k = cleComposee(where);
      const cible = k ? rows.find((r) => correspond(r, k)) : rows.find((r) => r.id === where.id);
      if (!cible) throw new Error('update: introuvable');
      Object.assign(cible, data);
      return { ...cible };
    }),
    updateMany: vi.fn(async ({ where, data }: { where?: Ligne; data: Ligne } = { data: {} }) => {
      const cibles = rows.filter((r) => correspond(r, where ?? {}));
      for (const c of cibles) Object.assign(c, data);
      return { count: cibles.length };
    }),
    create: vi.fn(async ({ data }: { data: Ligne }) => { rows.push({ ...data }); return { ...data }; }),
    createMany: vi.fn(async ({ data }: { data: Ligne[] }) => { for (const d of data) rows.push({ ...d }); return { count: data.length }; }),
    deleteMany: vi.fn(async ({ where }: { where?: Ligne } = {}) => {
      const avant = rows.length;
      const restants = rows.filter((r) => !correspond(r, where ?? {}));
      rows.length = 0; rows.push(...restants);
      return { count: avant - rows.length };
    }),
  };
}

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    tournament: table(bd.tournois),
    tournamentMatch: table(bd.matchs),
    tournamentParticipant: table(bd.participants),
    user: table(bd.users),
    deck: table([]),
    game: table([]),
    $runCommandRaw: vi.fn(),
  },
}));

vi.mock('@/lib/socket/server', () => ({
  rooms: new Map(),
  getSocketIO: vi.fn(() => null),
  maybeStartTournamentGame: vi.fn(async () => false),
  reconcileTournamentRoomSeats: vi.fn(async () => false),
  isSeatSocketAlive: vi.fn(() => false),
  clearTournamentInviteTimer: vi.fn(),
  isUserInAnotherLiveGame: vi.fn(() => false),
}));
vi.mock('@/lib/socket/io', () => ({ emitToUser: vi.fn(), isUserConnected: vi.fn(() => true) }));
vi.mock('@/lib/tournament/absenceManager', () => ({
  startAbsenceTimer: vi.fn((matchId: string) => { bd.timersArmes.push(matchId); return new Date(Date.now() + 300_000); }),
  clearAbsenceTimer: vi.fn(),
  scheduleAbsenceTimerWithDeadline: vi.fn(),
  ABSENCE_TIMEOUT_MS: 5 * 60 * 1000,
}));
vi.mock('@/lib/discord/tournamentRoles', () => ({ assignTournamentWinnerRole: vi.fn(async () => null) }));
vi.mock('@/lib/discord/tournamentWebhook', () => ({ sendTournamentResults: vi.fn() }));
vi.mock('@/lib/data/cardIndex', () => ({ getCharacterById: vi.fn(), getMissionById: vi.fn() }));
vi.mock('@/lib/tournament/matchRoomCleanup', () => ({
  finalizeAndScheduleRoomDeletion: vi.fn(), clearAllMatchRoomTimers: vi.fn(),
}));
vi.mock('@/lib/tournament/nwlPrize', () => ({ awardNwlPrizeIfNeeded: vi.fn(async () => {}) }));
vi.mock('@/lib/tournament/matchEventLog', () => ({ logMatchEvent: vi.fn() }));

const { advanceMatchWinner, basculerSiRondeTerminee, rondePasEncoreOuverte, rattraperLesRondesBloquees } =
  await import('@/lib/socket/tournamentHandlers');
const { generateBracket, MAIN_BRACKET } = await import('@/lib/tournament/tournamentEngine');

const TID = 'tourn-1';

function fauxIo() {
  return { to: () => ({ emit: () => {} }), sockets: { sockets: new Map() } } as never;
}

function installe(n: number): number {
  bd.tournois.length = 0; bd.matchs.length = 0; bd.participants.length = 0; bd.users.length = 0;
  bd.timersArmes.length = 0;

  const joueurs = Array.from({ length: n }, (_, i) => ({ userId: `j${i + 1}`, username: `J${i + 1}` }));
  const { matches, totalRounds, thirdPlaceMatch } = generateBracket(joueurs as never) as unknown as {
    matches: Array<Record<string, never>>; totalRounds: number; thirdPlaceMatch: Record<string, never> | null;
  };

  const toutes = thirdPlaceMatch ? [...matches, thirdPlaceMatch] : matches;
  toutes.forEach((m, i) => {
    const src = m as unknown as {
      bracket?: string; round: number; matchIndex: number; isBye: boolean; status: string;
      winnerId: string | null; winnerUsername: string | null;
      player1: { participantId: string | null; username: string | null };
      player2: { participantId: string | null; username: string | null };
    };
    bd.matchs.push({
      id: `m${i}`, tournamentId: TID, bracket: src.bracket ?? MAIN_BRACKET,
      round: src.round, matchIndex: src.matchIndex, isBye: src.isBye,
      status: src.status === 'completed' ? 'completed'
        : (src.status === 'ready' && src.round <= 1) ? 'ready'
        : 'pending',
      player1Id: src.player1.participantId, player2Id: src.player2.participantId,
      player1Username: src.player1.username, player2Username: src.player2.username,
      winnerId: src.winnerId, winnerUsername: src.winnerUsername,
      roomCode: null, gameId: null, absenceDeadline: null, absentPlayerId: null,
      player1GameWins: 0, player2GameWins: 0, completedAt: null,
    });
  });

  for (const j of joueurs) {
    bd.participants.push({ id: `p-${j.userId}`, tournamentId: TID, userId: j.userId, username: j.username, eliminated: false, hasBye: false });
    bd.users.push({ id: j.userId, username: j.username, tournamentWins: 0, discordId: null });
  }
  bd.tournois.push({
    id: TID, status: 'in_progress', format: 'elimination', currentRound: 1, totalRounds,
    winnerId: null, winnerUsername: null, name: 'Test', partner: null, bestOf: 1, completedAt: null,
  });
  return totalRounds;
}

function principaux(round: number): Ligne[] {
  return bd.matchs.filter((m) => m.bracket === MAIN_BRACKET && m.round === round);
}

function tournoi(): Ligne { return bd.tournois[0]; }

function invariants(n: number, etape: string): void {
  const cr = tournoi().currentRound as number;
  for (const m of bd.matchs) {
    if (m.bracket !== MAIN_BRACKET) continue;
    if ((m.round as number) > cr) {
      expect(
        m.status === 'ready' || m.status === 'in_progress',
        `effectif ${n} (${etape}): le match ${m.id} de la ronde ${m.round} est ouvert alors que la ronde courante est ${cr}`,
      ).toBe(false);
    }
  }
}

async function joue(n: number, options: { forfaits?: boolean; ordreInverse?: boolean } = {}): Promise<{
  vainqueur: string | null; rondes: number; cr: number;
}> {
  const totalRounds = installe(n);

  for (let round = 1; round <= totalRounds; round++) {
    const crAvant = tournoi().currentRound as number;
    expect(crAvant, `effectif ${n}: on doit etre a la ronde ${round}`).toBe(round);

    const aJouer = principaux(round).filter((m) => m.status !== 'completed' && m.status !== 'forfeit');
    if (options.ordreInverse) aJouer.reverse();

    for (let i = 0; i < aJouer.length; i++) {
      const m = aJouer[i];
      expect(
        m.player1Id && m.player2Id,
        `effectif ${n}, ronde ${round}: le match ${m.id} n a pas ses deux joueurs`,
      ).toBeTruthy();

      const forfait = options.forfaits && i % 3 === 2;
      const gagnant = m.player1Id as string;
      Object.assign(m, {
        status: forfait ? 'forfeit' : 'completed',
        winnerId: gagnant, winnerUsername: m.player1Username, completedAt: new Date(),
      });
      await advanceMatchWinner(fauxIo(), TID, {
        round: m.round as number, matchIndex: m.matchIndex as number, bracket: m.bracket as string,
        player1Id: m.player1Id as string, player2Id: m.player2Id as string,
        player1Username: m.player1Username as string, player2Username: m.player2Username as string,
      }, gagnant, m.player1Username as string);

      invariants(n, `ronde ${round} match ${i + 1}/${aJouer.length}`);
    }
  }

  return {
    vainqueur: (tournoi().winnerId as string) ?? null,
    rondes: totalRounds,
    cr: tournoi().currentRound as number,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('le tableau persiste au demarrage n ouvre jamais une ronde future', () => {
  it('startLogic ne pose ready que sur la premiere ronde', () => {
    const source = readFileSync(join(process.cwd(), 'lib/tournament/startLogic.ts'), 'utf8');
    const occurrences = source.split("m.status === 'ready'").length - 1;
    expect(occurrences, 'les deux branches de persistance existent').toBeGreaterThan(0);
    expect(
      source,
      'un match de ronde 2 rempli par deux byes ne doit pas naitre jouable',
    ).toContain("(m.status === 'ready' && m.round <= 1) ? 'ready'");
    expect(
      source.includes("status: m.status === 'ready' ? 'ready' :"),
      'l ancienne regle ne doit plus exister',
    ).toBe(false);
  });

  it('un effectif a byes multiples ne rend aucun match de ronde 2 jouable', () => {
    for (const n of [10, 11, 9, 12, 13, 20]) {
      installe(n);
      const cr = tournoi().currentRound as number;
      const ouvertsTropTot = bd.matchs.filter(
        (m) => m.bracket === MAIN_BRACKET && (m.round as number) > cr && m.status === 'ready',
      );
      expect(ouvertsTropTot.map((m) => m.id), `effectif ${n}`).toEqual([]);
    }
  });
});

describe('un tournoi a elimination va jusqu au bout, quel que soit l effectif', () => {
  it('de 2 a 32 joueurs, chaque tournoi designe un vainqueur sans jamais se figer', async () => {
    for (let n = 2; n <= 32; n++) {
      const r = await joue(n);
      expect(r.vainqueur, `effectif ${n}: pas de vainqueur`).toBeTruthy();
      const restants = bd.matchs.filter(
        (m) => m.bracket === MAIN_BRACKET && m.status !== 'completed' && m.status !== 'forfeit',
      );
      expect(restants.map((m) => m.id), `effectif ${n}: des matchs principaux non resolus`).toEqual([]);
    }
  });

  it('avec des forfaits en cours de route, le tournoi se termine aussi', async () => {
    for (const n of [4, 5, 7, 8, 11, 16, 32]) {
      const r = await joue(n, { forfaits: true });
      expect(r.vainqueur, `effectif ${n} avec forfaits`).toBeTruthy();
    }
  });

  it('l ordre dans lequel les matchs se terminent ne change rien', async () => {
    for (const n of [4, 6, 8, 13, 16, 32]) {
      const r = await joue(n, { ordreInverse: true });
      expect(r.vainqueur, `effectif ${n} en ordre inverse`).toBeTruthy();
    }
  });

  it('jamais un match d une ronde future n est ouvert avant l heure', async () => {
    for (const n of [4, 5, 8, 12, 16, 32]) {
      await joue(n);
    }
  });

  it('la ronde courante n avance que d un cran a la fois et ne recule jamais', async () => {
    const totalRounds = installe(8);
    const vus: number[] = [tournoi().currentRound as number];

    for (let round = 1; round <= totalRounds; round++) {
      for (const m of principaux(round).filter((x) => x.status !== 'completed')) {
        Object.assign(m, { status: 'completed', winnerId: m.player1Id, winnerUsername: m.player1Username });
        await advanceMatchWinner(fauxIo(), TID, {
          round: m.round as number, matchIndex: m.matchIndex as number, bracket: m.bracket as string,
          player1Id: m.player1Id as string, player2Id: m.player2Id as string,
          player1Username: m.player1Username as string, player2Username: m.player2Username as string,
        }, m.player1Id as string, m.player1Username as string);
        vus.push(tournoi().currentRound as number);
      }
    }

    for (let i = 1; i < vus.length; i++) {
      expect(vus[i] >= vus[i - 1], `la ronde a recule: ${vus.join(',')}`).toBe(true);
      expect(vus[i] - vus[i - 1] <= 1, `la ronde a saute un cran: ${vus.join(',')}`).toBe(true);
    }
  });

  it('un joueur ne peut pas lancer un match dont la ronde n est pas ouverte', async () => {
    installe(8);
    for (const m of bd.matchs.filter((x) => x.bracket === MAIN_BRACKET)) {
      const ferme = await rondePasEncoreOuverte(TID, m.round as number);
      expect(ferme, `ronde ${m.round}`).toBe((m.round as number) > 1);
    }
  });

  it('le rattrapage rouvre une ronde restee bloquee apres un redemarrage', async () => {
    installe(4);
    for (const m of principaux(1)) {
      Object.assign(m, { status: 'completed', winnerId: m.player1Id, winnerUsername: m.player1Username });
    }
    const suivants = principaux(2);
    suivants[0].player1Id = 'j1'; suivants[0].player2Id = 'j3';
    suivants[0].player1Username = 'J1'; suivants[0].player2Username = 'J3';
    expect(tournoi().currentRound, 'la bascule n a jamais eu lieu').toBe(1);

    const rattrapees = await rattraperLesRondesBloquees(fauxIo());

    expect(rattrapees, 'le balayage a rattrape le tournoi').toBeGreaterThan(0);
    expect(tournoi().currentRound, 'la ronde 2 est ouverte').toBe(2);
    expect(suivants[0].status, 'et son match est jouable').toBe('ready');
  });

  it('une bascule deja faite n est jamais rejouee par le rattrapage', async () => {
    installe(4);
    for (const m of principaux(1)) {
      Object.assign(m, { status: 'completed', winnerId: m.player1Id, winnerUsername: m.player1Username });
    }
    const suivants = principaux(2);
    suivants[0].player1Id = 'j1'; suivants[0].player2Id = 'j3';
    await rattraperLesRondesBloquees(fauxIo());
    const apresPremier = tournoi().currentRound;

    const second = await rattraperLesRondesBloquees(fauxIo());
    expect(tournoi().currentRound, 'la ronde ne bouge plus').toBe(apresPremier);
    expect(second, 'et rien n est signale comme rattrape').toBe(0);
  });

  it('la petite finale s ouvre en meme temps que la finale, sans la retarder', async () => {
    installe(4);
    const petiteFinale = bd.matchs.find((m) => m.bracket !== MAIN_BRACKET);
    expect(petiteFinale, 'un tableau de quatre a bien une petite finale').toBeTruthy();
    expect(petiteFinale!.round, 'elle porte le numero de la finale').toBe(2);

    for (const m of principaux(1)) {
      Object.assign(m, { status: 'completed', winnerId: m.player1Id, winnerUsername: m.player1Username });
      await advanceMatchWinner(fauxIo(), TID, {
        round: 1, matchIndex: m.matchIndex as number, bracket: m.bracket as string,
        player1Id: m.player1Id as string, player2Id: m.player2Id as string,
        player1Username: m.player1Username as string, player2Username: m.player2Username as string,
      }, m.player1Id as string, m.player1Username as string);
    }

    expect(tournoi().currentRound, 'la ronde 2 est ouverte').toBe(2);
    const finale = principaux(2)[0];
    expect(finale.status, 'la finale est jouable').toBe('ready');
    expect(
      petiteFinale!.status,
      'et la petite finale aussi, elles se jouent en parallele',
    ).toBe('ready');
  });

  it('la petite finale non resolue n empeche pas la ronde finale d etre consideree finie', async () => {
    installe(4);
    for (const m of principaux(1)) {
      Object.assign(m, { status: 'completed', winnerId: m.player1Id, winnerUsername: m.player1Username });
      await advanceMatchWinner(fauxIo(), TID, {
        round: 1, matchIndex: m.matchIndex as number, bracket: m.bracket as string,
        player1Id: m.player1Id as string, player2Id: m.player2Id as string,
        player1Username: m.player1Username as string, player2Username: m.player2Username as string,
      }, m.player1Id as string, m.player1Username as string);
    }
    const petiteFinale = bd.matchs.find((m) => m.bracket !== MAIN_BRACKET)!;
    Object.assign(petiteFinale, { status: 'in_progress' });

    const finale = principaux(2)[0];
    Object.assign(finale, { status: 'completed', winnerId: finale.player1Id });
    const bascule = await basculerSiRondeTerminee(fauxIo(), TID, 2);
    expect(
      bascule,
      'il n y a pas de ronde 3, donc rien a ouvrir: la petite finale ne bloque personne',
    ).toBe(false);
  });

  it('la bascule est sans effet tant qu un match de la ronde tourne encore', async () => {
    installe(8);
    const [premier, ...autres] = principaux(1);
    for (const m of autres) {
      Object.assign(m, { status: 'completed', winnerId: m.player1Id, winnerUsername: m.player1Username });
    }
    Object.assign(premier, { status: 'in_progress' });

    expect(await basculerSiRondeTerminee(fauxIo(), TID, 1)).toBe(false);
    expect(tournoi().currentRound, 'toujours en ronde 1').toBe(1);
    for (const m of principaux(2)) {
      expect(m.status, 'aucun match de la ronde 2 ne bouge').toBe('pending');
    }
  });
});
