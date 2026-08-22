import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    tournament: { findUnique: vi.fn() },
    tournamentParticipant: { findUnique: vi.fn(), update: vi.fn() },
    deck: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    variantInventory: { upsert: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock('@/lib/auth/authOptions', () => ({ auth: vi.fn() }));

vi.mock('@/lib/socket/server', () => ({ getSocketIO: vi.fn(() => null) }));

import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/authOptions';
import {
  generateBooster,
  generateSealedPool,
  separateSealedPool,
  type BoosterCard,
} from '@/lib/sealed/boosterGenerator';
import {
  getAvailableSetIds,
  getSetStatus,
  applySetStatusOverrides,
  ALL_SET_IDS,
  SET_REGISTRY,
} from '@/lib/data/sets/registry';
import {
  isVariantRarity,
  VARIANT_RARITIES,
  BOOSTER_EXCLUDED_VARIANTS,
  VARIANT_PACK_SIZE,
} from '@/lib/variants/constants';
import { isLockedVariantCard } from '@/lib/variants/isVariant';
import { getCardById } from '@/lib/data/cardIndex';
import { getPlayableCharacters, getPlayableMissions } from '@/lib/data/cardLoader';
import {
  computeDeckEvolvingPoints,
  isEvolvingCompatible,
  checkEvolvingCompatibility,
  deckUsesOnlyAllowedSets,
} from '@/lib/evolving/computePoints';
import { EVOLVING_CARDS } from '@/lib/evolving/cardCosts';
import { EVOLVING_MAX_POINTS } from '@/lib/evolving/constants';
import { POST as PostSealedDeck } from '../../app/api/tournaments/[id]/sealed-deck/route';

const REPO_ROOT = process.cwd();

function readSource(relative: string): string {
  return readFileSync(path.resolve(REPO_ROOT, relative), 'utf8');
}

function collectFiles(relativeDir: string): string[] {
  const abs = path.resolve(REPO_ROOT, relativeDir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
  };
  walk(abs);
  return out;
}

const BASE_RARITIES = ['C', 'UC', 'R', 'S', 'M', 'MMS'];

describe('sealed booster — exact 10 card composition with no bonus variant slot', () => {
  it('a single booster is exactly 10 cards', () => {
    expect(generateBooster(0, 'KS').cards.length).toBe(10);
  });

  it('300 boosters are all exactly 10 cards, never 11', () => {
    const sizes = new Set<number>();
    for (let i = 0; i < 300; i++) sizes.add(generateBooster(i, 'KS').cards.length);
    expect([...sizes]).toEqual([10]);
  });

  it('slots 1 to 4 are always four DISTINCT commons', () => {
    for (let i = 0; i < 200; i++) {
      const cards = generateBooster(i, 'KS').cards;
      const commons = cards.slice(0, 4);
      expect(commons.every((c) => c.rarity === 'C')).toBe(true);
      expect(commons.every((c) => c.card_type === 'character')).toBe(true);
      expect(new Set(commons.map((c) => c.id)).size).toBe(4);
    }
  });

  it('slots 5 to 7 are always three DISTINCT uncommons', () => {
    for (let i = 0; i < 200; i++) {
      const cards = generateBooster(i, 'KS').cards;
      const uncommons = cards.slice(4, 7);
      expect(uncommons.every((c) => c.rarity === 'UC')).toBe(true);
      expect(new Set(uncommons.map((c) => c.id)).size).toBe(3);
    }
  });

  it('slot 8 is always a plain rare', () => {
    for (let i = 0; i < 200; i++) {
      const cards = generateBooster(i, 'KS').cards;
      expect(cards[7].rarity).toBe('R');
      expect(cards[7].isHolo).toBe(false);
    }
  });

  it('slot 9 is the chase slot and only ever C, UC, S, L or SV', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const cards = generateBooster(i, 'KS').cards;
      expect(cards[8].isHolo).toBe(false);
      seen.add(cards[8].rarity);
    }
    for (const r of seen) expect(['C', 'UC', 'S', 'L', 'SV'], 'the notice lists no rare art in a Konoha Shido pack').toContain(r);
  });

  it('no sealed card carries isHolo: the holo skins belong to the reward boosters', () => {
    for (let i = 0; i < 200; i++) {
      const holos = generateBooster(i, 'KS').cards.filter((c) => c.isHolo);
      expect(holos.length).toBe(0);
    }
  });

  it('slot 10 is always the single mission card', () => {
    for (let i = 0; i < 200; i++) {
      const cards = generateBooster(i, 'KS').cards;
      expect(cards[9].card_type).toBe('mission');
      expect(cards.filter((c) => c.card_type === 'mission').length).toBe(1);
      expect(cards[9].isHolo).toBe(false);
    }
  });

  it('a booster never contains an MV, the Mythos variants are not a booster slot', () => {
    for (let i = 0; i < 400; i++) {
      for (const c of generateBooster(i, 'KS').cards) {
        expect(c.rarity === 'MV').toBe(false);
      }
    }
  });

  it('at most ONE variant-rarity card per booster and only ever in the holo slot', () => {
    for (let i = 0; i < 500; i++) {
      const cards = generateBooster(i, 'KS').cards;
      const variantIdx = cards.map((c, idx) => (isVariantRarity(c.rarity) ? idx : -1)).filter((x) => x >= 0);
      expect(variantIdx.length).toBeLessThanOrEqual(1);
      for (const idx of variantIdx) expect(idx).toBe(8);
    }
  });

  it('the sealed booster size is not the variant-booster size', () => {
    expect(generateBooster(0, 'KS').cards.length).not.toBe(VARIANT_PACK_SIZE);
  });

  it('boosterIndex and resolved setId are carried on the pack', () => {
    const b = generateBooster(7, 'KS');
    expect(b.boosterIndex).toBe(7);
    expect(b.setId).toBe('KS');
  });

  it('the generator source never reaches for the variant-booster roller or the inventory', () => {
    const src = readSource('lib/sealed/boosterGenerator.ts');
    for (const banned of [
      'rollVariantBooster',
      'rollBooster',
      'incrementVariant',
      'variantInventory',
      'VariantInventory',
      'unlockedVariantCardIds',
      'prisma',
      'VARIANT_PACK_PROBABILITIES',
      'VARIANT_PACK_SIZE',
    ]) {
      expect(src.includes(banned)).toBe(false);
    }
  });
});

