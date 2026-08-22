import { describe, it, expect, vi, beforeEach } from 'vitest';

const cibles = vi.hoisted(() => [] as Array<{ userId: string; event: string; data: unknown }>);
const salons = vi.hoisted(() => new Map<string, unknown>());

vi.mock('@/lib/socket/io', async (importOriginal) => {
  const vrai = await importOriginal<typeof import('@/lib/socket/io')>();
  return {
    ...vrai,
    emitToUser: vi.fn((userId: string, event: string, data: unknown) => { cibles.push({ userId, event, data }); }),
  };
});

vi.mock('@/lib/socket/server', () => ({
  rooms: salons,
  getSocketIO: vi.fn(() => null),
  isSeatSocketAlive: vi.fn(() => false),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    tournament: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    tournamentParticipant: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    tournamentMatch: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    deck: { findUnique: vi.fn() },
    game: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/tournament/absenceManager', () => ({
  startAbsenceTimer: vi.fn(() => new Date()),
  clearAbsenceTimer: vi.fn(),
  scheduleAbsenceTimerWithDeadline: vi.fn(),
  ABSENCE_TIMEOUT_MS: 300_000,
}));

vi.mock('@/lib/discord/tournamentRoles', () => ({ assignTournamentWinnerRole: vi.fn() }));
vi.mock('@/lib/discord/tournamentWebhook', () => ({ sendTournamentResults: vi.fn() }));
vi.mock('@/lib/data/cardIndex', () => ({ getCharacterById: vi.fn(), getMissionById: vi.fn() }));
vi.mock('@/lib/tournament/matchRoomCleanup', () => ({ finalizeAndScheduleRoomDeletion: vi.fn() }));
vi.mock('@/lib/tournament/matchEventLog', () => ({ logMatchEvent: vi.fn() }));

import { prisma } from '@/lib/db/prisma';
import { fireAbsenceTimerCallback, salonDuMatch } from '../socket/tournamentHandlers';

