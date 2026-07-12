import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CardData, Rarity } from '@/lib/engine/types';
import {
  HOLO_ID_SUFFIX,
  isHoloId,
  holoBaseId,
  holoIdFor,
  isHoloEligibleCard,
  holoDuplicateXp,
  decorateHoloCard,
} from '@/lib/holo/holoId';

function mockCard(id: string, rarity: Rarity, opts: Partial<CardData> = {}): CardData {
  return {
    id, cardId: id, set: 'KS', number: 0,
    name_fr: id, title_fr: '',
    rarity, card_type: 'character', has_visual: true,
    image_file: `${id}.webp`,
    chakra: 1, power: 1, keywords: [], group: '', effects: [],
    ...opts,
  };
}

const CARDS_BY_ID: Record<string, CardData> = {
  'KS-001-C': mockCard('KS-001-C', 'C'),
  'KS-056-UC': mockCard('KS-056-UC', 'UC'),
  'KS-104-R': mockCard('KS-104-R', 'R'),
  'KS-104-RA': mockCard('KS-104-RA', 'RA'),
};

vi.mock('@/lib/data/cardIndex', () => ({
  getCardById: (id: string) => CARDS_BY_ID[id] ?? null,
}));

const fakeFindUnique = vi.fn();
const fakeInvFindMany = vi.fn();
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => fakeFindUnique(...args) },
    variantInventory: { findMany: (...args: unknown[]) => fakeInvFindMany(...args) },
  },
}));

import { validateDeckVariantUnlocks } from '@/lib/variants/serverValidation';

describe('holo id helpers', () => {
  it('builds and parses holo ids', () => {
    expect(holoIdFor('KS-001-C')).toBe('KS-001-C_H');
    expect(holoIdFor('KS-001-C_H')).toBe('KS-001-C_H');
    expect(isHoloId('KS-001-C_H')).toBe(true);
    expect(isHoloId('KS-001-C')).toBe(false);
    expect(isHoloId(null)).toBe(false);
    expect(holoBaseId('KS-001-C_H')).toBe('KS-001-C');
    expect(holoBaseId('KS-001-C')).toBe('KS-001-C');
    expect(HOLO_ID_SUFFIX).toBe('_H');
  });

  it('holo ids pass the deck save id regex', () => {
    const ID_RE = /^[A-Z0-9_-]{1,30}$/;
    expect(ID_RE.test('KS-001-C_H')).toBe(true);
    expect(ID_RE.test('KS-056-UC_H')).toBe(true);
  });

  it('only commons and uncommons with an image are holo eligible', () => {
    expect(isHoloEligibleCard(mockCard('KS-001-C', 'C'))).toBe(true);
    expect(isHoloEligibleCard(mockCard('KS-056-UC', 'UC'))).toBe(true);
    expect(isHoloEligibleCard(mockCard('KS-104-R', 'R'))).toBe(false);
    expect(isHoloEligibleCard(mockCard('KS-117-L', 'L'))).toBe(false);
    expect(isHoloEligibleCard(mockCard('KS-001-C', 'C', { image_file: undefined }))).toBe(false);
    expect(isHoloEligibleCard(mockCard('MSS-01', 'MMS', { card_type: 'mission' }))).toBe(false);
    expect(isHoloEligibleCard(null)).toBe(false);
  });

  it('duplicate XP is 3 for holo commons and 5 for holo uncommons', () => {
    expect(holoDuplicateXp('C')).toBe(3);
    expect(holoDuplicateXp('UC')).toBe(5);
    expect(holoDuplicateXp('R')).toBe(0);
  });

  it('decorateHoloCard sets the holo id and flag without touching gameplay data', () => {
    const base = mockCard('KS-001-C', 'C');
    const holo = decorateHoloCard(base);
    expect(holo.id).toBe('KS-001-C_H');
    expect(holo.cardId).toBe('KS-001-C_H');
    expect(holo.isHolo).toBe(true);
    expect(holo.rarity).toBe('C');
    expect(holo.power).toBe(base.power);
    expect(holo.chakra).toBe(base.chakra);
    expect(base.isHolo).toBeUndefined();
  });
});

describe('validateDeckVariantUnlocks with holo ids', () => {
  beforeEach(() => {
    fakeFindUnique.mockReset();
    fakeInvFindMany.mockReset();
    fakeInvFindMany.mockResolvedValue([]);
  });

  it('accepts a deck whose holo ids are all owned', async () => {
    fakeFindUnique.mockResolvedValue({ username: 'alice', email: 'a@b.com' });
    fakeInvFindMany.mockResolvedValue([{ cardId: 'KS-001-C_H' }]);
    const r = await validateDeckVariantUnlocks('user-1', ['KS-001-C_H', 'KS-104-R']);
    expect(r.ok).toBe(true);
    expect(r.lockedCardIds).toEqual([]);
  });

  it('rejects unowned holo ids', async () => {
    fakeFindUnique.mockResolvedValue({ username: 'alice', email: 'a@b.com' });
    fakeInvFindMany.mockResolvedValue([]);
    const r = await validateDeckVariantUnlocks('user-1', ['KS-001-C_H']);
    expect(r.ok).toBe(false);
    expect(r.lockedCardIds).toEqual(['KS-001-C_H']);
  });

  it('rejects holo ids whose base card is not holo eligible', async () => {
    fakeFindUnique.mockResolvedValue({ username: 'alice', email: 'a@b.com' });
    fakeInvFindMany.mockResolvedValue([{ cardId: 'KS-104-R_H' }]);
    const r = await validateDeckVariantUnlocks('user-1', ['KS-104-R_H']);
    expect(r.ok).toBe(false);
    expect(r.lockedCardIds).toEqual(['KS-104-R_H']);
  });

  it('admins can use any valid holo without owning it', async () => {
    fakeFindUnique.mockResolvedValue({ username: 'Kutxyt', email: null });
    const r = await validateDeckVariantUnlocks('admin-1', ['KS-001-C_H', 'KS-056-UC_H', 'KS-104-RA']);
    expect(r.ok).toBe(true);
    expect(r.lockedCardIds).toEqual([]);
  });

  it('admins still cannot use holo ids of non eligible cards', async () => {
    fakeFindUnique.mockResolvedValue({ username: 'Kutxyt', email: null });
    const r = await validateDeckVariantUnlocks('admin-1', ['KS-104-R_H']);
    expect(r.ok).toBe(false);
    expect(r.lockedCardIds).toEqual(['KS-104-R_H']);
  });
});
