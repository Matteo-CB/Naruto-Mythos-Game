'use client';

import { useEffect, useRef } from 'react';
import { TierNode } from './TierNode';

interface TierData {
  tier: number;
  xpRequired: number;
  reward: {
    type: 'booster' | 'card';
    setId: string;
    cardId?: string;
    cardOwned?: boolean;
    cardClaimable?: boolean;
  };
  reached: boolean;
}

interface BattlepassTrackProps {
  tiers: TierData[];
  currentTier: number;
  xpIntoCurrentTier: number;
  xpForNextTier: number | null;
  xpForCurrentTier: number;
  onClaim?: (tier: number) => void;
  claimLabel?: string;
  claimingTier?: number | null;
}

export function BattlepassTrack({
  tiers,
  currentTier,
  xpIntoCurrentTier,
  xpForNextTier,
  xpForCurrentTier,
  onClaim,
  claimLabel,
  claimingTier,
}: BattlepassTrackProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const currentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (currentRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const target = currentRef.current;
      const offset = target.offsetLeft - container.clientWidth / 2 + target.clientWidth / 2;
      container.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' });
    }
  }, [currentTier]);

  const fillRatio =
    xpForNextTier !== null && xpForNextTier > xpForCurrentTier
      ? xpIntoCurrentTier / (xpForNextTier - xpForCurrentTier)
      : 1;

  return (
    <div
      ref={scrollRef}
      className="w-full overflow-x-auto overflow-y-hidden"
      style={{ paddingBottom: 8 }}
    >
      <div className="flex items-end gap-3 px-4" style={{ minWidth: 'max-content' }}>
        {tiers.map((t) => {
          const isCurrent = t.tier === currentTier + 1;
          const wrapperRef = isCurrent ? currentRef : undefined;
          return (
            <div ref={wrapperRef} key={t.tier}>
              <TierNode
                tier={t.tier}
                xpRequired={t.xpRequired}
                reward={t.reward}
                reached={t.reached}
                isCurrent={isCurrent}
                fillRatio={isCurrent ? fillRatio : undefined}
                onClaim={onClaim}
                claimLabel={claimLabel}
                claiming={claimingTier === t.tier}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
