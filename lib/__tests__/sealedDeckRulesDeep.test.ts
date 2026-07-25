import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    tournament: { findUnique: vi.fn(), update: vi.fn() },
    tournamentParticipant: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    tournamentMatch: { findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    bannedCard: { findMany: vi.fn() },
    deck: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    variantInventory: { upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('@/lib/auth/authOptions', () => ({ auth: vi.fn() }));

vi.mock('@/lib/socket/server', () => ({ getSocketIO: vi.fn(() => null) }));

vi.mock('@/lib/tournament/matchEventLog', () => ({ logMatchEvent: vi.fn() }));

vi.mock('@/lib/sealed/boosterGenerator', () => ({
  generateSealedPool: vi.fn(() => ({ boosters: [], allCards: [], temporaryVariants: [] })),
}));

vi.mock('@/lib/tournament/deckValidation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tournament/deckValidation')>();
  return { ...actual, validateDeckForTournament: vi.fn(actual.validateDeckForTournament) };
});

import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/authOptions';
import { generateSealedPool } from '@/lib/sealed/boosterGenerator';
import { validateDeckForTournament } from '@/lib/tournament/deckValidation';
import { executeTournamentStart } from '@/lib/tournament/startLogic';
import {
  checkSealedDeckAgainstPool,
  SEALED_MIN_DECK_SIZE,
  SEALED_REQUIRED_MISSIONS,
} from '@/lib/tournament/sealedRegistration';
import { getPlayableCharacters, getPlayableMissions } from '@/lib/data/cardLoader';
import { getCharacterById, getMissionById } from '@/lib/data/cardIndex';
import { isVariantRarity, isLockedVariant } from '@/lib/variants/constants';
import { MAX_COPIES_PER_VERSION } from '@/lib/engine/types';
import { POST as PostSealedDeck } from '../../app/api/tournaments/[id]/sealed-deck/route';

