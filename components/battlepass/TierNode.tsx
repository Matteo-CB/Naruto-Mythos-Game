'use client';

import { motion } from 'framer-motion';
import { withImageVersion } from '@/lib/utils/imagePath';

interface TierReward {
  type: 'booster' | 'card';
  setId: string;
  cardId?: string;
  cardOwned?: boolean;
  cardClaimable?: boolean;
}

interface TierNodeProps {
  tier: number;
  xpRequired: number;
  reward: TierReward;
  reached: boolean;
  isCurrent: boolean;
  fillRatio?: number;
  onClaim?: (tier: number) => void;
  claimLabel?: string;
  claiming?: boolean;
}

const ACCENT = '#c4a35a';
const ACCENT_DIM = '#5a4a2e';

function rewardImage(reward: TierReward): { src: string; isCard: boolean } {
  if (reward.type === 'card' && reward.cardId) {
    return {
      src: withImageVersion(`/images/cards/${reward.setId}/mythos_v/${reward.cardId}.webp`),
      isCard: true,
    };
  }
  return {
    src: withImageVersion(`/images/booster-${reward.setId}.webp`),
    isCard: false,
  };
}

export function TierNode({ tier, xpRequired, reward, reached, isCurrent, fillRatio, onClaim, claimLabel, claiming }: TierNodeProps) {
  const img = rewardImage(reward);
  const isSpecial = reward.type === 'card';

  return (
    <motion.div
      className="flex flex-col items-center"
      style={{ width: isSpecial ? 96 : 72 }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div
        className="text-xs font-display tracking-widest mb-1.5"
        style={{ color: reached ? ACCENT : '#666', fontVariantNumeric: 'tabular-nums' }}
      >
        {tier}
      </div>

      <div
        className="relative"
        style={{
          width: isSpecial ? 96 : 72,
          height: isSpecial ? 132 : 100,
          overflow: isSpecial ? 'hidden' : 'visible',
          backgroundColor: isSpecial ? (reached ? `${ACCENT}1f` : '#141414') : 'transparent',
          boxShadow: isSpecial
            ? (isCurrent
              ? `0 0 24px ${ACCENT}66`
              : reached
                ? `0 0 8px ${ACCENT}22`
                : 'none')
            : 'none',
        }}
      >
        <motion.div
          className="absolute inset-0"
          animate={isCurrent && !isSpecial ? { opacity: [0.7, 1, 0.7] } : undefined}
          transition={isCurrent && !isSpecial ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : undefined}
          style={{
            filter: isSpecial
              ? 'none'
              : isCurrent
                ? `drop-shadow(0 0 14px ${ACCENT}99)`
                : reached
                  ? `drop-shadow(0 0 6px ${ACCENT}55)`
                  : 'none',
          }}
        >
          <img
            src={img.src}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="absolute inset-0 w-full h-full"
            style={{
              objectFit: img.isCard ? 'cover' : 'contain',
              opacity: reached ? 1 : 0.35,
              filter: reached ? 'none' : 'grayscale(0.6) brightness(0.8)',
            }}
          />
        </motion.div>

        {isSpecial && isCurrent && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ boxShadow: `inset 0 0 0 1.5px ${ACCENT}` }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        {reward.type === 'card' && reward.cardOwned && (
          <div
            className="absolute top-1 right-1 px-1 py-0.5 text-[8px] font-display tracking-widest"
            style={{ backgroundColor: '#000c', color: ACCENT }}
          >
            ✓
          </div>
        )}
      </div>

      <div
        className="text-[10px] mt-1.5 tracking-widest font-display"
        style={{ color: reached ? '#999' : '#555', fontVariantNumeric: 'tabular-nums' }}
      >
        {xpRequired}
      </div>

      {reward.cardClaimable && onClaim && (
        <motion.button
          type="button"
          onClick={() => onClaim(tier)}
          disabled={claiming}
          className="mt-1.5 px-2 py-1 text-[10px] tracking-widest font-display uppercase"
          style={{
            backgroundColor: claiming ? '#1a1a1a' : ACCENT,
            color: claiming ? '#888' : '#0a0a0a',
            cursor: claiming ? 'wait' : 'pointer',
          }}
          animate={claiming ? undefined : { boxShadow: [`0 0 6px ${ACCENT}66`, `0 0 14px ${ACCENT}aa`, `0 0 6px ${ACCENT}66`] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        >
          {claimLabel ?? 'Claim'}
        </motion.button>
      )}

      {isCurrent && typeof fillRatio === 'number' && (
        <div className="w-full mt-1" style={{ height: 2, backgroundColor: ACCENT_DIM }}>
          <motion.div
            style={{ height: '100%', backgroundColor: ACCENT }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, Math.max(0, fillRatio * 100))}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      )}
    </motion.div>
  );
}
