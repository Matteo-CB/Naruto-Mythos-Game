import { describe, expect, it } from 'vitest';
import { generateBracket } from '@/lib/tournament/tournamentEngine';

interface Player { userId: string; username: string; elo: number }

function players(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    userId: `u${i + 1}`,
    username: `player${i + 1}`,
    elo: 1200 - i,
  }));
}

describe('a tournament always starts with matches its players can actually launch', () => {
  it('every real first-round match is armed, for every field size', () => {
    for (let n = 2; n <= 40; n++) {
      const { matches } = generateBracket(players(n));
      const roundOne = matches.filter((m) => m.round === 1);
      const playable = roundOne.filter((m) => !m.isBye);

      expect(playable.length, `${n} players: someone must have a match`).toBeGreaterThan(0);
      for (const match of playable) {
        expect(match.status, `${n} players: a first-round match left pending blocks both players`).toBe('ready');
      }
    }
  });

  it('a bye is completed, never left waiting for a game', () => {
    for (let n = 2; n <= 40; n++) {
      const { matches } = generateBracket(players(n));
      for (const match of matches.filter((m) => m.round === 1 && m.isBye)) {
        expect(match.status, `${n} players: a bye must be settled at once`).toBe('completed');
        expect(match.winnerId, `${n} players: a bye needs its winner`).toBeTruthy();
      }
    }
  });

  it('later rounds stay pending until their feeders resolve', () => {
    const { matches } = generateBracket(players(16));
    for (const match of matches.filter((m) => m.round > 1 && !m.isBye)) {
      expect(match.status).toBe('pending');
    }
  });

  it('no first-round match is left pending, which is what froze the 4 August tournament', () => {
    const { matches } = generateBracket(players(11));
    const stuck = matches.filter((m) => m.round === 1 && m.status === 'pending');
    expect(stuck.map((m) => `${m.player1.username} vs ${m.player2.username}`)).toEqual([]);
  });

  it('every player of the first round is seated in an armed or settled match', () => {
    for (let n = 2; n <= 33; n++) {
      const { matches } = generateBracket(players(n));
      const roundOne = matches.filter((m) => m.round === 1);
      const seated = new Set<string>();
      for (const match of roundOne) {
        expect(['ready', 'completed'], `${n} players: unexpected status ${match.status}`).toContain(match.status);
        if (match.player1.participantId) seated.add(match.player1.participantId);
        if (match.player2.participantId) seated.add(match.player2.participantId);
      }
      expect(seated.size, `${n} players: everyone plays round one`).toBe(n);
    }
  });
});
