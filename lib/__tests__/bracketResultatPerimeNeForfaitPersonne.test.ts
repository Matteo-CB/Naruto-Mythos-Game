import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const { participantUpdateMany, matchUpdate } = vi.hoisted(() => ({
  participantUpdateMany: vi.fn(async () => ({ count: 1 })),
  matchUpdate: vi.fn(async () => ({})),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    tournamentParticipant: { updateMany: participantUpdateMany },
    tournamentMatch: { update: matchUpdate },
  },
}));

vi.mock('@/lib/tournament/matchEventLog', () => ({ logMatchEvent: vi.fn() }));

const { annulerResultatPerimeDuMatchSuivant } = await import('@/lib/socket/tournamentHandlers');

const FINALE = {
  id: 'finale',
  round: 4,
  matchIndex: 0,
  bracket: 'main',
  player1Id: 'tyler',
  player2Id: 'louise',
};

beforeEach(() => {
  participantUpdateMany.mockClear();
  matchUpdate.mockClear();
});

describe('un match deja resolu ne peut pas etre repeuple en gardant son resultat', () => {
  it('un match encore ouvert n est pas touche', async () => {
    const data: Record<string, unknown> = { player2Id: 'hzr' };
    const annule = await annulerResultatPerimeDuMatchSuivant('t1', { ...FINALE, status: 'pending' }, data);
    expect(annule, 'rien a annuler').toBe(false);
    expect(data, 'la pose du qualifie reste seule').toEqual({ player2Id: 'hzr' });
    expect(participantUpdateMany).not.toHaveBeenCalled();
  });

  for (const statut of ['completed', 'forfeit']) {
    it(`un match ${statut} voit son resultat annule quand un qualifie corrige arrive`, async () => {
      const data: Record<string, unknown> = { player2Id: 'hzr', player2Username: 'Hzr-Blk' };
      const annule = await annulerResultatPerimeDuMatchSuivant('t1', { ...FINALE, status: statut }, data);

      expect(annule).toBe(true);
      expect(data.status, 'le match repart de zero').toBe('pending');
      expect(data.winnerId, 'plus de vainqueur herite').toBeNull();
      expect(data.winnerUsername).toBeNull();
      expect(data.completedAt).toBeNull();
      expect(data.absentPlayerId, 'plus d absent herite').toBeNull();
      expect(data.absenceDeadline).toBeNull();
      expect(data.gameId, 'ni partie ni salon herites').toBeNull();
      expect(data.roomCode).toBeNull();
      expect(data.player2Id, 'le qualifie corrige est bien pose').toBe('hzr');
    });
  }

  it('les eliminations produites par ce match sont effacees, pas les autres', async () => {
    await annulerResultatPerimeDuMatchSuivant('t1', { ...FINALE, status: 'forfeit' }, {});
    expect(participantUpdateMany).toHaveBeenCalledTimes(1);
    const arg = participantUpdateMany.mock.calls[0][0] as {
      where: { userId: { in: string[] }; eliminatedRound: number; eliminated: boolean };
      data: { eliminated: boolean; eliminatedRound: null };
    };
    expect(arg.where.userId.in.sort(), 'les deux joueurs du match').toEqual(['louise', 'tyler']);
    expect(
      arg.where.eliminatedRound,
      'seule une elimination datee de CE tour vient de ce match: '
      + 'un joueur sorti a un tour precedent doit rester sorti',
    ).toBe(FINALE.round);
    expect(arg.data).toEqual({ eliminated: false, eliminatedRound: null });
  });

  it('un match sans joueur pose ne touche aucun participant', async () => {
    await annulerResultatPerimeDuMatchSuivant(
      't1', { ...FINALE, status: 'forfeit', player1Id: null, player2Id: null }, {},
    );
    expect(participantUpdateMany).not.toHaveBeenCalled();
  });
});

describe('le bracket apprend la lecon du tournoi du 25 aout', () => {
  const SOURCE = readFileSync(
    join(__dirname, '..', 'socket', 'tournamentHandlers.ts'), 'utf8',
  );

  it('la pose d un qualifie passe toujours par l annulation du resultat perime', () => {
    const at = SOURCE.indexOf('const updateData: Record<string, unknown> = {};');
    expect(at, 'la pose du qualifie existe toujours').toBeGreaterThan(-1);
    const bloc = SOURCE.slice(at, at + 700);
    const posAnnulation = bloc.indexOf('annulerResultatPerimeDuMatchSuivant(');
    const posEcriture = bloc.indexOf('prisma.tournamentMatch.update(');
    expect(posAnnulation, 'le resultat perime est annule').toBeGreaterThan(-1);
    expect(
      posAnnulation,
      'sinon le match garde son ancien vainqueur et ses eliminations le temps d une ecriture',
    ).toBeLessThan(posEcriture);
  });

  it('le forfait automatique ignore une elimination datee du tour du match', () => {
    const at = SOURCE.indexOf('async function autoForfeitIfEliminated(');
    expect(at).toBeGreaterThan(-1);
    const bloc = SOURCE.slice(at, at + 1800);
    expect(
      bloc,
      'un joueur elimine au tour meme du match encore ouvert l a ete par ce match: '
      + 'ce drapeau ne peut pas servir a le forfaire une seconde fois',
    ).toContain('p.eliminatedRound !== m.round');
  });

  it('le match remis en jeu repart sans minuterie heritee', () => {
    const at = SOURCE.indexOf('export async function annulerResultatPerimeDuMatchSuivant(');
    const bloc = SOURCE.slice(at, at + 1800);
    expect(bloc, 'les minuteries du match annule sont coupees').toContain('clearTournamentMatchTimers(nextMatch.id)');
  });
});
