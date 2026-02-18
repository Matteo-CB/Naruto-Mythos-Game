'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

interface OpponentHandProps {
  handSize: number;
}

function CardBack({ index, total }: { index: number; total: number }) {
  // Fan effect: spread cards with rotation around a central arc
  const midpoint = (total - 1) / 2;
  const offset = index - midpoint;
  const rotation = offset * 2; // degrees per card from center
  const translateX = offset * 18; // horizontal spacing
  const translateY = Math.abs(offset) * 1.2; // Slight arc at edges

  return (
    <motion.div
      initial={{ y: -100, opacity: 0 }}
      animate={{
        y: 0,
        opacity: 1,
        rotate: rotation,
        x: translateX,
      }}
      transition={{
        type: 'spring',
        stiffness: 200,
        damping: 20,
        delay: index * 0.05,
      }}
      className="absolute card-aspect no-select"
      style={{
        width: '44px',
        height: '62px',
        borderRadius: '5px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        transform: `translateY(${translateY}px)`,
        zIndex: index,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
        overflow: 'hidden',
      }}
    >
      <img
        src="/images/card-back.webp"
        alt=""
        draggable={false}
        className="w-full h-full object-cover"
      />
    </motion.div>
  );
}

export function OpponentHand({ handSize }: OpponentHandProps) {
  const t = useTranslations();
  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Hand size label */}
      <span
        className="text-[11px] tabular-nums"
        style={{ color: '#888888' }}
      >
        {t('game.board.opponentHandCount', { count: handSize })}
      </span>

      {/* Fanned card backs */}
      <div
        className="relative flex items-center justify-center"
        style={{ height: '56px', minWidth: '250px' }}
      >
        {Array.from({ length: handSize }).map((_, i) => (
          <CardBack key={i} index={i} total={handSize} />
        ))}
      </div>
    </div>
  );
}
