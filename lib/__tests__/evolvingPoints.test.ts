import { describe, it, expect } from 'vitest';
import {
  computeDeckEvolvingPoints,
  isEvolvingCompatible,
  deckUsesOnlyAllowedSets,
  checkEvolvingCompatibility,
  extractSetFromCardId,
} from '@/lib/evolving/computePoints';
import {
  EVOLVING_MAX_POINTS,
  EVOLVING_ALLOWED_SETS,
  EVOLVING_INITIAL_ELO,
  EVOLVING_K_FACTOR,
  EVOLVING_MIN_GAIN_ON_WIN,
  EVOLVING_MAX_LOSS_ON_DEFEAT,
  EVOLVING_ELO_FLOOR,
} from '@/lib/evolving/constants';
import {
  EVOLVING_CARDS,
  EVOLVING_HERO_SPECS,
  isEvolvingHeroCard,
} from '@/lib/evolving/cardCosts';
import {
  getEvolvingBracket,
  getEvolvingColorForPoints,
  getEvolvingColorForBracket,
} from '@/lib/evolving/colors';

describe('Phase 1 — constants single-source', () => {
  it('locks EVOLVING_MAX_POINTS to 5', () => {
    expect(EVOLVING_MAX_POINTS).toBe(5);
  });

  it('locks EVOLVING_ALLOWED_SETS to KS only', () => {
    expect(EVOLVING_ALLOWED_SETS.has('KS')).toBe(true);
    expect(EVOLVING_ALLOWED_SETS.has('SS')).toBe(false);
    expect(EVOLVING_ALLOWED_SETS.size).toBe(1);
  });

  it('exposes ELO constants matching main system', () => {
    expect(EVOLVING_INITIAL_ELO).toBe(500);
    expect(EVOLVING_K_FACTOR).toBe(32);
    expect(EVOLVING_MIN_GAIN_ON_WIN).toBe(10);
    expect(EVOLVING_MAX_LOSS_ON_DEFEAT).toBe(25);
    expect(EVOLVING_ELO_FLOOR).toBe(100);
  });
});

describe('Phase 1 — EVOLVING_CARDS list (Marcello 2026-05-11)', () => {
  it('SPECS contains exactly 13 Hero card numbers', () => {
    expect(EVOLVING_HERO_SPECS.length).toBe(13);
  });

  it('resolved map has at least 13 entries (variants count too)', () => {
    expect(EVOLVING_CARDS.size).toBeGreaterThanOrEqual(13);
  });

  it('every resolved cardId in the map has set=KS and matches a SPEC number', () => {
    const validNumbers = new Set(EVOLVING_HERO_SPECS.map((s) => s.number));
    for (const cardId of EVOLVING_CARDS.keys()) {
      const m = cardId.match(/^([A-Z]+)-(\d+)-/);
      expect(m).not.toBeNull();
      if (m) {
        expect(m[1]).toBe('KS');
        expect(validNumbers.has(m[2])).toBe(true);
      }
    }
  });

  it('has the 3 expected 2pt characters', () => {
    expect(EVOLVING_CARDS.get('KS-107-R')?.pointCost).toBe(2);
    expect(EVOLVING_CARDS.get('KS-120-R')?.pointCost).toBe(2);
    expect(EVOLVING_CARDS.get('KS-135-S')?.pointCost).toBe(2);
  });

  it('has the 8 expected per-copy 1pt characters', () => {
    const onePtPerCopy = [
      'KS-020-UC', 'KS-026-UC', 'KS-031-UC', 'KS-033-UC',
      'KS-053-UC', 'KS-122-R', 'KS-133-S', 'KS-136-S',
    ];
    for (const id of onePtPerCopy) {
      const c = EVOLVING_CARDS.get(id);
      expect(c?.pointCost).toBe(1);
      expect(c?.costMode).toBe('per-copy');
    }
  });

  it('has the 2 expected flat-cost cards (Ton Ton, Shikamaru)', () => {
    expect(EVOLVING_CARDS.get('KS-021-C')?.costMode).toBe('flat');
    expect(EVOLVING_CARDS.get('KS-101-C')?.costMode).toBe('flat');
  });

  it('RA variant of Gaara 120 shares the 2pt cost with R variant', () => {
    expect(EVOLVING_CARDS.get('KS-120-RA')?.pointCost).toBe(2);
    expect(EVOLVING_CARDS.get('KS-120-R')?.pointCost).toBe(2);
  });

  it('isEvolvingHeroCard recognizes list members and rejects others', () => {
    expect(isEvolvingHeroCard('KS-107-R')).toBe(true);
    expect(isEvolvingHeroCard('KS-021-C')).toBe(true);
    expect(isEvolvingHeroCard('KS-001-C')).toBe(false);
    expect(isEvolvingHeroCard('SS-001-C')).toBe(false);
    expect(isEvolvingHeroCard('')).toBe(false);
  });

  it('every list entry has maxCopies=2 (matches base deck-build rule)', () => {
    for (const [, cost] of EVOLVING_CARDS) {
      expect(cost.maxCopies).toBe(2);
    }
  });

  it('costMode is exactly "flat" for Ton Ton + Shikamaru, "per-copy" for everything else', () => {
    const flatIds = new Set(['KS-021-C', 'KS-101-C']);
    for (const [id, cost] of EVOLVING_CARDS) {
      if (flatIds.has(id)) expect(cost.costMode).toBe('flat');
      else expect(cost.costMode).toBe('per-copy');
    }
  });

  it('pointCost is exactly 1 or 2 (no zeros, no other values)', () => {
    for (const [, cost] of EVOLVING_CARDS) {
      expect([1, 2]).toContain(cost.pointCost);
    }
  });
});

