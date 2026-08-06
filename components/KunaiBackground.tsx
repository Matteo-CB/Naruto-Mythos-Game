'use client';

import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const KUNAI_SRC = '/images/icons/kunai-mythos.webp';
const COUNT = 22;

function pseudo(seed: number, salt: number): number {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface Blade {
  left: number;
  top: number;
  size: number;
  rotate: number;
  opacity: number;
  duration: number;
  delay: number;
  driftX: number;
  driftY: number;
  spin: number;
  hue: number;
}

const BLADES: Blade[] = Array.from({ length: COUNT }, (_, i) => {
  const a = pseudo(i + 1, 1);
  const b = pseudo(i + 1, 2);
  const c = pseudo(i + 1, 3);
  const d = pseudo(i + 1, 4);
  const e = pseudo(i + 1, 5);
  return {
    left: a * 100,
    top: b * 100,
    size: 18 + c * 30,
    rotate: d * 360,
    opacity: 0.18 + e * 0.22,
    duration: 16 + a * 18,
    delay: -(b * 20),
    driftX: (c - 0.5) * 70,
    driftY: (d - 0.5) * 70,
    spin: (e - 0.5) * 40,
    hue: Math.round(a * 360),
  };
});

interface KunaiBackgroundProps {
  className?: string;
  animated?: boolean;
}

export const KunaiBackground = memo(function KunaiBackground({ className = '', animated = true }: KunaiBackgroundProps) {
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    if (!animated || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: no-preference)');
    const apply = () => setShouldAnimate(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [animated]);

  return (
    <div
      className={`fixed inset-0 pointer-events-none overflow-hidden ${className}`}
      style={{ zIndex: 0, backgroundColor: '#08080a' }}
      aria-hidden="true"
    >
      {BLADES.map((blade, i) => {
        const common = {
          position: 'absolute' as const,
          left: `${blade.left}%`,
          top: `${blade.top}%`,
          width: blade.size,
          height: blade.size * 2.66,
          backgroundImage: `url('${KUNAI_SRC}')`,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          opacity: blade.opacity,
          filter: `hue-rotate(${blade.hue}deg) saturate(2.6) brightness(1.5) drop-shadow(0 0 6px rgba(168, 230, 255, 0.45))`,
        };
        if (!shouldAnimate) {
          return <div key={i} style={{ ...common, transform: `rotate(${blade.rotate}deg)` }} />;
        }
        return (
          <motion.div
            key={i}
            style={common}
            initial={{ x: 0, y: 0, rotate: blade.rotate }}
            animate={{
              x: [0, blade.driftX, 0],
              y: [0, blade.driftY, 0],
              rotate: [blade.rotate, blade.rotate + blade.spin, blade.rotate],
              filter: [
                `hue-rotate(${blade.hue}deg) saturate(2.6) brightness(1.45) drop-shadow(0 0 6px rgba(168, 230, 255, 0.45))`,
                `hue-rotate(${blade.hue + 180}deg) saturate(3.2) brightness(1.9) drop-shadow(0 0 12px rgba(196, 163, 90, 0.55))`,
                `hue-rotate(${blade.hue + 360}deg) saturate(2.6) brightness(1.45) drop-shadow(0 0 6px rgba(168, 230, 255, 0.45))`,
              ],
            }}
            transition={{
              duration: blade.duration,
              delay: blade.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        );
      })}
    </div>
  );
});
