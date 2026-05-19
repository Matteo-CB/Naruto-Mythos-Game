'use client';

import { motion } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import type { ReactNode } from 'react';

/**
 * Home menu button.
 *
 * Idle: rectangular, thin border, centered title.
 * Hover: subtle bg lift + border tones up + 4px slide right.
 *
 * No glow, no halo, no particles, no pulse, no underline draw.
 * The only flourish lives on the tournament button (subtle gold sheen) and is
 * opted into via `innerClassName`.
 */

export type MenuVariant = 'muted' | 'primary' | 'gold' | 'red' | 'blue';

const VARIANT: Record<MenuVariant, { idleBorder: string; hoverBorder: string; idleText: string; hoverText: string }> = {
  muted:   { idleBorder: '#262626', hoverBorder: '#3a3a3a', idleText: '#e0e0e0', hoverText: '#c4a35a' },
  primary: { idleBorder: '#5a4520', hoverBorder: '#c4a35a', idleText: '#c4a35a', hoverText: '#ffd966' },
  gold:    { idleBorder: '#5a4520', hoverBorder: '#c4a35a', idleText: '#c4a35a', hoverText: '#ffd966' },
  red:     { idleBorder: '#5a2828', hoverBorder: '#b33e3e', idleText: '#cc6666', hoverText: '#ffaaaa' },
  blue:    { idleBorder: '#1f3a6a', hoverBorder: '#3b82f6', idleText: '#7eb6ff', hoverText: '#bfd9ff' },
};

interface Props {
  href: string;
  label: string;
  variant?: MenuVariant;
  delay?: number;
  rightSlot?: ReactNode;
  /** Extra CSS class on the inner Link (used by the subtle holo sheen on tournaments) */
  innerClassName?: string;
  /** Extra inline style applied to the inner Link (used to inject CSS vars) */
  innerStyle?: Record<string, string>;
}

export function HomeMenuButton({
  href,
  label,
  variant = 'muted',
  delay = 0,
  rightSlot,
  innerClassName = '',
  innerStyle,
}: Props) {
  const v = VARIANT[variant];

  const baseStyle: React.CSSProperties = {
    backgroundColor: '#141414',
    border: `1px solid ${v.idleBorder}`,
    color: v.idleText,
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
      className="relative"
    >
      <Link
        href={href as Parameters<typeof Link>[0]['href']}
        className={`relative flex h-10 items-center justify-center text-sm font-semibold tracking-wide overflow-hidden transition-[transform,border-color,color,background-color] duration-200 sm:h-12 sm:text-base ${innerClassName}`}
        style={{ ...baseStyle, ...(innerStyle as React.CSSProperties | undefined) }}
        onMouseEnter={(e) => {
          const t = e.currentTarget as HTMLElement;
          t.style.transform = 'translateX(4px)';
          t.style.borderColor = v.hoverBorder;
          t.style.color = v.hoverText;
          t.style.backgroundColor = '#191919';
        }}
        onMouseLeave={(e) => {
          const t = e.currentTarget as HTMLElement;
          t.style.transform = 'translateX(0)';
          t.style.borderColor = v.idleBorder;
          t.style.color = v.idleText;
          t.style.backgroundColor = '#141414';
        }}
      >
        <span className="font-display relative z-10 px-4">{label}</span>
      </Link>

      {/* Right slot lives OUTSIDE the Link so it can poke past the button's
          top-right corner like a real notification badge, without being clipped
          by the Link's overflow-hidden (used to contain the holo sheen).
          Negative top + right makes it protrude both up and to the right. */}
      {rightSlot && (
        <span
          className="absolute z-20 pointer-events-none"
          style={{ top: '-10px', right: '-8px' }}
        >
          {rightSlot}
        </span>
      )}
    </motion.div>
  );
}
