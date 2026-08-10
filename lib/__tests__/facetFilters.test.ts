import { describe, expect, it } from 'vitest';
import {
  facetOptions,
  facetPool,
  facetSelectionOrFallback,
  isFacetWorthShowing,
} from '@/lib/collection/facets';

interface Card {
  id: string;
  set: string;
  rarity: string;
  group: string;
  keywords: string[];
}

const CARDS: Card[] = [
  { id: 'KS-001-C', set: 'KS', rarity: 'C', group: 'Leaf Village', keywords: ['Team 7'] },
  { id: 'KS-131-S', set: 'KS', rarity: 'S', group: 'Leaf Village', keywords: ['Sannin'] },
  { id: 'KS-143-M', set: 'KS', rarity: 'M', group: 'Akatsuki', keywords: [] },
  { id: 'SS-005-MV', set: 'SS', rarity: 'M', group: 'Leaf Village', keywords: ['Team 7', 'Jutsu'] },
  { id: 'SS-046-UC', set: 'SS', rarity: 'UC', group: 'Sand Village', keywords: ['Jutsu'] },
];

const RARITY_ORDER = ['C', 'UC', 'R', 'S', 'M'] as const;

function build(selection: { set: string; rarity: string; group: string }) {
  return {
    set: (c: Card) => selection.set === 'all' || c.set === selection.set,
    rarity: (c: Card) => selection.rarity === 'all' || c.rarity === selection.rarity,
    group: (c: Card) => selection.group === 'all' || c.group === selection.group,
  };
}

const ALL = { set: 'all', rarity: 'all', group: 'all' };

describe('a filter never offers a value that matches nothing', () => {
  it('with no filter active, every value present in the pool is offered', () => {
    const options = facetOptions({
      cards: CARDS, predicates: build(ALL), dimension: 'rarity',
      valueOf: (c) => c.rarity, order: RARITY_ORDER,
    });
    expect(options).toEqual(['C', 'UC', 'S', 'M']);
    expect(options, 'no rare in this pool').not.toContain('R');
  });

  it('the user case: picking a set drops the rarities that set does not have', () => {
    const options = facetOptions({
      cards: CARDS, predicates: build({ ...ALL, set: 'SS' }), dimension: 'rarity',
      valueOf: (c) => c.rarity, order: RARITY_ORDER,
    });
    expect(options, 'set 2 has no Secret').not.toContain('S');
    expect(options).toEqual(['UC', 'M']);
  });

  it('a facet never filters by its own dimension, so the other choices stay reachable', () => {
    const options = facetOptions({
      cards: CARDS, predicates: build({ ...ALL, rarity: 'M' }), dimension: 'rarity',
      valueOf: (c) => c.rarity, order: RARITY_ORDER,
    });
    expect(options, 'you can still switch away from M').toEqual(['C', 'UC', 'S', 'M']);
  });

  it('two active filters both narrow a third', () => {
    const options = facetOptions({
      cards: CARDS, predicates: build({ set: 'SS', rarity: 'M', group: 'all' }), dimension: 'group',
      valueOf: (c) => c.group,
    });
    expect(options).toEqual(['Leaf Village']);
  });

  it('array values contribute every entry', () => {
    const options = facetOptions({
      cards: CARDS, predicates: build(ALL), dimension: 'keyword', valueOf: (c) => c.keywords,
    });
    expect(options).toEqual(['Jutsu', 'Sannin', 'Team 7']);
  });

  it('values outside the canonical order are appended, never dropped', () => {
    const options = facetOptions({
      cards: [...CARDS, { id: 'SS-149-L', set: 'SS', rarity: 'L', group: 'Leaf Village', keywords: [] }],
      predicates: build(ALL), dimension: 'rarity', valueOf: (c) => c.rarity, order: RARITY_ORDER,
    });
    expect(options).toEqual(['C', 'UC', 'S', 'M', 'L']);
  });

  it('empty and missing values never become an option', () => {
    const options = facetOptions({
      cards: [{ id: 'x', set: '', rarity: 'C', group: '', keywords: [] }],
      predicates: {}, dimension: 'group', valueOf: (c) => c.group,
    });
    expect(options).toEqual([]);
  });

  it('an empty pool offers nothing at all', () => {
    expect(facetOptions({
      cards: [], predicates: build(ALL), dimension: 'rarity', valueOf: (c: Card) => c.rarity,
    })).toEqual([]);
  });
});

describe('a control with nothing to choose is not shown', () => {
  it('zero or one value means there is no choice to make', () => {
    expect(isFacetWorthShowing([])).toBe(false);
    expect(isFacetWorthShowing(['C'])).toBe(false);
    expect(isFacetWorthShowing(['C', 'UC'])).toBe(true);
  });

  it('a pool from a single set hides the set picker', () => {
    const single = CARDS.filter((c) => c.set === 'SS');
    const options = facetOptions({
      cards: single, predicates: build(ALL), dimension: 'set', valueOf: (c) => c.set,
    });
    expect(options).toEqual(['SS']);
    expect(isFacetWorthShowing(options)).toBe(false);
  });
});

describe('a selection that becomes unreachable falls back', () => {
  it('an unavailable value is replaced by the fallback', () => {
    expect(facetSelectionOrFallback('S', ['UC', 'M'], 'all')).toBe('all');
  });

  it('an available value is left alone', () => {
    expect(facetSelectionOrFallback('M', ['UC', 'M'], 'all')).toBe('M');
  });

  it('the fallback itself is always stable, so the reset cannot loop', () => {
    expect(facetSelectionOrFallback('all', [], 'all')).toBe('all');
    const once = facetSelectionOrFallback('S', [], 'all');
    expect(facetSelectionOrFallback(once, [], 'all')).toBe(once);
  });
});

describe('the pool used for a facet', () => {
  it('applies every other predicate and never its own', () => {
    const pool = facetPool(CARDS, build({ set: 'KS', rarity: 'S', group: 'all' }), 'rarity');
    expect(pool.map((c) => c.id)).toEqual(['KS-001-C', 'KS-131-S', 'KS-143-M']);
  });

  it('with no predicate at all the pool is the full list', () => {
    expect(facetPool(CARDS, {}, 'rarity')).toHaveLength(CARDS.length);
  });
});
