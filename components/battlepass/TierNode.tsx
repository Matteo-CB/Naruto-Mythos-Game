'use client';

import { motion } from 'framer-motion';
import { withImageVersion, portraitImagePath } from '@/lib/utils/imagePath';
import { getCardById } from '@/lib/data/cardIndex';
import { iconeDuPalier } from '@/lib/battlepass/iconesDePalier';

interface TierReward {
  type: 'booster' | 'card';
  setId: string;
  cardId?: string;
  boosterSetIds?: string[];
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

const ACCENT = 'var(--t-accent)';
const ACCENT_DIM = 'var(--t-accent-dim)';
const accentAlpha = (percent: number) => `color-mix(in srgb, var(--t-accent) ${percent}%, transparent)`;

function boosterImage(setId: string): string {
  return withImageVersion(`/images/booster-${setId}.webp`);
}

// L illustration d une carte vient de ses propres donnees: chaque rarete vit dans son
// dossier, donc un chemin devine a partir du set affiche une image manquante. La case du
// palier est debout, donc une carte couchee est servie dans sa version pivotee.
function rewardImage(reward: TierReward): { src: string; isCard: boolean } {
  if (reward.type === 'card' && reward.cardId) {
    const carte = getCardById(reward.cardId);
    const chemin = portraitImagePath(carte);
    if (chemin) return { src: chemin, isCard: true };
  }
  return { src: boosterImage(reward.setId), isCard: false };
}

function boostersDuPalier(reward: TierReward): string[] {
  if (reward.boosterSetIds && reward.boosterSetIds.length > 0) return reward.boosterSetIds;
  return reward.type === 'booster' ? [reward.setId] : [];
}

export function TierNode({ tier, xpRequired, reward, reached, isCurrent, fillRatio, onClaim, claimLabel, claiming }: TierNodeProps) {
  const img = rewardImage(reward);
  const isSpecial = reward.type === 'card';
  const boosters = boostersDuPalier(reward);
  const estDouble = !isSpecial && boosters.length > 1;
  const icone = iconeDuPalier(tier);

  return (
    <motion.div
      className="flex flex-col items-center"
      style={{ width: isSpecial ? 96 : estDouble ? 92 : 72 }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div
        className="text-xs font-display tracking-widest mb-1.5"
        style={{ color: reached ? ACCENT : 'var(--t-dim)', fontVariantNumeric: 'tabular-nums' }}
      >
        {tier}
      </div>

      <div
        className="relative"
        style={{
          width: isSpecial ? 96 : estDouble ? 92 : 72,
          height: isSpecial ? 132 : 100,
          overflow: isSpecial ? 'hidden' : 'visible',
          backgroundColor: isSpecial ? (reached ? 'var(--t-accent-tint)' : 'var(--t-surface)') : 'transparent',
          boxShadow: isSpecial
            ? (isCurrent
              ? `0 0 24px ${accentAlpha(40)}`
              : reached
                ? '0 0 8px var(--t-accent-glow)'
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
                ? `drop-shadow(0 0 14px ${accentAlpha(60)})`
                : reached
                  ? `drop-shadow(0 0 6px ${accentAlpha(33)})`
                  : 'none',
          }}
        >
          {estDouble ? (
            boosters.map((setId, rang) => {
              const devant = rang === boosters.length - 1;
              return (
                <img
                  key={setId}
                  src={boosterImage(setId)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="absolute inset-0 w-full h-full"
                  style={{
                    objectFit: 'contain',
                    opacity: reached ? 1 : 0.35,
                    filter: reached ? 'none' : 'grayscale(0.6) brightness(0.8)',
                    transform: devant
                      ? 'translate(-11%, 6%) scale(0.9)'
                      : 'translate(13%, -8%) rotate(14deg) scale(0.86)',
                    transformOrigin: 'center',
                    zIndex: devant ? 2 : 1,
                  }}
                />
              );
            })
          ) : (
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
          )}
        </motion.div>

        {icone && (
          <motion.img
            src={withImageVersion(icone)}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="absolute pointer-events-none"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: reached ? 1 : 0.45, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{
              width: '68%',
              height: '68%',
              left: '-14%',
              bottom: '-10%',
              objectFit: 'contain',
              filter: reached
                ? `drop-shadow(0 4px 10px var(--t-shadow)) drop-shadow(0 0 10px ${accentAlpha(45)})`
                : 'grayscale(0.6) brightness(0.8) drop-shadow(0 3px 8px var(--t-shadow))',
              zIndex: 3,
            }}
          />
        )}

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
            style={{ backgroundColor: 'var(--t-overlay)', color: ACCENT }}
          >
            ✓
          </div>
        )}
      </div>

      <div
        className="text-[10px] mt-1.5 tracking-widest font-display"
        style={{ color: reached ? 'var(--t-muted)' : 'var(--t-dim)', fontVariantNumeric: 'tabular-nums' }}
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
            backgroundColor: claiming ? 'var(--t-surface-2)' : ACCENT,
            color: claiming ? 'var(--t-muted)' : 'var(--t-bg)',
            cursor: claiming ? 'wait' : 'pointer',
          }}
          animate={claiming ? undefined : { boxShadow: [`0 0 6px ${accentAlpha(40)}`, `0 0 14px ${accentAlpha(67)}`, `0 0 6px ${accentAlpha(40)}`] }}
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
