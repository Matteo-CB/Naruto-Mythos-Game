'use client';

import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface CloudBackgroundProps {
  className?: string;
  animated?: boolean;
  image?: string;
}

export const CloudBackground = memo(function CloudBackground({ className = '', animated = true, image = '/bgmenu/bgmenu.webp' }: CloudBackgroundProps) {
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
      {shouldAnimate ? (
        <div
          className="absolute"
          style={{
            top: '-8%',
            left: '-8%',
            width: '116%',
            height: '116%',
            overflow: 'hidden',
          }}
        >
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${image})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(2px) saturate(0.8) brightness(0.45)',
              willChange: 'transform',
            }}
            animate={{
              x: [0, 20, -15, 10, -5, 0],
              y: [0, -12, 8, -18, 5, 0],
              scale: [1, 1.03, 1.01, 1.04, 1.02, 1],
            }}
            transition={{
              duration: 60,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </div>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${image})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(2px) saturate(0.8) brightness(0.45)',
          }}
        />
      )}

      <div
        className="absolute inset-0"
        style={{
          backgroundColor: 'rgba(6, 6, 10, 0.35)',
          mixBlendMode: 'multiply',
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 25% 15%, rgba(90, 60, 130, 0.08) 0%, transparent 55%), radial-gradient(ellipse at 75% 85%, rgba(50, 40, 90, 0.06) 0%, transparent 45%)',
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 20%, rgba(6, 6, 10, 0.5) 55%, rgba(6, 6, 10, 0.92) 100%)',
        }}
      />

      <div
        className="absolute inset-x-0 top-0 h-24"
        style={{ background: 'linear-gradient(to bottom, rgba(6, 6, 10, 0.9), transparent)' }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-24"
        style={{ background: 'linear-gradient(to top, rgba(6, 6, 10, 0.9), transparent)' }}
      />
    </div>
  );
});
