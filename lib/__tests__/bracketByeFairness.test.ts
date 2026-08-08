import { describe, expect, it } from 'vitest';
import { generateBracket, advanceWinner, roundMatchCounts, nextPowerOf2, MAIN_BRACKET } from '@/lib/tournament/tournamentEngine';
import type { BracketMatch } from '@/lib/tournament/tournamentEngine';
import { generateDoubleElimBracket } from '@/lib/tournament/doubleElimEngine';

function players(n: number) {
  return Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, username: `P${i + 1}` }));
}

function mainMatches(matches: BracketMatch[]): BracketMatch[] {
  return matches.filter((m) => (m.bracket ?? MAIN_BRACKET) === MAIN_BRACKET);
}

function byesPerPlayer(matches: BracketMatch[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of matches) {
    if (!m.isBye || !m.winnerId) continue;
    counts.set(m.winnerId, (counts.get(m.winnerId) ?? 0) + 1);
  }
  return counts;
}

function playToTheEnd(main: BracketMatch[], totalRounds: number): BracketMatch {
  let guard = 0;
  const pending = () => main.filter((m) => m.status !== 'completed');
  while (pending().length > 0 && guard++ < 500) {
    const playable = pending().find(
      (m) => (m.isBye && m.player1.participantId) || (m.player1.participantId && m.player2.participantId),
    );
    expect(playable, 'the bracket must never deadlock').toBeTruthy();
    playable!.winnerId = playable!.player1.participantId;
    playable!.winnerUsername = playable!.player1.username;
    playable!.status = 'completed';
    advanceWinner(main, playable!);
  }
  return main.find((m) => m.round === totalRounds && m.matchIndex === 0)!;
}

describe('a knockout player can never be handed a second free win', () => {
  for (let n = 2; n <= 40; n += 1) {
    it(`${n} players: byes live in round 1 only, one per player at most`, () => {
      const { matches, totalRounds } = generateBracket(players(n));
      const main = mainMatches(matches);

      const seated = new Set<string>();
      for (const m of main.filter((m) => m.round === 1)) {
        if (m.player1.participantId) seated.add(m.player1.participantId);
        if (m.player2.participantId) seated.add(m.player2.participantId);
      }
      expect(seated.size, 'every registered player is in the tree').toBe(n);

      for (let round = 2; round <= totalRounds; round += 1) {
        expect(
          main.filter((m) => m.round === round && m.isBye).length,
          `round ${round} must be a real round`,
        ).toBe(0);
      }

      const byes = byesPerPlayer(main);
      for (const [userId, count] of byes) {
        expect(count, `${userId} received ${count} byes`).toBe(1);
      }

      expect(main.filter((m) => m.isBye).length, 'the tree is padded to a power of two')
        .toBe(nextPowerOf2(n) - n);
      expect(main.filter((m) => !m.isBye).length, 'a knockout always plays n-1 real matches').toBe(n - 1);
      expect(totalRounds).toBe(Math.log2(nextPowerOf2(n)));
      expect(roundMatchCounts(n).length).toBe(totalRounds);
      expect(main.filter((m) => m.round === totalRounds).length, 'a single final').toBe(1);

      const final = playToTheEnd(main, totalRounds);
      expect(final.status).toBe('completed');
      expect(final.winnerId, 'the tournament must produce a champion').toBeTruthy();
    });
  }

  it('the reported case: 18 players, nobody walks to the final on byes', () => {
    const { matches, totalRounds } = generateBracket(players(18));
    const main = mainMatches(matches);

    expect(totalRounds).toBe(5);
    expect(main.filter((m) => m.round === 1 && m.isBye).length).toBe(14);
    expect(main.filter((m) => m.round === 1 && !m.isBye).length, 'a play-in for the lowest seeds').toBe(2);
    expect(main.filter((m) => m.round > 1 && m.isBye).length, 'no free win after round 1').toBe(0);

    const byes = byesPerPlayer(main);
    expect(Math.max(0, ...byes.values()), 'three byes in a row is what players complained about').toBe(1);

    const champion = playToTheEnd(main, totalRounds);
    const wonByChampion = main.filter((m) => m.winnerId === champion.winnerId);
    expect(wonByChampion.filter((m) => !m.isBye).length, 'the champion really played').toBeGreaterThanOrEqual(4);
  });

  it('an exact power of two never produces a single bye', () => {
    for (const n of [2, 4, 8, 16, 32]) {
      const main = mainMatches(generateBracket(players(n)).matches);
      expect(main.filter((m) => m.isBye).length, `${n} players`).toBe(0);
    }
  });
});

describe('double elimination follows the same rule', () => {
  for (const n of [3, 5, 6, 7, 11, 18, 23]) {
    it(`${n} players: byes only in the first winners round, one per player`, () => {
      const { matches } = generateDoubleElimBracket(players(n));

      const lateByes = matches.filter((m) => m.isBye && !(m.bracket === 'winners' && m.round === 1));
      expect(lateByes.length, 'no free win outside the opening round').toBe(0);

      const counts = new Map<string, number>();
      for (const m of matches.filter((x) => x.isBye && x.winnerId)) {
        counts.set(m.winnerId!, (counts.get(m.winnerId!) ?? 0) + 1);
      }
      for (const [userId, count] of counts) {
        expect(count, `${userId} received ${count} byes`).toBe(1);
      }
    });
  }
});
