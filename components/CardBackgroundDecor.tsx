'use client';

import Image from 'next/image';

type Variant =
  | 'collection'
  | 'deck'
  | 'leaderboard'
  | 'learn'
  | 'quiz'
  | 'playAI'
  | 'playOnline'
  | 'auth'
  | 'profile';

const CARD_SETS: Record<Variant, [string, string]> = {
  collection: [
    '/images/rare/120-130_GAARA.webp',
    '/images/secret/136-130_SASUKE_UCHIWA.webp',
  ],
  deck: [
    '/images/rare_art/108-130_A_NARUTO_UZUMAKI.webp',
    '/images/secret/137-130_KAKASHI_HATAKE.webp',
  ],
  leaderboard: [
    '/images/mythos/143-130_ITACHI_UCHIWA.webp',
    '/images/mythos/144-130_KISAME_HOSHIGAKI.webp',
  ],
  learn: [
    '/images/rare/108-130_NARUTO_UZUMAKI.webp',
    '/images/secret/135-130_SAKURA_HARUNO.webp',
  ],
  quiz: [
    '/images/rare_art/120-130_A_GAARA.webp',
    '/images/secret/133-130_NARUTO_UZUMAKI.webp',
  ],
  playAI: [
    '/images/secret/136-130_SASUKE_UCHIWA.webp',
    '/images/secret/137-130_KAKASHI_HATAKE.webp',
  ],
  playOnline: [
    '/images/mythos/143-130_ITACHI_UCHIWA.webp',
    '/images/rare/108-130_NARUTO_UZUMAKI.webp',
  ],
  auth: [
    '/images/secret/133-130_NARUTO_UZUMAKI.webp',
    '/images/rare/120-130_GAARA.webp',
  ],
  profile: [
    '/images/mythos/144-130_KISAME_HOSHIGAKI.webp',
    '/images/secret/135-130_SAKURA_HARUNO.webp',
  ],
};

interface Props {
  variant: Variant;
}

export function CardBackgroundDecor({ variant }: Props) {
  const [left, right] = CARD_SETS[variant];

  return (
    <div
      className="pointer-events-none fixed inset-0 hidden lg:block"
      style={{ zIndex: 1 }}
      aria-hidden="true"
    >
      {/* Left card */}
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

      {/* Right card */}
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
