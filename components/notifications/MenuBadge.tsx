'use client';

import { motion, useReducedMotion } from 'framer-motion';

type Accent = 'gold' | 'cyan' | 'pink';

interface MenuBadgeProps {
  accent?: Accent;
  count?: number;
  tooltip?: string;
}

const COLOR: Record<Accent, string> = {
  gold: '#c4a35a',
  cyan: '#5fa3df',
  pink: '#f472b6',
};

export function MenuBadge({ accent = 'gold', count, tooltip }: MenuBadgeProps) {
  const color = COLOR[accent];
  const reduce = useReducedMotion();
  const label = typeof count === 'number' && count > 0 ? (count > 99 ? '99+' : String(count)) : '!';

  const baseStyle: React.CSSProperties = {
    fontFamily: 'Nevanta, system-ui, sans-serif',
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '0.01em',
    lineHeight: 1,
    color: '#0a0a0a',
    backgroundColor: color,
    borderRadius: '999px',
    height: '18px',
    minWidth: '18px',
    padding: '0 5px',
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  };

  if (reduce) {
    return (
      <span
        title={tooltip}
        className="select-none inline-flex items-center justify-center"
        style={{ ...baseStyle, boxShadow: `0 0 8px ${color}55` }}
      >
        {label}
      </span>
    );
  }

  return (
    <motion.span
      title={tooltip}
      className="select-none inline-flex items-center justify-center"
      style={baseStyle}
      animate={{ boxShadow: [`0 0 6px ${color}3a`, `0 0 12px ${color}77`, `0 0 6px ${color}3a`] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
    >
      {label}
    </motion.span>
  );
}
