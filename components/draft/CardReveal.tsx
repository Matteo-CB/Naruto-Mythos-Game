'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { BoosterCard } from '@/lib/draft/boosterGenerator';
import { normalizeImagePath } from '@/lib/utils/imagePath';

interface CardRevealProps {
  card: BoosterCard;
  index: number;
  onRevealed: () => void;
  autoReveal?: boolean;
  delay?: number;
}

function getRarityGlow(rarity: string): { color: string; intensity: string; label: string } {
  switch (rarity) {
    case 'L':
      return { color: '#ffd700', intensity: '0 0 30px #ffd700, 0 0 60px #ffd700, 0 0 90px #ffd700', label: 'LEGENDARY' };
    case 'M':
    case 'MV':
      return { color: '#ff4444', intensity: '0 0 20px #ff4444, 0 0 40px #ff4444', label: 'MYTHOS' };
    case 'S':
    case 'SV':
      return { color: '#c4a35a', intensity: '0 0 20px #c4a35a, 0 0 40px #c4a35a', label: 'SECRET' };
    case 'RA':
      return { color: '#9b59b6', intensity: '0 0 15px #9b59b6, 0 0 30px #9b59b6', label: 'RARE ART' };
    case 'R':
      return { color: '#3498db', intensity: '0 0 12px #3498db, 0 0 25px #3498db', label: 'RARE' };
    case 'UC':
      return { color: '#2ecc71', intensity: '0 0 8px #2ecc71', label: 'UNCOMMON' };
    case 'MMS':
      return { color: '#e67e22', intensity: '0 0 10px #e67e22, 0 0 20px #e67e22', label: 'MISSION' };
    default:
      return { color: '#888888', intensity: '0 0 5px #88888840', label: 'COMMON' };
  }
}

function isHighRarity(rarity: string): boolean {
  return ['S', 'SV', 'M', 'MV', 'L'].includes(rarity);
}

export function CardReveal({ card, index, onRevealed, autoReveal = false, delay = 0 }: CardRevealProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const hasFlippedRef = useRef(false);
  const hasCalledRevealedRef = useRef(false);
  const imagePath = normalizeImagePath(card.image_file);
  const rarityInfo = getRarityGlow(card.rarity);
  const highRarity = isHighRarity(card.rarity);
  const isMission = card.card_type === 'mission';
  const cardWidth = isMission ? '168px' : '120px';
  const cardHeight = isMission ? '120px' : '168px';

  const handleFlip = useCallback(() => {
    if (hasFlippedRef.current) return;
    hasFlippedRef.current = true;
    setIsFlipped(true);

    const flipDuration = highRarity ? 800 : 500;
    setTimeout(() => {
      if (!hasCalledRevealedRef.current) {
        hasCalledRevealedRef.current = true;
        onRevealed();
      }
    }, flipDuration);
  }, [highRarity, onRevealed]);

  // Auto-reveal with staggered delay — useEffect ensures it runs only once
  useEffect(() => {
    if (!autoReveal || hasFlippedRef.current) return;
    const timer = setTimeout(() => {
      handleFlip();
    }, delay);
    return () => clearTimeout(timer);
  }, [autoReveal, delay, handleFlip]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.08, duration: 0.3, type: 'spring', stiffness: 200 }}
      className="relative cursor-pointer"
      style={{ perspective: '1000px', width: cardWidth, height: cardHeight }}
      onClick={handleFlip}
    >
      {/* 3D flip container */}
      <motion.div
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: highRarity ? 0.8 : 0.5, ease: 'easeInOut' }}
        style={{
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          position: 'relative',
        }}
      >
        {/* Card back */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            backfaceVisibility: 'hidden',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: '#111',
          }}
        >
          <img
            src="/images/card-back.webp"
            alt="Card back"
            style={{ width: '100%', height: '100%', objectFit: isMission ? 'contain' : 'cover' }}
          />
          {/* Tap hint shimmer */}
          {!isFlipped && !hasFlippedRef.current && (
            <motion.div
              className="absolute inset-0"
              animate={{ opacity: [0.05, 0.15, 0.05] }}
              transition={{ repeat: Infinity, duration: 2 }}
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}
            />
          )}
        </div>

        {/* Card front */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          {imagePath ? (
            <img
              src={imagePath}
              alt={card.name_fr}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ backgroundColor: '#1a1a1a' }}
            >
              <span className="text-xs text-center px-2" style={{ color: '#888888' }}>
                {card.name_fr}
              </span>
            </div>
          )}

          {/* Holo shimmer overlay */}
          {card.isHolo && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              animate={{ opacity: [0.05, 0.2, 0.05] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
              style={{
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
              }}
            />
          )}
        </div>
      </motion.div>

      {/* Rarity glow effect (only after flip) */}
      {isFlipped && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: '8px',
            boxShadow: rarityInfo.intensity,
          }}
        />
      )}

      {/* High rarity flash */}
      {isFlipped && highRarity && (
        <motion.div
          initial={{ opacity: 0.8, scale: 1 }}
          animate={{ opacity: 0, scale: 2 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: '8px',
            backgroundColor: rarityInfo.color,
          }}
        />
      )}

      {/* Rarity label */}
      {isFlipped && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.3 }}
          className="absolute -bottom-5 left-0 right-0 text-center"
        >
          <span
            className="text-[9px] font-bold uppercase tracking-wider"
            style={{ color: rarityInfo.color }}
          >
            {rarityInfo.label}
          </span>
        </motion.div>
      )}
    </motion.div>
  );
}
