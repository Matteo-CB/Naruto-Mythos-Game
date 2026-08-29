import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { decideAbsenceOutcome, type AbsenceEvidence } from '@/lib/tournament/absenceDecision';
import {
  noterUneActionAuPlateau,
  aAgiAuPlateau,
  oublierLeMatch,
  reinitialiserLaPresence,
} from '@/lib/tournament/presenceAuPlateau';

const RACINE = process.cwd();
const MATCH = 'match-vendredi';
const PRESENT = 'joueur-present';
const ABSENT = 'joueur-absent';

function preuve(surcharge: Partial<AbsenceEvidence> = {}): AbsenceEvidence {
  return {
    p1: PRESENT,
    p2: ABSENT,
    knownAbsentPlayerId: null,
    readySetPresent: true,
    readyP1: false,
    readyP2: false,
    seatBoundP1: false,
    seatBoundP2: false,
    onlineP1: false,
    onlineP2: false,
    gameLive: false,
    aAgiP1: false,
    aAgiP2: false,
    cycles: 99,
    maxCycles: 8,
    ...surcharge,
  };
}

beforeEach(() => { reinitialiserLaPresence(); });

describe('un joueur qui a agi au plateau ne peut plus etre declare absent', () => {
  it('retient qui a agi, et l oublie quand le match est clos', () => {
    expect(aAgiAuPlateau(MATCH, PRESENT)).toBe(false);
    noterUneActionAuPlateau(MATCH, PRESENT);
    expect(aAgiAuPlateau(MATCH, PRESENT)).toBe(true);
    expect(aAgiAuPlateau(MATCH, ABSENT)).toBe(false);
    oublierLeMatch(MATCH);
    expect(aAgiAuPlateau(MATCH, PRESENT)).toBe(false);
  });

  it('ne retient rien sans match ni joueur', () => {
    noterUneActionAuPlateau(null, PRESENT);
    noterUneActionAuPlateau(MATCH, null);
    expect(aAgiAuPlateau(MATCH, PRESENT)).toBe(false);
  });

  it('le joueur qui a fait son mulligan echappe au forfait, celui qui n a rien fait le prend', () => {
    const sansMemoire = decideAbsenceOutcome(preuve());
    expect(sansMemoire.kind, 'sans memoire, les deux tombent').toBe('forfeit');
    expect(sansMemoire.kind === 'forfeit' && sansMemoire.players).toEqual([PRESENT, ABSENT]);

    const avecMemoire = decideAbsenceOutcome(preuve({ aAgiP1: true }));
    expect(avecMemoire.kind).toBe('forfeit');
    expect(
      avecMemoire.kind === 'forfeit' && avecMemoire.players,
      'seul celui qui n a jamais agi est declare absent',
    ).toEqual([ABSENT]);
  });

  it('quand les deux ont agi, personne n est declare absent', () => {
    const out = decideAbsenceOutcome(preuve({ aAgiP1: true, aAgiP2: true }));
    expect(out.kind).toBe('noop');
  });

  it('la decision d absence consulte reellement la memoire du plateau', () => {
    const source = readFileSync(join(RACINE, 'lib/socket/tournamentHandlers.ts'), 'utf8');
    expect(source).toContain('aAgiP1: aAgiAuPlateau(matchId, p1)');
    expect(source).toContain('aAgiP2: aAgiAuPlateau(matchId, p2 || null)');
  });

  it('le serveur note chaque action au plateau', () => {
    const source = readFileSync(join(RACINE, 'lib/socket/server.ts'), 'utf8');
    expect(source).toContain('noterUneActionAuPlateau(room.tournamentMatchId');
  });
});

describe('un joueur qui revient pendant l avant-partie n est pas laisse sur le tirage', () => {
  it('le serveur lui rejoue la synchronisation au lieu de l ignorer', () => {
    const source = readFileSync(join(RACINE, 'lib/socket/server.ts'), 'utf8');
    const bloc = source.slice(source.indexOf("socket.on('coin-flip-done'"));
    const handler = bloc.slice(0, bloc.indexOf('});') + 3);
    expect(handler, 'le tirage deja resolu doit etre rejoue au revenant').toContain('room.coinFlipResolved');
    expect(handler).toContain("socket.emit('coin-flip-sync')");
    const avantLeRetour = handler.indexOf('room.coinFlipResolved');
    const marquage = handler.indexOf('room.coinFlipDone[player] = true');
    expect(avantLeRetour).toBeLessThan(marquage);
  });
});
