import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CardData, Rarity } from '@/lib/engine/types';
import { rollVariantBooster } from '@/lib/variants/rollBooster';
import { mulberry32 } from '@/lib/variants/rng';
import { BOOSTER_EXCLUDED_VARIANTS, VARIANT_PACK_PROBABILITIES, VARIANT_PACK_SIZE } from '@/lib/variants/constants';

function mockCard(id: string, rarity: Rarity, set = 'KS'): CardData {
  return {
    id,
    cardId: id,
    set,
    number: parseInt(id.split('-')[1], 10) || 0,
    name_fr: id,
    title_fr: '',
    name_en: id,
    title_en: '',
    rarity,
    card_type: 'character',
    has_visual: true,
    image_file: `${id}.webp`,
    chakra: 1,
    power: 1,
    keywords: [],
    group: '',
    effects: [],
  };
}

const RA_POOL = Array.from({ length: 20 }, (_, i) => mockCard(`KS-${100 + i}-RA`, 'RA'));
const MV_POOL = [
  mockCard('KS-141-MV', 'MV'),
  mockCard('KS-142-MV', 'MV'),
  mockCard('KS-143-MV', 'MV'),
];
const SV_POOL = [
  mockCard('KS-132-SV', 'SV'),
  mockCard('KS-140-SV', 'SV'),
];
const L_POOL = [
  mockCard('KS-117-L', 'L'),
  mockCard('KS-133-L', 'L'),
];
const EXCLUDED = [
  mockCard('KS-108-MV', 'MV'),
  mockCard('KS-120-MV', 'MV'),
  mockCard('KS-128-MV', 'MV'),
  mockCard('KS-137-MV', 'MV'),
  mockCard('KS-133-MV', 'MV'),
  mockCard('KS-133_2-MV', 'MV'),
];
const SS_VARIANTS = [mockCard('SS-001-RA', 'RA', 'SS')];
const HOLO_C_POOL = Array.from({ length: 10 }, (_, i) => mockCard(`KS-${String(i + 1).padStart(3, '0')}-C`, 'C'));
const HOLO_UC_POOL = Array.from({ length: 8 }, (_, i) => mockCard(`KS-${String(56 + i).padStart(3, '0')}-UC`, 'UC'));

vi.mock('@/lib/data/cardLoader', () => ({
  getAllCards: () =>
    [
      ...RA_POOL,
      ...MV_POOL,
      ...SV_POOL,
      ...L_POOL,
      ...EXCLUDED,
      ...SS_VARIANTS,
      ...HOLO_C_POOL,
      ...HOLO_UC_POOL,
      mockCard('KS-130-R', 'R'),
    ],
}));

function slotKind(card: CardData): 'RA' | 'MV' | 'SV' | 'L' | 'HOLO_C' | 'HOLO_UC' {
  if (card.isHolo) return card.rarity === 'C' ? 'HOLO_C' : 'HOLO_UC';
  return card.rarity as 'RA' | 'MV' | 'SV' | 'L';
}

describe('rollVariantBooster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns VARIANT_PACK_SIZE cards per booster', () => {
    const rng = mulberry32(42);
    const pack = rollVariantBooster('KS', { rng });
    expect(pack).toHaveLength(VARIANT_PACK_SIZE);
  });

  it('only rolls variant rarities or holo commons and uncommons', () => {
    const rng = mulberry32(1234);
    for (let i = 0; i < 100; i++) {
      const pack = rollVariantBooster('KS', { rng });
      for (const card of pack) {
        if (card.isHolo) {
          expect(['C', 'UC']).toContain(card.rarity);
          expect(card.cardId.endsWith('_H')).toBe(true);
        } else {
          expect(['RA', 'MV', 'SV', 'L']).toContain(card.rarity);
        }
      }
    }
  });

  it('never rolls excluded MVs', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const pack = rollVariantBooster('KS', { rng });
      for (const card of pack) {
        expect(BOOSTER_EXCLUDED_VARIANTS.has(card.cardId)).toBe(false);
      }
    }
  });

  it('only rolls cards from the requested set', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 200; i++) {
      const pack = rollVariantBooster('KS', { rng });
      for (const card of pack) {
        expect(card.set).toBe('KS');
      }
    }
  });

  it('forceL mode guarantees a Legendary in slot 1', () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 20; i++) {
      const pack = rollVariantBooster('KS', { rng, mode: 'forceL' });
      expect(pack[0]?.rarity).toBe('L');
    }
  });

  it('forceSV mode guarantees a Secret Variant in slot 1', () => {
    const rng = mulberry32(13);
    for (let i = 0; i < 20; i++) {
      const pack = rollVariantBooster('KS', { rng, mode: 'forceSV' });
      expect(pack[0]?.rarity).toBe('SV');
    }
  });

  it('probabilities converge to spec over 1M full rollVariantBooster calls', () => {
    const rng = mulberry32(20240525);
    const counts = { RA: 0, MV: 0, SV: 0, L: 0, HOLO_C: 0, HOLO_UC: 0 };
    const N = 1_000_000;
    let totalSlots = 0;
    for (let i = 0; i < N; i++) {
      const pack = rollVariantBooster('KS', { rng });
      for (const card of pack) {
        counts[slotKind(card)]++;
        totalSlots++;
      }
    }

    const ra = counts.RA / totalSlots;
    const mv = counts.MV / totalSlots;
    const sv = counts.SV / totalSlots;
    const l = counts.L / totalSlots;
    const hc = counts.HOLO_C / totalSlots;
    const huc = counts.HOLO_UC / totalSlots;

    expect(totalSlots).toBeGreaterThan(N * 2);
    expect(Math.abs(ra - VARIANT_PACK_PROBABILITIES.RA)).toBeLessThan(0.005);
    expect(Math.abs(mv - VARIANT_PACK_PROBABILITIES.MV)).toBeLessThan(0.003);
    expect(Math.abs(l - VARIANT_PACK_PROBABILITIES.L)).toBeLessThan(0.002);
    expect(Math.abs(sv - VARIANT_PACK_PROBABILITIES.SV)).toBeLessThan(0.001);
    expect(Math.abs(hc - VARIANT_PACK_PROBABILITIES.HOLO_C)).toBeLessThan(0.005);
    expect(Math.abs(huc - VARIANT_PACK_PROBABILITIES.HOLO_UC)).toBeLessThan(0.005);
  }, 60_000);

  it('over many rolls, every slot kind appears at least once', () => {
    const rng = mulberry32(2024);
    const seen = new Set<string>();
    for (let i = 0; i < 50_000 && seen.size < 6; i++) {
      const pack = rollVariantBooster('KS', { rng });
      for (const c of pack) seen.add(slotKind(c));
    }
    expect(seen.has('RA')).toBe(true);
    expect(seen.has('MV')).toBe(true);
    expect(seen.has('L')).toBe(true);
    expect(seen.has('SV')).toBe(true);
    expect(seen.has('HOLO_C')).toBe(true);
    expect(seen.has('HOLO_UC')).toBe(true);
  }, 30_000);
});
