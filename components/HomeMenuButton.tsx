'use client';

import { motion } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import type { ReactNode } from 'react';

/**
 * Home menu button — editorial "mission dossier" style.
 *
 * Layout: a 3-zone row.
 *   ┌────┬─────────────────────────────────┬───────┐
 *   │ Nº │  TITLE (display)                │ slot  │
 *   │    │  caption (one informative line) │       │
 *   └────┴─────────────────────────────────┴───────┘
 *
 * Idle: borderless, sits flush with the column. Caption muted.
 * Hover: a brush-ink underline draws under the title from left to right
 *        (SVG path with stroke-dashoffset transition), the caption brightens,
 *        the row shifts 4px to the right.
 *
 * No border, no glow, no particles.
 */

export type MenuVariant = 'muted' | 'primary' | 'gold' | 'red' | 'blue';

const VARIANT: Record<MenuVariant, { ink: string; title: string; titleHover: string; caption: string; captionHover: string; numberInk: string }> = {
  muted:   { ink: '#c4a35a', title: '#e0e0e0', titleHover: '#ffffff', caption: '#666666', captionHover: '#a0a0a0', numberInk: '#444444' },
  primary: { ink: '#c4a35a', title: '#c4a35a', titleHover: '#ffd966', caption: '#7a6438', captionHover: '#c4a35a', numberInk: '#7a6438' },
  gold:    { ink: '#c4a35a', title: '#c4a35a', titleHover: '#ffd966', caption: '#7a6438', captionHover: '#c4a35a', numberInk: '#7a6438' },
  red:     { ink: '#b33e3e', title: '#cc6666', titleHover: '#ffaaaa', caption: '#7a3838', captionHover: '#cc6666', numberInk: '#7a3838' },
  blue:    { ink: '#3b82f6', title: '#7eb6ff', titleHover: '#bfd9ff', caption: '#3a5a8a', captionHover: '#7eb6ff', numberInk: '#3a5a8a' },
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

interface Props {
  href: string;
  index: number;
  label: string;
  caption: string;
  variant?: MenuVariant;
  delay?: number;
  /** Optional rendered slot at the right edge — e.g. a kanji hanko stamp or a rank chip. */
  rightSlot?: ReactNode;
  /** When true the button uses an "active" treatment: the index gets a vermillion fill block. */
  active?: boolean;
}

/**
 * Brush-ink underline that appears beneath the title on hover.
 * Drawn as an SVG path, animated via stroke-dashoffset.
 */
function BrushUnderline({ color }: { color: string }) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute -bottom-0.5 left-0"
      width="100%"
      height="6"
      viewBox="0 0 200 6"
      preserveAspectRatio="none"
      style={{ opacity: 0, transition: 'opacity 0.3s' }}
      data-brush-underline
    >
      <path
        d="M 0 3 Q 30 1, 60 3 T 120 3 T 200 2"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
        strokeDasharray="220"
        strokeDashoffset="220"
        style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
        data-brush-path
      />
    </svg>
  );
}

export function HomeMenuButton({
  href,
  index,
  label,
  caption,
  variant = 'muted',
  delay = 0,
  rightSlot,
  active = false,
}: Props) {
  const v = VARIANT[variant];
  const numeral = ROMAN[index] ?? String(index + 1);

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.22, 0.61, 0.36, 1] }}
    >
      <Link
        href={href as Parameters<typeof Link>[0]['href']}
        className="group relative flex items-center gap-4 px-1 py-3 transition-[transform,background-color] duration-200 sm:gap-5 sm:py-3.5"
        style={{
          backgroundColor: 'transparent',
        }}
        onMouseEnter={(e) => {
          const root = e.currentTarget as HTMLElement;
          root.style.transform = 'translateX(4px)';
          // brush underline reveal
          const svg = root.querySelector('[data-brush-underline]') as SVGElement | null;
          const path = root.querySelector('[data-brush-path]') as SVGPathElement | null;
          if (svg) svg.style.opacity = '1';
          if (path) path.style.strokeDashoffset = '0';
        }}
        onMouseLeave={(e) => {
          const root = e.currentTarget as HTMLElement;
          root.style.transform = 'translateX(0)';
          const svg = root.querySelector('[data-brush-underline]') as SVGElement | null;
          const path = root.querySelector('[data-brush-path]') as SVGPathElement | null;
          if (svg) svg.style.opacity = '0';
          if (path) path.style.strokeDashoffset = '220';
        }}
      >
        {/* Numeral column — small Roman numeral as a low-key index */}
        <span
          aria-hidden
          className="flex flex-col items-center justify-center shrink-0 select-none"
          style={{
            width: '28px',
            color: active ? v.ink : v.numberInk,
            fontFamily: '"NJNaruto", "Noto Serif JP", serif',
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.05em',
            lineHeight: 1,
            transition: 'color 0.2s',
          }}
        >
          {/* Vermillion block behind the numeral when active — looks like a printer's mark */}
          {active && (
            <span
              aria-hidden
              className="absolute"
              style={{
                width: '3px',
                height: '32px',
                backgroundColor: v.ink,
                left: '0px',
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            />
          )}
          {numeral}
        </span>

        {/* Title + caption — main column */}
        <span className="flex flex-col items-start min-w-0 flex-1 relative">
          <span
            className="relative font-semibold tracking-wide"
            style={{
              color: v.title,
              fontSize: '14px',
              lineHeight: 1.2,
              transition: 'color 0.2s',
            }}
            data-title
          >
            <span className="block sm:hidden">{label}</span>
            <span className="hidden sm:block" style={{ fontSize: '15px' }}>{label}</span>
            <BrushUnderline color={v.ink} />
          </span>
          <span
            className="text-[10px] tracking-wider uppercase mt-1 truncate w-full"
            style={{
              color: v.caption,
              letterSpacing: '0.14em',
              transition: 'color 0.2s',
            }}
            data-caption
          >
            {caption}
          </span>
        </span>

        {/* Right slot — stamp / chip */}
        {rightSlot && (
          <span className="shrink-0 flex items-center justify-center" style={{ minWidth: '34px' }}>
            {rightSlot}
          </span>
        )}

        {/* Inner hover state for caption + title using CSS pseudo (handled via group hover) */}
        <style jsx>{`
          .group:hover [data-title] { color: ${v.titleHover}; }
          .group:hover [data-caption] { color: ${v.captionHover}; }
        `}</style>
      </Link>
    </motion.div>
  );
}

/**
 * Subtle hairline divider with a small brush-ink dot in the middle.
 * Used between menu entries to give the column an editorial rhythm.
 */
export function MenuHairline() {
  return (
    <div
      aria-hidden
      className="relative w-full"
      style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.04)' }}
    >
      <span
        className="absolute"
        style={{
          left: '50%',
          top: '50%',
          width: '4px',
          height: '4px',
          transform: 'translate(-50%, -50%) rotate(45deg)',
          backgroundColor: 'rgba(196, 163, 90, 0.18)',
        }}
      />
    </div>
  );
}
