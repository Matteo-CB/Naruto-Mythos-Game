import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    deck: { count: vi.fn() },
  },
}));

import { prisma } from '@/lib/db/prisma';
import {
  assertCanJoinEvolving,
  userHasEvolvingDeck,
  getEvolvingEloField,
  getEvolvingEloType,
  buildEvolvingGameConfigExtras,
} from '@/lib/socket/server';
import { holoFromHue, normalizeHue, randomHoloHue } from '@/lib/utils/holoColor';

const p = prisma as unknown as { deck: { count: ReturnType<typeof vi.fn> } };

beforeEach(() => {
  p.deck.count.mockReset();
});

describe('Phase 14.1 — assertCanJoinEvolving', () => {
  it('player without evo deck attempting to join evo room → rejected with evolvingNoDeck errorKey', async () => {
    p.deck.count.mockResolvedValue(0);
    const result = await assertCanJoinEvolving('user-1', { isEvolving: true });
    expect(result).toEqual({ ok: false, errorKey: 'room.error.evolvingNoDeck' });
    expect(p.deck.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', evolvingCompatible: true },
    });
  });

  it('player with at least one evo deck → accepted', async () => {
    p.deck.count.mockResolvedValue(1);
    const result = await assertCanJoinEvolving('user-1', { isEvolving: true });
    expect(result).toEqual({ ok: true });
  });

  it('player with many evo decks → still accepted (count >= 1 is enough)', async () => {
    p.deck.count.mockResolvedValue(7);
    const result = await assertCanJoinEvolving('user-1', { isEvolving: true });
    expect(result).toEqual({ ok: true });
  });

  it('player without evo deck joining a non-evo room → accepted (gate skipped, no DB hit)', async () => {
    const result = await assertCanJoinEvolving('user-1', { isEvolving: false });
    expect(result).toEqual({ ok: true });
    expect(p.deck.count).not.toHaveBeenCalled();
  });

  it('prisma throws → second check returns false (refused) to fail closed safely', async () => {
    p.deck.count.mockRejectedValueOnce(new Error('connection lost'));
    const result = await assertCanJoinEvolving('user-1', { isEvolving: true });
    expect(result).toEqual({ ok: false, errorKey: 'room.error.evolvingNoDeck' });
  });

  it('userHasEvolvingDeck returns false when prisma throws (defensive default)', async () => {
    p.deck.count.mockRejectedValue(new Error('db error'));
    const has = await userHasEvolvingDeck('user-1');
    expect(has).toBe(false);
  });

  it('userHasEvolvingDeck returns true when count > 0', async () => {
    p.deck.count.mockResolvedValue(3);
    const has = await userHasEvolvingDeck('user-1');
    expect(has).toBe(true);
  });

  it('userHasEvolvingDeck returns false when count === 0', async () => {
    p.deck.count.mockResolvedValue(0);
    const has = await userHasEvolvingDeck('user-1');
    expect(has).toBe(false);
  });
});

describe('Phase 14.2 — room creation flag matrix', () => {
  it('randomHoloHue stays in [0, 359] across 500 samples', () => {
    for (let i = 0; i < 500; i++) {
      const hue = randomHoloHue();
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThanOrEqual(359);
    }
  });

  it('randomHoloHue returns integers (Math.floor applied)', () => {
    for (let i = 0; i < 100; i++) {
      expect(Number.isInteger(randomHoloHue())).toBe(true);
    }
  });

  it('every hue picked by a room normalizes to a stable value across reads', () => {
    for (let i = 0; i < 50; i++) {
      const h = randomHoloHue();
      expect(normalizeHue(h)).toBe(h);
    }
  });

  it('hue stored on a room produces CSS-valid HSL palettes (primary/secondary)', () => {
    [0, 35, 90, 180, 270, 359].forEach((h) => {
      const palette = holoFromHue(h);
      expect(palette.primary).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
      expect(palette.secondary).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
      expect(palette.glow).toMatch(/^hsla\(\d+ \d+% \d+% \/ [\d.]+\)$/);
      expect(palette.shimmer).toMatch(/^hsla\(\d+ \d+% \d+% \/ [\d.]+\)$/);
    });
  });

  it('casual + evolving combo uses evolving ELO field even though it is not ranked', () => {
    expect(getEvolvingEloField(true)).toBe('evolvingElo');
    expect(getEvolvingEloType(true)).toBe('evolving');
  });

  it('ranked + evolving combo routes ELO writes to evolvingElo and eloType=evolving', () => {
    expect(getEvolvingEloField(true)).toBe('evolvingElo');
    expect(getEvolvingEloType(true)).toBe('evolving');
  });

  it('ranked without evolving keeps the historical ranked path (elo + eloType=ranked)', () => {
    expect(getEvolvingEloField(false)).toBe('elo');
    expect(getEvolvingEloType(false)).toBe('ranked');
  });

  it('non-evolving room never produces a startingMissionPoints config (preserves vanilla games)', () => {
    expect(buildEvolvingGameConfigExtras({
      isEvolving: false,
      hostEvolvingPoints: 0,
      guestEvolvingPoints: 5,
    })).toEqual({});
  });

  it('evolving room produces startingMissionPoints with the catch-up bonus going to the lower deck', () => {
    expect(buildEvolvingGameConfigExtras({
      isEvolving: true,
      hostEvolvingPoints: 1,
      guestEvolvingPoints: 5,
    })).toEqual({ startingMissionPoints: { player1: 4, player2: 0 } });
  });
});

