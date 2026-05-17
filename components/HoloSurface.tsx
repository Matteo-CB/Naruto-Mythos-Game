'use client';

import React from 'react';
import { normalizeHue } from '@/lib/utils/holoColor';
import '@/styles/holo-evolving.css';

export type HoloIntensity = 'subtle' | 'card' | 'banner';
export type HoloMotion = 'idle' | 'active';

interface HoloSurfaceProps {
  hue: number | null | undefined;
  intensity?: HoloIntensity;
  motion?: HoloMotion;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

const INTENSITY_TO_CSS: Record<HoloIntensity, string> = {
  subtle: 'holo-evolving--subtle',
  card: 'holo-evolving--normal',
  banner: 'holo-evolving--strong',
};

export function HoloSurface({
  hue,
  intensity = 'card',
  motion = 'idle',
  className,
  style,
  children,
}: HoloSurfaceProps) {
  if (hue == null) {
    if (!className && !style) return <>{children}</>;
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  const h = normalizeHue(hue);
  const foil = `hsl(${h} 78% 56%)`;
  const cssVars = { '--foil': foil } as React.CSSProperties;
  const mergedStyle: React.CSSProperties = style ? { ...style, ...cssVars } : cssVars;

  const classes = [
    'holo-evolving',
    INTENSITY_TO_CSS[intensity],
    motion === 'active' ? 'holo-evolving--zero' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} style={mergedStyle} data-holo-hue={h}>
      {children}
    </div>
  );
}
