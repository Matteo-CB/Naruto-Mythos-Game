'use client';

import { motion } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import type { ReactNode } from 'react';

/**
 * Home menu button.
 *
 * Idle: rectangular, thin border, centered title. No left stripe, no accent.
 * Hover:
 *   - background lifts slightly (very subtle).
 *   - border tones to gold.
 *   - a thin hand-drawn brush stroke draws across, just below the title baseline.
 *   - the row glides 4px to the right.
 *
 * No glow, no halo, no particles, no pulse, no orbiting orbs, no sweep.
 * The only true flourish lives on the tournament button (hanko stamp), and is
 * animated once on first paint, then static.
 */

export type MenuVariant = 'muted' | 'primary' | 'gold' | 'red' | 'blue';

const VARIANT: Record<MenuVariant, { idleBorder: string; hoverBorder: string; ink: string; idleText: string; hoverText: string }> = {
  muted:   { idleBorder: '#262626', hoverBorder: '#3a3a3a', ink: '#c4a35a', idleText: '#e0e0e0', hoverText: '#c4a35a' },
  primary: { idleBorder: '#5a4520', hoverBorder: '#c4a35a', ink: '#c4a35a', idleText: '#c4a35a', hoverText: '#ffd966' },
  gold:    { idleBorder: '#5a4520', hoverBorder: '#c4a35a', ink: '#c4a35a', idleText: '#c4a35a', hoverText: '#ffd966' },
  red:     { idleBorder: '#5a2828', hoverBorder: '#b33e3e', ink: '#b33e3e', idleText: '#cc6666', hoverText: '#ffaaaa' },
  blue:    { idleBorder: '#1f3a6a', hoverBorder: '#3b82f6', ink: '#3b82f6', idleText: '#7eb6ff', hoverText: '#bfd9ff' },
};

interface Props {
  href: string;
  label: string;
  variant?: MenuVariant;
  delay?: number;
  rightSlot?: ReactNode;
}

export function HomeMenuButton({
  href,
  label,
  variant = 'muted',
  delay = 0,
  rightSlot,
}: Props) {
  const v = VARIANT[variant];

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
    >
      <Link
        href={href as Parameters<typeof Link>[0]['href']}
        className="group relative flex h-10 items-center justify-center text-sm font-semibold tracking-wide transition-[transform,border-color,color,background-color] duration-200 sm:h-12 sm:text-base"
        style={{
          backgroundColor: '#141414',
          border: `1px solid ${v.idleBorder}`,
          color: v.idleText,
        }}
        onMouseEnter={(e) => {
          const t = e.currentTarget as HTMLElement;
          t.style.transform = 'translateX(4px)';
          t.style.borderColor = v.hoverBorder;
          t.style.color = v.hoverText;
          t.style.backgroundColor = '#191919';
          const path = t.querySelector('[data-menu-underline-path]') as SVGPathElement | null;
          if (path) path.style.strokeDashoffset = '0';
        }}
        onMouseLeave={(e) => {
          const t = e.currentTarget as HTMLElement;
          t.style.transform = 'translateX(0)';
          t.style.borderColor = v.idleBorder;
          t.style.color = v.idleText;
          t.style.backgroundColor = '#141414';
          const path = t.querySelector('[data-menu-underline-path]') as SVGPathElement | null;
          if (path) path.style.strokeDashoffset = '180';
        }}
      >
        {/* Centered label */}
        <span className="relative z-10 px-4">{label}</span>

        {/* Hand-painted brush stroke that draws under the label on hover. */}
        <svg
          aria-hidden
          className="pointer-events-none absolute"
          width="180"
          height="6"
          viewBox="0 0 180 6"
          preserveAspectRatio="none"
          style={{ bottom: '7px', left: '50%', transform: 'translateX(-50%)' }}
        >
          <path
            d="M 4 3 Q 30 1, 60 3 Q 90 5, 120 3 Q 150 1, 176 3"
            stroke={v.ink}
            strokeWidth="1.2"
            strokeLinecap="round"
            fill="none"
            strokeDasharray="180"
            strokeDashoffset="180"
            style={{ transition: 'stroke-dashoffset 0.55s ease-out' }}
            data-menu-underline-path
          />
        </svg>

        {rightSlot && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center">
            {rightSlot}
          </span>
        )}
      </Link>
    </motion.div>
  );
}
