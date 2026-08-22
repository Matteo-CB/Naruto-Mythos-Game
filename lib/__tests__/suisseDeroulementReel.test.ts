import { describe, it, expect, vi, beforeEach } from 'vitest';

const partage = vi.hoisted(() => ({
  salons: new Map<string, Record<string, unknown>>(),
  evenements: [] as Array<{ type: string; matchId?: string }>,
  podiums: [] as Array<{ nom: string; podium: Array<{ userId: string; username: string; place: number }> }>,
  primes: [] as string[],
}));

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

vi.mock('@/lib/socket/server', () => ({
  rooms: partage.salons,
  getSocketIO: vi.fn(() => null),
  maybeStartTournamentGame: vi.fn(async () => false),
  reconcileTournamentRoomSeats: vi.fn(async () => false),
  isSeatSocketAlive: vi.fn(() => false),
  clearTournamentInviteTimer: vi.fn(),
  isUserInAnotherLiveGame: vi.fn(() => false),
}));

vi.mock('@/lib/socket/io', () => ({
  emitToUser: vi.fn(),
  isUserConnected: vi.fn(() => false),
}));

vi.mock('@/lib/tournament/absenceManager', () => ({
  startAbsenceTimer: vi.fn(() => new Date(Date.now() + 300_000)),
  clearAbsenceTimer: vi.fn(),
  scheduleAbsenceTimerWithDeadline: vi.fn(),
  ABSENCE_TIMEOUT_MS: 5 * 60 * 1000,
}));

vi.mock('@/lib/discord/tournamentRoles', () => ({ assignTournamentWinnerRole: vi.fn(async () => null) }));
vi.mock('@/lib/discord/tournamentWebhook', () => ({
  sendTournamentResults: vi.fn(async (nom: string, podium: Array<{ userId: string; username: string; place: number }>) => {
    partage.podiums.push({ nom, podium });
  }),
}));
vi.mock('@/lib/data/cardIndex', () => ({ getCharacterById: vi.fn(), getMissionById: vi.fn() }));
vi.mock('@/lib/tournament/matchRoomCleanup', () => ({
  finalizeAndScheduleRoomDeletion: vi.fn(), clearAllMatchRoomTimers: vi.fn(),
}));
vi.mock('@/lib/tournament/nwlPrize', () => ({ awardNwlPrizeIfNeeded: vi.fn(async () => {}) }));
vi.mock('@/lib/tournament/matchEventLog', () => ({
  logMatchEvent: vi.fn((ev: { type: string; matchId?: string }) => { partage.evenements.push(ev); }),
}));
vi.mock('@/lib/tournament/prizes', () => ({
  grantWinnerPrize: vi.fn(async (userId: string) => { partage.primes.push(`vainqueur:${userId}`); }),
  grantParticipantReward: vi.fn(async (userId: string) => { partage.primes.push(`present:${userId}`); }),
  listEligibleParticipantsForReward: vi.fn(async () => []),
  markParticipantAbsence: vi.fn(), clearParticipantAbsence: vi.fn(),
  readTournamentPrizeCardId: vi.fn(async () => null),
  acquirePrizeAwardLock: vi.fn(async () => true),
}));
vi.mock('@/lib/quests/hooks', () => ({ emitQuestEvent: vi.fn() }));
vi.mock('@/lib/quests/listenerSetup', () => ({ ensureQuestPersistenceListener: vi.fn() }));

import { prisma } from '@/lib/db/prisma';
import { handleSwissMatchEnd, handleSwissDoubleAbsence } from '../socket/tournamentHandlers';

const p = prisma as never as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

function fauxIo() {
  const emissions: Array<{ event: string; data: unknown }> = [];
  return Object.assign(
    { emissions, to: () => ({ emit: (event: string, data: unknown) => emissions.push({ event, data }) }) },
    { sockets: { sockets: new Map() } },
  );
}

interface MatchFactice {
  id: string; tournamentId: string; round: number; matchIndex: number;
  player1Id: string | null; player1Username: string | null;
  player2Id: string | null; player2Username: string | null;
  winnerId: string | null; winnerUsername: string | null;
  isBye: boolean; status: string; roomCode: string | null; bracket: string | null;
}

function match(o: Partial<MatchFactice> & { id: string; round: number }): MatchFactice {
  return {
    tournamentId: 't-swiss', matchIndex: 0,
    player1Id: null, player1Username: null, player2Id: null, player2Username: null,
    winnerId: null, winnerUsername: null, isBye: false, status: 'completed',
    roomCode: null, bracket: null, ...o,
  };
}

