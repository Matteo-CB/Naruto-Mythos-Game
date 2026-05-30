import { describe, it, expect } from 'vitest';
import React from 'react';
import { LockedCardWrapper } from '@/components/cards/LockedCardWrapper';
import { LockBadge } from '@/components/badges/LockBadge';

interface ReactElementLike {
  type: unknown;
  props: { children?: unknown; style?: Record<string, unknown>; [k: string]: unknown };
}

function isElement(node: unknown): node is ReactElementLike {
  return typeof node === 'object' && node !== null && 'props' in node && 'type' in node;
}

function walk(node: unknown, visit: (n: ReactElementLike) => void): void {
  if (!isElement(node)) return;
  visit(node);
  const kids = node.props.children;
  if (Array.isArray(kids)) {
    for (const k of kids) walk(k, visit);
  } else if (kids !== undefined) {
    walk(kids, visit);
  }
}

function collectStrings(node: unknown, into: string[]): void {
  if (typeof node === 'string') {
    into.push(node);
    return;
  }
  if (!isElement(node)) return;
  const kids = node.props.children;
  if (Array.isArray(kids)) for (const k of kids) collectStrings(k, into);
  else if (kids !== undefined) collectStrings(kids, into);
}

describe('LockedCardWrapper preserves child content', () => {
  it('renders the children inside a brightness-reduced container', () => {
    const child = React.createElement('p', { className: 'effect-text' }, 'EFFECT: vaincre un personnage');
    const tree = LockedCardWrapper({ children: child });

    let foundChildContainer = false;
    let foundOurChild = false;
    walk(tree, (n) => {
      if (
        n.type === 'div' &&
        n.props.style &&
        typeof n.props.style.filter === 'string' &&
        (n.props.style.filter as string).includes('brightness(0.55)')
      ) {
        foundChildContainer = true;
        const inner = n.props.children;
        if (isElement(inner) && inner.props.className === 'effect-text') {
          foundOurChild = true;
        }
      }
    });
    expect(foundChildContainer).toBe(true);
    expect(foundOurChild).toBe(true);
  });

  it('never sets display:none or opacity:0 on the children container', () => {
    const child = React.createElement('span', null, 'visible text');
    const tree = LockedCardWrapper({ children: child });

    walk(tree, (n) => {
      const style = (n.props.style ?? {}) as Record<string, unknown>;
      expect(style.display).not.toBe('none');
      expect(style.visibility).not.toBe('hidden');
      expect(style.opacity === 0 || style.opacity === '0').toBe(false);
    });
  });

  it('renders the lock badge as a sibling of the brightness container', () => {
    const tree = LockedCardWrapper({ children: 'x', badgeLabel: 'Locked' });
    const topChildren = (tree as ReactElementLike).props.children;
    expect(Array.isArray(topChildren)).toBe(true);
    const arr = topChildren as ReactElementLike[];
    expect(arr).toHaveLength(2);
    expect(arr[1]?.type).toBe(LockBadge);
  });

  it('text inside children remains in the rendered tree (not stripped)', () => {
    const child = React.createElement('div', null,
      React.createElement('span', null, 'Effect line 1'),
      React.createElement('span', null, 'Effect line 2'),
    );
    const tree = LockedCardWrapper({ children: child });

    const strings: string[] = [];
    collectStrings(tree, strings);
    expect(strings).toContain('Effect line 1');
    expect(strings).toContain('Effect line 2');
  });

  it('passes badgeTooltip through to LockBadge', () => {
    const tree = LockedCardWrapper({
      children: 'x',
      badgeLabel: 'Locked',
      badgeTooltip: 'Verrouillée. Comment débloquer ?',
    });
    const arr = (tree as ReactElementLike).props.children as ReactElementLike[];
    const badge = arr[1];
    expect(badge.props.tooltip).toBe('Verrouillée. Comment débloquer ?');
  });
});

describe('LockBadge renders the key glyph', () => {
  it('returns a div tree with role=img and aria-label', () => {
    const tree = LockBadge({ label: 'Locked', tooltip: 'Tip' });
    expect((tree as ReactElementLike).type).toBe('div');
    expect((tree as ReactElementLike).props.role).toBe('img');
    expect((tree as ReactElementLike).props['aria-label']).toBe('Locked');
  });

  it('renders the tooltip element only when tooltip prop is set', () => {
    const withTooltip = LockBadge({ label: 'x', tooltip: 'Hi' });
    const withoutTooltip = LockBadge({ label: 'x' });

    const stringsWith: string[] = [];
    const stringsWithout: string[] = [];
    collectStrings(withTooltip, stringsWith);
    collectStrings(withoutTooltip, stringsWithout);
    expect(stringsWith).toContain('Hi');
    expect(stringsWithout).not.toContain('Hi');
  });
});
