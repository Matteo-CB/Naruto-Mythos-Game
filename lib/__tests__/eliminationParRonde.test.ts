import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

vi.mock('@/lib/db/prisma', () => {
  const m = {
    tournament: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    tournamentParticipant: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    tournamentMatch: {
      findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(),
      update: vi.fn(), updateMany: vi.fn(), createMany: vi.fn(), create: vi.fn(),
    },
    user: { findUnique: vi.fn(), update: vi.fn() },
    deck: { findUnique: vi.fn() },
    game: { findUnique: vi.fn() },
    $runCommandRaw: vi.fn(),
  };
  return { prisma: m };
});

const partage = vi.hoisted(() => ({
  timersArmes: [] as string[],
  timersArretes: [] as string[],
  messagesCibles: [] as Array<{ userId: string; event: string }>,
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
vi.mock('@/lib/socket/io', () => ({
  emitToUser: vi.fn((userId: string, event: string) => { partage.messagesCibles.push({ userId, event }); }),
  isUserConnected: vi.fn(() => false),
}));
vi.mock('@/lib/tournament/absenceManager', () => ({
  startAbsenceTimer: vi.fn((matchId: string) => { partage.timersArmes.push(matchId); return new Date(Date.now() + 300_000); }),
  clearAbsenceTimer: vi.fn((matchId: string) => { partage.timersArretes.push(matchId); }),
  scheduleAbsenceTimerWithDeadline: vi.fn(),
  ABSENCE_TIMEOUT_MS: 5 * 60 * 1000,
}));
vi.mock('@/lib/discord/tournamentRoles', () => ({ assignTournamentWinnerRole: vi.fn() }));
vi.mock('@/lib/discord/tournamentWebhook', () => ({ sendTournamentResults: vi.fn() }));
vi.mock('@/lib/data/cardIndex', () => ({ getCharacterById: vi.fn(), getMissionById: vi.fn() }));
vi.mock('@/lib/tournament/matchRoomCleanup', () => ({
  finalizeAndScheduleRoomDeletion: vi.fn(),
  clearAllMatchRoomTimers: vi.fn(),
}));
vi.mock('@/lib/tournament/nwlPrize', () => ({ awardNwlPrizeIfNeeded: vi.fn(async () => {}) }));

const { prisma: p } = (await import('@/lib/db/prisma')) as unknown as { prisma: Record<string, Record<string, ReturnType<typeof vi.fn>>> };
const { basculerSiRondeTerminee, ouvrirLaRonde, rondePasEncoreOuverte } = await import('@/lib/socket/tournamentHandlers');
const { selectCurrentMatchForUser, attendLOuvertureDeSaRonde, isOpenForUser } = await import('@/lib/tournament/matchSelection');

const RACINE = process.cwd();
const HANDLERS = readFileSync(join(RACINE, 'lib/socket/tournamentHandlers.ts'), 'utf8');
const LOCALES = ['en', 'fr', 'es', 'pt', 'it', 'pl', 'ja'];

function match(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'm1', tournamentId: 't1', round: 1, matchIndex: 0, bracket: 'main',
    status: 'completed', isBye: false, gameId: null, roomCode: null,
    player1Id: 'a', player2Id: 'b', player1Username: 'A', player2Username: 'B',
    ...over,
  };
}

function fauxIo() {
  const emissions: Array<{ event: string }> = [];
  const io = { to: () => ({ emit: (event: string) => { emissions.push({ event }); } }), sockets: { sockets: new Map() } };
  return { io, emissions };
}

beforeEach(() => {
  vi.clearAllMocks();
  partage.timersArmes.length = 0;
  partage.timersArretes.length = 0;
  partage.messagesCibles.length = 0;
  p.tournamentMatch.update.mockResolvedValue({});
  p.tournamentMatch.updateMany.mockResolvedValue({ count: 0 });
  p.tournament.update.mockResolvedValue({});
  p.tournamentMatch.count.mockResolvedValue(2);
});

describe('un tournoi a elimination avance par ronde entiere', () => {
  it('la ronde suivante reste fermee tant qu un seul match tourne encore', async () => {
    p.tournament.findUnique.mockResolvedValue({ status: 'in_progress', currentRound: 1, format: 'elimination' });
    p.tournamentMatch.findMany.mockResolvedValue([
      match({ id: 'm1', status: 'completed' }),
      match({ id: 'm2', status: 'in_progress' }),
    ]);
    const { io } = fauxIo();

    expect(await basculerSiRondeTerminee(io as never, 't1', 1)).toBe(false);
    expect(p.tournament.update, 'la ronde courante ne bouge pas').not.toHaveBeenCalled();
  });

  it('la ronde bascule quand tous les matchs sont finis, forfaits compris', async () => {
    p.tournament.findUnique.mockResolvedValue({ status: 'in_progress', currentRound: 1, format: 'elimination' });
    p.tournamentMatch.findMany
      .mockResolvedValueOnce([
        match({ id: 'm1', status: 'completed' }),
        match({ id: 'm2', status: 'forfeit' }),
      ])
      .mockResolvedValueOnce([match({ id: 'm3', round: 2, status: 'pending' })]);
    const { io, emissions } = fauxIo();

    expect(await basculerSiRondeTerminee(io as never, 't1', 1)).toBe(true);
    expect(p.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentRound: 2 } }),
    );
    expect(emissions.some((e) => e.event === 'tournament:round-complete')).toBe(true);
  });

  it('un match de la ronde suivante passe a ready seulement a l ouverture', async () => {
    p.tournamentMatch.findMany.mockResolvedValue([
      match({ id: 'm3', round: 2, status: 'pending' }),
      match({ id: 'm4', round: 2, status: 'pending', player2Id: null }),
    ]);
    const { io, emissions } = fauxIo();

    const ouverts = await ouvrirLaRonde(io as never, 't1', 2);
    expect(ouverts, 'seul le match dont les deux joueurs sont connus s ouvre').toBe(1);
    expect(p.tournamentMatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm3' }, data: { status: 'ready' } }),
    );
    expect(emissions.some((e) => e.event === 'tournament:match-updated')).toBe(true);
  });

  it('l ouverture ne touche jamais une partie deja en cours, meme si la requete la renvoie', async () => {
    p.tournamentMatch.findMany.mockResolvedValue([
      match({ id: 'm-live', round: 2, status: 'in_progress', gameId: 'g1', roomCode: 'ABC' }),
      match({ id: 'm-bye', round: 2, status: 'pending', isBye: true }),
      match({ id: 'm-autre-ronde', round: 5, status: 'pending' }),
    ]);
    const { io } = fauxIo();

    expect(await ouvrirLaRonde(io as never, 't1', 2), 'la partie en cours compte comme jouable').toBe(1);
    expect(p.tournamentMatch.update, 'mais rien n est ecrit dessus').not.toHaveBeenCalled();
  });

  it('un match deja ready par propagation de byes compte comme jouable', async () => {
    p.tournament.findUnique.mockResolvedValue({ format: 'elimination', currentRound: 2 });
    p.tournamentMatch.findMany.mockResolvedValue([
      match({ id: 'deux-byes', round: 2, status: 'ready' }),
      match({ id: 'a-ouvrir', round: 2, status: 'pending' }),
    ]);
    const { io } = fauxIo();

    const jouables = await ouvrirLaRonde(io as never, 't1', 2);
    expect(jouables, 'les deux comptent, sinon aucun chrono ne serait arme').toBe(2);
    expect(p.tournamentMatch.update, 'celui en attente est bien ouvert').toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a-ouvrir' }, data: { status: 'ready' } }),
    );
    expect(p.tournamentMatch.update, 'et le deja-ready n est jamais reouvert').not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'deux-byes' }, data: { status: 'ready' } }),
    );
    expect(partage.timersArmes, 'le chrono est arme sur le match deja ready, qui sinon n en aurait aucun').toContain('deux-byes');
  });

  it('un tournoi termine ou annule ne bascule plus', async () => {
    for (const status of ['completed', 'cancelled']) {
      vi.clearAllMocks();
      p.tournament.findUnique.mockResolvedValue({ status, currentRound: 1, format: 'elimination' });
      expect(await basculerSiRondeTerminee(fauxIo().io as never, 't1', 1)).toBe(false);
      expect(p.tournament.update).not.toHaveBeenCalled();
    }
  });

  it('le format suisse garde son propre mecanisme, on ne le double pas', async () => {
    p.tournament.findUnique.mockResolvedValue({ status: 'in_progress', currentRound: 1, format: 'swiss' });
    expect(await basculerSiRondeTerminee(fauxIo().io as never, 't1', 1)).toBe(false);
    expect(p.tournament.update).not.toHaveBeenCalled();
  });

  it('une ronde deja basculee n est pas rejouee', async () => {
    p.tournament.findUnique.mockResolvedValue({ status: 'in_progress', currentRound: 3, format: 'elimination' });
    expect(await basculerSiRondeTerminee(fauxIo().io as never, 't1', 1)).toBe(false);
    expect(p.tournament.update).not.toHaveBeenCalled();
  });

  it('la finale ne cherche pas a ouvrir une ronde qui n existe pas', async () => {
    p.tournament.findUnique.mockResolvedValue({ status: 'in_progress', currentRound: 3, format: 'elimination' });
    p.tournamentMatch.findMany.mockResolvedValue([match({ id: 'finale', round: 3, status: 'completed' })]);
    p.tournamentMatch.count.mockResolvedValue(0);

    expect(await basculerSiRondeTerminee(fauxIo().io as never, 't1', 3)).toBe(false);
    expect(p.tournament.update).not.toHaveBeenCalled();
  });

  it('une ronde entierement composee de byes deja resolus ne fige pas le tournoi', async () => {
    let tour = 1;
    p.tournament.findUnique.mockImplementation(async () => ({ status: 'in_progress', currentRound: tour, format: 'elimination' }));
    p.tournament.update.mockImplementation(async ({ data }: { data: { currentRound: number } }) => {
      tour = data.currentRound; return {};
    });
    p.tournamentMatch.count.mockResolvedValue(1);
    p.tournamentMatch.findMany.mockImplementation(async ({ where }: { where: { round: number; status?: string } }) => {
      if (where.status === 'pending') return [];
      if (where.round === 1) return [match({ id: 'm1', status: 'completed' })];
      if (where.round === 2) return [match({ id: 'bye2', round: 2, status: 'completed', isBye: true })];
      return [match({ id: 'finale', round: 3, status: 'in_progress' })];
    });

    expect(await basculerSiRondeTerminee(fauxIo().io as never, 't1', 1)).toBe(true);
    expect(tour, 'la cascade a traverse la ronde de byes jusqu a la finale').toBe(3);
  });

  it('la ronde d un match dit si elle est ouverte, et seulement en elimination', async () => {
    p.tournament.findUnique.mockResolvedValue({ format: 'elimination', currentRound: 1 });
    expect(await rondePasEncoreOuverte('t1', 2), 'ronde 2 fermee quand on est en ronde 1').toBe(true);
    expect(await rondePasEncoreOuverte('t1', 1)).toBe(false);

    p.tournament.findUnique.mockResolvedValue({ format: 'swiss', currentRound: 1 });
    expect(await rondePasEncoreOuverte('t1', 9), 'le suisse n est jamais bloque par ce verrou').toBe(false);
  });
});