function participants(noms: string[], elimines: string[] = []) {
  return noms.map((n, i) => ({
    id: `part-${n}`, tournamentId: 't-swiss', userId: n, username: n.toUpperCase(),
    seed: i + 1, eliminated: elimines.includes(n), eliminatedRound: elimines.includes(n) ? 1 : null,
    deckValid: true, hasBye: false, deckId: `deck-${n}`, sealedDeck: null,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  partage.salons.clear();
  partage.evenements.length = 0;
  partage.podiums.length = 0;
  partage.primes.length = 0;
  for (const modele of Object.values(p)) {
    for (const fn of Object.values(modele)) (fn as ReturnType<typeof vi.fn>).mockReset?.();
  }
  p.tournamentMatch.update.mockResolvedValue({});
  p.tournamentMatch.updateMany.mockResolvedValue({ count: 1 });
  p.tournamentMatch.createMany.mockResolvedValue({ count: 0 });
  p.tournamentMatch.findFirst.mockResolvedValue(null);
  p.tournamentParticipant.updateMany.mockResolvedValue({ count: 1 });
  p.tournament.update.mockResolvedValue({});
  p.user.update.mockResolvedValue({ tournamentWins: 1 });
  p.tournamentParticipant.findFirst.mockResolvedValue(null);
});

describe('un tour suisse ne s enchaine que lorsqu il est vraiment fini', () => {
  it('un match encore en cours laisse le tour ouvert et met juste le classement a jour', async () => {
    const matchs = [
      match({ id: 'm1', round: 1, player1Id: 'a', player2Id: 'b', winnerId: 'a', status: 'completed' }),
      match({ id: 'm2', round: 1, player1Id: 'c', player2Id: 'd', status: 'in_progress' }),
    ];
    p.tournamentMatch.findMany.mockResolvedValue(matchs);
    p.tournament.findUnique.mockResolvedValue({
      id: 't-swiss', name: 'Suisse', format: 'swiss', status: 'in_progress',
      currentRound: 1, totalRounds: 2, isPublic: true,
      participants: participants(['a', 'b', 'c', 'd']), matches: matchs,
    });
    const io = fauxIo();

    await handleSwissMatchEnd(io as never, 't-swiss', { round: 1, matchIndex: 0 });

    expect(p.tournamentMatch.createMany, 'aucun tour 2 cree').not.toHaveBeenCalled();
    expect(p.tournament.update, 'le tour courant ne bouge pas').not.toHaveBeenCalled();
    expect(io.emissions.map((e) => e.event)).toContain('tournament:standings-updated');
  });

  it('le tour complet cree le tour suivant, sans revanche et sans oublier personne', async () => {
    const matchs = [
      match({ id: 'm1', round: 1, player1Id: 'a', player1Username: 'A', player2Id: 'b', player2Username: 'B', winnerId: 'a' }),
      match({ id: 'm2', round: 1, player1Id: 'c', player1Username: 'C', player2Id: 'd', player2Username: 'D', winnerId: 'c' }),
    ];
    p.tournamentMatch.findMany.mockImplementation(async (args: { where?: { status?: string } }) => {
      if (args?.where?.status === 'ready') return [];
      return matchs;
    });
    p.tournament.findUnique.mockResolvedValue({
      id: 't-swiss', name: 'Suisse', format: 'swiss', status: 'in_progress',
      currentRound: 1, totalRounds: 2, isPublic: true,
      participants: participants(['a', 'b', 'c', 'd']), matches: matchs,
    });
    const io = fauxIo();

    await handleSwissMatchEnd(io as never, 't-swiss', { round: 1, matchIndex: 1 });

    expect(p.tournamentMatch.createMany, 'le tour 2 est cree').toHaveBeenCalledTimes(1);
    const crees = p.tournamentMatch.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(crees.length, 'quatre joueurs font deux matchs').toBe(2);
    const places = crees.flatMap((m) => [m.player1Id, m.player2Id]).filter(Boolean);
    expect(new Set(places).size, 'chacun joue une fois').toBe(4);
    for (const m of crees) {
      const paire = [m.player1Id, m.player2Id].sort().join('|');
      expect(paire, 'aucune revanche du tour 1').not.toBe('a|b');
      expect(paire, 'aucune revanche du tour 1').not.toBe('c|d');
    }
    expect(p.tournament.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ currentRound: 2 }),
    }));
    expect(io.emissions.map((e) => e.event)).toContain('tournament:round-complete');
  });

  it('un nombre impair donne un bye deja gagne, jamais un match vide', async () => {
    const matchs = [
      match({ id: 'm1', round: 1, player1Id: 'a', player1Username: 'A', player2Id: 'b', player2Username: 'B', winnerId: 'a' }),
      match({ id: 'm2', round: 1, player1Id: 'c', player1Username: 'C', winnerId: 'c', isBye: true }),
    ];
    p.tournamentMatch.findMany.mockImplementation(async (args: { where?: { status?: string } }) => {
      if (args?.where?.status === 'ready') return [];
      return matchs;
    });
    p.tournament.findUnique.mockResolvedValue({
      id: 't-swiss', name: 'Suisse', format: 'swiss', status: 'in_progress',
      currentRound: 1, totalRounds: 2, isPublic: true,
      participants: participants(['a', 'b', 'c']), matches: matchs,
    });

    await handleSwissMatchEnd(fauxIo() as never, 't-swiss', { round: 1, matchIndex: 0 });

    const crees = p.tournamentMatch.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    const byes = crees.filter((m) => m.isBye);
    expect(byes.length, 'un seul bye').toBe(1);
    expect(byes[0].winnerId, 'le bye est deja gagne').toBeTruthy();
    expect(byes[0].status).toBe('completed');
    expect(byes[0].player1Id, 'le bye ne revient pas au joueur qui l a deja eu').not.toBe('c');
    for (const m of crees) {
      if (m.isBye) continue;
      expect(m.player1Id, 'aucun match sans joueur').toBeTruthy();
      expect(m.player2Id, 'aucun match sans adversaire').toBeTruthy();
    }
  });
});

