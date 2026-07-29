import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  hiddenCardFindMany: vi.fn(),
  siteSettingsFindUnique: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    hiddenCard: { findMany: (...a: unknown[]) => dbMocks.hiddenCardFindMany(...a) },
    siteSettings: { findUnique: (...a: unknown[]) => dbMocks.siteSettingsFindUnique(...a) },
  },
}));

import {
  DEFAULT_FEATURED_CARD_IDS,
  FEATURED_MENU_MAX,
  checkFeaturableCardId,
  isFeaturableCardId,
  resolveFeaturedMenuCards,
  sanitizeFeaturedCardIds,
} from '@/lib/cards/featuredMenu';
import { applySetStatusOverrides } from '@/lib/data/sets/registry';
import { ensureServerCards } from '@/lib/data/serverCards';

const NONE = new Set<string>();

const RELEASED_CHARACTER = 'KS-141-M';
const REVEALING_CHARACTER = 'SS-134-R';
const MISSION_CARD = 'KS-001-MMS';

describe('featured menu card filtering', () => {
  beforeEach(() => {
    ensureServerCards();
    applySetStatusOverrides({ SS: 'revealing' });
  });

  afterEach(() => {
    applySetStatusOverrides(null);
  });

  it('accepts a released character card', () => {
    expect(checkFeaturableCardId(RELEASED_CHARACTER, NONE)).toBeNull();
  });

  it('accepts a revealed card from a revealing set', () => {
    expect(checkFeaturableCardId(REVEALING_CHARACTER, NONE)).toBeNull();
  });

  it('rejects a card that an admin has hidden', () => {
    expect(checkFeaturableCardId(REVEALING_CHARACTER, new Set([REVEALING_CHARACTER]))).toBe('not_public');
  });

  it('rejects every card of a set turned back to coming soon', () => {
    applySetStatusOverrides({ SS: 'coming_soon' });
    expect(checkFeaturableCardId(REVEALING_CHARACTER, NONE)).toBe('not_public');
    expect(checkFeaturableCardId(RELEASED_CHARACTER, NONE)).toBeNull();
  });

  it('accepts mission cards, and rejects holo ids and unknown ids', () => {
    expect(checkFeaturableCardId(MISSION_CARD, NONE), 'missions can be featured too').toBe(null);
    expect(checkFeaturableCardId(`${RELEASED_CHARACTER}_H`, NONE)).toBe('holo_id');
    expect(checkFeaturableCardId('KS-999-ZZ', NONE)).toBe('unknown_card');
    expect(checkFeaturableCardId('', NONE)).toBe('unknown_card');
  });

  it('exposes a boolean helper consistent with the detailed check', () => {
    expect(isFeaturableCardId(RELEASED_CHARACTER, NONE)).toBe(true);
    expect(isFeaturableCardId(MISSION_CARD, NONE), 'missions are featurable').toBe(true);
  });
});

describe('resolveFeaturedMenuCards', () => {
  beforeEach(() => {
    ensureServerCards();
    applySetStatusOverrides({ SS: 'revealing' });
  });

  afterEach(() => {
    applySetStatusOverrides(null);
  });

  it('drops a configured card as soon as it is hidden again', () => {
    const configured = [RELEASED_CHARACTER, REVEALING_CHARACTER];
    expect(resolveFeaturedMenuCards(configured, NONE).map((c) => c.id)).toEqual(configured);
    expect(
      resolveFeaturedMenuCards(configured, new Set([REVEALING_CHARACTER])).map((c) => c.id),
    ).toEqual([RELEASED_CHARACTER]);
  });

  it('returns nothing for a malformed stored value', () => {
    for (const bad of [null, undefined, 'KS-141-M', 42, { ids: [] }]) {
      expect(resolveFeaturedMenuCards(bad as unknown, NONE)).toEqual([]);
    }
    expect(resolveFeaturedMenuCards([1, true, null], NONE)).toEqual([]);
  });

  it('resolves the shipped defaults so the menu is never empty', () => {
    const cards = resolveFeaturedMenuCards(DEFAULT_FEATURED_CARD_IDS, NONE);
    expect(cards).toHaveLength(DEFAULT_FEATURED_CARD_IDS.length);
    for (const card of cards) expect(card.src.length).toBeGreaterThan(0);
  });

  it('serves a released card from the public path and a revealing card from the gated route', () => {
    const [released] = resolveFeaturedMenuCards([RELEASED_CHARACTER], NONE);
    const [revealing] = resolveFeaturedMenuCards([REVEALING_CHARACTER], NONE);
    expect(released.src.startsWith('/images/cards/')).toBe(true);
    expect(revealing.src).toBe(`/api/card-image/${REVEALING_CHARACTER}`);
  });

  it('deduplicates, preserves order and caps at the maximum', () => {
    const many = [RELEASED_CHARACTER, RELEASED_CHARACTER, 'KS-143-M', 'KS-148-M', 'KS-142-M', 'KS-144-M', 'KS-145-M', 'KS-146-M', 'KS-147-M'];
    const ids = resolveFeaturedMenuCards(many, NONE).map((c) => c.id);
    expect(ids.length).toBeLessThanOrEqual(FEATURED_MENU_MAX);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe(RELEASED_CHARACTER);
  });

  it('maps rarity to the holo style used by the menu card', () => {
    const [mythos] = resolveFeaturedMenuCards([RELEASED_CHARACTER], NONE);
    expect(mythos.rarity).toBe('mythos');
  });
});

describe('sanitizeFeaturedCardIds', () => {
  it('accepts a well formed list and removes duplicates', () => {
    expect(sanitizeFeaturedCardIds(['KS-141-M', ' KS-143-M ', 'KS-141-M'])).toEqual(['KS-141-M', 'KS-143-M']);
  });

  it('rejects a list longer than the maximum', () => {
    expect(sanitizeFeaturedCardIds(new Array(FEATURED_MENU_MAX + 1).fill('KS-141-M'))).toBeNull();
  });

  it('rejects non-array and non-string payloads', () => {
    expect(sanitizeFeaturedCardIds('KS-141-M')).toBeNull();
    expect(sanitizeFeaturedCardIds([1])).toBeNull();
    expect(sanitizeFeaturedCardIds([null])).toBeNull();
    expect(sanitizeFeaturedCardIds(['  '])).toBeNull();
  });
});

describe('the fallback default menu cards can never leak an unrevealed card', () => {
  it('keeps every default from a released set even when it is listed as hidden', () => {
    const ids = resolveFeaturedMenuCards(DEFAULT_FEATURED_CARD_IDS, new Set(DEFAULT_FEATURED_CARD_IDS)).map((c) => c.id);
    expect(ids).toEqual(DEFAULT_FEATURED_CARD_IDS);
  });

  it('proves the defaults are all public, which is what makes the fallback safe', () => {
    for (const id of DEFAULT_FEATURED_CARD_IDS) {
      expect(isFeaturableCardId(id, new Set([id]))).toBe(true);
    }
  });

  it('would drop a default taken from a set that is still revealing', () => {
    applySetStatusOverrides({ SS: 'revealing' });
    const ids = resolveFeaturedMenuCards([REVEALING_CHARACTER], new Set([REVEALING_CHARACTER])).map((c) => c.id);
    expect(ids).toEqual([]);
    applySetStatusOverrides(null);
  });
});
