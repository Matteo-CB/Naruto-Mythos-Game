'use client';

import { motion } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import type { ReactNode } from 'react';

/**
 * Home menu button — close to the original rectangular look, refined.
 *
 * Layout: a centered-title row with a thin left accent stripe.
 * Optional rightSlot for an indicator (kanji stamp on the tournament button).
 *
 * Idle: rectangular, thin border. Centered title in display weight.
 * Hover: border lightens to gold, slight scale (1.02), small slide right (3px).
 *        A 1px accent line draws under the title from left to right (subtle, no shimmer).
 *
 * No glow, no halo, no particles, no orbiting orbs.
 */

export type MenuVariant = 'muted' | 'primary' | 'gold' | 'red' | 'blue';

const VARIANT: Record<MenuVariant, { idleBorder: string; hoverBorder: string; accent: string; idleText: string; hoverText: string }> = {
  muted:   { idleBorder: '#262626', hoverBorder: '#c4a35a', accent: '#c4a35a', idleText: '#e0e0e0', hoverText: '#c4a35a' },
  primary: { idleBorder: '#c4a35a', hoverBorder: '#ffd966', accent: '#c4a35a', idleText: '#c4a35a', hoverText: '#ffd966' },
  gold:    { idleBorder: '#c4a35a', hoverBorder: '#ffd966', accent: '#c4a35a', idleText: '#c4a35a', hoverText: '#ffd966' },
  red:     { idleBorder: '#b33e3e', hoverBorder: '#ff6666', accent: '#b33e3e', idleText: '#cc6666', hoverText: '#ffaaaa' },
  blue:    { idleBorder: '#3b82f6', hoverBorder: '#7eb6ff', accent: '#3b82f6', idleText: '#7eb6ff', hoverText: '#bfd9ff' },
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
          t.style.transform = 'translateX(3px) scale(1.02)';
          t.style.borderColor = v.hoverBorder;
          t.style.color = v.hoverText;
          t.style.backgroundColor = '#181818';
          const path = t.querySelector('[data-menu-underline-path]') as SVGPathElement | null;
          if (path) path.style.strokeDashoffset = '0';
        }}
        onMouseLeave={(e) => {
          const t = e.currentTarget as HTMLElement;
          t.style.transform = 'translateX(0) scale(1)';
          t.style.borderColor = v.idleBorder;
          t.style.color = v.idleText;
          t.style.backgroundColor = '#141414';
          const path = t.querySelector('[data-menu-underline-path]') as SVGPathElement | null;
          if (path) path.style.strokeDashoffset = '160';
        }}
      >
        {/* Left accent stripe (always present, color-coded by variant) */}
        <span
          aria-hidden
          className="absolute left-0 top-0 h-full"
          style={{
            width: '3px',
            backgroundColor: v.accent,
          }}
        />

        {/* Centered label */}
        <span className="relative z-10 px-4">{label}</span>

        {/* Subtle ink line that draws under the label on hover */}
        <svg
          aria-hidden
          className="pointer-events-none absolute"
          width="160"
          height="4"
          viewBox="0 0 160 4"
          preserveAspectRatio="none"
          style={{ bottom: '8px', left: '50%', transform: 'translateX(-50%)' }}
        >
          <path
            d="M 2 2 Q 40 1, 80 2 T 158 2"
            stroke={v.accent}
            strokeWidth="1"
            strokeLinecap="round"
            fill="none"
            strokeDasharray="160"
            strokeDashoffset="160"
            style={{ transition: 'stroke-dashoffset 0.45s ease-out' }}
            data-menu-underline-path
          />
        </svg>

        {/* Right slot (status indicator, e.g. tournament hanko stamp) */}
        {rightSlot && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center">
            {rightSlot}
          </span>
        )}
      </Link>
    </motion.div>
  );
}
