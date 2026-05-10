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
 * No glow, no halo, no particles, no pulse, no underline draw, no foil overlay.
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
        className="relative flex h-10 items-center justify-center text-sm font-semibold tracking-wide transition-[transform,border-color,color,background-color] duration-200 sm:h-12 sm:text-base"
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
        }}
        onMouseLeave={(e) => {
          const t = e.currentTarget as HTMLElement;
          t.style.transform = 'translateX(0)';
          t.style.borderColor = v.idleBorder;
          t.style.color = v.idleText;
          t.style.backgroundColor = '#141414';
        }}
      >
        <span className="relative z-10 px-4">{label}</span>

        {rightSlot && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center">
            {rightSlot}
          </span>
        )}
      </Link>
    </motion.div>
  );
}
