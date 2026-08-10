'use client';

import type { CSSProperties } from 'react';

const BASE = '/images/rarity/';

const FILE_BY_FAMILY: Record<string, { file: string; ext: 'svg' | 'png' }> = {
  C: { file: 'common', ext: 'svg' },
  UC: { file: 'uncommon', ext: 'svg' },
  R: { file: 'rare', ext: 'svg' },
  RA: { file: 'rare-art', ext: 'svg' },
  S: { file: 'secret', ext: 'svg' },
  M: { file: 'mythos', ext: 'svg' },
  L: { file: 'legendary', ext: 'svg' },
  SP: { file: 'sp', ext: 'png' },
  POP: { file: 'pop', ext: 'png' },
  CHIBI: { file: 'chibi', ext: 'png' },
  SHINOBI: { file: 'shinobi', ext: 'png' },
};

export function rarityFamily(rarity: string): string {
  const code = (rarity ?? '').toUpperCase();
  if (code === 'RA') return 'RA';
  if (code.length > 1 && code.endsWith('V')) {
    const base = code.slice(0, -1);
    if (FILE_BY_FAMILY[base]) return base;
  }
  return code;
}

export function hasRarityIcon(rarity: string): boolean {
  return !!FILE_BY_FAMILY[rarityFamily(rarity)];
}

interface RarityIconProps {
  rarity: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function RarityIcon({ rarity, size = 16, className = '', style, title }: RarityIconProps) {
  const entry = FILE_BY_FAMILY[rarityFamily(rarity)];
  if (!entry) return null;

  const common: CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    verticalAlign: 'middle',
    ...style,
  };

  return (
    <span
      className={`rarity-icon ${className}`}
      style={{ display: 'inline-flex', lineHeight: 0, flexShrink: 0 }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <img src={`${BASE}${entry.file}-dark.${entry.ext}`} alt="" draggable={false} data-rarity-icon="dark" style={common} />
      <img src={`${BASE}${entry.file}.${entry.ext}`} alt="" draggable={false} data-rarity-icon="light" style={common} />
    </span>
  );
}