describe('Phase 1 — extractSetFromCardId', () => {
  it('extracts set prefix from standard KS character cardId', () => {
    expect(extractSetFromCardId('KS-108-R')).toBe('KS');
    expect(extractSetFromCardId('KS-020-UC')).toBe('KS');
  });

  it('extracts set prefix from RA variant', () => {
    expect(extractSetFromCardId('KS-120-RA')).toBe('KS');
  });

  it('extracts set prefix from secret variant', () => {
    expect(extractSetFromCardId('KS-133-S')).toBe('KS');
    expect(extractSetFromCardId('KS-133-SV')).toBe('KS');
  });

  it('extracts set prefix from mythos / legendary', () => {
    expect(extractSetFromCardId('KS-143-M')).toBe('KS');
    expect(extractSetFromCardId('KS-150-L')).toBe('KS');
  });

  it('extracts set prefix from mission cardId', () => {
    expect(extractSetFromCardId('KS-MSS-01')).toBe('KS');
  });

  it('extracts set prefix from future SS set', () => {
    expect(extractSetFromCardId('SS-001-C')).toBe('SS');
  });

  it('returns empty string for malformed input', () => {
    expect(extractSetFromCardId('')).toBe('');
    expect(extractSetFromCardId('nodash')).toBe('');
    expect(extractSetFromCardId(null as never)).toBe('');
    expect(extractSetFromCardId(undefined as never)).toBe('');
  });
});

