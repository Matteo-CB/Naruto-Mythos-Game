import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => {
  const m = {
    tournament: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    tournamentParticipant: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    tournamentMatch: {
      findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(),
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
  salons: new Map<string, Record<string, unknown>>(),
  reconciliations: [] as string[],
  connectes: new Set<string>(),
  messagesCibles: [] as Array<{ userId: string; event: string }>,
  timersArmes: [] as string[],
  timersArretes: [] as string[],
  salonsFinalises: [] as string[],
  evenements: [] as Array<{ type: string; matchId?: string }>,
}));

const salons = partage.salons;
const reconciliations = partage.reconciliations;

vi.mock('@/lib/socket/server', () => ({
  rooms: partage.salons,
  getSocketIO: vi.fn(() => null),
  maybeStartTournamentGame: vi.fn(async () => false),
  reconcileTournamentRoomSeats: vi.fn(async (_room: unknown, code: string) => {
    partage.reconciliations.push(code);
    return false;
  }),
  isSeatSocketAlive: vi.fn(() => false),
  clearTournamentInviteTimer: vi.fn(),
  isUserInAnotherLiveGame: vi.fn(() => false),
}));

const connectes = partage.connectes;
const messagesCibles = partage.messagesCibles;
vi.mock('@/lib/socket/io', () => ({
  emitToUser: vi.fn((userId: string, event: string) => { partage.messagesCibles.push({ userId, event }); }),
  isUserConnected: vi.fn((userId: string) => partage.connectes.has(userId)),
}));

const timersArmes = partage.timersArmes;
const timersArretes = partage.timersArretes;
vi.mock('@/lib/tournament/absenceManager', () => ({
  startAbsenceTimer: vi.fn((matchId: string) => { partage.timersArmes.push(matchId); return new Date(Date.now() + 300_000); }),
  clearAbsenceTimer: vi.fn((matchId: string) => { partage.timersArretes.push(matchId); }),
  scheduleAbsenceTimerWithDeadline: vi.fn(),
  ABSENCE_TIMEOUT_MS: 5 * 60 * 1000,
}));

vi.mock('@/lib/discord/tournamentRoles', () => ({ assignTournamentWinnerRole: vi.fn() }));
vi.mock('@/lib/discord/tournamentWebhook', () => ({ sendTournamentResults: vi.fn() }));
vi.mock('@/lib/data/cardIndex', () => ({ getCharacterById: vi.fn(), getMissionById: vi.fn() }));

const salonsFinalises = partage.salonsFinalises;
vi.mock('@/lib/tournament/matchRoomCleanup', () => ({
  finalizeAndScheduleRoomDeletion: vi.fn((_rooms: unknown, code: string) => { partage.salonsFinalises.push(code); }),
  clearAllMatchRoomTimers: vi.fn(),
}));

vi.mock('@/lib/tournament/nwlPrize', () => ({ awardNwlPrizeIfNeeded: vi.fn(async () => {}) }));

const evenements = partage.evenements;
vi.mock('@/lib/tournament/matchEventLog', () => ({
  logMatchEvent: vi.fn((ev: { type: string; matchId?: string }) => { partage.evenements.push(ev); }),
}));

vi.mock('@/lib/tournament/prizes', () => ({
  grantWinnerPrize: vi.fn(), grantParticipantReward: vi.fn(),
  listEligibleParticipantsForReward: vi.fn(async () => []),
  markParticipantAbsence: vi.fn(), clearParticipantAbsence: vi.fn(),
  readTournamentPrizeCardId: vi.fn(async () => null),
  acquirePrizeAwardLock: vi.fn(async () => false),
}));

import { prisma } from '@/lib/db/prisma';
import {
  fireAbsenceTimerCallback,
  handleMatchForfeit,
  sweepOrphanTournamentMatches,
  reopenTournamentMatch,
  reconcileTournamentLaunches,
  salonDuMatch,
  matchEnCoursDeJeu,
} from '../socket/tournamentHandlers';

const p = prisma as never as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

