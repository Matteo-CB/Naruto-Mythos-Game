import { describe, it, expect } from 'vitest';
import { validateDeckForTournament, emptyTournamentRules } from '@/lib/tournament/deckValidation';

function repeat(id: string, n: number): string[] {
  return Array.from({ length: n }, () => id);
}

describe('Phase 13 — tournament Evolving deck gate', () => {
  it('rejects a deck with non-KS cards when tournament.gameMode === "evolving"', () => {
    const deck = {
      cardIds: [...repeat('KS-001-C', 28), 'SS-001-C', 'SS-002-C'],
      missionIds: ['KS-MSS-01', 'KS-MSS-02', 'KS-MSS-03'],
    };
    const tournament = { ...emptyTournamentRules(), gameMode: 'evolving' };
    const result = validateDeckForTournament(deck, tournament);
    expect(result.valid).toBe(false);
    expect(result.errorKeys.some((e) => e.key === 'tournament.deckError.evolvingSetNotAllowed')).toBe(true);
  });

  it('rejects an evolving tournament deck that exceeds 5 points', () => {
    const deck = {
      cardIds: [
        ...repeat('KS-107-R', 2),
        ...repeat('KS-120-R', 2),
        ...repeat('KS-135-S', 2),
        ...repeat('KS-001-C', 24),
      ],
      missionIds: ['KS-MSS-01', 'KS-MSS-02', 'KS-MSS-03'],
    };
    const tournament = { ...emptyTournamentRules(), gameMode: 'evolving' };
    const result = validateDeckForTournament(deck, tournament);
    expect(result.valid).toBe(false);
    expect(result.errorKeys.some((e) => e.key === 'tournament.deckError.evolvingOverBudget')).toBe(true);
  });

  it('accepts a KS-only deck within 5 points in an evolving tournament', () => {
    const deck = {
      cardIds: [
        'KS-120-R', 'KS-120-R',
        'KS-031-UC',
        ...repeat('KS-001-C', 27),
      ],
      missionIds: ['KS-MSS-01', 'KS-MSS-02', 'KS-MSS-03'],
    };
    const tournament = { ...emptyTournamentRules(), gameMode: 'evolving' };
    const result = validateDeckForTournament(deck, tournament);

    const evolvingErrors = result.errorKeys.filter(
      (e) =>
        e.key === 'tournament.deckError.evolvingSetNotAllowed' ||
        e.key === 'tournament.deckError.evolvingOverBudget',
    );
    expect(evolvingErrors).toHaveLength(0);
  });

  it('does NOT apply Evolving deck gate when gameMode is not "evolving"', () => {
    const deck = {
      cardIds: [...repeat('KS-001-C', 28), 'SS-001-C', 'SS-002-C'],
      missionIds: ['KS-MSS-01', 'KS-MSS-02', 'KS-MSS-03'],
    };
    const tournament = { ...emptyTournamentRules(), gameMode: 'classic' };
    const result = validateDeckForTournament(deck, tournament);
    const evolvingErrors = result.errorKeys.filter(
      (e) =>
        e.key === 'tournament.deckError.evolvingSetNotAllowed' ||
        e.key === 'tournament.deckError.evolvingOverBudget',
    );
    expect(evolvingErrors).toHaveLength(0);
  });

  it('reports both evolving errors AND base validation errors when both apply', () => {
    const deck = {
      cardIds: [...repeat('KS-107-R', 2), 'SS-001-C', ...repeat('KS-001-C', 26)],
      missionIds: ['KS-MSS-01', 'KS-MSS-02'],
    };
    const tournament = { ...emptyTournamentRules(), gameMode: 'evolving' };
    const result = validateDeckForTournament(deck, tournament);
    expect(result.valid).toBe(false);
    expect(result.errorKeys.some((e) => e.key === 'tournament.deckError.wrongMissionCount')).toBe(true);
    expect(result.errorKeys.some((e) => e.key === 'tournament.deckError.evolvingSetNotAllowed')).toBe(true);
  });
});