describe('Phase 1 — computeDeckEvolvingPoints', () => {
  it('returns 0 for empty deck', () => {
    expect(computeDeckEvolvingPoints([])).toBe(0);
  });

  it('returns 0 for a deck with only non-Evolving KS cards', () => {
    expect(computeDeckEvolvingPoints(['KS-001-C', 'KS-002-C', 'KS-003-C'])).toBe(0);
  });

  it('returns 2 for one copy of a 2pt card', () => {
    expect(computeDeckEvolvingPoints(['KS-107-R'])).toBe(2);
  });

  it('returns 4 for two copies of a 2pt card', () => {
    expect(computeDeckEvolvingPoints(['KS-107-R', 'KS-107-R'])).toBe(4);
  });

  it('returns 1 for one copy of a 1pt per-copy card', () => {
    expect(computeDeckEvolvingPoints(['KS-133-S'])).toBe(1);
  });

  it('returns 2 for two copies of a 1pt per-copy card', () => {
    expect(computeDeckEvolvingPoints(['KS-133-S', 'KS-133-S'])).toBe(2);
  });

  it('returns 1 for one copy of Ton Ton (flat)', () => {
    expect(computeDeckEvolvingPoints(['KS-101-C'])).toBe(1);
  });

  it('returns 1 for TWO copies of Ton Ton (flat, capped)', () => {
    expect(computeDeckEvolvingPoints(['KS-101-C', 'KS-101-C'])).toBe(1);
  });

  it('returns 1 for one copy of Shikamaru 021 (flat)', () => {
    expect(computeDeckEvolvingPoints(['KS-021-C'])).toBe(1);
  });

  it('returns 1 for TWO copies of Shikamaru 021 (flat, capped)', () => {
    expect(computeDeckEvolvingPoints(['KS-021-C', 'KS-021-C'])).toBe(1);
  });

  it('returns 2 for one Ton Ton + one Shikamaru (both flat, sum independently)', () => {
    expect(computeDeckEvolvingPoints(['KS-101-C', 'KS-021-C'])).toBe(2);
  });

  it('returns 2 for 2 Ton Ton + 2 Shikamaru (each flat capped, independent)', () => {
    expect(computeDeckEvolvingPoints(['KS-101-C', 'KS-101-C', 'KS-021-C', 'KS-021-C'])).toBe(2);
  });

  it('Gaara R + Gaara RA count as DIFFERENT entries summing independently', () => {
    expect(computeDeckEvolvingPoints(['KS-120-R', 'KS-120-RA'])).toBe(4);
  });

  it('computes a realistic 5pt deck mix: 2 Gaara + 1 Hinata = 5', () => {
    expect(computeDeckEvolvingPoints(['KS-120-R', 'KS-120-R', 'KS-031-UC'])).toBe(5);
  });

  it('computes max-out 5pt: 5 different 1pt cards', () => {
    expect(computeDeckEvolvingPoints([
      'KS-020-UC', 'KS-026-UC', 'KS-031-UC', 'KS-033-UC', 'KS-053-UC',
    ])).toBe(5);
  });

  it('computes over-budget scenario: 2 Sasuke 107 + 2 Naruto 133 = 6', () => {
    expect(computeDeckEvolvingPoints([
      'KS-107-R', 'KS-107-R', 'KS-133-S', 'KS-133-S',
    ])).toBe(6);
  });

  it('combinatorial: 1 Sakura 135 + 2 Naruto 133 + 1 Ton Ton = 5', () => {
    expect(computeDeckEvolvingPoints([
      'KS-135-S', 'KS-133-S', 'KS-133-S', 'KS-101-C',
    ])).toBe(5);
  });

  it('handles malformed input gracefully (non-string entries skipped)', () => {
    expect(computeDeckEvolvingPoints([
      'KS-133-S', null as never, undefined as never, 42 as never,
    ])).toBe(1);
  });
});

describe('Phase 1 — deckUsesOnlyAllowedSets', () => {
  it('returns true for all-KS card list', () => {
    expect(deckUsesOnlyAllowedSets(['KS-001-C', 'KS-107-R'])).toBe(true);
  });

  it('returns false if any card is from SS', () => {
    expect(deckUsesOnlyAllowedSets(['KS-001-C', 'SS-001-C'])).toBe(false);
  });

  it('returns true with KS missions', () => {
    expect(deckUsesOnlyAllowedSets(['KS-001-C'], ['KS-MSS-01'])).toBe(true);
  });

  it('returns false if a mission is from another set', () => {
    expect(deckUsesOnlyAllowedSets(['KS-001-C'], ['SS-MSS-01'])).toBe(false);
  });

  it('returns true for empty inputs', () => {
    expect(deckUsesOnlyAllowedSets([], [])).toBe(true);
  });
});

describe('Phase 1 — isEvolvingCompatible (full gate)', () => {
  it('returns true for empty deck (0 points, no non-KS cards)', () => {
    expect(isEvolvingCompatible([])).toBe(true);
  });

  it('returns true for valid Evolving 5pt deck', () => {
    expect(isEvolvingCompatible([
      'KS-107-R', 'KS-107-R', 'KS-133-S',
    ])).toBe(true);
  });

  it('returns true for KS-only deck below budget', () => {
    expect(isEvolvingCompatible(['KS-001-C', 'KS-001-C'])).toBe(true);
  });

  it('returns FALSE if total exceeds 5 points', () => {
    expect(isEvolvingCompatible([
      'KS-107-R', 'KS-107-R', 'KS-133-S', 'KS-133-S',
    ])).toBe(false);
  });

  it('returns FALSE if a character card is from a non-allowed set', () => {
    expect(isEvolvingCompatible(['KS-001-C', 'SS-001-C'])).toBe(false);
  });

  it('returns FALSE if a mission is from a non-allowed set', () => {
    expect(isEvolvingCompatible(['KS-001-C'], ['SS-MSS-01'])).toBe(false);
  });

  it('returns FALSE when both gates fail (non-KS + over-budget)', () => {
    expect(isEvolvingCompatible([
      'KS-107-R', 'KS-107-R', 'KS-107-R', 'SS-001-C',
    ])).toBe(false);
  });
});

