'use client';

import { motion } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import { HoverShuriken, showShuriken, hideShuriken } from '@/components/HoverShuriken';
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

export type MenuVariant = 'muted' | 'primary' | 'gold';

const VARIANT: Record<MenuVariant, { idleBorder: string; hoverBorder: string; idleText: string; hoverText: string }> = {
  muted:   { idleBorder: 'var(--t-accent-surface-border)', hoverBorder: 'var(--t-accent-surface-border-strong)', idleText: 'var(--t-on-accent-surface-text)', hoverText: 'var(--t-on-accent-surface)' },
  primary: { idleBorder: 'var(--t-accent-surface-border)', hoverBorder: 'var(--t-accent-surface-border-strong)', idleText: 'var(--t-on-accent-surface)', hoverText: 'var(--t-on-accent-surface-strong)' },
  gold:    { idleBorder: 'var(--t-accent-surface-border)', hoverBorder: 'var(--t-accent-surface-border-strong)', idleText: 'var(--t-on-accent-surface)', hoverText: 'var(--t-on-accent-surface-strong)' },
};

interface Props {
  href: string;
  label: string;
  variant?: MenuVariant;
  delay?: number;
  rightSlot?: ReactNode;
  /** Decoration rendered inside the Link, to the left of the label */
  leftSlot?: ReactNode;
  /** Extra CSS class on the inner Link (used by the subtle holo sheen on tournaments) */
  innerClassName?: string;
  /** Extra inline style applied to the inner Link (used to inject CSS vars) */
  innerStyle?: Record<string, string>;
  /** When set, renders a logo image centered instead of the text label (label becomes the alt text) */
  image?: { src: string; height?: number };
}

export function HomeMenuButton({
  href,
  label,
  variant = 'muted',
  delay = 0,
  rightSlot,
  leftSlot,
  innerClassName = '',
  innerStyle,
  image,
}: Props) {
  const v = VARIANT[variant];

  const baseStyle: React.CSSProperties = {
    backgroundColor: 'var(--t-accent-surface)',
    backdropFilter: 'blur(3px)',
    WebkitBackdropFilter: 'blur(3px)',
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
          showShuriken(t, v.hoverText);
          t.style.transform = 'translateX(4px)';
          t.style.borderColor = v.hoverBorder;
          t.style.color = v.hoverText;
          t.style.backgroundColor = 'var(--t-accent-surface)';
        }}
        onMouseLeave={(e) => {
          const t = e.currentTarget as HTMLElement;
          hideShuriken(t, v.idleText);
          t.style.transform = 'translateX(0)';
          t.style.borderColor = v.idleBorder;
          t.style.color = v.idleText;
          t.style.backgroundColor = 'var(--t-accent-surface)';
        }}
      >
        {leftSlot ? (
          <span
            className="absolute z-10 flex items-center justify-center pointer-events-none"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
          >
            {leftSlot}
          </span>
        ) : (
          <HoverShuriken size={16} left={12} color={v.idleText} />
        )}
        {image ? (
          <img
            src={image.src}
            alt={label}
            className="relative z-10"
            style={{ height: image.height ?? 22, width: 'auto', opacity: 0.92 }}
          />
        ) : (
          <span className="font-display relative z-10 px-4">{label}</span>
        )}
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
