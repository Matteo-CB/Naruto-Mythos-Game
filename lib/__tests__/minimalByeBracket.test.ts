import { describe, expect, it } from 'vitest';
import { generateBracket, advanceWinner, roundMatchCounts, MAIN_BRACKET } from '@/lib/tournament/tournamentEngine';
import type { BracketMatch } from '@/lib/tournament/tournamentEngine';

function players(n: number) {
  return Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, username: `P${i + 1}` }));
}

function mainMatches(matches: BracketMatch[]): BracketMatch[] {
  return matches.filter((m) => (m.bracket ?? MAIN_BRACKET) === MAIN_BRACKET);
}

describe('the bracket pairs every player in round 1 and never gives more than one bye per round', () => {
  for (let n = 2; n <= 40; n += 1) {
    it(`${n} players: everyone plays, byes stay minimal, a champion comes out`, () => {
      const { matches, totalRounds } = generateBracket(players(n));
      const main = mainMatches(matches);

      const round1 = main.filter((m) => m.round === 1);
      const seated = new Set<string>();
      for (const m of round1) {
        if (m.player1.participantId) seated.add(m.player1.participantId);
        if (m.player2.participantId) seated.add(m.player2.participantId);
      }
      expect(seated.size, 'every registered player must be seated in round 1').toBe(n);

      expect(round1.filter((m) => m.isBye).length, 'round 1 byes').toBe(n % 2);

      for (let round = 1; round <= totalRounds; round += 1) {
        const byes = main.filter((m) => m.round === round && m.isBye).length;
        expect(byes, `round ${round} may hold at most one bye`).toBeLessThanOrEqual(1);
      }

      expect(main.filter((m) => !m.isBye).length, 'real matches in a knockout').toBe(n - 1);

      expect(roundMatchCounts(n).length).toBe(totalRounds);
      expect(main.filter((m) => m.round === totalRounds).length, 'a single final').toBe(1);

      let guard = 0;
      const pending = () => main.filter((m) => m.status !== 'completed');
      while (pending().length > 0 && guard++ < 200) {
        const playable = pending().find(
          (m) => (m.isBye && m.player1.participantId) || (m.player1.participantId && m.player2.participantId),
        );
        expect(playable, 'the bracket must never deadlock').toBeTruthy();
        playable!.winnerId = playable!.player1.participantId;
        playable!.winnerUsername = playable!.player1.username;
        playable!.status = 'completed';
        advanceWinner(main, playable!);
      }

      const final = main.find((m) => m.round === totalRounds && m.matchIndex === 0)!;
      expect(final.status).toBe('completed');
      expect(final.winnerId, 'the tournament must produce a champion').toBeTruthy();
    });
  }

  it('an odd field gives the single round 1 bye to one player only once', () => {
    const { matches } = generateBracket(players(17));
    const byeMatch = mainMatches(matches).find((m) => m.round === 1 && m.isBye)!;
    expect(byeMatch.player1.participantId).toBeTruthy();
    expect(byeMatch.player2.participantId).toBeNull();
    expect(byeMatch.status).toBe('completed');
  });

  it('the 17-player NWL scenario: 8 real matches round 1, not 15 free wins', () => {
    const { matches } = generateBracket(players(17));
    const round1 = mainMatches(matches).filter((m) => m.round === 1);
    expect(round1.filter((m) => !m.isBye).length).toBe(8);
    expect(round1.filter((m) => m.isBye).length).toBe(1);
  });
});
