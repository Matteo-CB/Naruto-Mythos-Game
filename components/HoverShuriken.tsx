'use client';

import { PowerIcon } from '@/components/icons/GameIcons';

export const SHURIKEN_COLOR = 'var(--t-muted)';
export const SHURIKEN_GOLD = 'var(--t-accent)';
export const SHURIKEN_GOLD_BRIGHT = 'var(--t-accent-bright)';
export const SHURIKEN_WHITE = 'var(--t-text)';
export const SHURIKEN_WHITE_BRIGHT = 'var(--t-text-strong)';

const HIDDEN_TRANSFORM = 'translateY(-50%) rotate(-120deg) scale(0.4)';
const SHOWN_TRANSFORM = 'translateY(-50%) rotate(0deg) scale(1)';

function tint(glyph: HTMLElement, color?: string): void {
  if (!color) return;
  const inner = glyph.firstElementChild as HTMLElement | null;
  if (inner) inner.style.backgroundColor = color;
}

export function showShuriken(target: HTMLElement, hoverColor?: string): void {
  const glyph = target.querySelector<HTMLElement>('[data-shuriken]');
  if (!glyph) return;
  glyph.style.opacity = '1';
  glyph.style.transform = SHOWN_TRANSFORM;
  tint(glyph, hoverColor);
}

export function hideShuriken(target: HTMLElement, idleColor?: string): void {
  const glyph = target.querySelector<HTMLElement>('[data-shuriken]');
  if (!glyph) return;
  glyph.style.opacity = '0';
  glyph.style.transform = HIDDEN_TRANSFORM;
  tint(glyph, idleColor);
}

export function HoverShuriken({
  size = 14,
  left = 10,
  color = SHURIKEN_COLOR,
}: {
  size?: number;
  left?: number;
  color?: string;
}) {
  return (
    <span
      data-shuriken
      aria-hidden
      className="pointer-events-none absolute z-10"
      style={{
        position: 'absolute',
        zIndex: 3,
        left,
        top: '50%',
        lineHeight: 0,
        opacity: 0,
        transform: HIDDEN_TRANSFORM,
        transition: 'opacity 260ms ease, transform 420ms cubic-bezier(0.34, 1.4, 0.5, 1)',
      }}
    >
      <PowerIcon size={size} color={color} style={{ transition: 'background-color 260ms ease' }} />
    </span>
  );
}
