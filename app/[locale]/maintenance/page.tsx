'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { motion, useMotionValue, useAnimationFrame } from 'framer-motion';
import { useState, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';

const CAROUSEL_CARDS = [
  '/images/cards/KS/rare_art/KS-108-RA.webp',
  '/images/cards/KS/mythos/KS-143-M.webp',
  '/images/cards/KS/rare_art/KS-128-RA.webp',
  '/images/cards/KS/secret/KS-133-S.webp',
  '/images/cards/KS/rare_art/KS-120-RA.webp',
  '/images/cards/KS/mythos/KS-148-M.webp',
  '/images/cards/KS/rare_art/KS-107-RA.webp',
  '/images/cards/KS/secret/KS-136-S.webp',
  '/images/cards/KS/rare_art/KS-123-RA.webp',
  '/images/cards/KS/mythos/KS-144-M.webp',
  '/images/cards/KS/rare_art/KS-125-RA.webp',
  '/images/cards/KS/secret/KS-137-S.webp',
];

function useCarouselRadius() {
  const [radius, setRadius] = useState(340);

  useEffect(() => {
    function update() {
      const w = window.innerWidth;
      if (w < 640) setRadius(160);
      else if (w < 1024) setRadius(250);
      else setRadius(340);
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return radius;
}

function CardCarousel() {
  const rotation = useMotionValue(0);
  const radius = useCarouselRadius();
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useAnimationFrame((time) => {
    if (!prefersReducedMotion.current) {
      rotation.set((time / 1000) * 10.3); // ~35s per revolution
    }
  });

  const N = CAROUSEL_CARDS.length;
  const angle = 360 / N;

  // Responsive card size
  const [cardSize, setCardSize] = useState({ w: 160, h: 224 });
  useEffect(() => {
    function update() {
      const w = window.innerWidth;
      if (w < 640) setCardSize({ w: 100, h: 140 });
      else if (w < 1024) setCardSize({ w: 140, h: 196 });
      else setCardSize({ w: 160, h: 224 });
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div className="flex flex-col items-center mt-10">
      <div style={{ perspective: 1200, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <div style={{ transform: 'rotateX(-8deg)', transformStyle: 'preserve-3d' as const }}>
          <motion.div
            style={{
              rotateY: rotation,
              transformStyle: 'preserve-3d' as const,
              width: cardSize.w,
              height: cardSize.h,
              position: 'relative',
            }}
          >
            {CAROUSEL_CARDS.map((src, i) => (
              <div
                key={i}
                className="absolute rounded-lg overflow-hidden"
                style={{
                  width: cardSize.w,
                  height: cardSize.h,
                  transform: `rotateY(${i * angle}deg) translateZ(${radius}px)`,
                  backfaceVisibility: 'hidden',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.7), 0 0 12px rgba(196, 163, 90, 0.08)',
                  border: '1px solid rgba(196, 163, 90, 0.15)',
                }}
              >
                <Image
                  src={src}
                  alt=""
                  width={cardSize.w}
                  height={cardSize.h}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </div>
            ))}
          </motion.div>
        </div>
      </div>
      {/* Reflection */}
      <div
        className="relative pointer-events-none"
        style={{
          width: '60%',
          height: 50,
          marginTop: -10,
          background: 'radial-gradient(ellipse at center, rgba(196, 163, 90, 0.06) 0%, transparent 70%)',
        }}
      />
    </div>
  );
}

export default function MaintenancePage() {
  const t = useTranslations('maintenance');
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Poll the server to check if maintenance is over, redirect to home when it is
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (res.ok) {
          clearInterval(poll);
          router.push('/');
        }
      } catch {
        // Server still down, keep polling
      }
    }, 5000);
    return () => clearInterval(poll);
  }, [router]);

  const timerDisplay = useMemo(() => {
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [elapsed]);

  return (
    <div
      className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      <CloudBackground />
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center px-4 max-w-[600px] text-center">
        <h1
          className="font-display tracking-wider"
          style={{
            fontSize: 'clamp(2.2rem, 6vw, 3.5rem)',
            color: '#c4a35a',
            textShadow: '0 0 40px rgba(196, 163, 90, 0.3), 0 0 80px rgba(196, 163, 90, 0.1)',
            lineHeight: 1.1,
          }}
        >
          {t('title')}
        </h1>

        <p
          className="font-display uppercase mt-1"
          style={{
            fontSize: 'clamp(0.65rem, 2vw, 0.85rem)',
            color: '#888888',
            letterSpacing: '0.35em',
          }}
        >
          {t('subtitle')}
        </p>

        {/* Divider */}
        <div className="my-6" style={{ width: 120, height: 1, background: 'rgba(196, 163, 90, 0.1)' }} />

        <p
          className="font-body"
          style={{
            fontSize: 'clamp(0.9rem, 2.5vw, 1.05rem)',
            color: '#e0e0e0',
            lineHeight: 1.7,
            maxWidth: 480,
          }}
        >
          {t('message')}
        </p>

        {/* Timer */}
        <div className="mt-7 text-center">
          <p
            className="font-body uppercase"
            style={{ fontSize: '0.75rem', color: '#888888', letterSpacing: '0.2em' }}
          >
            {t('timerLabel')}
          </p>
          <p
            className="font-display mt-1"
            style={{
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              color: '#c4a35a',
              textShadow: '0 0 30px rgba(196, 163, 90, 0.3)',
              letterSpacing: '0.12em',
            }}
          >
            {timerDisplay}
          </p>
        </div>

        {/* Card carousel */}
        <CardCarousel />
      </div>

      {/* Status bar */}
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10"
        style={{ fontSize: '0.7rem', color: '#888888', letterSpacing: '0.05em' }}
      >
        <span
          className="block rounded-full"
          style={{
            width: 6,
            height: 6,
            background: '#b33e3e',
            animation: 'pulse-dot 2s ease-in-out infinite',
          }}
        />
        <span className="font-body">{t('statusOffline')}</span>
      </div>

      <style jsx>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
