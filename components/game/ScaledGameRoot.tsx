'use client';

import React, { useEffect, useState, type ReactNode } from 'react';
import { GameScaleContext, MOBILE_FIXED_DIMS } from './GameScaleContext';

const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;

interface Props {
  children: ReactNode;
}

export function ScaledGameRoot({ children }: Props) {
  const [scale, setScale] = useState<number>(1);

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setScale(Math.min(w / BASE_WIDTH, h / BASE_HEIGHT));
    };

    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('orientationchange', compute);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('orientationchange', compute);
    };
  }, []);

  const scaledW = BASE_WIDTH * scale;
  const scaledH = BASE_HEIGHT * scale;

  return (
    <div
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
          width: scaledW,
          height: scaledH,
          position: 'relative',
          flexShrink: 0,
          backgroundColor: '#0a0a0a',
        }}
      >
        <div
          style={{
            width: BASE_WIDTH,
            height: BASE_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
            ['--game-board-w' as string]: `${BASE_WIDTH}px`,
            ['--game-board-h' as string]: `${BASE_HEIGHT}px`,
          } as React.CSSProperties}
        >
          <GameScaleContext.Provider value={MOBILE_FIXED_DIMS}>
            {children}
          </GameScaleContext.Provider>
        </div>
      </div>
    </div>
  );
}
