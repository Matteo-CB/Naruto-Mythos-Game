import { describe, it, expect } from 'vitest';
import { buildMotionEventsFromSnaps, findRemovedHandIndex, type MotionSnap, type MotionCharSnap } from '@/lib/motion/motionDiff';

function char(id: string, over: Partial<MotionCharSnap> = {}): MotionCharSnap {
  return {
    instanceId: id,
    missionIndex: 0,
    side: 'me',
    isHidden: false,
    imageFile: `/img/${id}.webp`,
    powerTokens: 0,
    stackSize: 1,
    hasAmbush: false,
    ...over,
  };
}

function snap(chars: MotionCharSnap[], over: Partial<Omit<MotionSnap, 'chars'>> = {}): MotionSnap {
  return {
    chars: new Map(chars.map((c) => [c.instanceId, c])),
    discard: { me: 0, opp: 0 },
    edgeHolder: 'me',
    myHandCardIds: [],
    oppHandLen: 0,
    missions: [],
    ...over,
  };
}

describe('buildMotionEventsFromSnaps', () => {
  it('detects a reveal with ambush flag and image', () => {
    const prev = snap([char('a', { isHidden: true, imageFile: null })]);
    const next = snap([char('a', { isHidden: false, hasAmbush: true })]);
    const events = buildMotionEventsFromSnaps(prev, next);
    expect(events).toEqual([{
      type: 'card-reveal',
      data: { instanceId: 'a', missionIndex: 0, side: 'me', cardImage: '/img/a.webp', hasAmbush: true },
    }]);
  });

  it('detects a hide and carries the previous face image', () => {
    const prev = snap([char('a')]);
    const next = snap([char('a', { isHidden: true, imageFile: null })]);
    const events = buildMotionEventsFromSnaps(prev, next);
    expect(events[0].type).toBe('card-hide');
    expect(events[0].data.cardImage).toBe('/img/a.webp');
  });

  it('detects mission moves and side changes as relocations', () => {
    const prev = snap([char('a'), char('b', { side: 'opp', missionIndex: 1 })]);
    const next = snap([char('a', { missionIndex: 2 }), char('b', { side: 'me', missionIndex: 1 })]);
    const events = buildMotionEventsFromSnaps(prev, next);
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === 'card-relocate').length).toBe(2);
    const aMove = events.find((e) => e.data.instanceId === 'a')!;
    expect(aMove.data).toMatchObject({ fromMissionIndex: 0, missionIndex: 2, fromSide: 'me', side: 'me' });
    const bMove = events.find((e) => e.data.instanceId === 'b')!;
    expect(bMove.data).toMatchObject({ fromSide: 'opp', side: 'me' });
  });

  it('detects a defeat only when a discard pile grew, and picks the pile', () => {
    const prev = snap([char('a', { side: 'opp', missionIndex: 1 })]);
    const nextWithDiscard = snap([], { discard: { me: 0, opp: 1 } });
    const events = buildMotionEventsFromSnaps(prev, nextWithDiscard);
    expect(events).toEqual([{
      type: 'card-defeat',
      data: { instanceId: 'a', missionIndex: 1, side: 'opp', discardSide: 'opp', cardImage: '/img/a.webp', hidden: false },
    }]);

    const nextBounce = snap([]);
    expect(buildMotionEventsFromSnaps(prev, nextBounce)).toEqual([]);
  });

  it('emits one defeat event per card when several die simultaneously', () => {
    const prev = snap([
      char('a', { side: 'opp', missionIndex: 0 }),
      char('b', { side: 'opp', missionIndex: 2 }),
      char('c', { side: 'opp', missionIndex: 2, isHidden: true }),
    ]);
    const next = snap([], { discard: { me: 0, opp: 3 } });
    const events = buildMotionEventsFromSnaps(prev, next);
    expect(events.map((e) => e.type)).toEqual(['card-defeat', 'card-defeat', 'card-defeat']);
    expect(events.map((e) => e.data.instanceId).sort()).toEqual(['a', 'b', 'c']);
  });

  it('hidden defeated cards fly as card backs', () => {
    const prev = snap([char('a', { isHidden: true })]);
    const next = snap([], { discard: { me: 1, opp: 0 } });
    const events = buildMotionEventsFromSnaps(prev, next);
    expect(events[0].data.cardImage).toBe(null);
    expect(events[0].data.hidden).toBe(true);
  });

  it('detects an upgrade from stack growth with the removed hand index for me', () => {
    const prev = snap([char('a', { stackSize: 1 })], { myHandCardIds: ['x', 'y', 'z'] });
    const next = snap([char('a', { stackSize: 2, imageFile: '/img/new.webp' })], { myHandCardIds: ['x', 'z'] });
    const events = buildMotionEventsFromSnaps(prev, next);
    expect(events).toEqual([{
      type: 'card-upgrade',
      data: { instanceId: 'a', missionIndex: 0, side: 'me', cardImage: '/img/new.webp', cardIndex: 1 },
    }]);
  });

  it('detects edge transfers and token deltas', () => {
    const prev = snap([char('a', { powerTokens: 1 })], { edgeHolder: 'me' });
    const next = snap([char('a', { powerTokens: 3 })], { edgeHolder: 'opp' });
    const events = buildMotionEventsFromSnaps(prev, next);
    expect(events).toContainEqual({ type: 'power-token', data: { instanceId: 'a', missionIndex: 0, side: 'me', delta: 2 } });
    expect(events).toContainEqual({ type: 'edge-transfer', data: { to: 'opp' } });
  });

  it('emits card-play for new characters with the flight origin', () => {
    const fromHand = buildMotionEventsFromSnaps(
      snap([], { myHandCardIds: ['x', 'y'] }),
      snap([char('new1', { rarity: 'L', isSummon: false })], { myHandCardIds: ['y'] }),
    );
    expect(fromHand).toEqual([{
      type: 'card-play',
      data: {
        instanceId: 'new1', missionIndex: 0, side: 'me', cardImage: '/img/new1.webp',
        hidden: false, rarity: 'L', isSummon: false, origin: 'hand', cardIndex: 0,
      },
    }]);

    const fromDeck = buildMotionEventsFromSnaps(
      snap([], { myHandCardIds: ['x'] }),
      snap([char('summon1', { isSummon: true, rarity: 'R' })], { myHandCardIds: ['x'] }),
    );
    expect(fromDeck[0].data).toMatchObject({ origin: 'deck', isSummon: true, cardIndex: undefined });

    const oppFromDiscard = buildMotionEventsFromSnaps(
      snap([], { discard: { me: 0, opp: 2 }, oppHandLen: 4 }),
      snap([char('back1', { side: 'opp' })], { discard: { me: 0, opp: 1 }, oppHandLen: 4 }),
    );
    expect(oppFromDiscard[0].data).toMatchObject({ side: 'opp', origin: 'discard' });
  });

  it('hidden plays hide rarity and image', () => {
    const events = buildMotionEventsFromSnaps(
      snap([], { oppHandLen: 5 }),
      snap([char('h1', { side: 'opp', isHidden: true, rarity: 'L' })], { oppHandLen: 4 }),
    );
    expect(events[0].data).toMatchObject({ hidden: true, cardImage: null, rarity: undefined, origin: 'hand' });
  });

  it('caps event bursts and keeps the most important ones', () => {
    const prevChars = Array.from({ length: 12 }, (_, i) => char(`c${i}`, { powerTokens: 0 }));
    const nextChars = prevChars.map((c) => ({ ...c, powerTokens: 1 }));
    prevChars.push(char('victim'));
    const prev = snap(prevChars);
    const next = snap(nextChars, { discard: { me: 1, opp: 0 } });
    const events = buildMotionEventsFromSnaps(prev, next);
    expect(events.length).toBeLessThanOrEqual(8);
    expect(events[0].type).toBe('card-defeat');
  });
});

