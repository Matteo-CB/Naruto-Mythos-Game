'use client';

import { motion } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import type { ReactNode } from 'react';

/**
 * Each variant gives the brushstroke + speed lines + accent text a different ink color.
 */
export type MenuVariant = 'muted' | 'primary' | 'gold' | 'red' | 'blue';

const VARIANT_COLORS: Record<MenuVariant, { ink: string; text: string; textHover: string; accent: string }> = {
  muted:   { ink: '#262626', text: '#e0e0e0', textHover: '#c4a35a', accent: '#c4a35a' },
  primary: { ink: '#c4a35a', text: '#c4a35a', textHover: '#ffd966', accent: '#c4a35a' },
  gold:    { ink: '#c4a35a', text: '#c4a35a', textHover: '#ffd966', accent: '#c4a35a' },
  red:     { ink: '#b33e3e', text: '#cc6666', textHover: '#ffaaaa', accent: '#b33e3e' },
  blue:    { ink: '#3b82f6', text: '#7eb6ff', textHover: '#bfd9ff', accent: '#3b82f6' },
};

interface Props {
  href: string;
  label: string;
  variant?: MenuVariant;
  delay?: number;
  /** Optional rendered slot at the right edge — e.g. a kanji hanko stamp. Static, no animation expected. */
  rightSlot?: ReactNode;
}

/**
 * Sumi-e style brushstroke as the left edge of the button.
 * The path is intentionally irregular — heavier in the middle, with a small split
 * near the bottom, mimicking how a real ink brush leaves the paper.
 */
function BrushEdge({ color }: { color: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 60"
      preserveAspectRatio="none"
      className="absolute left-0 top-0 h-full pointer-events-none"
      style={{ width: '12px' }}
    >
      <path
        d="
          M 5 1
          C 7 8, 4 14, 8 22
          C 10 30, 6 36, 9 44
          C 11 50, 7 54, 8 59
          L 0 59
          L 0 1
          Z
        "
        fill={color}
      />
      {/* Tiny ink fleck below the main stroke, for a hand-painted feel */}
      <ellipse cx="3" cy="56" rx="1.5" ry="0.6" fill={color} opacity="0.55" />
      <ellipse cx="6" cy="58" rx="0.8" ry="0.4" fill={color} opacity="0.4" />
    </svg>
  );
}

/**
 * Manga speed lines that appear on hover. Three angled, staggered strokes on the right side.
 * Subtle. Each line draws itself from right to left.
 */
function SpeedLines({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 right-0 overflow-hidden"
      style={{ width: '40%' }}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute"
          style={{
            right: '6%',
            top: `${28 + i * 22}%`,
            width: '60%',
            height: '1px',
            background: `linear-gradient(to left, ${color}, transparent)`,
            transformOrigin: 'right center',
            transform: 'skewX(-18deg)',
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.22, delay: i * 0.05, ease: 'easeOut' }}
        />
      ))}
    </span>
  );
}

export function HomeMenuButton({
  href,
  label,
  variant = 'muted',
  delay = 0,
  rightSlot,
}: Props) {
  const colors = VARIANT_COLORS[variant];

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
    >
      <Link
        href={href as Parameters<typeof Link>[0]['href']}
        className="group relative flex h-10 items-center justify-start text-sm font-semibold tracking-wide transition-colors sm:h-12 sm:text-base"
        style={{
          backgroundColor: '#141414',
          color: colors.text,
          paddingLeft: '24px',
          paddingRight: rightSlot ? '52px' : '20px',
          // No border. The brushstroke serves as the visual anchor.
          borderTop: '1px solid transparent',
          borderBottom: '1px solid #1a1a1a',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = colors.textHover;
          (e.currentTarget as HTMLElement).style.backgroundColor = '#181818';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = colors.text;
          (e.currentTarget as HTMLElement).style.backgroundColor = '#141414';
        }}
      >
        <BrushEdge color={colors.ink} />

        {/* Speed lines: only render on group-hover — wrapped in a CSS-only display gate */}
        <span className="hidden group-hover:inline">
          <SpeedLines color={colors.accent} />
        </span>

        <span className="relative z-10">{label}</span>

        {rightSlot && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 z-10">{rightSlot}</span>
        )}
      </Link>
    </motion.div>
  );
}
