import { describe, it, expect } from 'vitest';
import { pickInDirection, pickNearest, type FocusRect } from '@/lib/gamepad/spatial';

function box(x: number, y: number, w = 40, h = 20): FocusRect {
  return { left: x, top: y, right: x + w, bottom: y + h };
}

describe('gamepad spatial navigation', () => {
  const center = box(200, 200);
  const up = { id: 'up', rect: box(200, 100) };
  const down = { id: 'down', rect: box(200, 300) };
  const left = { id: 'left', rect: box(100, 200) };
  const right = { id: 'right', rect: box(300, 200) };
  const all = [up, down, left, right];

  it('picks the aligned neighbour in each direction', () => {
    expect(pickInDirection(center, all, 'up')?.id).toBe('up');
    expect(pickInDirection(center, all, 'down')?.id).toBe('down');
    expect(pickInDirection(center, all, 'left')?.id).toBe('left');
    expect(pickInDirection(center, all, 'right')?.id).toBe('right');
  });

  it('returns null when nothing lies in the requested direction', () => {
    expect(pickInDirection(center, [right], 'left')).toBeNull();
    expect(pickInDirection(center, [up], 'down')).toBeNull();
  });

  it('prefers a well-aligned target over a closer but off-axis one', () => {
    const aligned = { id: 'aligned', rect: box(200, 120) };
    const closerOffAxis = { id: 'off', rect: box(340, 150) };
    expect(pickInDirection(center, [aligned, closerOffAxis], 'up')?.id).toBe('aligned');
  });

  it('does not jump to a far off-axis element outside the cone', () => {
    const wayOff = { id: 'wayoff', rect: box(900, 190) };
    expect(pickInDirection(center, [wayOff], 'up')).toBeNull();
  });

  it('pickNearest returns the closest element to an origin', () => {
    const near = { id: 'near', rect: box(210, 210) };
    const far = { id: 'far', rect: box(800, 600) };
    expect(pickNearest({ x: 220, y: 220 }, [near, far])?.id).toBe('near');
  });
});
