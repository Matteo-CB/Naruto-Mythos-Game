'use client';

import '@/styles/holo-foil.css';

type FoilIntensity = 'board' | 'preview' | 'strong';

interface HoloFoilOverlayProps {
  intensity?: FoilIntensity;
}

export function HoloFoilOverlay({ intensity = 'board' }: HoloFoilOverlayProps) {
  const modifier = intensity === 'preview' ? ' holo-foil--preview' : intensity === 'strong' ? ' holo-foil--strong' : '';
  return (
    <div aria-hidden className={`holo-foil${modifier}`}>
      <div className="holo-foil__rainbow" />
      <div className="holo-foil__sheen" />
    </div>
  );
}
