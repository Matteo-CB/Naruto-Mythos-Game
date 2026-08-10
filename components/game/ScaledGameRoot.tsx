'use client';

import React, { useEffect, useState, type ReactNode } from 'react';
import { GameScaleContext, MOBILE_FIXED_DIMS } from './GameScaleContext';
import { readViewport, watchViewport } from '@/lib/ui/viewport';

const BASE_WIDTH = 1180;
const MIN_BASE_HEIGHT = 520;
const MAX_BASE_HEIGHT = 670;

interface Props {
  children: ReactNode;
}

interface Layout {
  scale: number;
  baseHeight: number;
  viewWidth: number;
  viewHeight: number;
}

export function computeLayout(w: number, h: number): Layout {
  const width = Math.max(1, w);
  const height = Math.max(1, h);
  const aspect = width / height;
  const targetHeight = Math.round(BASE_WIDTH / Math.max(aspect, BASE_WIDTH / MAX_BASE_HEIGHT));
  const baseHeight = Math.max(MIN_BASE_HEIGHT, Math.min(MAX_BASE_HEIGHT, targetHeight));
  const scale = Math.min(width / BASE_WIDTH, height / baseHeight);
  return { scale, baseHeight, viewWidth: width, viewHeight: height };
}

export function ScaledGameRoot({ children }: Props) {
  const [layout, setLayout] = useState<Layout>(() => {
    const view = readViewport();
    return computeLayout(view.width, view.height);
  });

  useEffect(() => watchViewport(() => {
    const view = readViewport();
    setLayout((current) => {
      const next = computeLayout(view.width, view.height);
      if (next.scale === current.scale
        && next.baseHeight === current.baseHeight
        && next.viewWidth === current.viewWidth
        && next.viewHeight === current.viewHeight) {
        return current;
      }
      return next;
    });
  }), []);

  const { scale, baseHeight, viewWidth, viewHeight } = layout;
  const scaledW = BASE_WIDTH * scale;
  const scaledH = baseHeight * scale;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: viewWidth,
        height: viewHeight,
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
