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

  it('ignores newly played characters (handled by the play pipeline)', () => {
    const prev = snap([]);
    const next = snap([char('new1')]);
    expect(buildMotionEventsFromSnaps(prev, next)).toEqual([]);
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