describe('la fin d un tournoi suisse designe le bon vainqueur et le bon podium', () => {
  function tournoiFini(elimines: string[]) {
    const matchs = [
      match({ id: 'm1', round: 1, player1Id: 'a', player1Username: 'A', player2Id: 'b', player2Username: 'B', winnerId: 'a' }),
      match({ id: 'm2', round: 1, player1Id: 'c', player1Username: 'C', player2Id: 'd', player2Username: 'D', winnerId: 'c' }),
      match({ id: 'm3', round: 2, player1Id: 'a', player1Username: 'A', player2Id: 'c', player2Username: 'C', winnerId: 'a' }),
      match({ id: 'm4', round: 2, player1Id: 'b', player1Username: 'B', player2Id: 'd', player2Username: 'D', winnerId: 'b' }),
    ];
    p.tournamentMatch.findMany.mockImplementation(async (args: { where?: { status?: string; round?: number } }) => {
      if (args?.where?.status === 'ready') return [];
      if (args?.where?.round === 2) return matchs.filter((m) => m.round === 2);
      return matchs;
    });
    p.tournament.findUnique.mockResolvedValue({
      id: 't-swiss', name: 'Suisse', format: 'swiss', status: 'in_progress',
      currentRound: 2, totalRounds: 2, isPublic: true,
      participants: participants(['a', 'b', 'c', 'd'], elimines), matches: matchs,
    });
  }

  it('le meilleur classement gagne et le podium suit le classement', async () => {
    tournoiFini([]);
    const io = fauxIo();

    await handleSwissMatchEnd(io as never, 't-swiss', { round: 2, matchIndex: 1 });

    expect(p.tournament.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'completed', winnerId: 'a' }),
    }));
    expect(partage.podiums.length, 'un podium est annonce').toBe(1);
    expect(partage.podiums[0].podium.map((x) => x.userId), 'trois places')
      .toEqual(['a', 'b', 'c']);
    expect(partage.primes, 'le vainqueur recoit sa recompense').toContain('vainqueur:a');
  });

  it('un joueur sorti pour absence ne monte jamais sur le podium', async () => {
    tournoiFini(['b']);
    const io = fauxIo();

    await handleSwissMatchEnd(io as never, 't-swiss', { round: 2, matchIndex: 1 });

    const annonce = partage.podiums[0].podium;
    expect(
      annonce.map((x) => x.userId),
      'b a ete sorti pour absence, il ne peut pas etre annonce deuxieme',
    ).not.toContain('b');
    expect(annonce[0].userId, 'la premiere place du podium est le vainqueur reel').toBe('a');
    expect(annonce.map((x) => x.place)).toEqual([1, 2, 3].slice(0, annonce.length));
  });

  it('si le meilleur du classement a ete sorti, le titre revient au suivant present', async () => {
    tournoiFini(['a']);

    await handleSwissMatchEnd(fauxIo() as never, 't-swiss', { round: 2, matchIndex: 1 });

    const ecrit = p.tournament.update.mock.calls.map((c) => c[0].data).find((d) => d.status === 'completed');
    expect(ecrit.winnerId, 'a est sorti, le titre passe au premier present').not.toBe('a');
    expect(partage.podiums[0].podium[0].userId, 'le podium annonce le meme vainqueur')
      .toBe(ecrit.winnerId);
  });
});

