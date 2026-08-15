'use client';

import { useMemo } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';

interface Couche {
  seed: number;
  frequence: string;
  frequenceFin: string;
  octaves: number;
  duree: number;
  echelle: number;
  opacite: number;
  derive: number;
  sens: number;
}

const COUCHES: Couche[] = [
  { seed: 11, frequence: '0.011 0.017', frequenceFin: '0.016 0.011', octaves: 5, duree: 23, echelle: 1.35, opacite: 0.96, derive: 9, sens: 1 },
  { seed: 47, frequence: '0.019 0.013', frequenceFin: '0.012 0.020', octaves: 4, duree: 17, echelle: 1.15, opacite: 0.78, derive: 13, sens: -1 },
  { seed: 83, frequence: '0.031 0.026', frequenceFin: '0.024 0.033', octaves: 3, duree: 11, echelle: 1.0, opacite: 0.52, derive: 18, sens: 1 },
];

export function FlashBombSmoke({ instanceId }: { instanceId: string }) {
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled);
  const base = useMemo(() => `fb-${instanceId.replace(/[^a-zA-Z0-9]/g, '')}`, [instanceId]);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: 6, borderRadius: 'inherit', backgroundColor: 'rgba(24,24,26,0.55)' }}
      aria-hidden
    >
      {COUCHES.map((couche, i) => (
        <svg
          key={couche.seed}
          className="absolute"
          style={{
            left: '-30%',
            top: '-30%',
            width: '160%',
            height: '160%',
            opacity: couche.opacite,
            transform: `scale(${couche.echelle})`,
            animation: animationsEnabled
              ? `fbDerive${i} ${couche.duree * 1.7}s ease-in-out infinite alternate`
              : undefined,
          }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            <filter id={`${base}-${i}`} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
              <feTurbulence
                type="fractalNoise"
                baseFrequency={couche.frequence}
                numOctaves={couche.octaves}
                seed={couche.seed}
                result="bruit"
              >
                {animationsEnabled && (
                  <animate
                    attributeName="baseFrequency"
                    dur={`${couche.duree}s`}
                    values={`${couche.frequence};${couche.frequenceFin};${couche.frequence}`}
                    repeatCount="indefinite"
                  />
                )}
              </feTurbulence>
              <feColorMatrix
                in="bruit"
                type="matrix"
                values="0 0 0 0 0.86
                        0 0 0 0 0.88
                        0 0 0 0 0.91
                        1.9 0 0 0 -0.42"
                result="voile"
              />
              <feGaussianBlur in="voile" stdDeviation="0.9" />
            </filter>
          </defs>
          <rect width="100" height="100" filter={`url(#${base}-${i})`} />
        </svg>
      ))}

      <style>{`
        @keyframes fbDerive0 {
          from { transform: scale(1.35) translate3d(-4%, 2%, 0); }
          to   { transform: scale(1.45) translate3d(5%, -3%, 0); }
        }
        @keyframes fbDerive1 {
          from { transform: scale(1.15) translate3d(6%, -2%, 0); }
          to   { transform: scale(1.25) translate3d(-6%, 3%, 0); }
        }
        @keyframes fbDerive2 {
          from { transform: scale(1) translate3d(-7%, -3%, 0); }
          to   { transform: scale(1.12) translate3d(7%, 4%, 0); }
        }
      `}</style>
    </div>
  );
}
