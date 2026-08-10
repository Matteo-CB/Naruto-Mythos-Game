'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  stepPx?: number;
}

export function BoosterCarousel({ children, stepPx = 304 }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      if (ro) ro.disconnect();
    };
  }, [update]);

  const scrollDir = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * stepPx, behavior: 'smooth' });
  };

  return (
    <div className="relative">
      {canLeft && (
        <button
          type="button" onClick={() => scrollDir(-1)} aria-label="Previous"
          className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center cursor-pointer font-display text-base transition-colors hover:text-(--t-accent-bright)"
          style={{ backgroundColor: 'var(--t-overlay)', color: 'var(--t-accent)', borderRadius: 9999, boxShadow: '0 4px 14px var(--t-shadow)' }}
        >&lt;</button>
      )}
      {canRight && (
        <button
          type="button" onClick={() => scrollDir(1)} aria-label="Next"
          className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center cursor-pointer font-display text-base transition-colors hover:text-(--t-accent-bright)"
          style={{ backgroundColor: 'var(--t-overlay)', color: 'var(--t-accent)', borderRadius: 9999, boxShadow: '0 4px 14px var(--t-shadow)' }}
        >&gt;</button>
      )}
      <div
        ref={scrollRef}
        className="flex flex-row gap-4 sm:gap-6 overflow-x-auto scroll-smooth no-scrollbar pb-2 px-1"
        style={{ scrollSnapType: 'x mandatory', justifyContent: 'safe center' }}
      >
        {children}
      </div>
    </div>
  );
}
