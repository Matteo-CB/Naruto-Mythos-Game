import { describe, it, expect } from 'vitest';
import {
  statusColor,
  pct,
  isUrl,
  isCutRound,
  splitRounds,
  extractDecks,
  deckCardCount,
  formatLocation,
  formatTournamentDate,
} from '@/lib/topdeck/detail';
import type { TdRound } from '@/components/topdeck/shared';

describe('topdeck statusColor', () => {
  it('returns distinct colors for known statuses and a fallback for unknown', () => {
    expect(statusColor('upcoming')).toBe('#7eb6ff');
    expect(statusColor('ongoing')).toBe('#6ee7a8');
    expect(statusColor('completed')).toBe('#b59a63');
    expect(statusColor('weird')).toBe('#8a8a8a');
  });
});

describe('topdeck pct', () => {
  it('formats fractions and whole percentages, dash on null', () => {
    expect(pct(0.5)).toBe('50.0%');
    expect(pct(0.6667)).toBe('66.7%');
    expect(pct(75)).toBe('75.0%');
    expect(pct(null)).toBe('-');
    expect(pct(undefined)).toBe('-');
  });
});

describe('topdeck isUrl', () => {
  it('detects http(s) urls only', () => {
    expect(isUrl('https://moxfield.com/decks/x')).toBe(true);
    expect(isUrl('http://x')).toBe(true);
    expect(isUrl('4x Sol Ring')).toBe(false);
    expect(isUrl(null)).toBe(false);
  });
});

describe('topdeck isCutRound', () => {
  it('treats string-labeled rounds as cut, numeric as swiss', () => {
    expect(isCutRound('Top 16')).toBe(true);
    expect(isCutRound('Top 4')).toBe(true);
    expect(isCutRound('7')).toBe(false);
    expect(isCutRound(7)).toBe(false);
    expect(isCutRound(undefined)).toBe(false);
  });
});

describe('topdeck splitRounds', () => {
  it('separates numeric swiss rounds from string-labeled cut rounds, preserving order', () => {
    const rounds: TdRound[] = [
      { round: 1, tables: [] },
      { round: 2, tables: [] },
      { round: 'Top 16', tables: [] },
      { round: 'Top 4', tables: [] },
    ];
    const { swiss, cut } = splitRounds(rounds);
    expect(swiss.map((r) => r.round)).toEqual([1, 2]);
    expect(cut.map((r) => r.round)).toEqual(['Top 16', 'Top 4']);
  });
});

describe('topdeck extractDecks', () => {
  const rounds: TdRound[] = [
    {
      round: 1,
      tables: [
        { players: [
          { name: 'Alice', id: 'a', decklist: 'list-a', deckObj: { Commanders: { 'Grist': { id: 'x', count: 1 } } } },
          { name: 'Bob', id: 'b', decklist: null, deckObj: null },
        ] },
      ],
    },
    {
      round: 2,
      tables: [
        { players: [
          { name: 'Alice', id: 'a', decklist: 'list-a', deckObj: {} },
          { name: 'Carl', id: 'c', deckObj: { Mainboard: { 'Sol Ring': { count: 1 } } } },
        ] },
      ],
    },
  ];

  it('collects unique players that have a decklist or deckObj, deduped by id', () => {
    const decks = extractDecks(rounds);
    const ids = decks.map((d) => d.id).sort();
    expect(ids).toEqual(['a', 'c']);
    const alice = decks.find((d) => d.id === 'a')!;
    expect(alice.name).toBe('Alice');
    expect(alice.decklist).toBe('list-a');
  });

  it('returns empty when no players carry decks', () => {
    expect(extractDecks([{ round: 1, tables: [{ players: [{ name: 'x', id: 'x' }] }] }])).toEqual([]);
  });
});

describe('topdeck deckCardCount', () => {
  it('sums counts across all sections', () => {
    expect(deckCardCount({ Commanders: { A: { count: 1 } }, Mainboard: { B: { count: 3 }, C: { count: 2 } } })).toBe(6);
    expect(deckCardCount(null)).toBe(0);
  });
});

describe('topdeck formatLocation', () => {
  it('joins city/state/country and dedupes, falling back to locationName', () => {
    expect(formatLocation({ city: 'Lyon', state: 'AURA', country: 'France', locationName: 'addr' })).toBe('Lyon, AURA, France');
    expect(formatLocation({ city: null, state: null, country: null, locationName: '4051 W Outer Rd' })).toBe('4051 W Outer Rd');
    expect(formatLocation({ city: 'Paris', state: 'Paris', country: null, locationName: null })).toBe('Paris');
  });
});

describe('topdeck formatTournamentDate', () => {
  it('formats a date per locale and returns empty for null/invalid', () => {
    expect(formatTournamentDate(null, 'fr')).toBe('');
    expect(formatTournamentDate('not-a-date', 'en')).toBe('');
    const iso = new Date(Date.UTC(2026, 4, 13, 12, 0, 0)).toISOString();
    expect(formatTournamentDate(iso, 'en')).toMatch(/2026/);
    expect(formatTournamentDate(iso, 'fr')).toMatch(/2026/);
  });
});