const p = prisma as never as {
  tournamentMatch: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  tournament: { findUnique: ReturnType<typeof vi.fn> };
  tournamentParticipant: { updateMany: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
};

const MATCH = 'm-en-cours';

function partieEnCours(code: string) {
  salons.set(code, {
    tournamentMatchId: MATCH,
    finalized: false,
    gameState: { phase: 'action' },
    hostId: 'p1',
    guestId: 'p2',
  });
}

function ioMuet() {
  return {
    to: () => ({ emit: () => {} }),
    sockets: { sockets: new Map() },
  };
}

beforeEach(() => {
  cibles.length = 0;
  salons.clear();
  vi.clearAllMocks();
  p.tournament.findUnique.mockResolvedValue({ format: 'elimination' });
  p.tournamentMatch.update.mockResolvedValue({});
  p.tournamentMatch.findMany.mockResolvedValue([]);
  p.tournamentParticipant.updateMany.mockResolvedValue({ count: 1 });
  p.tournamentParticipant.findMany.mockResolvedValue([]);
});

describe('le chrono ne peut plus tomber pendant qu une partie se joue', () => {
  it('le salon du match est retrouve meme quand le code enregistre a ete perdu', () => {
    partieEnCours('T-reel');
    expect(salonDuMatch(MATCH, null), 'retrouve par identifiant de match').toBeTruthy();
    expect(salonDuMatch(MATCH, 'T-perime'), 'un code perime ne masque pas la partie').toBeTruthy();
    expect(salonDuMatch('autre-match', null), 'aucun salon pour un autre match').toBeUndefined();
  });

  it('aucun forfait quand la partie tourne, meme sans code de salon en base', async () => {
    partieEnCours('T-reel');
    p.tournamentMatch.findUnique.mockResolvedValue({
      id: MATCH, tournamentId: 't1', status: 'ready', roomCode: null, gameId: null,
      player1Id: 'p1', player2Id: 'p2', player1Username: 'P1', player2Username: 'P2',
      round: 2, matchIndex: 0, bracket: null,
    });

    for (let i = 0; i < 6; i++) {
      await fireAbsenceTimerCallback(ioMuet() as never, 't1', MATCH, 'p1', 'p2', 'p2', true);
    }

    const forfait = p.tournamentMatch.update.mock.calls.find(
      (appel: unknown[]) => (appel[0] as { data?: { status?: string } })?.data?.status === 'forfeit',
    );
    expect(forfait, 'les joueurs jouent: personne ne peut etre disqualifie').toBeUndefined();
  });

  it('une partie terminee ne protege plus le match, sinon il resterait fige', async () => {
    salons.set('T-fini', {
      tournamentMatchId: MATCH, finalized: false,
      gameState: { phase: 'gameOver' }, hostId: 'p1', guestId: 'p2',
    });
    expect(salonDuMatch(MATCH, null), 'le salon existe encore').toBeTruthy();

    p.tournamentMatch.findUnique.mockResolvedValue({
      id: MATCH, tournamentId: 't1', status: 'ready', roomCode: null, gameId: null,
      player1Id: 'p1', player2Id: 'p2', player1Username: 'P1', player2Username: 'P2',
      round: 2, matchIndex: 0, bracket: null,
    });
    for (let i = 0; i < 6; i++) {
      await fireAbsenceTimerCallback(ioMuet() as never, 't1', MATCH, 'p1', 'p2', 'p2', true);
    }
    const forfait = p.tournamentMatch.update.mock.calls.find(
      (appel: unknown[]) => (appel[0] as { data?: { status?: string } })?.data?.status === 'forfeit',
    );
    expect(forfait, 'partie terminee et joueurs hors ligne: le match doit pouvoir se trancher').toBeTruthy();
  });
});

describe('rien n est annonce avant la fin reelle du bracket', () => {
  it('la remise des prix attend que plus aucun match ne soit ouvert', async () => {
    const source = await import('fs').then((m) =>
      m.readFileSync(new URL('../tournament/nwlPrize.ts', import.meta.url), 'utf8'));
    expect(source, 'un match encore ouvert bloque toute annonce').toContain('encoreOuverts');
    const bloc = source.slice(source.indexOf('const encoreOuverts'), source.indexOf('const encoreOuverts') + 500);
    expect(bloc).toContain("m.status !== 'completed'");
    expect(bloc).toContain('return;');
  });
});

describe('aucun mecanisme de tournoi ne cherche la partie par le seul code de salon', () => {
  const SOURCE = (() => {
    const { readFileSync } = require('fs') as typeof import('fs');
    const { join } = require('path') as typeof import('path');
    return readFileSync(join(__dirname, '..', 'socket', 'tournamentHandlers.ts'), 'utf8');
  })();

  function bloc(ancre: string, longueur: number): string {
    const at = SOURCE.indexOf(ancre);
    expect(at, `ancre introuvable: ${ancre}`).toBeGreaterThan(-1);
    return SOURCE.slice(at, at + longueur);
  }

  it('le balayage des matchs orphelins retrouve la partie par le match', () => {
    const corps = bloc('export async function sweepOrphanTournamentMatches', 3000);
    expect(
      corps,
      "chercher la partie avec rooms.has(roomCode) remet un match EN COURS a l etat pret "
      + "des que le code stocke a derive, toutes les cinq minutes, pendant que les joueurs jouent",
    ).not.toContain('rooms.has(m.roomCode)');
    expect(corps, 'la partie se retrouve par son match').toContain('entreeDuSalonDuMatch(m.id');
  });

  it('la relance et la finalisation d un match bloque passent aussi par le match', () => {
    const corps = bloc('export async function sweepOrphanTournamentMatches', 3000);
    expect(corps, 'aucune lecture directe du salon par son code').not.toContain('rooms.get(m.roomCode)');
  });

  it('le rappel de presence lit le salon du match', () => {
    expect(SOURCE, 'aucun rappel ne repose sur le seul code').not.toContain('m.roomCode ? rooms.get(m.roomCode) : null');
  });
});

describe('le controle d absence connait la partie sans passer par la base', () => {
  const SOURCE = (() => {
    const { readFileSync } = require('fs') as typeof import('fs');
    const { join } = require('path') as typeof import('path');
    return readFileSync(join(__dirname, '..', 'socket', 'tournamentHandlers.ts'), 'utf8');
  })();

  it('la sortie anticipee ne depend plus de l identifiant de partie en base', () => {
    const at = SOURCE.indexOf('export async function fireAbsenceTimerCallback');
    const corps = SOURCE.slice(at, at + 2600);
    expect(
      corps,
      "une partie de tournoi ne cree sa ligne en base qu a la fin, donc exiger un identifiant de partie "
      + "rendait ce garde-fou inerte pendant toute la partie: le chrono d absence continuait de tourner",
    ).not.toContain('if (m?.gameId && (await partieEncoreVivante(');
    expect(corps, 'la partie en memoire suffit a arreter le chrono').toContain('isMatchGameLive(matchId, m?.roomCode)');
  });

  it('la reouverture d un match refuse de toucher une partie en cours', () => {
    const at = SOURCE.indexOf('export async function reopenTournamentMatch');
    const corps = SOURCE.slice(at, at + 2600);
    expect(corps, 'la partie vivante se retrouve par le match').toContain('salonDuMatch(matchId, previousRoomCode)');
    expect(corps).not.toContain('previousRoomCode ? rooms.get(previousRoomCode) : null');
  });
});

describe('la garde centrale des forfaits', () => {
  const SOURCE = (() => {
    const { readFileSync } = require('fs') as typeof import('fs');
    const { join } = require('path') as typeof import('path');
    return readFileSync(join(__dirname, '..', 'socket', 'tournamentHandlers.ts'), 'utf8');
  })();

  it('aucun forfait ne passe pendant que la partie du match se joue', () => {
    const at = SOURCE.indexOf('export async function handleMatchForfeit');
    const corps = SOURCE.slice(at, at + 1400);
    expect(
      corps,
      "c est le dernier rempart: quel que soit l appelant, un joueur assis a la table ne perd pas son match",
    ).toContain('matchEnCoursDeJeu(matchId, match.roomCode)');
    expect(corps).toContain('match.forfeit.refused.game-live');
  });

  it('la garde laisse passer les etapes d avant partie', () => {
    const at = SOURCE.indexOf('const PHASES_HORS_PARTIE');
    const corps = SOURCE.slice(at, at + 320);
    for (const phase of ['setup', 'mulligan', 'gameOver']) {
      expect(corps, `${phase} n est pas une partie en cours`).toContain(`'${phase}'`);
    }
  });

  it('le salon d un autre match ne peut jamais etre pris pour celui-ci', () => {
    const at = SOURCE.indexOf('export function entreeDuSalonDuMatch');
    const corps = SOURCE.slice(at, at + 700);
    expect(
      corps,
      "accepter un salon dont l identifiant de match differe ferait passer la partie d autrui pour la sienne",
    ).toContain('!parCode.tournamentMatchId && salonVivant(parCode)');
  });
});
