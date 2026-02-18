'use client';

import { useRef, useCallback, useState } from 'react';
import Image from 'next/image';
import '@/styles/holo-card.css';

interface Props {
  src: string;
  backSrc?: string;
  alt?: string;
  width?: number;
  height?: number;
  rarity?: 'common' | 'rare' | 'secret' | 'mythos';
}

export function HoloCard({
  src,
  backSrc = '/images/card-back.png',
  alt = '',
  width = 320,
  height = 448,
  rarity = 'rare',
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [interacting, setInteracting] = useState(false);
  const [flipped, setFlipped] = useState(false);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;

    const px = x / w;
    const py = y / h;

    const mx = (px * 100).toFixed(1) + '%';
    const my = (py * 100).toFixed(1) + '%';

    // Rotation: +-15deg based on cursor position
    const ry = ((px - 0.5) * 30).toFixed(2) + 'deg';
    const rx = ((0.5 - py) * 30).toFixed(2) + 'deg';

    // Position percentages for backgrounds
    const posx = (px * 100).toFixed(1) + '%';
    const posy = (py * 100).toFixed(1) + '%';

    // Hypotenuse from center (0 to ~0.7)
    const cx = px - 0.5;
    const cy = py - 0.5;
    const hyp = Math.sqrt(cx * cx + cy * cy).toFixed(3);

    el.style.setProperty('--card-mx', mx);
    el.style.setProperty('--card-my', my);
    el.style.setProperty('--card-rx', rx);
    el.style.setProperty('--card-ry', ry);
    el.style.setProperty('--card-posx', posx);
    el.style.setProperty('--card-posy', posy);
    el.style.setProperty('--card-hyp', hyp);
    el.style.setProperty('--card-o', '1');
  }, []);

  const handleMouseEnter = useCallback(() => {
    setInteracting(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;

    setInteracting(false);
    el.style.setProperty('--card-rx', '0deg');
    el.style.setProperty('--card-ry', '0deg');
    el.style.setProperty('--card-o', '0');
    el.style.setProperty('--card-hyp', '0');
  }, []);

  const handleClick = useCallback(() => {
    setFlipped((prev) => !prev);
  }, []);

  return (
    <div
      ref={cardRef}
      className={`holo-card ${interacting ? 'interacting' : ''} ${flipped ? 'holo-card--flipped' : ''}`}
      data-rarity={rarity}
      style={{ width, height }}
    >
      <div className="holo-card__translater">
        <div
          className="holo-card__rotator"
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        >
          <div className="holo-card__front">
            <Image
              src={src}
              alt={alt}
              width={width}
              height={height}
              priority
              draggable={false}
            />
          </div>
          <div className="holo-card__back">
            <Image
              src={backSrc}
              alt="Card back"
              width={width}
              height={height}
              draggable={false}
            />
          </div>
          <div className="holo-card__shine" />
          <div className="holo-card__glare" />
        </div>
      </div>
    </div>
  );
}
