'use client';

import type { CSSProperties } from 'react';
import { isLandscapeCard, cardAspectRatio } from '@/lib/cards/orientation';
import { normalizeImagePath } from '@/lib/utils/imagePath';

type OrientableCard = { card_type?: string | null; image_file?: string | null; attach_to?: string | null };

export function isRotatedInPortraitSlot(card: OrientableCard | null | undefined): boolean {
  if (!card) return false;
  return isLandscapeCard(card as Parameters<typeof isLandscapeCard>[0]);
}

export { isLandscapeCard, cardAspectRatio };

interface CardArtProps {
  card: OrientableCard | null | undefined;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  fit?: 'cover' | 'contain';
  loading?: 'lazy' | 'eager';
}

export function CardArt({ card, alt = '', className = '', style, fit = 'cover', loading = 'lazy' }: CardArtProps) {
  const src = normalizeImagePath(card?.image_file ?? undefined);
  if (!src) return null;

  const rotated = isRotatedInPortraitSlot(card);

  if (!rotated) {
    return (
      <img
        src={src}
        alt={alt}
        aria-hidden={alt === '' ? true : undefined}
        loading={loading}
        decoding="async"
        draggable={false}
        className={`absolute inset-0 h-full w-full ${className}`}
        style={{ objectFit: fit, ...style }}
      />
    );
  }

  return (
    <span
      aria-hidden={alt === '' ? true : undefined}
      className={`absolute inset-0 block overflow-hidden ${className}`}
      style={{ containerType: 'size', ...style }}
    >
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        draggable={false}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '100cqh',
          height: '100cqw',
          objectFit: fit,
          transform: 'translate(-50%, -50%) rotate(90deg)',
        }}
      />
    </span>
  );
}

export const ROTATED_SLOT_STYLE: CSSProperties = { containerType: 'size' } as CSSProperties;

export const ROTATED_ART_STYLE: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  width: '100cqh',
  height: '100cqw',
  objectFit: 'cover',
  transform: 'translate(-50%, -50%) rotate(90deg)',
} as CSSProperties;

export function rotatedArtProps(card: OrientableCard | null | undefined): { slot: CSSProperties; art: CSSProperties } {
  if (!isRotatedInPortraitSlot(card)) return { slot: {}, art: {} };
  return { slot: ROTATED_SLOT_STYLE, art: ROTATED_ART_STYLE };
}
