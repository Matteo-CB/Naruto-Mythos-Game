'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { holoMaskStyle } from './HoloFoilOverlay';

type Intensity = 'subtle' | 'strong';

interface VariantHoloOverlayProps {
  intensity?: Intensity;
  imageUrl?: string | null;
  maskSize?: 'cover' | 'contain';
}

export function VariantHoloOverlay({ intensity = 'subtle', imageUrl, maskSize = 'cover' }: VariantHoloOverlayProps) {
  const reduceMotion = useReducedMotion();
  const alpha = intensity === 'strong' ? 0.14 : 0.08;
  const bandColor = `rgba(255,255,255,${alpha})`;

  if (reduceMotion) {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: `rgba(255,255,255,${alpha * 0.5})`,
          mixBlendMode: 'screen',
          ...holoMaskStyle(imageUrl, maskSize),
        }}
      />
    );
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ mixBlendMode: 'screen', ...holoMaskStyle(imageUrl, maskSize) }}
    >
      <motion.div
        initial={{ x: '-120%' }}
        animate={{ x: ['-120%', '220%'] }}
        transition={{
          duration: 5.5,
          repeat: Infinity,
          repeatDelay: 1.4,
          ease: 'linear',
        }}
        style={{
          position: 'absolute',
          top: '-25%',
          left: 0,
          width: '60%',
          height: '150%',
          backgroundColor: bandColor,
          transform: 'rotate(20deg)',
        }}
      />
    </div>
  );
}