describe('findRemovedHandIndex', () => {
  it('finds the removed position', () => {
    expect(findRemovedHandIndex(['a', 'b', 'c'], ['a', 'c'])).toBe(1);
    expect(findRemovedHandIndex(['a', 'b', 'c'], ['b', 'c'])).toBe(0);
    expect(findRemovedHandIndex(['a', 'b', 'c'], ['a', 'b'])).toBe(2);
    expect(findRemovedHandIndex(['a', 'b'], ['a', 'b'])).toBeUndefined();
    expect(findRemovedHandIndex(['a'], ['a', 'b'])).toBeUndefined();
  });
});

describe('mission scoring detection', () => {
  const mission = (wonBy: 'me' | 'opp' | 'draw' | null, value = 4, powerMe = 6, powerOpp = 3) =>
    ({ wonBy, value, powerMe, powerOpp });

  it('emits no event when a mission gains a winner', () => {
    const prev = snap([char('victim')], { missions: [mission(null)] });
    const next = snap([], { missions: [mission('me')], discard: { me: 0, opp: 1 } });
    const events = buildMotionEventsFromSnaps(prev, next);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('card-defeat');
  });

  it('ignores draws, resets to null and multiple winners', () => {
    const prev = snap([], { missions: [mission('me'), mission(null), mission(null)] });
    const next = snap([], { missions: [mission(null), mission('draw'), mission('opp')] });
    expect(buildMotionEventsFromSnaps(prev, next)).toEqual([]);
  });
});
