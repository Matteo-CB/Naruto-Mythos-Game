'use client';

import { motion } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import type { ReactNode } from 'react';

/**
 * Home menu button.
 *
 * Idle: rectangular, thin border, centered title. No left stripe, no underline.
 * Hover: subtle bg lift + border tones up + 4px slide right.
 *
 * No glow, no halo, no particles, no pulse, no orbiting orbs, no underline draw.
 * The only flourish lives on the tournament button (holographic foil), wired by
 * passing extra classes/handlers through `wrapperClass`, `wrapperData`, and
 * `wrapperOnMouseMove`.
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
  /** Extra classes applied to the inner Link (use to opt-in to holo foil etc.) */
  innerClassName?: string;
  /** Extra data-* attributes applied to the inner Link */
  innerData?: Record<string, string | undefined>;
  /** Extra mouse-move handler used by holo foil to track cursor position */
  onMouseMoveExtra?: (e: React.MouseEvent<HTMLElement>) => void;
  /** Extra mouse-leave handler */
  onMouseLeaveExtra?: (e: React.MouseEvent<HTMLElement>) => void;
}

export function HomeMenuButton({
  href,
  label,
  variant = 'muted',
  delay = 0,
  rightSlot,
  innerClassName = '',
  innerData = {},
  onMouseMoveExtra,
  onMouseLeaveExtra,
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
        className={`relative flex h-10 items-center justify-center text-sm font-semibold tracking-wide overflow-hidden transition-[transform,border-color,color,background-color] duration-200 sm:h-12 sm:text-base ${innerClassName}`}
        style={{
          backgroundColor: '#141414',
          border: `1px solid ${v.idleBorder}`,
          color: v.idleText,
        }}
        {...Object.fromEntries(Object.entries(innerData).filter(([, val]) => val !== undefined))}
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
          onMouseLeaveExtra?.(e);
        }}
        onMouseMove={onMouseMoveExtra}
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
