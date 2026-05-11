'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;

export const SCALED_GAME_BASE_WIDTH = BASE_WIDTH;
export const SCALED_GAME_BASE_HEIGHT = BASE_HEIGHT;

interface Props {
  children: ReactNode;
}

export function ScaledGameRoot({ children }: Props) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState<number>(1);

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const sX = w / BASE_WIDTH;
      const sY = h / BASE_HEIGHT;
      setScale(Math.min(sX, sY));
    };

    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('orientationchange', compute);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('orientationchange', compute);
    };
  }, []);

  return (
    <div
      ref={outerRef}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#000',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: BASE_WIDTH,
          height: BASE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          position: 'relative',
          flexShrink: 0,
          backgroundColor: '#0a0a0a',
        }}
      >
        {children}
      </div>
    </div>
  );
}
