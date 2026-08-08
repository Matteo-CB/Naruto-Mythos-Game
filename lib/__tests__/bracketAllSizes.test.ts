import { describe, it, expect } from 'vitest';
import { generateBracket, roundMatchCounts, advanceWinner, nextPowerOf2, MAIN_BRACKET, THIRD_PLACE_BRACKET } from '@/lib/tournament/tournamentEngine';
import type { BracketMatch } from '@/lib/tournament/tournamentEngine';

function participantsOf(n: number) {
  return Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, username: `P${i + 1}` }));
}

function playOutBracket(matches: BracketMatch[], totalRounds: number): string | null {
  for (let round = 1; round <= totalRounds; round++) {
    const roundMatches = matches
      .filter((m) => (m.bracket ?? MAIN_BRACKET) === MAIN_BRACKET && m.round === round)
      .sort((a, b) => a.matchIndex - b.matchIndex);
    for (const m of roundMatches) {
      if (m.winnerId) {
        advanceWinner(matches, m);
        continue;
      }
      const p1 = m.player1.participantId;
      const p2 = m.player2.participantId;
      if (!p1 && !p2) return null;
      m.winnerId = p1 ?? p2;
      m.winnerUsername = p1 ? m.player1.username : m.player2.username;
      m.status = 'completed';
      advanceWinner(matches, m);
    }
  }
  const final = matches.find((m) => (m.bracket ?? MAIN_BRACKET) === MAIN_BRACKET && m.round === totalRounds);
  return final?.winnerId ?? null;
}

describe('single elimination bracket is sound for every field size from 2 to 32', () => {
  for (let n = 2; n <= 32; n++) {
    it(`${n} players: produces a playable bracket with exactly one champion`, () => {
      const { matches, totalRounds, thirdPlaceMatch } = generateBracket(participantsOf(n));

      expect(totalRounds).toBe(roundMatchCounts(n).length);

      const round1 = matches.filter((m) => m.round === 1);
      expect(round1, 'the tree is padded to a power of two').toHaveLength(nextPowerOf2(n) / 2);

      const seated = round1.flatMap((m) => [m.player1.participantId, m.player2.participantId]).filter(Boolean);
      expect(new Set(seated).size).toBe(n);
      expect(seated).toHaveLength(n);

      for (const m of matches) {
        if (m.player1.participantId && m.player2.participantId) {
          expect(m.player1.participantId).not.toBe(m.player2.participantId);
        }
      }

      const champion = playOutBracket(matches, totalRounds);
      expect(champion).toBeTruthy();
      expect(seated).toContain(champion);

      if (n >= 4) {
        expect(thirdPlaceMatch).not.toBeNull();
        expect(thirdPlaceMatch!.bracket).toBe(THIRD_PLACE_BRACKET);
        expect(thirdPlaceMatch!.round).toBe(totalRounds);
      } else {
        expect(thirdPlaceMatch).toBeNull();
      }
    });
  }

  it('a full 32 player field needs 5 rounds and 31 matches, with no bye', () => {
    const { matches, totalRounds } = generateBracket(participantsOf(32));
    expect(totalRounds).toBe(5);
    expect(matches.filter((m) => (m.bracket ?? MAIN_BRACKET) === MAIN_BRACKET)).toHaveLength(31);
    expect(matches.some((m) => m.isBye)).toBe(false);
  });

  it('an odd field keeps every bye in round 1 and never leaves an empty later match', () => {
    const { matches, totalRounds } = generateBracket(participantsOf(21));
    for (let round = 2; round <= totalRounds; round += 1) {
      expect(matches.filter((m) => m.round === round && m.isBye).length, `round ${round}`).toBe(0);
    }
    expect(matches.filter((m) => m.round === 1 && m.isBye).length).toBe(nextPowerOf2(21) - 21);
    const champion = playOutBracket(matches, totalRounds);
    expect(champion).toBeTruthy();
  });
});
