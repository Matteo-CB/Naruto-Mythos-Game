'use client';

import { memo } from 'react';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { isLandscapeCard } from '@/lib/cards/orientation';
import type { CardData } from '@/lib/engine/types';

interface AttachmentStripProps {
  card: CardData;
  label: string;
  mine: boolean;
  index: number;
  glow: string;
  onClick: () => void;
  onHover?: (x: number, y: number) => void;
  onLeave?: () => void;
}

export const CHARACTER_VISIBLE_RATIO = 0.32;
export const MISSION_VISIBLE_RATIO = 0.4;
const CHARACTER_DRIFT_PCT = 9;
const MISSION_DRIFT_PCT = 12;
const FAN_PCT = 5;

export const AttachmentStrip = memo(function AttachmentStrip({
  card,
  label,
  mine,
  index,
  glow,
  onClick,
  onHover,
  onLeave,
}: AttachmentStripProps) {
  const onMission = isLandscapeCard(card);
  const towardsMe = mine ? 1 : -1;
  const fan = index * FAN_PCT;

  const shiftPct = (onMission ? MISSION_VISIBLE_RATIO : CHARACTER_VISIBLE_RATIO) * 100 + fan;

  const transform = onMission
    ? `translate(${towardsMe * MISSION_DRIFT_PCT}%, ${towardsMe * shiftPct}%) rotate(${mine ? 0 : 180}deg)`
    : `translate(${towardsMe * shiftPct}%, ${towardsMe * (CHARACTER_DRIFT_PCT + fan)}%) rotate(${mine ? 0 : 180}deg)`;

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseEnter={(e) => onHover?.(e.clientX, e.clientY)}
      onMouseLeave={onLeave}
      title={label}
      aria-label={label}
      style={{
        position: 'absolute',
        inset: 0,
        transform,
        transformOrigin: 'center',
        backgroundImage: card.image_file ? `url('${normalizeImagePath(card.image_file)}')` : undefined,
        backgroundColor: '#141414',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        borderRadius: '4px',
        boxShadow: `0 2px 10px rgba(0,0,0,0.8), 0 0 8px ${glow}`,
        cursor: 'pointer',
        zIndex: 0,
        pointerEvents: 'auto',
      }}
    />
  );
});
