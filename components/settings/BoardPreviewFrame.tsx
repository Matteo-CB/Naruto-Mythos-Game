'use client';

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { GameScaleContext, MOBILE_FIXED_DIMS } from '@/components/game/GameScaleContext';

const BASE_WIDTH = 1180;
const BASE_HEIGHT = 620;
const MIN_SCALE = 0.42;

export function BoardPreviewFrame({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(MIN_SCALE);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const width = el.clientWidth;
      if (width > 0) setScale(Math.max(MIN_SCALE, width / BASE_WIDTH));
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scaledWidth = BASE_WIDTH * scale;
  const scaledHeight = BASE_HEIGHT * scale;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-x-auto overflow-y-hidden"
      style={{
        maxWidth: '100%',
        height: scaledHeight,
        backgroundColor: '#0a0a0a',
        boxShadow: '0 18px 44px rgba(0,0,0,0.55)',
        WebkitOverflowScrolling: 'touch',
        overscrollBehaviorX: 'contain',
      }}
    >
      <div style={{ width: scaledWidth, height: scaledHeight, position: 'relative' }}>
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
