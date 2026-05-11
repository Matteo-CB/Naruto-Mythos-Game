'use client';

import React, { useEffect, useState, type ReactNode } from 'react';
import { GameScaleContext, MOBILE_FIXED_DIMS } from './GameScaleContext';

const BASE_WIDTH = 1920;
const MIN_BASE_HEIGHT = 800;
const MAX_BASE_HEIGHT = 1080;

interface Props {
  children: ReactNode;
}

interface Layout {
  scale: number;
  baseHeight: number;
}

export function ScaledGameRoot({ children }: Props) {
  const [layout, setLayout] = useState<Layout>({ scale: 1, baseHeight: MAX_BASE_HEIGHT });

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const aspect = w / h;
      const targetHeight = Math.round(BASE_WIDTH / Math.max(aspect, BASE_WIDTH / MAX_BASE_HEIGHT));
      const baseHeight = Math.max(MIN_BASE_HEIGHT, Math.min(MAX_BASE_HEIGHT, targetHeight));
      const scale = Math.min(w / BASE_WIDTH, h / baseHeight);
      setLayout({ scale, baseHeight });
    };

    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('orientationchange', compute);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('orientationchange', compute);
    };
  }, []);

  const { scale, baseHeight } = layout;
  const scaledW = BASE_WIDTH * scale;
  const scaledH = baseHeight * scale;

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
            height: baseHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
            ['--game-board-w' as string]: `${BASE_WIDTH}px`,
            ['--game-board-h' as string]: `${baseHeight}px`,
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
