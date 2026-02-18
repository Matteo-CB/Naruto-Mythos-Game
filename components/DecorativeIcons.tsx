'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

const DECORATIVE_PLACEMENTS = [
  { src: '/images/icons/kunai.webp', x: '2%',  y: '15%', size: 35, rotation: 135, opacity: 0.06, floatDelay: 0 },
  { src: '/images/icons/kunai.webp', x: '95%', y: '60%', size: 30, rotation: -45, opacity: 0.05, floatDelay: 2 },
  { src: '/images/icons/kunai.webp', x: '88%', y: '25%', size: 28, rotation: 200, opacity: 0.04, floatDelay: 4 },
  { src: '/images/icons/shuriken.webp', x: '93%', y: '8%',  size: 40, rotation: 0,   opacity: 0.05, floatDelay: 1 },
  { src: '/images/icons/shuriken.webp', x: '5%',  y: '75%', size: 35, rotation: 22,  opacity: 0.04, floatDelay: 3 },
  { src: '/images/icons/shuriken.webp', x: '48%', y: '93%', size: 30, rotation: 45,  opacity: 0.03, floatDelay: 5 },
  { src: '/images/icons/scroll-kunai.webp', x: '3%',  y: '45%', size: 45, rotation: -30, opacity: 0.05, floatDelay: 1.5 },
  { src: '/images/icons/scroll-kunai.webp', x: '90%', y: '82%', size: 40, rotation: 150, opacity: 0.04, floatDelay: 3.5 },
  { src: '/images/icons/akatsuki-cloud.webp', x: '85%', y: '45%', size: 50, rotation: 5,  opacity: 0.04, floatDelay: 2.5 },
  { src: '/images/icons/akatsuki-cloud.webp', x: '8%',  y: '90%', size: 40, rotation: -5, opacity: 0.03, floatDelay: 4.5 },
];

interface DecorativeIconsProps {
  className?: string;
}

export const DecorativeIcons = memo(function DecorativeIcons({ className = '' }: DecorativeIconsProps) {
  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      {DECORATIVE_PLACEMENTS.map((item, i) => {
        const isShuriken = item.src.includes('shuriken');
        const spinDuration = 30 + (i % 4) * 10;
        const floatDuration = 20 + (i % 3) * 5;
        const floatRange = 6 + (i % 3) * 3;

        return (
          <motion.div
            key={i}
            className="absolute select-none"
            style={{
              left: item.x,
              top: item.y,
              width: item.size,
              height: item.size,
              opacity: item.opacity,
            }}
            animate={{
              y: [0, -floatRange, 0, floatRange * 0.6, 0],
              rotate: isShuriken
                ? [item.rotation, item.rotation + 360]
                : [item.rotation - 2, item.rotation + 2, item.rotation - 2],
            }}
            transition={{
              y: {
                duration: floatDuration,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: item.floatDelay,
              },
              rotate: isShuriken
                ? { duration: spinDuration, repeat: Infinity, ease: 'linear' }
                : { duration: 8, repeat: Infinity, ease: 'easeInOut', delay: item.floatDelay },
            }}
          >
            <Image
              src={item.src}
              alt=""
              width={item.size}
              height={item.size}
              loading="lazy"
              style={{ objectFit: 'contain' }}
            />
          </motion.div>
        );
      })}
    </div>
  );
});
