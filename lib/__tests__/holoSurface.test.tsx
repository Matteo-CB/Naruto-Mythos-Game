// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/styles/holo-evolving.css', () => ({}));

import { HoloSurface } from '../../components/HoloSurface';

describe('HoloSurface', () => {
  it('renders children unwrapped when hue is null and no className/style', () => {
    const html = renderToStaticMarkup(
      React.createElement(HoloSurface, { hue: null }, 'child') as React.ReactElement,
    );
    expect(html).toBe('child');
  });

  it('renders children unwrapped when hue is undefined', () => {
    const html = renderToStaticMarkup(
      React.createElement(HoloSurface, { hue: undefined }, 'child') as React.ReactElement,
    );
    expect(html).toBe('child');
  });

  it('wraps in a plain div when hue is null but className is provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(HoloSurface, { hue: null, className: 'foo' }, 'child') as React.ReactElement,
    );
    expect(html).toContain('class="foo"');
    expect(html).toContain('child');
    expect(html).not.toContain('holo-evolving');
  });

  it('applies holo-evolving class when hue is a number', () => {
    const html = renderToStaticMarkup(
      React.createElement(HoloSurface, { hue: 180 }, 'child') as React.ReactElement,
    );
    expect(html).toContain('holo-evolving');
    expect(html).toContain('holo-evolving--normal');
    expect(html).toContain('--foil:hsl(180 78% 56%)');
    expect(html).toContain('data-holo-hue="180"');
  });

  it('maps intensity subtle to holo-evolving--subtle', () => {
    const html = renderToStaticMarkup(
      React.createElement(HoloSurface, { hue: 90, intensity: 'subtle' }, 'x') as React.ReactElement,
    );
    expect(html).toContain('holo-evolving--subtle');
    expect(html).not.toContain('holo-evolving--normal');
    expect(html).not.toContain('holo-evolving--strong');
  });

  it('maps intensity card to holo-evolving--normal', () => {
    const html = renderToStaticMarkup(
      React.createElement(HoloSurface, { hue: 90, intensity: 'card' }, 'x') as React.ReactElement,
    );
    expect(html).toContain('holo-evolving--normal');
    expect(html).not.toContain('holo-evolving--subtle');
    expect(html).not.toContain('holo-evolving--strong');
  });

  it('maps intensity banner to holo-evolving--strong', () => {
    const html = renderToStaticMarkup(
      React.createElement(HoloSurface, { hue: 90, intensity: 'banner' }, 'x') as React.ReactElement,
    );
    expect(html).toContain('holo-evolving--strong');
    expect(html).not.toContain('holo-evolving--subtle');
    expect(html).not.toContain('holo-evolving--normal');
  });

  it('adds holo-evolving--zero only when motion is active', () => {
    const idle = renderToStaticMarkup(
      React.createElement(HoloSurface, { hue: 0, motion: 'idle' }, 'x') as React.ReactElement,
    );
    expect(idle).not.toContain('holo-evolving--zero');

    const active = renderToStaticMarkup(
      React.createElement(HoloSurface, { hue: 0, motion: 'active' }, 'x') as React.ReactElement,
    );
    expect(active).toContain('holo-evolving--zero');
  });

  it('normalizes negative hue', () => {
    const html = renderToStaticMarkup(
      React.createElement(HoloSurface, { hue: -30 }, 'x') as React.ReactElement,
    );
    expect(html).toContain('--foil:hsl(330 78% 56%)');
    expect(html).toContain('data-holo-hue="330"');
  });

  it('normalizes hue over 360', () => {
    const html = renderToStaticMarkup(
      React.createElement(HoloSurface, { hue: 450 }, 'x') as React.ReactElement,
    );
    expect(html).toContain('--foil:hsl(90 78% 56%)');
  });

  it('preserves caller className alongside holo classes', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        HoloSurface,
        { hue: 180, className: 'rounded-lg overflow-hidden bg-black' },
        'x',
      ) as React.ReactElement,
    );
    expect(html).toContain('holo-evolving');
    expect(html).toContain('rounded-lg');
    expect(html).toContain('overflow-hidden');
    expect(html).toContain('bg-black');
  });

  it('preserves caller style alongside foil var', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        HoloSurface,
        { hue: 180, style: { borderRadius: 8, padding: 12 } },
        'x',
      ) as React.ReactElement,
    );
    expect(html).toContain('--foil:hsl(180 78% 56%)');
    expect(html).toMatch(/border-radius:\s*8px/);
    expect(html).toMatch(/padding:\s*12px/);
  });
});
