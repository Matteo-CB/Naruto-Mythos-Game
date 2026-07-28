'use client';

import type { CSSProperties } from 'react';
import '@/styles/holo-foil.css';

type FoilIntensity = 'board' | 'preview' | 'strong';

interface HoloFoilOverlayProps {
  intensity?: FoilIntensity;
  imageUrl?: string | null;
  maskSize?: 'cover' | 'contain';
}

export function holoMaskStyle(imageUrl?: string | null, maskSize: 'cover' | 'contain' = 'cover'): CSSProperties {
  if (!imageUrl) return {};
  const url = `url("${imageUrl}")`;
  return {
    maskImage: url,
    WebkitMaskImage: url,
    maskSize,
    WebkitMaskSize: maskSize,
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
  } as CSSProperties;
}

export function HoloFoilOverlay({ intensity = 'board', imageUrl, maskSize = 'cover' }: HoloFoilOverlayProps) {
  const modifier = intensity === 'preview' ? ' holo-foil--preview' : intensity === 'strong' ? ' holo-foil--strong' : '';
  return (
    <div aria-hidden className={`holo-foil${modifier}`} style={holoMaskStyle(imageUrl, maskSize)}>
      <div className="holo-foil__rainbow" />
      <div className="holo-foil__sheen" />
    </div>
  );
}
