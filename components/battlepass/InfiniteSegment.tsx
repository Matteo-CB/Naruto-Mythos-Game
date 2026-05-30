'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

interface InfiniteSegmentProps {
  setId: string;
  totalEarned: number;
  xpIntoCurrentStep: number;
  stepXp: number;
  xpToNext: number | null;
  active: boolean;
}

const ACCENT = '#c4a35a';

export function InfiniteSegment({
  setId,
  totalEarned,
  xpIntoCurrentStep,
  stepXp,
  xpToNext,
  active,
}: InfiniteSegmentProps) {
  const ratio = stepXp > 0 ? Math.min(1, Math.max(0, xpIntoCurrentStep / stepXp)) : 0;

  return (
    <div
      className="w-full p-4"
      style={{
        backgroundColor: '#0f0f0f',
        boxShadow: active ? `0 0 20px ${ACCENT}33` : 'none',
        opacity: active ? 1 : 0.6,
      }}
    >
      <div className="flex items-center gap-4">
        <div
          className="relative shrink-0 overflow-hidden"
          style={{ width: 72, height: 100 }}
        >
          <Image
            src={`/images/booster-${setId}.webp`}
            alt=""
            fill
            sizes="72px"
            style={{ objectFit: 'contain' }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between mb-1">
            <span className="flex items-center gap-1.5" style={{ color: ACCENT }}>
              <img src="/images/icons/infinity.svg" alt="" draggable={false} style={{ width: 16, height: 16, opacity: 0.85 }} />
            </span>
            <span className="text-[10px]" style={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>
              {totalEarned}
            </span>
          </div>

          <div className="w-full" style={{ height: 4, backgroundColor: '#1a1a1a' }}>
            <motion.div
              style={{ height: '100%', backgroundColor: ACCENT }}
              initial={{ width: 0 }}
              animate={{ width: `${ratio * 100}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>

          {active && xpToNext !== null && (
            <div className="text-[10px] mt-1.5" style={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>
              {xpToNext} XP
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