describe('Phase 1 — checkEvolvingCompatibility (structured reason)', () => {
  it('returns compatible for a valid deck', () => {
    const r = checkEvolvingCompatibility(['KS-001-C', 'KS-107-R']);
    expect(r.kind).toBe('compatible');
  });

  it('returns over-budget with point detail', () => {
    const r = checkEvolvingCompatibility([
      'KS-107-R', 'KS-107-R', 'KS-133-S', 'KS-133-S',
    ]);
    expect(r.kind).toBe('over-budget');
    if (r.kind === 'over-budget') {
      expect(r.points).toBe(6);
      expect(r.max).toBe(5);
    }
  });

  it('returns set-not-allowed with cardId and set detail', () => {
    const r = checkEvolvingCompatibility(['KS-001-C', 'SS-001-C']);
    expect(r.kind).toBe('set-not-allowed');
    if (r.kind === 'set-not-allowed') {
      expect(r.cardId).toBe('SS-001-C');
      expect(r.set).toBe('SS');
    }
  });

  it('reports set issue BEFORE point issue (set is the hard gate)', () => {
    const r = checkEvolvingCompatibility([
      'KS-107-R', 'KS-107-R', 'KS-107-R', 'SS-001-C',
    ]);
    expect(r.kind).toBe('set-not-allowed');
  });

  it('reports set issue from mission even if characters are fine', () => {
    const r = checkEvolvingCompatibility(['KS-001-C'], ['SS-MSS-01']);
    expect(r.kind).toBe('set-not-allowed');
    if (r.kind === 'set-not-allowed') {
      expect(r.cardId).toBe('SS-MSS-01');
    }
  });
});

describe('Phase 1 — getEvolvingBracket', () => {
  it('returns the bracket for integer points 0..5', () => {
    expect(getEvolvingBracket(0)).toBe(0);
    expect(getEvolvingBracket(1)).toBe(1);
    expect(getEvolvingBracket(2)).toBe(2);
    expect(getEvolvingBracket(3)).toBe(3);
    expect(getEvolvingBracket(4)).toBe(4);
    expect(getEvolvingBracket(5)).toBe(5);
  });

  it('rounds up non-integer points to the next bracket', () => {
    expect(getEvolvingBracket(0.5)).toBe(1);
    expect(getEvolvingBracket(2.3)).toBe(3);
  });

  it('returns null for points > MAX', () => {
    expect(getEvolvingBracket(6)).toBeNull();
    expect(getEvolvingBracket(100)).toBeNull();
  });

  it('returns null for negative points', () => {
    expect(getEvolvingBracket(-1)).toBeNull();
    expect(getEvolvingBracket(-0.1)).toBeNull();
  });

  it('returns null for non-finite values', () => {
    expect(getEvolvingBracket(NaN)).toBeNull();
    expect(getEvolvingBracket(Infinity)).toBeNull();
    expect(getEvolvingBracket(-Infinity)).toBeNull();
  });
});

describe('Phase 1 — getEvolvingColorForPoints (palette)', () => {
  it('0pt → silver-white', () => {
    expect(getEvolvingColorForPoints(0)).toBe('#e8e8f0');
  });

  it('1pt → pale cyan', () => {
    expect(getEvolvingColorForPoints(1)).toBe('#5fb8d8');
  });

  it('2pt → lavender', () => {
    expect(getEvolvingColorForPoints(2)).toBe('#9070d0');
  });

  it('3pt → project gold', () => {
    expect(getEvolvingColorForPoints(3)).toBe('#c4a35a');
  });

  it('4pt → tangerine', () => {
    expect(getEvolvingColorForPoints(4)).toBe('#e08040');
  });

  it('5pt → crimson', () => {
    expect(getEvolvingColorForPoints(5)).toBe('#b33e3e');
  });

  it('returns null for over-budget points', () => {
    expect(getEvolvingColorForPoints(6)).toBeNull();
  });

  it('returns null for negative points', () => {
    expect(getEvolvingColorForPoints(-1)).toBeNull();
  });

  it('getEvolvingColorForBracket returns the same palette directly', () => {
    expect(getEvolvingColorForBracket(0)).toBe('#e8e8f0');
    expect(getEvolvingColorForBracket(5)).toBe('#b33e3e');
  });
});
