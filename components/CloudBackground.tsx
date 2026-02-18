'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

const CLOUD_PLACEMENTS = [
  { src: '/images/icons/cloud-2.webp', x: '5%',  y: '3%',  size: 90,  rotation: -8,  opacity: 0.10, delay: 0 },
  { src: '/images/icons/cloud-5.webp', x: '75%', y: '2%',  size: 80,  rotation: 12,  opacity: 0.08, delay: 0.3 },
  { src: '/images/icons/cloud-6.webp', x: '40%', y: '8%',  size: 70,  rotation: -5,  opacity: 0.07, delay: 0.6 },
  { src: '/images/icons/cloud-2.webp', x: '88%', y: '15%', size: 65,  rotation: 15,  opacity: 0.09, delay: 0.2 },
  { src: '/images/icons/cloud-5.webp', x: '20%', y: '18%', size: 55,  rotation: -12, opacity: 0.06, delay: 0.5 },
  { src: '/images/icons/cloud-6.webp', x: '60%', y: '22%', size: 75,  rotation: 8,   opacity: 0.08, delay: 0.1 },
  { src: '/images/icons/cloud-5.webp', x: '92%', y: '32%', size: 60,  rotation: -15, opacity: 0.07, delay: 0.4 },
  { src: '/images/icons/cloud-2.webp', x: '8%',  y: '35%', size: 85,  rotation: 5,   opacity: 0.09, delay: 0.7 },
  { src: '/images/icons/cloud-6.webp', x: '50%', y: '38%', size: 50,  rotation: -10, opacity: 0.06, delay: 0.2 },
  { src: '/images/icons/cloud-5.webp', x: '70%', y: '48%', size: 70,  rotation: 18,  opacity: 0.08, delay: 0.3 },
  { src: '/images/icons/cloud-2.webp', x: '15%', y: '52%', size: 60,  rotation: -8,  opacity: 0.07, delay: 0.6 },
  { src: '/images/icons/cloud-6.webp', x: '85%', y: '55%', size: 55,  rotation: 10,  opacity: 0.06, delay: 0.1 },
  { src: '/images/icons/cloud-6.webp', x: '35%', y: '62%', size: 65,  rotation: -12, opacity: 0.08, delay: 0.5 },
  { src: '/images/icons/cloud-2.webp', x: '78%', y: '68%', size: 80,  rotation: 7,   opacity: 0.07, delay: 0.4 },
  { src: '/images/icons/cloud-5.webp', x: '3%',  y: '72%', size: 55,  rotation: -5,  opacity: 0.09, delay: 0.2 },
  { src: '/images/icons/cloud-5.webp', x: '55%', y: '78%', size: 60,  rotation: 15,  opacity: 0.07, delay: 0.3 },
  { src: '/images/icons/cloud-6.webp', x: '25%', y: '82%', size: 75,  rotation: -10, opacity: 0.08, delay: 0.7 },
  { src: '/images/icons/cloud-2.webp', x: '90%', y: '85%', size: 50,  rotation: 8,   opacity: 0.06, delay: 0.1 },
  { src: '/images/icons/cloud-6.webp', x: '45%', y: '92%', size: 70,  rotation: -7,  opacity: 0.07, delay: 0.5 },
  { src: '/images/icons/cloud-2.webp', x: '10%', y: '95%', size: 60,  rotation: 12,  opacity: 0.06, delay: 0.4 },
];

interface CloudBackgroundProps {
  className?: string;
  animated?: boolean;
}

export const CloudBackground = memo(function CloudBackground({ className = '', animated = true }: CloudBackgroundProps) {
  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      {CLOUD_PLACEMENTS.map((cloud, i) => {
        const floatDuration = 15 + (i % 5) * 4;
        const floatRange = 8 + (i % 3) * 4;
        const h = Math.round(cloud.size * 0.6);

        if (animated) {
          return (
            <motion.div
              key={i}
              className="absolute select-none"
              style={{
                left: cloud.x,
                top: cloud.y,
                width: cloud.size,
                height: h,
                opacity: cloud.opacity,
                transform: `rotate(${cloud.rotation}deg)`,
              }}
              animate={{
                y: [0, -floatRange, 0, floatRange * 0.5, 0],
                x: [0, floatRange * 0.3, 0, -floatRange * 0.3, 0],
              }}
              transition={{
                duration: floatDuration,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: cloud.delay * 3,
              }}
            >
              <Image
                src={cloud.src}
                alt=""
                width={cloud.size}
                height={h}
                loading="lazy"
                style={{ filter: 'saturate(0.7)' }}
              />
            </motion.div>
          );
        }

        return (
          <div
            key={i}
            className="absolute select-none"
            style={{
              left: cloud.x,
              top: cloud.y,
              width: cloud.size,
              height: h,
              opacity: cloud.opacity,
              transform: `rotate(${cloud.rotation}deg)`,
            }}
          >
            <Image
              src={cloud.src}
              alt=""
              width={cloud.size}
              height={h}
              loading="lazy"
              style={{ filter: 'saturate(0.7)' }}
            />
          </div>
        );
      })}
    </div>
  );
});