describe('le serveur est la seule barriere, et le client ne propose rien d impossible', () => {
  it('advanceMatchWinner n ouvre plus le match suivant tout seul', () => {
    const bloc = HANDLERS.slice(
      HANDLERS.indexOf('const updateData: Record<string, unknown> = {};'),
      HANDLERS.indexOf('export async function ouvrirLaRonde'),
    );
    expect(bloc.length).toBeGreaterThan(200);
    expect(bloc, 'plus de passage a ready a l avancement').not.toContain("data: { status: 'ready' }");
    expect(bloc, 'plus d armement du chrono d absence a l avancement').not.toContain('armReadyMatchAbsence');
    expect(bloc, 'la fin de ronde est le seul declencheur').toContain('basculerSiRondeTerminee(io, tournamentId, match.round)');
  });

  it('la branche du bye verifie aussi la fin de ronde avant de sortir', () => {
    const bye = HANDLERS.slice(HANDLERS.indexOf('if (nextMatch.isBye) {'), HANDLERS.indexOf('export async function ouvrirLaRonde'));
    const avantRetour = bye.slice(0, bye.indexOf('    return;'));
    expect(avantRetour, 'sinon un bye figeait la ronde').toContain('basculerSiRondeTerminee(io, tournamentId, match.round)');
  });

  it('le gestionnaire de mise en jeu refuse un match dont la ronde n est pas ouverte', () => {
    const bloc = HANDLERS.slice(HANDLERS.indexOf("socket.on('tournament:ready'"), HANDLERS.indexOf('matchReadyPlayers.set(matchId, new Set())'));
    expect(bloc).toContain('rondePasEncoreOuverte(tournamentId, match.round)');
    expect(bloc, 'et le joueur est prevenu au lieu d un refus muet').toContain('tournament:round-not-open');
  });

  it('le chrono d absence ne peut pas forfaiter sur une ronde fermee', () => {
    const bloc = HANDLERS.slice(HANDLERS.indexOf('export async function fireAbsenceTimerCallback'), HANDLERS.indexOf('export async function fireAbsenceTimerCallback') + 2500);
    expect(bloc).toContain('rondePasEncoreOuverte(m.tournamentId, m.round)');
    expect(bloc, 'et le minuteur est desarme').toContain('clearAbsenceTimer(matchId)');
  });

  it('un balayage periodique rattrape une ronde restee bloquee', () => {
    expect(HANDLERS).toContain('export async function rattraperLesRondesBloquees');
    const balayage = HANDLERS.slice(HANDLERS.indexOf('export async function sweepOrphanTournamentMatches'));
    expect(balayage.slice(0, 300), 'le rattrapage tourne avec le balayage existant').toContain('rattraperLesRondesBloquees(io)');
  });

  it('le client ne propose pas un match dont la ronde n est pas ouverte', () => {
    const matchs = [
      { id: 'r1', round: 1, matchIndex: 0, status: 'completed', player1Id: 'moi', player2Id: 'x' },
      { id: 'r2', round: 2, matchIndex: 0, status: 'pending', player1Id: 'moi', player2Id: 'y' },
    ];
    expect(selectCurrentMatchForUser(matchs, 'moi', 1), 'rien a lancer').toBeUndefined();
    expect(attendLOuvertureDeSaRonde(matchs, 'moi', 1), 'mais on lui dit qu il attend').toBe(true);

    expect(selectCurrentMatchForUser(matchs, 'moi', 2)?.id, 'ronde ouverte, le match apparait').toBe('r2');
    expect(attendLOuvertureDeSaRonde(matchs, 'moi', 2)).toBe(false);
  });

  it('sans ronde connue le comportement d avant est conserve', () => {
    const m = { id: 'r2', round: 2, matchIndex: 0, status: 'pending', player1Id: 'moi', player2Id: 'y' };
    expect(isOpenForUser(m, 'moi'), 'appel a deux arguments inchange').toBe(true);
    expect(isOpenForUser(m, 'moi', 1)).toBe(false);
    expect(attendLOuvertureDeSaRonde([m], 'moi', null)).toBe(false);
  });

  it('le message d attente existe dans les sept langues', () => {
    for (const code of LOCALES) {
      const m = JSON.parse(readFileSync(join(RACINE, `messages/${code}.json`), 'utf8'));
      expect(m.tournament?.roundWaitTitle, `${code}: titre`).toBeTruthy();
      expect(m.tournament?.roundWaitHint, `${code}: explication`).toBeTruthy();
    }
  });

  it('le jeudi automatique est bien passe en elimination', async () => {
    const { WEEKLY_SCHEDULE } = await import('@/lib/tournament/weeklySchedule');
    expect(WEEKLY_SCHEDULE[4]?.format, 'jeudi').toBe('elimination');
    expect(WEEKLY_SCHEDULE[2]?.format, 'mardi reste elimination').toBe('elimination');
    expect(WEEKLY_SCHEDULE[6]?.format, 'samedi reste en suisse').toBe('swiss');
    expect(WEEKLY_SCHEDULE[3]?.gameMode, 'mercredi reste le scelle').toBe('sealed');
  });
});