describe('la double absence suisse ne peut pas frapper une partie en cours', () => {
  it('deux joueurs a la table ne sont jamais declares absents tous les deux', async () => {
    partage.salons.set('T-AUTRE', {
      tournamentMatchId: 'm-live', hostId: 'a', guestId: 'b',
      hostSocket: 'sa', guestSocket: 'sb', finalized: false,
      gameState: { phase: 'action' },
    });
    p.tournamentMatch.findUnique.mockResolvedValue(match({
      id: 'm-live', round: 1, player1Id: 'a', player2Id: 'b', status: 'in_progress', roomCode: 'T-PERIME',
    }));

    await handleSwissDoubleAbsence(fauxIo() as never, 't-swiss', 'm-live');

    expect(p.tournamentMatch.update, 'aucun forfait ecrit').not.toHaveBeenCalled();
    expect(p.tournamentParticipant.updateMany, 'personne n est sorti du tournoi').not.toHaveBeenCalled();
    expect(partage.evenements.map((e) => e.type)).toContain('match.forfeit.refused.game-live');
  });

  it('sans partie lancee, la double absence sort bien les deux joueurs', async () => {
    const matchs = [match({ id: 'm-vide', round: 1, player1Id: 'a', player2Id: 'b', status: 'ready' })];
    p.tournamentMatch.findUnique.mockResolvedValue(matchs[0]);
    p.tournamentMatch.findMany.mockResolvedValue(matchs);
    p.tournament.findUnique.mockResolvedValue({
      id: 't-swiss', name: 'Suisse', format: 'swiss', status: 'in_progress',
      currentRound: 1, totalRounds: 1, isPublic: true,
      participants: participants(['a', 'b']), matches: matchs,
    });

    await handleSwissDoubleAbsence(fauxIo() as never, 't-swiss', 'm-vide');

    expect(p.tournamentMatch.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'forfeit', winnerId: null }),
    }));
    expect(p.tournamentParticipant.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eliminated: true }),
    }));
    expect(partage.evenements.map((e) => e.type)).toContain('match.forfeit.double');
  });
});

describe('deux matchs qui finissent en meme temps ne creent pas deux fois le tour suivant', () => {
  function tournoiTourUnFini() {
    const matchs = [
      match({ id: 'm1', round: 1, player1Id: 'a', player1Username: 'A', player2Id: 'b', player2Username: 'B', winnerId: 'a' }),
      match({ id: 'm2', round: 1, player1Id: 'c', player1Username: 'C', player2Id: 'd', player2Username: 'D', winnerId: 'c' }),
    ];
    let tourCourant = 1;
    let tourDeuxCree = false;

    p.tournamentMatch.findMany.mockImplementation(async (args: { where?: { status?: string; round?: number } }) => {
      if (args?.where?.status === 'ready') return [];
      if (args?.where?.round === 1) return matchs;
      return matchs;
    });
    p.tournamentMatch.findFirst.mockImplementation(async () => (tourDeuxCree ? { id: 'm3' } : null));
    p.tournamentMatch.createMany.mockImplementation(async () => { tourDeuxCree = true; return { count: 2 }; });
    p.tournament.update.mockImplementation(async (args: { data?: { currentRound?: number } }) => {
      if (typeof args?.data?.currentRound === 'number') tourCourant = args.data.currentRound;
      return {};
    });
    p.tournament.findUnique.mockImplementation(async () => ({
      id: 't-swiss', name: 'Suisse', format: 'swiss', status: 'in_progress',
      currentRound: tourCourant, totalRounds: 2, isPublic: true,
      participants: participants(['a', 'b', 'c', 'd']), matches: matchs,
    }));
  }

  it('en sequence, le second appel ne recree rien', async () => {
    tournoiTourUnFini();
    const io = fauxIo();

    await handleSwissMatchEnd(io as never, 't-swiss', { round: 1, matchIndex: 0 });
    await handleSwissMatchEnd(io as never, 't-swiss', { round: 1, matchIndex: 1 });

    expect(p.tournamentMatch.createMany, 'le tour 2 n est cree qu une fois').toHaveBeenCalledTimes(1);
  });

  it('en simultane, le verrou de tour tient', async () => {
    tournoiTourUnFini();
    const io = fauxIo();

    await Promise.all([
      handleSwissMatchEnd(io as never, 't-swiss', { round: 1, matchIndex: 0 }),
      handleSwissMatchEnd(io as never, 't-swiss', { round: 1, matchIndex: 1 }),
    ]);

    expect(p.tournamentMatch.createMany, 'un seul tour 2 malgre deux fins simultanees').toHaveBeenCalledTimes(1);
    const passages = io.emissions.filter((e) => e.event === 'tournament:round-complete');
    expect(passages.length, 'un seul passage de tour annonce').toBe(1);
  });
});