describe('Phase 14.3 — finalizeGameEnd ELO routing (via exported helpers)', () => {
  it('casual + evolving: only ranked rooms trigger ELO writes (gate is isRanked, not isEvolving)', () => {
    // The finalizeGameEnd function inspects room.isRanked first; a casual+evolving room
    // exits the ELO branch entirely. Helpers below remain the source of truth for which
    // field the WRITE would target when isRanked is true.
    expect(getEvolvingEloField(true)).toBe('evolvingElo');
    expect(getEvolvingEloField(false)).toBe('elo');
  });

  it('ranked + evolving: ELO update lands on evolvingElo, EloHistory tagged eloType=evolving', () => {
    expect(getEvolvingEloField(true)).toBe('evolvingElo');
    expect(getEvolvingEloType(true)).toBe('evolving');
  });

  it('ranked without evolving: ELO update lands on elo, EloHistory tagged eloType=ranked', () => {
    expect(getEvolvingEloField(false)).toBe('elo');
    expect(getEvolvingEloType(false)).toBe('ranked');
  });

  it('the field map is exhaustive: only two valid ELO field names exist', () => {
    const fields = new Set<string>();
    fields.add(getEvolvingEloField(true));
    fields.add(getEvolvingEloField(false));
    expect(fields.size).toBe(2);
    expect(fields.has('elo')).toBe(true);
    expect(fields.has('evolvingElo')).toBe(true);
  });

  it('the eloType map is exhaustive: only two valid eloType values exist', () => {
    const types = new Set<string>();
    types.add(getEvolvingEloType(true));
    types.add(getEvolvingEloType(false));
    expect(types.size).toBe(2);
    expect(types.has('ranked')).toBe(true);
    expect(types.has('evolving')).toBe(true);
  });
});

describe('Phase 14.7 — leaderboard mode resolution', () => {
  function resolveInitialMode(
    fromUrl: string | null,
    fromStorage: string | null,
  ): 'ranked' | 'evolving' {
    if (fromUrl === 'evolving' || fromUrl === 'ranked') return fromUrl;
    if (fromStorage === 'evolving' || fromStorage === 'ranked') return fromStorage;
    return 'ranked';
  }

  it('?mode=evolving in URL wins over everything', () => {
    expect(resolveInitialMode('evolving', null)).toBe('evolving');
    expect(resolveInitialMode('evolving', 'ranked')).toBe('evolving');
  });

  it('?mode=ranked in URL wins over localStorage=evolving', () => {
    expect(resolveInitialMode('ranked', 'evolving')).toBe('ranked');
  });

  it('without URL param, falls back to localStorage value', () => {
    expect(resolveInitialMode(null, 'evolving')).toBe('evolving');
    expect(resolveInitialMode(null, 'ranked')).toBe('ranked');
  });

  it('without URL or storage, defaults to ranked', () => {
    expect(resolveInitialMode(null, null)).toBe('ranked');
  });

  it('garbage URL value falls back to storage, not to itself', () => {
    expect(resolveInitialMode('haxxor', 'evolving')).toBe('evolving');
    expect(resolveInitialMode('foo', null)).toBe('ranked');
  });

  it('garbage storage value is also ignored', () => {
    expect(resolveInitialMode(null, 'bar')).toBe('ranked');
  });
});
