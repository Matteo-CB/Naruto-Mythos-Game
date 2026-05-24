'use client';

import Image from 'next/image';

type Variant =
  | 'collection'
  | 'deck'
  | 'leaderboard'
  | 'playAI'
  | 'playOnline'
  | 'auth'
  | 'profile';

const CARD_SETS: Record<Variant, [string, string]> = {
  collection: [
    '/images/cards/KS/rare/KS-120-R.webp',
    '/images/cards/KS/secret/KS-136-S.webp',
  ],
  deck: [
    '/images/cards/KS/rare_art/KS-108-RA.webp',
    '/images/cards/KS/secret/KS-137-S.webp',
  ],
  leaderboard: [
    '/images/cards/KS/mythos/KS-143-M.webp',
    '/images/cards/KS/mythos/KS-144-M.webp',
  ],
  playAI: [
    '/images/cards/KS/secret/KS-136-S.webp',
    '/images/cards/KS/secret/KS-137-S.webp',
  ],
  playOnline: [
    '/images/cards/KS/mythos/KS-143-M.webp',
    '/images/cards/KS/rare_art/KS-108-RA.webp',
  ],
  auth: [
    '/images/cards/KS/secret/KS-133-S.webp',
    '/images/cards/KS/rare/KS-120-R.webp',
  ],
  profile: [
    '/images/cards/KS/mythos/KS-144-M.webp',
    '/images/cards/KS/secret/KS-135-S.webp',
  ],
};

interface Props {
  variant: Variant;
}

export function CardBackgroundDecor({ variant: _variant }: Props) {
  
  return null;
  const [left, right] = CARD_SETS[_variant];

  return (
    <div
      className="pointer-events-none fixed inset-0 hidden lg:block"
      style={{ zIndex: 1 }}
      aria-hidden="true"
    >
      
      <div
        className="absolute"
        style={{
          top: '10%',
          left: '2%',
          opacity: 0.12,
          transform: 'rotate(-8deg)',
        }}
      >
        <Image
          src={left}
          alt=""
          width={160}
          height={224}
          style={{ borderRadius: '8px' }}
          priority={false}
        />
      </div>

      <div
        className="absolute"
        style={{
          top: '10%',
          right: '2%',
          opacity: 0.12,
          transform: 'rotate(8deg)',
        }}
      >
        <Image
          src={right}
          alt=""
          width={160}
          height={224}
          style={{ borderRadius: '8px' }}
          priority={false}
        />
      </div>
    </div>
  );
}