interface FauxIo {
  emissions: Array<{ room: string; event: string; data: unknown }>;
  to(room: string): { emit: (event: string, data: unknown) => void };
}

function fauxIo(): FauxIo {
  const emissions: FauxIo['emissions'] = [];
  return Object.assign(
    {
      emissions,
      to(room: string) {
        return { emit: (event: string, data: unknown) => emissions.push({ room, event, data }) };
      },
    },
    { sockets: { sockets: new Map() } },
  );
}

function salonEnPartie(matchId: string, phase: string) {
  return {
    tournamentMatchId: matchId,
    hostId: 'p1',
    guestId: 'p2',
    hostSocket: { id: 'sa' },
    guestSocket: { id: 'sb' },
    finalized: false,
    gameState: { phase },
    tournamentInviteTimer: null,
  };
}

const MATCH_JOUE = {
  id: 'm-live',
  tournamentId: 't-chunin',
  status: 'in_progress',
  roomCode: 'T-VIEUX1',
  gameId: null,
  player1Id: 'p1',
  player2Id: 'p2',
  player1Username: 'P1',
  player2Username: 'P2',
  round: 1,
  matchIndex: 0,
  bracket: null,
  isBye: false,
  startedAt: new Date(Date.now() - 45 * 60 * 1000),
};

beforeEach(() => {
  vi.clearAllMocks();
  salons.clear();
  connectes.clear();
  evenements.length = 0;
  timersArmes.length = 0;
  timersArretes.length = 0;
  reconciliations.length = 0;
  messagesCibles.length = 0;
  salonsFinalises.length = 0;
  for (const modele of Object.values(p)) {
    for (const fn of Object.values(modele)) fn.mockReset?.();
  }
  (p.$runCommandRaw as unknown as ReturnType<typeof vi.fn>).mockResolvedValue?.({});
  p.game.findUnique.mockResolvedValue({ status: 'in_progress' });
  p.tournament.findUnique.mockResolvedValue({ format: 'elimination' });
  p.tournament.findMany.mockResolvedValue([{ id: 't-chunin' }]);
  p.tournamentMatch.update.mockResolvedValue({});
  p.tournamentMatch.updateMany.mockResolvedValue({ count: 1 });
  p.tournamentMatch.findMany.mockResolvedValue([]);
  p.tournamentParticipant.updateMany.mockResolvedValue({ count: 1 });
});

describe('la partie en cours est retrouvee meme quand le code de salon enregistre a derive', () => {
  it('le salon est identifie par le match, pas par le code', () => {
    salons.set('T-REEL99', salonEnPartie('m-live', 'action'));
    expect(salonDuMatch('m-live', 'T-VIEUX1'), 'le code stocke ne pointe sur rien').toBeTruthy();
    expect(matchEnCoursDeJeu('m-live', 'T-VIEUX1')).toBe(true);
    expect(matchEnCoursDeJeu('m-live', null), 'meme sans aucun code').toBe(true);
  });

  it('le salon d un autre match n est jamais confondu avec celui-ci', () => {
    salons.set('T-VIEUX1', salonEnPartie('m-autre', 'action'));
    expect(salonDuMatch('m-live', 'T-VIEUX1'), 'ce salon appartient a un autre match').toBeUndefined();
    expect(matchEnCoursDeJeu('m-live', 'T-VIEUX1')).toBe(false);
  });

  it('une partie terminee ne compte plus comme en cours', () => {
    salons.set('T-REEL99', salonEnPartie('m-live', 'gameOver'));
    expect(matchEnCoursDeJeu('m-live', 'T-VIEUX1')).toBe(false);
  });
});