const p = prisma as unknown as {
  tournament: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  tournamentParticipant: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  tournamentMatch: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
  bannedCard: { findMany: ReturnType<typeof vi.fn> };
  deck: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  variantInventory: {
    upsert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const poolGenMock = generateSealedPool as unknown as ReturnType<typeof vi.fn>;
const validateMock = validateDeckForTournament as unknown as typeof validateDeckForTournament & {
  mockClear: () => void;
};

const ksChars = (rarity: string): string[] =>
  getPlayableCharacters().filter((c) => c.set === 'KS' && c.rarity === rarity).map((c) => c.id);

const COMMONS = ksChars('C');
const UNCOMMONS = ksChars('UC');
const RARES = ksChars('R');
const RARE_ARTS = ksChars('RA');
const SECRETS = ksChars('S');
const LEGENDARIES = ksChars('L');
const MYTHOS = ksChars('M');
const MISSIONS = getPlayableMissions().filter((m) => m.set === 'KS').map((m) => m.id);

const DECK30 = COMMONS.slice(0, 30);
const MISSIONS3 = MISSIONS.slice(0, 3);

function withMissions(ids: string[], missionIds: string[] = MISSIONS3): string[] {
  return [...ids, ...missionIds];
}

function checkAgainstPool(poolIds: string[], deckIds: string[], missionIds: string[] = MISSIONS3) {
  return checkSealedDeckAgainstPool(withMissions(poolIds, missionIds), deckIds, missionIds);
}

function poolOf(ids: string[]): { allCards: Array<{ id: string }> } {
  return { allCards: ids.map((id) => ({ id })) };
}

function repeat(id: string, n: number): string[] {
  return Array.from({ length: n }, () => id);
}

const ctx = { params: Promise.resolve({ id: 't1' }) };

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/tournaments/t1/sealed-deck', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function submit(body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await PostSealedDeck(jsonRequest(body) as never, ctx as never);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function submitRaw(raw: string): Promise<number> {
  const req = new Request('http://localhost/api/tournaments/t1/sealed-deck', { method: 'POST', body: raw });
  const res = await PostSealedDeck(req as never, ctx as never);
  return res.status;
}

function setPool(ids: string[], missionIds: string[] = MISSIONS3): void {
  p.tournamentParticipant.findUnique.mockResolvedValue({
    id: 'part1',
    sealedPool: poolOf(withMissions(ids, missionIds)),
    deckValid: false,
  });
}

function resetAll(): void {
  for (const model of Object.values(p)) {
    for (const fn of Object.values(model as Record<string, unknown>)) {
      if (typeof fn === 'function' && 'mockReset' in fn) (fn as ReturnType<typeof vi.fn>).mockReset();
    }
  }
  authMock.mockReset();
  poolGenMock.mockReset();
  validateMock.mockClear();
  poolGenMock.mockReturnValue({ boosters: [], allCards: [], temporaryVariants: [] });
  authMock.mockResolvedValue({ user: { id: 'u1' } });
  p.tournament.findUnique.mockResolvedValue({ gameMode: 'sealed', status: 'registration' });
  p.tournament.update.mockResolvedValue({});
  p.tournamentParticipant.update.mockResolvedValue({});
  p.tournamentParticipant.updateMany.mockResolvedValue({ count: 0 });
  p.tournamentMatch.findFirst.mockResolvedValue(null);
  p.tournamentMatch.deleteMany.mockResolvedValue({ count: 0 });
  p.tournamentMatch.create.mockResolvedValue({});
  p.bannedCard.findMany.mockResolvedValue([]);
}

beforeEach(resetAll);

describe('sealed deck rules: fixtures resolve to real playable cards', () => {
  it('the KS card pool used by these tests is complete enough to build every scenario', () => {
    expect(COMMONS.length).toBeGreaterThanOrEqual(55);
    expect(UNCOMMONS.length).toBeGreaterThanOrEqual(30);
    expect(RARES.length).toBeGreaterThan(0);
    expect(RARE_ARTS.length).toBeGreaterThan(0);
    expect(SECRETS.length).toBeGreaterThan(0);
    expect(LEGENDARIES.length).toBeGreaterThan(0);
    expect(MYTHOS.length).toBeGreaterThan(0);
    expect(MISSIONS.length).toBeGreaterThanOrEqual(3);
  });

  it('every fixture character resolves as a character and every fixture mission as a mission', () => {
    for (const id of [...DECK30, RARE_ARTS[0], SECRETS[0], LEGENDARIES[0], MYTHOS[0]]) {
      expect(getCharacterById(id)).toBeTruthy();
    }
    for (const id of MISSIONS3) {
      expect(getMissionById(id)).toBeTruthy();
    }
  });

  it('the documented sealed thresholds are 30 characters and exactly 3 missions', () => {
    expect(SEALED_MIN_DECK_SIZE).toBe(30);
    expect(SEALED_REQUIRED_MISSIONS).toBe(3);
    expect(DECK30.length).toBe(30);
    expect(MISSIONS3.length).toBe(3);
  });
});

describe('sealed deck rules: NO 2-copies-per-version limit', () => {
  it('accepts 6 copies of one card when 6 were opened', () => {
    const pool = [...repeat(COMMONS[0], 6), ...COMMONS.slice(1, 25)];
    const deck = [...repeat(COMMONS[0], 6), ...COMMONS.slice(1, 25)];
    expect(checkAgainstPool(pool, deck, MISSIONS3)).toEqual({ valid: true });
  });

  it('accepts 10 copies of one card when 10 were opened', () => {
    const pool = [...repeat(COMMONS[0], 10), ...COMMONS.slice(1, 21)];
    const deck = [...repeat(COMMONS[0], 10), ...COMMONS.slice(1, 21)];
    expect(checkAgainstPool(pool, deck, MISSIONS3).valid).toBe(true);
  });

  it('accepts a deck made of 30 copies of the very same card when 30 were opened', () => {
    const pool = repeat(COMMONS[0], 30);
    expect(checkAgainstPool(pool, repeat(COMMONS[0], 30), MISSIONS3).valid).toBe(true);
  });

  it('accepts 50 copies of one card, the size of a whole 5 booster pool', () => {
    const pool = repeat(COMMONS[0], 50);
    expect(checkAgainstPool(pool, repeat(COMMONS[0], 50), MISSIONS3).valid).toBe(true);
  });

  it('accepts every copy count from 3 to 30 as long as the pool holds them', () => {
    for (let copies = MAX_COPIES_PER_VERSION + 1; copies <= 30; copies++) {
      const pool = [...repeat(COMMONS[0], copies), ...COMMONS.slice(1, 31)];
      const deck = [...repeat(COMMONS[0], copies), ...COMMONS.slice(1, 31 - copies + 1)];
      const res = checkAgainstPool(pool, deck, MISSIONS3);
      expect(res.valid).toBe(true);
    }
  });

  it('is a genuine exception: the classic tournament validator refuses the exact same 30 copy deck', () => {
    const deck = { cardIds: repeat(COMMONS[0], 30), missionIds: MISSIONS3 };
    const classic = validateMock(deck, {
      bannedCardIds: [], allowedGroups: [], bannedGroups: [], allowedKeywords: [], bannedKeywords: [],
      allowedRarities: [], bannedRarities: [], maxPerRarity: null, maxCopiesPerCard: null,
      minDeckSize: null, maxDeckSize: null, maxChakraCost: null,
    });
    expect(classic.valid).toBe(false);
    expect(classic.errorKeys.some((e) => e.key === 'tournament.deckError.tooManyCopies')).toBe(true);
    expect(checkAgainstPool(repeat(COMMONS[0], 30), deck.cardIds, MISSIONS3).valid).toBe(true);
  });

  it('counts a rare and its rare art as two different cards, never as one shared budget', () => {
    const base = RARES.find((id) => RARE_ARTS.includes(id.replace(/-R$/, '-RA')));
    expect(base).toBeTruthy();
    const art = base!.replace(/-R$/, '-RA');
    expect(art).not.toBe(base);

    const pool = [base!, art, ...COMMONS.slice(0, 28)];
    expect(checkAgainstPool(pool, [base!, art, ...COMMONS.slice(0, 28)], MISSIONS3).valid).toBe(true);

    const collapsed = checkAgainstPool(pool, [base!, base!, ...COMMONS.slice(0, 28)], MISSIONS3);
    expect(collapsed.valid).toBe(false);
    expect(collapsed.offendingCardId).toBe(base);

    const collapsedArt = checkAgainstPool(pool, [art, art, ...COMMONS.slice(0, 28)], MISSIONS3);
    expect(collapsedArt.valid).toBe(false);
    expect(collapsedArt.offendingCardId).toBe(art);
  });

  it('accepts every printing separately when the pool really opened both', () => {
    const base = RARES.find((id) => RARE_ARTS.includes(id.replace(/-R$/, '-RA')))!;
    const art = base.replace(/-R$/, '-RA');
    const pool = [...repeat(base, 2), ...repeat(art, 2), ...COMMONS.slice(0, 26)];
    expect(checkAgainstPool(pool, [...pool], MISSIONS3).valid).toBe(true);
    expect(checkAgainstPool(pool, [...repeat(base, 3), art, ...COMMONS.slice(0, 26)], MISSIONS3).valid).toBe(false);
  });

  it('the route itself accepts a 30 copy sealed deck end to end', async () => {
    setPool(repeat(COMMONS[0], 30));
    const res = await submit({ cardIds: repeat(COMMONS[0], 30), missionIds: MISSIONS3 });
    expect(res.status).toBe(200);
    expect(p.tournamentParticipant.update).toHaveBeenCalledTimes(1);
    const call = p.tournamentParticipant.update.mock.calls[0][0] as { data: { sealedDeck: { cardIds: string[] }; deckValid: boolean } };
    expect(call.data.sealedDeck.cardIds.length).toBe(30);
    expect(call.data.deckValid).toBe(true);
  });

  it('the route accepts 8 copies of a single uncommon inside a wider deck', async () => {
    const pool = [...repeat(UNCOMMONS[0], 8), ...COMMONS.slice(0, 30)];
    setPool(pool);
    const res = await submit({ cardIds: [...repeat(UNCOMMONS[0], 8), ...COMMONS.slice(0, 25)], missionIds: MISSIONS3 });
    expect(res.status).toBe(200);
  });
});

describe('sealed deck rules: the pool is consumed as a multiset', () => {
  it('refuses exactly one copy more than was opened, for every copy count', () => {
    for (const copies of [1, 2, 3, 6, 10, 30]) {
      const pool = [...repeat(COMMONS[0], copies), ...COMMONS.slice(1, 41)];
      const deck = [...repeat(COMMONS[0], copies + 1), ...COMMONS.slice(1, 41)];
      const res = checkAgainstPool(pool, deck, MISSIONS3);
      expect(res.valid).toBe(false);
      expect(res.errorKey).toBe('tournament.error.sealedCardNotInPool');
      expect(res.offendingCardId).toBe(COMMONS[0]);
    }
  });

  it('is order independent: shuffling a legal deck keeps it legal', () => {
    const pool = [...repeat(COMMONS[0], 5), ...repeat(COMMONS[1], 5), ...COMMONS.slice(2, 30)];
    const deck = [...repeat(COMMONS[0], 5), ...repeat(COMMONS[1], 5), ...COMMONS.slice(2, 22)];
    for (let i = 0; i < 20; i++) {
      const shuffled = [...deck].sort(() => Math.random() - 0.5);
      expect(checkAgainstPool(pool, shuffled, MISSIONS3).valid).toBe(true);
    }
  });

  it('is order independent when it refuses too: the overdraft is caught wherever it sits', () => {
    const pool = [...repeat(COMMONS[0], 2), ...COMMONS.slice(1, 40)];
    const deck = [COMMONS[0], ...COMMONS.slice(1, 29), COMMONS[0], COMMONS[0]];
    expect(deck.length).toBeGreaterThanOrEqual(30);
    const res = checkAgainstPool(pool, deck, MISSIONS3);
    expect(res.valid).toBe(false);
    expect(res.offendingCardId).toBe(COMMONS[0]);
  });

  it('spending a copy on one slot really removes it from the remaining budget', () => {
    const pool = [...repeat(COMMONS[0], 3), ...COMMONS.slice(1, 28)];
    expect(checkAgainstPool(pool, [...repeat(COMMONS[0], 3), ...COMMONS.slice(1, 28)], MISSIONS3).valid).toBe(true);
    expect(checkAgainstPool(pool, [...repeat(COMMONS[0], 4), ...COMMONS.slice(1, 27)], MISSIONS3).valid).toBe(false);
  });

  it('the route refuses the overdraft and names the offending card', async () => {
    setPool([...repeat(COMMONS[0], 2), ...COMMONS.slice(1, 40)]);
    const res = await submit({ cardIds: [...repeat(COMMONS[0], 3), ...COMMONS.slice(1, 28)], missionIds: MISSIONS3 });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe('tournament.error.sealedCardNotInPool');
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('an empty pool refuses every deck', () => {
    const res = checkSealedDeckAgainstPool([], DECK30, MISSIONS3);
    expect(res.valid).toBe(false);
    expect(res.errorKey).toBe('tournament.error.sealedCardNotInPool');
  });

  it('a hostile card id never crashes the pool check and is simply refused', () => {
    for (const hostile of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      const res = checkAgainstPool(DECK30, [...DECK30.slice(0, 29), hostile], MISSIONS3);
      expect(res.valid).toBe(false);
      expect(res.offendingCardId).toBe(hostile);
    }
  });

  it('an empty string card id is refused rather than silently matched', () => {
    const res = checkAgainstPool(DECK30, [...DECK30.slice(0, 29), ''], MISSIONS3);
    expect(res.valid).toBe(false);
    expect(res.errorKey).toBe('tournament.error.sealedCardNotInPool');
  });
});

describe('sealed deck rules: the 30 character minimum at its boundary', () => {
  it('the pure check refuses 29 and accepts 30', () => {
    const pool = COMMONS.slice(0, 40);
    expect(checkAgainstPool(pool, COMMONS.slice(0, 29), MISSIONS3).errorKey).toBe('tournament.error.sealedDeckTooSmall');
    expect(checkAgainstPool(pool, COMMONS.slice(0, 30), MISSIONS3).valid).toBe(true);
  });

  it('the pure check refuses every size below 30', () => {
    const pool = COMMONS.slice(0, 40);
    for (const size of [0, 1, 15, 28, 29]) {
      const res = checkAgainstPool(pool, COMMONS.slice(0, size), MISSIONS3);
      expect(res.valid).toBe(false);
      expect(res.errorKey).toBe('tournament.error.sealedDeckTooSmall');
    }
  });

  it('a sealed deck may legally exceed 30 characters', () => {
    const pool = COMMONS.slice(0, 55);
    for (const size of [31, 35, 40, 50, 55]) {
      expect(checkAgainstPool(pool, COMMONS.slice(0, size), MISSIONS3).valid).toBe(true);
    }
  });

  it('a sealed deck may use the entire pool, characters and copies included', () => {
    const pool = [...repeat(COMMONS[0], 12), ...COMMONS.slice(1, 39)];
    expect(checkAgainstPool(pool, [...pool], MISSIONS3).valid).toBe(true);
  });

  it('the route refuses 29 with the dedicated too-small key and accepts 30 with the same pool', async () => {
    setPool(COMMONS.slice(0, 40));
    const short = await submit({ cardIds: COMMONS.slice(0, 29), missionIds: MISSIONS3 });
    expect(short.status).toBe(400);
    expect(short.body.errorKey).toBe('tournament.error.sealedDeckTooSmall');
    resetAll();
    setPool(COMMONS.slice(0, 40));
    const ok = await submit({ cardIds: COMMONS.slice(0, 30), missionIds: MISSIONS3 });
    expect(ok.status).toBe(200);
  });

  it('the route accepts an oversized sealed deck of 45 characters', async () => {
    setPool(COMMONS.slice(0, 50));
    const res = await submit({ cardIds: COMMONS.slice(0, 45), missionIds: MISSIONS3 });
    expect(res.status).toBe(200);
    const call = p.tournamentParticipant.update.mock.calls[0][0] as { data: { sealedDeck: { cardIds: string[] } } };
    expect(call.data.sealedDeck.cardIds.length).toBe(45);
  });

  it('the route names the real reason for an undersized deck instead of a generic invalid-deck key', async () => {
    setPool(COMMONS.slice(0, 40));
    const res = await submit({ cardIds: COMMONS.slice(0, 10), missionIds: MISSIONS3 });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe('tournament.error.sealedDeckTooSmall');
    expect(res.body.errorKey).not.toBe('game.error.invalidDeck');
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('every sealed rejection key the route can emit is one of the dedicated sealed keys', async () => {
    const cases: Array<[unknown, string]> = [
      [{ cardIds: COMMONS.slice(0, 29), missionIds: MISSIONS3 }, 'tournament.error.sealedDeckTooSmall'],
      [{ cardIds: DECK30, missionIds: MISSIONS.slice(0, 2) }, 'tournament.error.sealedMissionCount'],
      [{ cardIds: [...COMMONS.slice(0, 29), MYTHOS[0]], missionIds: MISSIONS3 }, 'tournament.error.sealedCardNotInPool'],
    ];
    for (const [body, expected] of cases) {
      resetAll();
      setPool(COMMONS.slice(0, 40));
      const res = await submit(body);
      expect(res.status).toBe(400);
      expect(res.body.errorKey).toBe(expected);
    }
  });

  it('malformed payloads are refused instead of being treated as an empty legal deck', async () => {
    setPool(COMMONS.slice(0, 40));
    expect((await submit({})).status).toBe(400);
    expect((await submit({ cardIds: 'KS-001-C', missionIds: MISSIONS3 })).status).toBe(400);
    expect((await submit({ cardIds: DECK30, missionIds: null })).status).toBe(400);
    expect((await submit({ cardIds: null, missionIds: null })).status).toBe(400);
    expect(await submitRaw('{not-json')).toBe(400);
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('non-string entries are dropped, so a padded payload cannot fake the 30 card minimum', async () => {
    setPool(COMMONS.slice(0, 40));
    const res = await submit({ cardIds: [...COMMONS.slice(0, 29), 1, null, { id: 'x' }], missionIds: MISSIONS3 });
    expect(res.status).toBe(400);
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });
});

describe('sealed deck rules: exactly 3 missions', () => {
  it('the pure check accepts 3 and refuses every other count', () => {
    const pool = COMMONS.slice(0, 40);
    expect(checkAgainstPool(pool, DECK30, MISSIONS3).valid).toBe(true);
    for (const count of [0, 1, 2, 4, 5, 10]) {
      const missions = Array.from({ length: count }, (_, i) => MISSIONS[i % MISSIONS.length]);
      const res = checkAgainstPool(pool, DECK30, missions);
      expect(res.valid).toBe(false);
      expect(res.errorKey).toBe('tournament.error.sealedMissionCount');
    }
  });

  it('the route accepts exactly 3 missions', async () => {
    setPool(COMMONS.slice(0, 40));
    expect((await submit({ cardIds: DECK30, missionIds: MISSIONS3 })).status).toBe(200);
  });

  it('the route refuses 0, 1 and 5 missions', async () => {
    setPool(COMMONS.slice(0, 40));
    expect((await submit({ cardIds: DECK30, missionIds: [] })).status).toBe(400);
    expect((await submit({ cardIds: DECK30, missionIds: MISSIONS.slice(0, 1) })).status).toBe(400);
    expect((await submit({ cardIds: DECK30, missionIds: MISSIONS.slice(0, 5) })).status).toBe(400);
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('the route refuses a mission id that is not a mission card', async () => {
    setPool([...COMMONS.slice(0, 40), MYTHOS[0]]);
    const res = await submit({ cardIds: DECK30, missionIds: [MISSIONS3[0], MISSIONS3[1], MYTHOS[0]] });
    expect(res.status).toBe(400);
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('the route refuses an invented mission id even when the stored pool holds it', async () => {
    setPool(COMMONS.slice(0, 40), [MISSIONS3[0], MISSIONS3[1], 'KS-999-MMS']);
    const res = await submit({ cardIds: DECK30, missionIds: [MISSIONS3[0], MISSIONS3[1], 'KS-999-MMS'] });
    expect(res.status).toBe(400);
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('the route refuses a mission id used as a character card', async () => {
    setPool([...COMMONS.slice(0, 29), MISSIONS3[0]]);
    const res = await submit({ cardIds: [...COMMONS.slice(0, 29), MISSIONS3[0]], missionIds: MISSIONS3 });
    expect(res.status).toBe(400);
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });
});

describe('sealed deck rules: missions must come from your own pool', () => {
  it('a mission that was never opened is refused and named', async () => {
    setPool(COMMONS.slice(0, 40), [MISSIONS[0]]);
    const res = await submit({ cardIds: DECK30, missionIds: [MISSIONS[1], MISSIONS[2], MISSIONS[3]] });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe('tournament.error.sealedCardNotInPool');
    expect(res.body.offendingCardId).toBe(MISSIONS[1]);
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('a single unopened mission poisons an otherwise legal deck', async () => {
    setPool(COMMONS.slice(0, 40), [MISSIONS[0], MISSIONS[1]]);
    const res = await submit({ cardIds: DECK30, missionIds: [MISSIONS[0], MISSIONS[1], MISSIONS[2]] });
    expect(res.status).toBe(400);
    expect(res.body.offendingCardId).toBe(MISSIONS[2]);
  });

  it('the same mission cannot be used three times when the pool holds one copy', async () => {
    setPool(COMMONS.slice(0, 40), [MISSIONS[0]]);
    const res = await submit({ cardIds: DECK30, missionIds: [MISSIONS[0], MISSIONS[0], MISSIONS[0]] });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe('tournament.error.sealedCardNotInPool');
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('three copies of one mission are legal when three copies were opened', async () => {
    setPool(COMMONS.slice(0, 40), [MISSIONS[0], MISSIONS[0], MISSIONS[0]]);
    const res = await submit({ cardIds: DECK30, missionIds: [MISSIONS[0], MISSIONS[0], MISSIONS[0]] });
    expect(res.status).toBe(200);
    expect(p.tournamentParticipant.update).toHaveBeenCalledTimes(1);
  });

  it('the pure pool check consumes mission ids from the pool multiset', () => {
    const pool = [...COMMONS.slice(0, 40), MISSIONS[0]];
    expect(checkSealedDeckAgainstPool(pool, DECK30, [MISSIONS[1], MISSIONS[2], MISSIONS[3]]).valid).toBe(false);
    expect(checkSealedDeckAgainstPool(pool, DECK30, [MISSIONS[0], MISSIONS[0], MISSIONS[0]]).valid).toBe(false);
    expect(
      checkSealedDeckAgainstPool([...COMMONS.slice(0, 40), MISSIONS[0], MISSIONS[1], MISSIONS[2]], DECK30, MISSIONS3).valid,
    ).toBe(true);
  });

  it('the mission budget is spent on top of the character budget, never instead of it', () => {
    const pool = [...repeat(COMMONS[0], 30), MISSIONS[0], MISSIONS[1], MISSIONS[2]];
    expect(checkSealedDeckAgainstPool(pool, repeat(COMMONS[0], 30), MISSIONS3).valid).toBe(true);
    expect(checkSealedDeckAgainstPool(pool, repeat(COMMONS[0], 31), MISSIONS3).valid).toBe(false);
  });

  it('the missions involved are real playable KS missions, so the rule is about ownership only', () => {
    for (const id of [MISSIONS[0], MISSIONS[1], MISSIONS[2], MISSIONS[3]]) {
      const mission = getMissionById(id);
      expect(mission).toBeTruthy();
      expect(mission?.set).toBe('KS');
    }
  });
});

describe('sealed deck rules: only YOUR pool counts', () => {
  const poolA = COMMONS.slice(0, 30);
  const poolB = UNCOMMONS.slice(0, 30);

  it('the two fixture pools are genuinely disjoint', () => {
    expect(poolA.length).toBe(30);
    expect(poolB.length).toBe(30);
    expect(poolA.filter((id) => poolB.includes(id)).length).toBe(0);
  });

  it('each deck is legal against its own pool and illegal against the other one', () => {
    expect(checkAgainstPool(poolA, poolA, MISSIONS3).valid).toBe(true);
    expect(checkAgainstPool(poolB, poolB, MISSIONS3).valid).toBe(true);
    expect(checkAgainstPool(poolB, poolA, MISSIONS3).valid).toBe(false);
    expect(checkAgainstPool(poolA, poolB, MISSIONS3).valid).toBe(false);
  });

  it('a single borrowed card from the other pool poisons an otherwise legal deck', () => {
    const deck = [...poolA.slice(0, 29), poolB[0]];
    const res = checkAgainstPool(poolA, deck, MISSIONS3);
    expect(res.valid).toBe(false);
    expect(res.errorKey).toBe('tournament.error.sealedCardNotInPool');
    expect(res.offendingCardId).toBe(poolB[0]);
  });

  it('a real card of the general collection that was never opened is refused', () => {
    const notOpened = MYTHOS[0];
    expect(getCharacterById(notOpened)).toBeTruthy();
    const res = checkAgainstPool(poolA, [...poolA.slice(0, 29), notOpened], MISSIONS3);
    expect(res.valid).toBe(false);
    expect(res.offendingCardId).toBe(notOpened);
  });

  it('the route refuses the other player pool wholesale', async () => {
    setPool(poolB);
    const res = await submit({ cardIds: poolA, missionIds: MISSIONS3 });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe('tournament.error.sealedCardNotInPool');
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('the route refuses a single unopened collection card slipped into a legal deck', async () => {
    setPool(poolA);
    const res = await submit({ cardIds: [...poolA.slice(0, 29), LEGENDARIES[0]], missionIds: MISSIONS3 });
    expect(res.status).toBe(400);
    expect(res.body.errorKey).toBe('tournament.error.sealedCardNotInPool');
  });

  it('the route refuses a deck built from the whole KS collection', async () => {
    setPool(poolA);
    const res = await submit({ cardIds: COMMONS.slice(0, 50), missionIds: MISSIONS3 });
    expect(res.status).toBe(400);
  });
});

describe('sealed deck rules: variants from the pool are playable', () => {
  it('rare art and legendary are variant rarities that are normally locked', () => {
    expect(isVariantRarity('RA')).toBe(true);
    expect(isVariantRarity('L')).toBe(true);
    expect(isLockedVariant('RA')).toBe(true);
    expect(isLockedVariant('L')).toBe(true);
  });

  it('the pure check treats a rare art exactly like any other pooled card', () => {
    const pool = [...COMMONS.slice(0, 29), RARE_ARTS[0]];
    expect(checkAgainstPool(pool, [...COMMONS.slice(0, 29), RARE_ARTS[0]], MISSIONS3).valid).toBe(true);
  });

  it('the route accepts a sealed deck containing rare art, secret and legendary cards', async () => {
    const pool = [...COMMONS.slice(0, 27), RARE_ARTS[0], SECRETS[0], LEGENDARIES[0]];
    setPool(pool);
    const res = await submit({ cardIds: pool, missionIds: MISSIONS3 });
    expect(res.status).toBe(200);
    const call = p.tournamentParticipant.update.mock.calls[0][0] as { data: { sealedDeck: { cardIds: string[] } } };
    expect(call.data.sealedDeck.cardIds).toContain(RARE_ARTS[0]);
    expect(call.data.sealedDeck.cardIds).toContain(SECRETS[0]);
    expect(call.data.sealedDeck.cardIds).toContain(LEGENDARIES[0]);
  });

  it('a variant is playable without any permanent unlock being consulted', async () => {
    const pool = [...COMMONS.slice(0, 29), RARE_ARTS[0]];
    setPool(pool);
    const res = await submit({ cardIds: pool, missionIds: MISSIONS3 });
    expect(res.status).toBe(200);
    expect(p.variantInventory.findMany).not.toHaveBeenCalled();
  });

  it('two copies of the same rare art are legal when two were opened', () => {
    const pool = [...repeat(RARE_ARTS[0], 2), ...COMMONS.slice(0, 28)];
    expect(checkAgainstPool(pool, pool, MISSIONS3).valid).toBe(true);
  });

  it('a rare art that was never opened is still refused, variants get no free pass', () => {
    const pool = COMMONS.slice(0, 30);
    const res = checkAgainstPool(pool, [...pool.slice(0, 29), RARE_ARTS[1]], MISSIONS3);
    expect(res.valid).toBe(false);
    expect(res.offendingCardId).toBe(RARE_ARTS[1]);
  });
});

describe('sealed deck rules: submitting never grants a permanent unlock', () => {
  it('a successful submission writes the deck on the participant and nothing else', async () => {
    const pool = [...COMMONS.slice(0, 28), RARE_ARTS[0], LEGENDARIES[0]];
    setPool(pool);
    const res = await submit({ cardIds: pool, missionIds: MISSIONS3 });
    expect(res.status).toBe(200);
    expect(p.variantInventory.upsert).not.toHaveBeenCalled();
    expect(p.variantInventory.update).not.toHaveBeenCalled();
    expect(p.variantInventory.updateMany).not.toHaveBeenCalled();
    expect(p.variantInventory.create).not.toHaveBeenCalled();
    expect(p.deck.create).not.toHaveBeenCalled();
    expect(p.deck.update).not.toHaveBeenCalled();
  });

  it('the stored payload carries only the sealed deck and its validity flag', async () => {
    const pool = [...COMMONS.slice(0, 29), RARE_ARTS[0]];
    setPool(pool);
    await submit({ cardIds: pool, missionIds: MISSIONS3 });
    const call = p.tournamentParticipant.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(Object.keys(call.data).sort()).toEqual(['deckValid', 'sealedDeck']);
  });

  it('a confirmed sealed deck is final and re-submitting is refused with the locked key', async () => {
    p.tournamentParticipant.findUnique.mockResolvedValue({ id: 'part1', sealedPool: poolOf(DECK30), deckValid: true });
    const res = await submit({ cardIds: DECK30, missionIds: MISSIONS3 });
    expect(res.status).toBe(409);
    expect(res.body.errorKey).toBe('tournament.error.sealedDeckLocked');
    expect(p.tournamentParticipant.update).not.toHaveBeenCalled();
  });
});

describe('sealed tournament start: no classic deck validation, no auto-build', () => {
  function sealedParticipant(
    i: number,
    sealedDeck: { cardIds: string[]; missionIds: string[] } | null,
    deckValid: boolean,
  ) {
    return {
      id: `p${i}`,
      userId: `u${i}`,
      username: `P${i}`,
      seed: null,
      deckId: null,
      deckValid,
      eliminated: false,
      sealedPool: { allCards: [] },
      sealedDeck,
    };
  }

  function sealedTournament(participants: unknown[]) {
    return {
      id: 't1',
      status: 'registration',
      format: 'swiss',
      gameMode: 'sealed',
      useBanList: false,
      bannedCardIds: [],
      sealedBoosterCount: 5,
      sealedSetChoice: 'KS',
      participants,
    };
  }

  const thirtyCopies = { cardIds: repeat(COMMONS[0], 30), missionIds: MISSIONS3 };

  function eliminationCalls(): Array<{ where: { id: string }; data: Record<string, unknown> }> {
    return p.tournamentParticipant.update.mock.calls
      .map((c: unknown[]) => c[0] as { where: { id: string }; data: Record<string, unknown> })
      .filter((c) => c.data?.eliminated === true);
  }

  it('starts a sealed event whose confirmed decks use 30 copies of one card', async () => {
    p.tournament.findUnique.mockResolvedValue(
      sealedTournament([sealedParticipant(1, thirtyCopies, true), sealedParticipant(2, thirtyCopies, true)]),
    );
    const result = await executeTournamentStart('t1');
    expect(result.ok).toBe(true);
    expect(eliminationCalls().length).toBe(0);
  });

  it('never runs the classic deck validator on a sealed event', async () => {
    p.tournament.findUnique.mockResolvedValue(
      sealedTournament([sealedParticipant(1, thirtyCopies, true), sealedParticipant(2, thirtyCopies, true)]),
    );
    await executeTournamentStart('t1');
    expect(validateMock).not.toHaveBeenCalled();
    expect(p.deck.findUnique).not.toHaveBeenCalled();
  });

  it('the same 30 copy deck IS rejected by the classic path, proving the spy really fires', async () => {
    p.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'registration', format: 'swiss', gameMode: 'classic',
      useBanList: false, bannedCardIds: [], allowedGroups: [], bannedGroups: [],
      allowedKeywords: [], bannedKeywords: [], allowedRarities: [], bannedRarities: [],
      maxPerRarity: null, maxCopiesPerCard: null, minDeckSize: null, maxDeckSize: null, maxChakraCost: null,
      participants: [
        { id: 'p1', userId: 'u1', username: 'P1', seed: null, deckId: 'd1', deckValid: true, eliminated: false, sealedPool: null },
        { id: 'p2', userId: 'u2', username: 'P2', seed: null, deckId: 'd2', deckValid: true, eliminated: false, sealedPool: null },
      ],
    });
    p.deck.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      userId: where.id.replace('d', 'u'),
      cardIds: repeat(COMMONS[0], 30),
      missionIds: MISSIONS3,
    }));
    const result = await executeTournamentStart('t1');
    expect(validateMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at least 2/i);
  });

  it('eliminates a participant whose confirmed deck has only 29 characters', async () => {
    p.tournament.findUnique.mockResolvedValue(
      sealedTournament([
        sealedParticipant(1, thirtyCopies, true),
        sealedParticipant(2, thirtyCopies, true),
        sealedParticipant(3, { cardIds: repeat(COMMONS[0], 29), missionIds: MISSIONS3 }, true),
      ]),
    );
    const result = await executeTournamentStart('t1');
    expect(result.ok).toBe(true);
    const eliminated = eliminationCalls();
    expect(eliminated.length).toBe(1);
    expect(eliminated[0].where.id).toBe('p3');
    expect(eliminated[0].data.deckValid).toBe(false);
    expect(eliminated[0].data.eliminatedRound).toBe(0);
  });

  it('eliminates participants whose confirmed deck does not carry exactly 3 missions', async () => {
    p.tournament.findUnique.mockResolvedValue(
      sealedTournament([
        sealedParticipant(1, thirtyCopies, true),
        sealedParticipant(2, thirtyCopies, true),
        sealedParticipant(3, { cardIds: repeat(COMMONS[0], 30), missionIds: MISSIONS.slice(0, 2) }, true),
        sealedParticipant(4, { cardIds: repeat(COMMONS[0], 30), missionIds: MISSIONS.slice(0, 4) }, true),
      ]),
    );
    await executeTournamentStart('t1');
    const ids = eliminationCalls().map((c) => c.where.id).sort();
    expect(ids).toEqual(['p3', 'p4']);
  });

  it('eliminates a participant who built a deck but never confirmed it', async () => {
    p.tournament.findUnique.mockResolvedValue(
      sealedTournament([
        sealedParticipant(1, thirtyCopies, true),
        sealedParticipant(2, thirtyCopies, true),
        sealedParticipant(3, thirtyCopies, false),
        sealedParticipant(4, null, false),
      ]),
    );
    await executeTournamentStart('t1');
    const ids = eliminationCalls().map((c) => c.where.id).sort();
    expect(ids).toEqual(['p3', 'p4']);
  });

  it('never auto-builds a sealed deck for an unconfirmed participant', async () => {
    p.tournament.findUnique.mockResolvedValue(
      sealedTournament([
        sealedParticipant(1, thirtyCopies, true),
        sealedParticipant(2, thirtyCopies, true),
        sealedParticipant(3, null, false),
      ]),
    );
    await executeTournamentStart('t1');
    const wroteADeck = p.tournamentParticipant.update.mock.calls.some(
      (c: unknown[]) => 'sealedDeck' in ((c[0] as { data: Record<string, unknown> }).data ?? {}),
    );
    expect(wroteADeck).toBe(false);
  });

  it('does not reroll a pool that the player already claimed at join time', async () => {
    p.tournament.findUnique.mockResolvedValue(
      sealedTournament([sealedParticipant(1, thirtyCopies, true), sealedParticipant(2, thirtyCopies, true)]),
    );
    await executeTournamentStart('t1');
    expect(poolGenMock).not.toHaveBeenCalled();
  });

  it('refuses to start when only one player confirmed a sealed deck', async () => {
    p.tournament.findUnique.mockResolvedValue(
      sealedTournament([
        sealedParticipant(1, thirtyCopies, true),
        sealedParticipant(2, thirtyCopies, false),
        sealedParticipant(3, null, false),
      ]),
    );
    const result = await executeTournamentStart('t1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/at least 2/i);
    }
  });

  it('runs the confirmed sealed field as a plain swiss event', async () => {
    p.tournament.findUnique.mockResolvedValue(
      sealedTournament([
        sealedParticipant(1, thirtyCopies, true),
        sealedParticipant(2, thirtyCopies, true),
        sealedParticipant(3, thirtyCopies, true),
        sealedParticipant(4, thirtyCopies, true),
      ]),
    );
    const result = await executeTournamentStart('t1');
    expect(result.ok).toBe(true);
    expect(p.tournamentMatch.create).toHaveBeenCalledTimes(2);
    const started = p.tournament.update.mock.calls
      .map((c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data)
      .find((d) => d.status === 'in_progress');
    expect(started).toBeTruthy();
    expect(started?.currentRound).toBe(1);
  });

  it('an oversized confirmed sealed deck is accepted at start', async () => {
    const big = { cardIds: [...repeat(COMMONS[0], 20), ...COMMONS.slice(1, 26)], missionIds: MISSIONS3 };
    p.tournament.findUnique.mockResolvedValue(
      sealedTournament([sealedParticipant(1, big, true), sealedParticipant(2, big, true)]),
    );
    const result = await executeTournamentStart('t1');
    expect(result.ok).toBe(true);
    expect(eliminationCalls().length).toBe(0);
  });
});
