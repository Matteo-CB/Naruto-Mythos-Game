'use client';

import React, { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface CloudBackgroundProps {
  className?: string;
  animated?: boolean;
  image?: string;
}

export const CloudBackground = memo(function CloudBackground({ className = '', animated = true, image }: CloudBackgroundProps) {
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    if (!animated || typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px) and (prefers-reduced-motion: no-preference)');
    const apply = () => setShouldAnimate(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [animated]);

  return (
    <div
      className={`fixed inset-0 pointer-events-none overflow-hidden ${className}`}
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage: image ? `url(${image})` : 'var(--t-bg-pattern)',
          backgroundSize: 'auto',
          backgroundRepeat: 'repeat',
          backgroundPosition: 'center',
          filter: 'var(--t-bg-filter)',
        }}
        animate={shouldAnimate ? { opacity: [0.92, 1, 0.94, 1, 0.92] } : { opacity: 1 }}
        transition={{ duration: 60, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div
        className="absolute inset-0"
        style={{
          backgroundColor: 'var(--t-bg-veil)',
          mixBlendMode: 'var(--t-bg-blend)' as React.CSSProperties['mixBlendMode'],
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 25% 15%, var(--t-accent-tint) 0%, transparent 55%), radial-gradient(ellipse at 75% 85%, var(--t-accent-tint) 0%, transparent 45%)',
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 25%, var(--t-bg-vignette) 60%, var(--t-bg-vignette-edge) 100%)',
        }}
      />

      <div
        className="absolute inset-x-0 top-0 h-24"
        style={{ background: 'linear-gradient(to bottom, var(--t-bg-fade), transparent)' }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-24"
        style={{ background: 'linear-gradient(to top, var(--t-bg-fade), transparent)' }}
      />
    </div>
  );
});