describe('le scenario exact du tournoi rate: les joueurs jouent, le chrono tourne', () => {
  it('le controle d absence ne declare rien pendant la partie et coupe son chrono', async () => {
    salons.set('T-REEL99', salonEnPartie('m-live', 'action'));
    p.tournamentMatch.findUnique.mockResolvedValue(MATCH_JOUE);
    const io = fauxIo();

    await fireAbsenceTimerCallback(io as never, 't-chunin', 'm-live', 'p1', 'p2', 'p2', true);

    expect(p.tournamentMatch.update, 'aucune ecriture sur le match').not.toHaveBeenCalled();
    expect(io.emissions.some((e) => e.event === 'tournament:player-forfeited')).toBe(false);
    expect(timersArretes, 'le chrono est coupe pour de bon').toContain('m-live');
  });

  it('meme une demande de forfait explicite est refusee pendant la partie', async () => {
    salons.set('T-REEL99', salonEnPartie('m-live', 'action'));
    p.tournamentMatch.findUnique.mockResolvedValue(MATCH_JOUE);
    const io = fauxIo();

    await handleMatchForfeit(io as never, 't-chunin', 'm-live', 'p2');

    expect(p.tournamentMatch.update).not.toHaveBeenCalled();
    expect(p.tournamentParticipant.updateMany, 'personne n est elimine').not.toHaveBeenCalled();
    expect(evenements.map((e) => e.type)).toContain('match.forfeit.refused.game-live');
  });

  it('le rempart tient sur chaque phase de jeu', async () => {
    for (const phase of ['start', 'action', 'mission', 'end']) {
      salons.clear();
      evenements.length = 0;
      p.tournamentMatch.update.mockClear();
      salons.set('T-REEL99', salonEnPartie('m-live', phase));
      p.tournamentMatch.findUnique.mockResolvedValue(MATCH_JOUE);

      await handleMatchForfeit(fauxIo() as never, 't-chunin', 'm-live', 'p2');

      expect(p.tournamentMatch.update, `phase ${phase}`).not.toHaveBeenCalled();
      expect(evenements.map((e) => e.type), `phase ${phase}`).toContain('match.forfeit.refused.game-live');
    }
  });

  it('le balayage des matchs ne remet pas a zero une partie en cours', async () => {
    salons.set('T-REEL99', salonEnPartie('m-live', 'action'));
    p.tournamentMatch.findMany.mockResolvedValue([MATCH_JOUE]);
    const io = fauxIo();

    await sweepOrphanTournamentMatches(io as never);

    expect(p.tournamentMatch.update, 'le match reste en cours').not.toHaveBeenCalled();
    expect(io.emissions.some((e) => e.event === 'tournament:match-updated')).toBe(false);
  });

  it('la reouverture refuse de toucher un match dont la partie tourne', async () => {
    salons.set('T-REEL99', salonEnPartie('m-live', 'action'));
    p.tournamentMatch.findUnique.mockResolvedValue({ roomCode: 'T-VIEUX1', gameId: null, status: 'in_progress' });
    const io = fauxIo();

    await reopenTournamentMatch(io as never, 't-chunin', 'm-live', 'p1', 'p2');

    expect(p.tournamentMatch.update).not.toHaveBeenCalled();
    expect(salons.has('T-REEL99'), 'le salon de la partie est intact').toBe(true);
  });

  it('le rappel de presence ne harcele pas des joueurs deja a la table', async () => {
    salons.set('T-REEL99', salonEnPartie('m-live', 'action'));
    connectes.add('p1');
    connectes.add('p2');
    p.tournamentMatch.findMany.mockResolvedValue([{
      id: 'm-live', tournamentId: 't-chunin', roomCode: 'T-VIEUX1', player1Id: 'p1', player2Id: 'p2',
    }]);

    await reconcileTournamentLaunches(fauxIo() as never);

    expect(
      messagesCibles.filter((m) => m.event === 'tournament:please-confirm-ready'),
      'aucun rappel pendant la partie',
    ).toEqual([]);
  });
});

