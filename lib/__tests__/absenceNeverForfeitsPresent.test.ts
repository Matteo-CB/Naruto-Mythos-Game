import { describe, it, expect } from 'vitest';
import { decideAbsenceOutcome, type AbsenceEvidence , MIN_ABSENCE_SAMPLES_WITHOUT_EVIDENCE } from '@/lib/tournament/absenceDecision';

const P1 = 'user-1';
const P2 = 'user-2';
const MAX = 8;

function everyCombination(): AbsenceEvidence[] {
  const bools = [false, true];
  const out: AbsenceEvidence[] = [];
  for (const gameLive of bools) {
    for (const knownAbsentPlayerId of [null, P1, P2]) {
      for (const readySetPresent of bools) {
        for (const readyP1 of bools) {
          for (const readyP2 of bools) {
            for (const seatBoundP1 of bools) {
              for (const seatBoundP2 of bools) {
                for (const onlineP1 of bools) {
                  for (const onlineP2 of bools) {
                    for (const cycles of [0, 1, MAX - 1, MAX, MAX + 5]) {
                      out.push({
                        p1: P1, p2: P2, knownAbsentPlayerId, readySetPresent,
                        readyP1, readyP2, seatBoundP1, seatBoundP2,
                        onlineP1, onlineP2, gameLive, cycles, maxCycles: MAX,
                        aAgiP1: false, aAgiP2: false,
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return out;
}

describe('a tournament never forfeits a player the server can still see', () => {
  const cases = everyCombination();

  it('the sweep really covers every combination of evidence', () => {
    expect(cases.length).toBe(2 * 3 * 2 * 2 * 2 * 2 * 2 * 2 * 2 * 5);
  });

  it('no player who is online is ever forfeited, whatever the rest of the evidence says', () => {
    const offenders: string[] = [];
    for (const ev of cases) {
      const out = decideAbsenceOutcome(ev);
      if (out.kind !== 'forfeit') continue;
      if (ev.onlineP1 && out.players.includes(P1)) offenders.push(`p1 online but forfeited: ${JSON.stringify(ev)}`);
      if (ev.onlineP2 && out.players.includes(P2)) offenders.push(`p2 online but forfeited: ${JSON.stringify(ev)}`);
    }
    expect(offenders.slice(0, 3)).toEqual([]);
  });

  it('no player sitting in the match room is ever forfeited', () => {
    const offenders: string[] = [];
    for (const ev of cases) {
      const out = decideAbsenceOutcome(ev);
      if (out.kind !== 'forfeit') continue;
      if (ev.seatBoundP1 && out.players.includes(P1)) offenders.push(JSON.stringify(ev));
      if (ev.seatBoundP2 && out.players.includes(P2)) offenders.push(JSON.stringify(ev));
    }
    expect(offenders.slice(0, 3)).toEqual([]);
  });

  it('no player who confirmed ready is ever forfeited', () => {
    const offenders: string[] = [];
    for (const ev of cases) {
      const out = decideAbsenceOutcome(ev);
      if (out.kind !== 'forfeit') continue;
      if (ev.readyP1 && out.players.includes(P1)) offenders.push(JSON.stringify(ev));
      if (ev.readyP2 && out.players.includes(P2)) offenders.push(JSON.stringify(ev));
    }
    expect(offenders.slice(0, 3)).toEqual([]);
  });

  it('a live game is never interrupted by an absence decision', () => {
    for (const ev of cases.filter((c) => c.gameLive)) {
      expect(decideAbsenceOutcome(ev).kind).toBe('noop');
    }
  });

  it('the grace loop is bounded: past the cap it never asks for another grace cycle', () => {
    for (const ev of cases.filter((c) => c.cycles >= c.maxCycles)) {
      expect(decideAbsenceOutcome(ev).kind).not.toBe('grace');
    }
  });

  it('when both players are visible the match is reopened, never decided by forfeit', () => {
    const out = decideAbsenceOutcome({
      p1: P1, p2: P2, knownAbsentPlayerId: null, readySetPresent: true,
      readyP1: false, readyP2: false, seatBoundP1: false, seatBoundP2: false,
      onlineP1: true, onlineP2: true, gameLive: false, aAgiP1: false, aAgiP2: false,
      cycles: MAX, maxCycles: MAX,
    });
    expect(out.kind).toBe('no-contest');
  });

  it('an offline player who never showed up is still forfeited, but only after several checks', () => {
    const preuve = (cycles: number) => ({
      p1: P1, p2: P2, knownAbsentPlayerId: P2, readySetPresent: true,
      readyP1: true, readyP2: false, seatBoundP1: true, seatBoundP2: false,
      onlineP1: true, onlineP2: false, gameLive: false, aAgiP1: false, aAgiP2: false,
      cycles, maxCycles: MAX,
    });

    expect(
      decideAbsenceOutcome(preuve(0)).kind,
      'un seul controle ne suffit pas: le joueur peut naviguer vers son match',
    ).toBe('grace');

    const out = decideAbsenceOutcome(preuve(MIN_ABSENCE_SAMPLES_WITHOUT_EVIDENCE));
    expect(out.kind).toBe('forfeit');
    expect(out.kind === 'forfeit' && out.players).toEqual([P2]);
  });
});
