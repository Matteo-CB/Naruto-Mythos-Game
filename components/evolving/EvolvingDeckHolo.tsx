'use client';

import React from 'react';
import { decideHolo, type HoloIntensity } from '@/lib/evolving/holoDecision';
import '@/styles/holo-evolving.css';

interface EvolvingDeckHoloProps {
  points: number;
  enabled?: boolean;
  intensity?: HoloIntensity;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function EvolvingDeckHolo({
  points,
  enabled,
  intensity = 'normal',
  className,
  style,
  children,
}: EvolvingDeckHoloProps) {
  const decision = decideHolo({ points, enabled, intensity });

  if (!decision.active) {
    if (!className && !style) return <>{children}</>;
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  const cssVars = { '--foil': decision.color } as React.CSSProperties;
  const mergedStyle: React.CSSProperties = style ? { ...style, ...cssVars } : cssVars;
  const classes = [
    'holo-evolving',
    decision.intensityClass,
    decision.zeroPulse ? 'holo-evolving--zero' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} style={mergedStyle} data-evolving-bracket={decision.bracket}>
      {children}
    </div>
  );
}

export { decideHolo } from '@/lib/evolving/holoDecision';
export type { HoloIntensity } from '@/lib/evolving/holoDecision';