describe('les cas ou le systeme doit toujours trancher restent intacts', () => {
  it('un joueur qui n a jamais rejoint et reste hors ligne perd bien son match', async () => {
    p.tournamentMatch.findUnique.mockResolvedValue({
      ...MATCH_JOUE, id: 'm-vide', status: 'ready', roomCode: null, startedAt: null,
    });
    p.tournamentMatch.findMany.mockResolvedValue([]);
    connectes.add('p1');
    const io = fauxIo();

    for (let i = 0; i < 4; i += 1) {
      await fireAbsenceTimerCallback(io as never, 't-chunin', 'm-vide', 'p1', 'p2', 'p2', true);
    }

    expect(p.tournamentMatch.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'forfeit', winnerId: 'p1' }),
    }));
  });

  it('un abandon avant la partie, au mulligan, reste possible', async () => {
    salons.set('T-REEL99', salonEnPartie('m-live', 'mulligan'));
    p.tournamentMatch.findUnique.mockResolvedValue(MATCH_JOUE);

    await handleMatchForfeit(fauxIo() as never, 't-chunin', 'm-live', 'p2');

    expect(p.tournamentMatch.update, 'la regle du mulligan garde son effet').toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'forfeit', winnerId: 'p1' }) }),
    );
  });

  it('un match dont le salon a vraiment disparu est bien remis en attente', async () => {
    p.tournamentMatch.findMany.mockResolvedValue([MATCH_JOUE]);
    const io = fauxIo();

    await sweepOrphanTournamentMatches(io as never);

    expect(p.tournamentMatch.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'm-live' },
      data: expect.objectContaining({ status: 'ready', roomCode: null }),
    }));
    expect(timersArmes, 'le match repart avec un chrono neuf').toContain('m-live');
  });

  it('un match sans salon dont les joueurs sont connectes recoit un rappel cible', async () => {
    connectes.add('p1');
    connectes.add('p2');
    p.tournamentMatch.findMany.mockResolvedValue([{
      id: 'm-attente', tournamentId: 't-chunin', roomCode: null, player1Id: 'p1', player2Id: 'p2',
    }]);

    await reconcileTournamentLaunches(fauxIo() as never);

    const rappels = messagesCibles.filter((m) => m.event === 'tournament:please-confirm-ready');
    expect(rappels.map((r) => r.userId).sort(), 'les deux joueurs du match, personne d autre').toEqual(['p1', 'p2']);
  });
});

describe('une partie longue n est jamais tranchee de force pendant qu elle avance', () => {
  function salonLong(matchId: string, derniereActionIlYA: number, socketPresent: boolean) {
    return {
      tournamentMatchId: matchId,
      hostId: 'p1',
      guestId: 'p2',
      hostSocket: 'sa',
      guestSocket: socketPresent ? 'sb' : null,
      finalized: false,
      gameState: {
        phase: 'action',
        player1: { missionPoints: 12 },
        player2: { missionPoints: 9 },
      },
      lastApplyActionAt: Date.now() - derniereActionIlYA,
      isRanked: true,
      isEvolving: false,
      tournamentInviteTimer: null,
    };
  }

  it('un joueur en pleine reconnexion ne perd pas une partie de 45 minutes qui avance', async () => {
    salons.set('T-REEL99', salonLong('m-live', 20_000, false));
    p.tournamentMatch.findMany.mockResolvedValue([MATCH_JOUE]);
    const io = fauxIo();

    await sweepOrphanTournamentMatches(io as never);

    expect(p.tournamentMatch.update, 'la partie continue').not.toHaveBeenCalled();
    expect(io.emissions.some((e) => e.event === 'game:ended')).toBe(false);
    expect(salonsFinalises, 'le salon reste vivant').toEqual([]);
  });

  it('une table reellement figee, sans action depuis longtemps et un siege vide, est bien liberee', async () => {
    salons.set('T-REEL99', salonLong('m-live', 20 * 60_000, false));
    p.tournamentMatch.findMany.mockResolvedValue([MATCH_JOUE]);
    p.tournamentMatch.findUnique.mockResolvedValue({ ...MATCH_JOUE, status: 'in_progress' });
    const io = fauxIo();

    await sweepOrphanTournamentMatches(io as never);

    expect(p.tournamentMatch.update, 'le match est enfin cloture').toHaveBeenCalled();
  });
});