describe('sealed pool — size math and instance identity', () => {
  it('a 5 booster pool is exactly 50 cards', () => {
    const pool = generateSealedPool(5, 'KS');
    expect(pool.boosters.length).toBe(5);
    expect(pool.allCards.length).toBe(50);
  });

  it('pool size is 10 times the booster count for 1 to 6 boosters', () => {
    for (let n = 1; n <= 6; n++) {
      expect(generateSealedPool(n, 'KS').allCards.length).toBe(n * 10);
    }
  });

  it('the default booster count is 6, so 60 cards', () => {
    expect(generateSealedPool().allCards.length).toBe(60);
  });

  it('a pool splits into 9 characters and 1 mission per booster', () => {
    const pool = generateSealedPool(5, 'KS');
    const sep = separateSealedPool(pool);
    expect(sep.missions.length).toBe(5);
    expect(sep.characters.length).toBe(45);
  });

  it('booster indexes are a dense 0..n-1 sequence', () => {
    const pool = generateSealedPool(6, 'KS');
    expect(pool.boosters.map((b) => b.boosterIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('every sealedInstanceId is unique inside a pool', () => {
    for (let i = 0; i < 20; i++) {
      const pool = generateSealedPool(6, 'KS');
      expect(new Set(pool.allCards.map((c) => c.sealedInstanceId)).size).toBe(pool.allCards.length);
    }
  });

  it('the same card id can legitimately repeat across boosters of one pool', () => {
    let sawRepeat = false;
    for (let i = 0; i < 40 && !sawRepeat; i++) {
      const pool = generateSealedPool(6, 'KS');
      sawRepeat = new Set(pool.allCards.map((c) => c.id)).size < pool.allCards.length;
    }
    expect(sawRepeat).toBe(true);
  });
});

describe('sealed pool — variants are ephemeral and never unlock anything', () => {
  it('isTemporaryVariant is exactly isVariantRarity for every card of a large pool', () => {
    const pool = generateSealedPool(60, 'KS');
    for (const c of pool.allCards) {
      expect(c.isTemporaryVariant).toBe(isVariantRarity(c.rarity));
    }
  });

  it('no base rarity card is ever flagged temporary', () => {
    const pool = generateSealedPool(60, 'KS');
    for (const c of pool.allCards) {
      if (BASE_RARITIES.includes(c.rarity)) expect(c.isTemporaryVariant).toBe(false);
    }
  });

  it('every flagged card is a locked variant rarity and is never marked holo', () => {
    const pool = generateSealedPool(80, 'KS');
    const flagged = pool.allCards.filter((c) => c.isTemporaryVariant);
    expect(
      pool.allCards.some((c) => c.rarity === 'RA'),
      'the printed notice shows no rare art in a Konoha Shido pack',
    ).toBe(false);
    for (const c of flagged) {
      expect(VARIANT_RARITIES as readonly string[]).toContain(c.rarity);
      expect(isLockedVariantCard(getCardById(c.id))).toBe(true);
      expect(c.isHolo).toBe(false);
    }
  });

  it('pool.temporaryVariants is the exact multiset of flagged card ids', () => {
    const pool = generateSealedPool(40, 'KS');
    const flagged = pool.allCards.filter((c) => c.isTemporaryVariant).map((c) => c.id).sort();
    expect([...pool.temporaryVariants].sort()).toEqual(flagged);
  });

  it('reserved booster-excluded variants never surface in a sealed pool', () => {
    const pool = generateSealedPool(80, 'KS');
    for (const id of pool.temporaryVariants) {
      expect(BOOSTER_EXCLUDED_VARIANTS.has(id)).toBe(false);
    }
  });

  it('a temporary variant is a real card of the pool set, usable for the sealed deck', () => {
    const pool = generateSealedPool(80, 'KS');
    for (const id of pool.temporaryVariants) {
      const card = getCardById(id);
      expect(card).toBeTruthy();
      expect(card?.set).toBe('KS');
      expect(card?.card_type).toBe('character');
    }
  });

  it('no sealed code path writes to the variant inventory', () => {
    const files = [
      'lib/sealed/boosterGenerator.ts',
      'app/api/tournaments/[id]/sealed-pool/route.ts',
      'app/api/tournaments/[id]/sealed-deck/route.ts',
      ...collectFiles('components/sealed'),
      ...collectFiles('app/[locale]/play/sealed'),
    ];
    for (const f of files) {
      const src = f.startsWith('lib') || f.startsWith('app') ? readSource(f) : readFileSync(f, 'utf8');
      expect(src.includes('incrementVariant')).toBe(false);
      expect(src.includes('variantInventory')).toBe(false);
      expect(src.includes('unlockedVariantCardIds')).toBe(false);
    }
  });
});

describe('sealed set choice — random resolves against AVAILABLE sets only', () => {
  afterEach(() => {
    applySetStatusOverrides(null);
  });

  it('KS and SS are available, AK is coming soon', () => {
    expect(getSetStatus('KS')).toBe('available');
    expect(getSetStatus('SS')).toBe('available');
    expect(getSetStatus('AK')).toBe('coming_soon');
  });

  it('getAvailableSetIds excludes revealing and coming-soon sets', () => {
    const available = getAvailableSetIds();
    expect(available).toContain('KS');
    expect(available).toContain('SS');
    expect(available).not.toContain('AK');
    expect(available.every((id) => ALL_SET_IDS.includes(id))).toBe(true);
  });

  it('a random pool only ever draws from available sets', () => {
    for (let i = 0; i < 200; i++) {
      const pool = generateSealedPool(1, 'random');
      expect(getAvailableSetIds()).toContain(pool.boosters[0].setId);
    }
  });

  it('an explicitly requested revealing set is refused', () => {
    applySetStatusOverrides({ SS: 'revealing' });
    expect(() => generateSealedPool(1, 'SS')).toThrow(/not available for sealed play/);
    applySetStatusOverrides({});
  });

  it('an explicitly requested coming-soon set is refused', () => {
    expect(() => generateSealedPool(1, 'AK')).toThrow(/not available for sealed play/);
  });

  it('an unknown set id is refused', () => {
    expect(() => generateSealedPool(1, 'ZZ')).toThrow(/not available for sealed play/);
  });

  it('an admin status override makes a set selectable, but the card-count guard still protects the pool', () => {
    const previousSealedReady = SET_REGISTRY.AK.sealedReady;
    SET_REGISTRY.AK.sealedReady = true;
    applySetStatusOverrides({ AK: 'available' });
    try {
      expect(getAvailableSetIds()).toContain('AK');
      expect(() => generateSealedPool(1, 'AK')).toThrow(/does not have enough cards/);
    } finally {
      SET_REGISTRY.AK.sealedReady = previousSealedReady;
      applySetStatusOverrides({});
    }
  });

  it('a set that is available but not sealed ready is still refused', () => {
    applySetStatusOverrides({ AK: 'available' });
    expect(getAvailableSetIds()).toContain('AK');
    expect(() => generateSealedPool(1, 'AK')).toThrow(/not available for sealed play/);
  });

  it('generateSealedPool honours a status override that pulls a set out of rotation', () => {
    applySetStatusOverrides({ KS: 'coming_soon', SS: 'available' });
    expect(getAvailableSetIds()).not.toContain('KS');
    expect(() => generateSealedPool(1, 'KS')).toThrow(/not available for sealed play|No sealed-ready sets are available/);
  });

  it('a pool with no available set at all is refused outright', () => {
    applySetStatusOverrides({ KS: 'coming_soon', SS: 'coming_soon' });
    expect(getAvailableSetIds().length).toBe(0);
    expect(() => generateSealedPool(1, 'random')).toThrow(/No sealed-ready sets are available/);
  });

  it.fails('generateBooster should refuse a set that is not available for sealed play (DEFECT)', () => {
    applySetStatusOverrides({ KS: 'coming_soon', SS: 'available' });
    expect(() => generateBooster(0, 'KS')).toThrow();
  });

  it('clearing the overrides restores the shipped statuses', () => {
    applySetStatusOverrides({ SS: 'revealing' });
    applySetStatusOverrides(null);
    expect(getSetStatus('SS')).toBe('available');
    expect(getAvailableSetIds()).toContain('SS');
  });
});

describe('sealed deck — pool-bound, never saved as a personal deck', () => {
  const p = prisma as unknown as {
    tournament: { findUnique: ReturnType<typeof vi.fn> };
    tournamentParticipant: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    deck: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  };
  const authMock = auth as unknown as ReturnType<typeof vi.fn>;

  const charIds = getPlayableCharacters()
    .filter((c) => c.set === 'KS' && c.rarity === 'C')
    .slice(0, 30)
    .map((c) => c.id);
  const missionIds = getPlayableMissions()
    .filter((m) => m.set === 'KS')
    .slice(0, 3)
    .map((m) => m.id);

  function poolOf(ids: string[]): { allCards: Array<{ id: string }> } {
    return { allCards: ids.map((id) => ({ id })) };
  }

  function req(body: unknown): Request {
    return new Request('http://localhost/api/tournaments/t1/sealed-deck', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  const ctx = { params: Promise.resolve({ id: 't1' }) };

  beforeEach(() => {
    authMock.mockReset();
    p.tournament.findUnique.mockReset();
    p.tournamentParticipant.findUnique.mockReset();
    p.tournamentParticipant.update.mockReset();
    p.deck.create.mockReset();
    p.deck.update.mockReset();
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    p.tournament.findUnique.mockResolvedValue({ gameMode: 'sealed', status: 'registration' });
    p.tournamentParticipant.update.mockResolvedValue({});
  });

  it('the fixture deck is 30 real characters and 3 real missions', () => {
    expect(charIds.length).toBe(30);
    expect(missionIds.length).toBe(3);
  });

  it('accepts a deck fully covered by the sealed pool', async () => {
    p.tournamentParticipant.findUnique.mockResolvedValue({ id: 'part1', sealedPool: poolOf([...charIds, ...missionIds]) });
    const res = await PostSealedDeck(req({ cardIds: charIds, missionIds }) as never, ctx as never);
    expect(res.status).toBe(200);
  });

  it('stores the sealed deck on the tournament participant, never on the Deck model', async () => {
    p.tournamentParticipant.findUnique.mockResolvedValue({ id: 'part1', sealedPool: poolOf([...charIds, ...missionIds]) });
    await PostSealedDeck(req({ cardIds: charIds, missionIds }) as never, ctx as never);
    expect(p.tournamentParticipant.update).toHaveBeenCalledTimes(1);
    const call = p.tournamentParticipant.update.mock.calls[0][0];
    expect(call.data.sealedDeck.cardIds).toEqual(charIds);
    expect(call.data.sealedDeck.missionIds).toEqual(missionIds);
    expect(p.deck.create).not.toHaveBeenCalled();
    expect(p.deck.update).not.toHaveBeenCalled();
  });

  it('rejects a card that is not in the sealed pool', async () => {
    const shortPool = charIds.slice(0, 29);
    p.tournamentParticipant.findUnique.mockResolvedValue({ id: 'part1', sealedPool: poolOf(shortPool) });
    const res = await PostSealedDeck(req({ cardIds: charIds, missionIds }) as never, ctx as never);
    expect(res.status).toBe(400);
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('enforces pool MULTIPLICITY, not mere membership', async () => {
    const deckWithDuplicate = [...charIds.slice(0, 29), charIds[0]];
    p.tournamentParticipant.findUnique.mockResolvedValue({ id: 'part1', sealedPool: poolOf(charIds) });
    const res = await PostSealedDeck(req({ cardIds: deckWithDuplicate, missionIds }) as never, ctx as never);
    expect(res.status).toBe(400);
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('accepts a duplicate when the pool really holds two copies', async () => {
    const deckWithDuplicate = [...charIds.slice(0, 29), charIds[0]];
    p.tournamentParticipant.findUnique.mockResolvedValue({
      id: 'part1',
      sealedPool: poolOf([...charIds, charIds[0], ...missionIds]),
    });
    const res = await PostSealedDeck(req({ cardIds: deckWithDuplicate, missionIds }) as never, ctx as never);
    expect(res.status).toBe(200);
  });

  it('rejects a deck under the 30 character minimum', async () => {
    p.tournamentParticipant.findUnique.mockResolvedValue({ id: 'part1', sealedPool: poolOf(charIds) });
    const res = await PostSealedDeck(req({ cardIds: charIds.slice(0, 29), missionIds }) as never, ctx as never);
    expect(res.status).toBe(400);
  });

  it('rejects a deck that does not carry exactly 3 missions', async () => {
    p.tournamentParticipant.findUnique.mockResolvedValue({ id: 'part1', sealedPool: poolOf(charIds) });
    const two = await PostSealedDeck(req({ cardIds: charIds, missionIds: missionIds.slice(0, 2) }) as never, ctx as never);
    expect(two.status).toBe(400);
    const four = await PostSealedDeck(
      req({ cardIds: charIds, missionIds: [...missionIds, missionIds[0]] }) as never,
      ctx as never,
    );
    expect(four.status).toBe(400);
  });

  it('rejects when the participant has no sealed pool on file', async () => {
    p.tournamentParticipant.findUnique.mockResolvedValue({ id: 'part1', sealedPool: null });
    const res = await PostSealedDeck(req({ cardIds: charIds, missionIds }) as never, ctx as never);
    expect(res.status).toBe(400);
  });

  it('rejects on a non-sealed tournament', async () => {
    p.tournament.findUnique.mockResolvedValue({ gameMode: 'casual', status: 'registration' });
    p.tournamentParticipant.findUnique.mockResolvedValue({ id: 'part1', sealedPool: poolOf(charIds) });
    const res = await PostSealedDeck(req({ cardIds: charIds, missionIds }) as never, ctx as never);
    expect(res.status).toBe(400);
  });

  it('rejects once registration is closed', async () => {
    p.tournament.findUnique.mockResolvedValue({ gameMode: 'sealed', status: 'running' });
    p.tournamentParticipant.findUnique.mockResolvedValue({ id: 'part1', sealedPool: poolOf(charIds) });
    const res = await PostSealedDeck(req({ cardIds: charIds, missionIds }) as never, ctx as never);
    expect(res.status).toBe(400);
  });

  it('rejects an unauthenticated submission', async () => {
    authMock.mockResolvedValue(null);
    const res = await PostSealedDeck(req({ cardIds: charIds, missionIds }) as never, ctx as never);
    expect(res.status).toBe(401);
  });

  it('no sealed UI posts a sealed deck to the personal deck API', () => {
    const files = [...collectFiles('components/sealed'), ...collectFiles('app/[locale]/play/sealed')];
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src.includes('/api/decks')).toBe(false);
    }
  });

  it('the sealed deck route never touches the Deck model in source', () => {
    const src = readSource('app/api/tournaments/[id]/sealed-deck/route.ts');
    expect(src.includes('prisma.deck')).toBe(false);
    expect(src.includes('tournamentParticipant.update')).toBe(true);
  });
});

describe('draft mode — not part of the shipped codebase', () => {
  it('has no draft library, component folder or route', () => {
    expect(existsSync(path.resolve(REPO_ROOT, 'lib/draft'))).toBe(false);
    expect(existsSync(path.resolve(REPO_ROOT, 'components/draft'))).toBe(false);
    expect(existsSync(path.resolve(REPO_ROOT, 'app/[locale]/draft'))).toBe(false);
    expect(existsSync(path.resolve(REPO_ROOT, 'app/[locale]/play/draft'))).toBe(false);
  });
});

describe('evolving points — determinism and shape', () => {
  it('is stable across repeated calls', () => {
    const deck = ['KS-107-R', 'KS-107-R', 'KS-133-S', 'KS-021-C'];
    const first = computeDeckEvolvingPoints(deck);
    for (let i = 0; i < 50; i++) expect(computeDeckEvolvingPoints(deck)).toBe(first);
    expect(first).toBe(6);
  });

  it('is independent of card order', () => {
    const a = ['KS-107-R', 'KS-021-C', 'KS-133-S', 'KS-021-C', 'KS-107-R'];
    const b = ['KS-021-C', 'KS-107-R', 'KS-133-S', 'KS-107-R', 'KS-021-C'];
    expect(computeDeckEvolvingPoints(a)).toBe(computeDeckEvolvingPoints(b));
  });

  it('never returns a negative or fractional total', () => {
    const decks = [
      [],
      ['KS-001-C'],
      ['KS-107-R', 'KS-120-R', 'KS-135-S'],
      ['KS-021-C', 'KS-021-C', 'KS-101-C'],
    ];
    for (const d of decks) {
      const v = computeDeckEvolvingPoints(d);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('ignores cards that are not evolving heroes', () => {
    expect(computeDeckEvolvingPoints(['KS-001-C', 'KS-002-C', 'KS-MSS-01'])).toBe(0);
  });

  it('ignores unknown ids instead of throwing', () => {
    expect(computeDeckEvolvingPoints(['NOPE', 'KS-999-R', 'KS-107-R'])).toBe(2);
  });
});

describe('evolving points — holo skins resolve to their base card', () => {
  it('a holo id costs the same as the base id', () => {
    expect(computeDeckEvolvingPoints(['KS-107-R_H'])).toBe(2);
  });

  it('base plus holo of the same card counts as two copies', () => {
    expect(computeDeckEvolvingPoints(['KS-107-R', 'KS-107-R_H'])).toBe(4);
  });

  it('a flat-cost card is paid once even when one copy is holo', () => {
    expect(computeDeckEvolvingPoints(['KS-021-C', 'KS-021-C_H'])).toBe(1);
  });

  it('holo ids of non-hero cards still cost nothing', () => {
    expect(computeDeckEvolvingPoints(['KS-001-C_H', 'KS-002-C_H'])).toBe(0);
  });

  it('a holo id is still recognised as a KS card by the set gate', () => {
    expect(deckUsesOnlyAllowedSets(['KS-001-C_H'])).toBe(true);
    expect(deckUsesOnlyAllowedSets(['SS-001-C_H'])).toBe(false);
  });
});

describe('evolving points — flat versus per-copy cost modes', () => {
  it('a flat card costs 1 no matter how many copies', () => {
    expect(computeDeckEvolvingPoints(['KS-101-C'])).toBe(1);
    expect(computeDeckEvolvingPoints(['KS-101-C', 'KS-101-C'])).toBe(1);
    expect(computeDeckEvolvingPoints(['KS-101-C', 'KS-101-C', 'KS-101-C'])).toBe(1);
  });

  it('the two flat cards are billed independently', () => {
    expect(computeDeckEvolvingPoints(['KS-021-C', 'KS-021-C', 'KS-101-C', 'KS-101-C'])).toBe(2);
  });

  it('a per-copy card scales linearly', () => {
    expect(computeDeckEvolvingPoints(['KS-031-UC'])).toBe(1);
    expect(computeDeckEvolvingPoints(['KS-031-UC', 'KS-031-UC'])).toBe(2);
    expect(computeDeckEvolvingPoints(['KS-120-R', 'KS-120-R'])).toBe(4);
  });

  it('every registered art variant of a hero shares that hero cost', () => {
    expect(computeDeckEvolvingPoints(['KS-107-R'])).toBe(2);
    expect(computeDeckEvolvingPoints(['KS-107-RA'])).toBe(2);
    expect(computeDeckEvolvingPoints(['KS-107-MV'])).toBe(2);
    expect(computeDeckEvolvingPoints(['KS-107-R', 'KS-107-RA', 'KS-107-MV'])).toBe(6);
  });

  it('the legendary and secret-variant printings of a hero are registered too', () => {
    expect(EVOLVING_CARDS.get('KS-133-L')?.pointCost).toBe(1);
    expect(EVOLVING_CARDS.get('KS-136-L')?.pointCost).toBe(1);
    expect(computeDeckEvolvingPoints(['KS-133-S', 'KS-133-L'])).toBe(2);
  });

  it('no mission card ever carries an evolving cost', () => {
    for (const id of EVOLVING_CARDS.keys()) {
      expect(getCardById(id)?.card_type).toBe('character');
    }
  });
});

describe('evolving points — budget boundary at exactly 5', () => {
  it('exactly 5 points is compatible', () => {
    const deck = ['KS-107-R', 'KS-107-R', 'KS-021-C'];
    expect(computeDeckEvolvingPoints(deck)).toBe(EVOLVING_MAX_POINTS);
    expect(isEvolvingCompatible(deck)).toBe(true);
    expect(checkEvolvingCompatibility(deck).kind).toBe('compatible');
  });

  it('6 points is over budget and reports the exact numbers', () => {
    const deck = ['KS-107-R', 'KS-107-R', 'KS-120-R', 'KS-120-R'];
    expect(computeDeckEvolvingPoints(deck)).toBe(8);
    const r = checkEvolvingCompatibility(deck);
    expect(r.kind).toBe('over-budget');
    if (r.kind === 'over-budget') {
      expect(r.points).toBe(8);
      expect(r.max).toBe(EVOLVING_MAX_POINTS);
    }
  });

  it('one point over the cap flips compatibility', () => {
    const five = ['KS-020-UC', 'KS-026-UC', 'KS-031-UC', 'KS-033-UC', 'KS-053-UC'];
    expect(isEvolvingCompatible(five)).toBe(true);
    expect(isEvolvingCompatible([...five, 'KS-122-R'])).toBe(false);
  });

  it('an empty deck is compatible at 0 points', () => {
    expect(computeDeckEvolvingPoints([])).toBe(0);
    expect(isEvolvingCompatible([], [])).toBe(true);
  });

  it('the set gate is checked before the budget gate', () => {
    const r = checkEvolvingCompatibility(['KS-107-R', 'KS-107-R', 'KS-120-R', 'KS-120-R', 'SS-001-C']);
    expect(r.kind).toBe('set-not-allowed');
  });

  it('a non-KS mission alone blocks the deck', () => {
    expect(isEvolvingCompatible(['KS-001-C'], ['SS-001-MMS'])).toBe(false);
  });
});

describe('evolving points — extra-art printings of a hero (DEFECT)', () => {
  it.fails('KS-107_2-MV should cost the same 2 points as Sasuke 107', () => {
    expect(computeDeckEvolvingPoints(['KS-107_2-MV'])).toBe(2);
  });

  it.fails('KS-133_2-MV should cost the same 1 point as Naruto 133', () => {
    expect(computeDeckEvolvingPoints(['KS-133_2-MV'])).toBe(1);
  });

  it.fails('a full playset of extra-art heroes should not fit under the 5 point cap', () => {
    const deck = ['KS-107_2-MV', 'KS-107_2-MV', 'KS-133_2-MV', 'KS-133_2-MV'];
    expect(isEvolvingCompatible(deck)).toBe(false);
  });

  it('the extra-art printings really exist as playable KS characters', () => {
    for (const id of ['KS-107_2-MV', 'KS-133_2-MV']) {
      const card = getCardById(id);
      expect(card).toBeTruthy();
      expect(card?.card_type).toBe('character');
      expect(card?.set).toBe('KS');
    }
  });
});

describe('sealed pool — fairness of the common and uncommon slots (DEFECT)', () => {
  function slotCounts(slice: [number, number], iterations: number): number[] {
    const counts = new Map<string, number>();
    for (let i = 0; i < iterations; i++) {
      for (const c of generateBooster(i, 'KS').cards.slice(slice[0], slice[1])) {
        counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
      }
    }
    return [...counts.values()].sort((a, b) => a - b);
  }

  it('every common and every uncommon of the set can still be opened', () => {
    const commons = slotCounts([0, 4], 4000);
    const uncommons = slotCounts([4, 7], 4000);
    expect(commons.length).toBe(55);
    expect(uncommons.length).toBe(48);
    expect(commons[0]).toBeGreaterThan(0);
    expect(uncommons[0]).toBeGreaterThan(0);
  });

  it.fails('the four common slots should be close to uniform across the 55 commons', () => {
    const counts = slotCounts([0, 4], 6000);
    const ratio = counts[counts.length - 1] / counts[0];
    expect(ratio).toBeLessThan(2);
  });

  it.fails('the three uncommon slots should be close to uniform across the 48 uncommons', () => {
    const counts = slotCounts([4, 7], 6000);
    const ratio = counts[counts.length - 1] / counts[0];
    expect(ratio).toBeLessThan(2);
  });
});

describe('sealed pool — sealedInstanceId collisions between two pools', () => {
  it('two pools built back to back do not share instance ids', () => {
    const a = generateSealedPool(2, 'KS');
    const b = generateSealedPool(2, 'KS');
    const idsA = new Set(a.allCards.map((c) => c.sealedInstanceId));
    const shared = b.allCards.filter((c) => idsA.has(c.sealedInstanceId));
    expect(shared.length).toBe(0);
  });

  it('the two host and guest pools of one sealed room are built back to back', () => {
    const src = readSource('lib/socket/server.ts');
    expect(src.includes('const hostPool = generateSealedPool(count, choice);')).toBe(true);
    expect(src.includes('const guestPool = generateSealedPool(count, choice);')).toBe(true);
  });
});

describe('sealed pool cards stay engine-legal', () => {
  it('every pool card resolves in the card index under its own id', () => {
    const pool = generateSealedPool(6, 'KS');
    for (const c of pool.allCards) {
      expect(getCardById(c.id)).toBeTruthy();
    }
  });

  it('a booster card never carries a holo suffix id', () => {
    const pool = generateSealedPool(20, 'KS');
    for (const c of pool.allCards) {
      expect(c.id.endsWith('_H')).toBe(false);
    }
  });

  it('booster cards keep their printed chakra and power', () => {
    const pool = generateSealedPool(6, 'KS');
    for (const c of pool.allCards as BoosterCard[]) {
      const canon = getCardById(c.id);
      expect(c.chakra).toBe(canon?.chakra);
      expect(c.power).toBe(canon?.power);
    }
  });
});
