'use client';

import { memo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { CharacterCard } from '@/lib/engine/types';
import CardFace from './CardFace';

// ---------------------
// Props
// ---------------------
export interface CardInHandProps {
  card: CharacterCard;
  /** Whether this card is currently selected by the player */
  isSelected?: boolean;
  /** Whether the player can afford to play this card (based on chakra) */
  canAfford?: boolean;
  /** Whether it is currently this player's turn to act */
  isPlayable?: boolean;
  /** The chakra cost to display on the card badge */
  displayCost?: number;
  /** Called when the card is clicked */
  onClick?: (card: CharacterCard) => void;
  /** Called when mouse enters for preview purposes */
  onHoverStart?: (card: CharacterCard) => void;
  /** Called when mouse leaves */
  onHoverEnd?: () => void;
  /** Optional extra className for sizing */
  className?: string;
  /** Index in hand for staggered animations */
  index?: number;
}

// ---------------------
// Component
// ---------------------
function CardInHandInner({
  card,
  isSelected = false,
  canAfford = true,
  isPlayable = true,
  displayCost,
  onClick,
  onHoverStart,
  onHoverEnd,
  className = '',
  index = 0,
}: CardInHandProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = useCallback(() => {
    if (onClick && isPlayable) {
      onClick(card);
    }
  }, [onClick, card, isPlayable]);

  const handleHoverStart = useCallback(() => {
    setIsHovered(true);
    if (onHoverStart) {
      onHoverStart(card);
    }
  }, [onHoverStart, card]);

  const handleHoverEnd = useCallback(() => {
    setIsHovered(false);
    if (onHoverEnd) {
      onHoverEnd();
    }
  }, [onHoverEnd]);

  const effectiveCost = displayCost ?? card.chakra;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 40, scale: 0.9 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 25,
        delay: index * 0.05,
      }}
      whileHover={
        isPlayable
          ? {
              y: -20,
              scale: 1.05,
              zIndex: 50,
              transition: {
                type: 'spring',
                stiffness: 400,
                damping: 20,
              },
            }
          : undefined
      }
      onHoverStart={handleHoverStart}
      onHoverEnd={handleHoverEnd}
      onClick={handleClick}
      role={isPlayable ? 'button' : undefined}
      tabIndex={isPlayable ? 0 : undefined}
      onKeyDown={
        isPlayable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      style={{
        position: 'relative',
        cursor: isPlayable ? 'pointer' : 'default',
        zIndex: isHovered ? 50 : index,
        filter: !canAfford && isPlayable ? 'brightness(0.5)' : undefined,
      }}
    >
      {/* Selection highlight border */}
      <div
        className={className}
        style={{
          position: 'relative',
          borderRadius: '10px',
          border: isSelected
            ? '2px solid #eab308'
            : isHovered && isPlayable
              ? '2px solid rgba(234, 179, 8, 0.4)'
              : '2px solid transparent',
          transition: 'border-color 0.15s ease',
        }}
      >
        <CardFace card={card} />
      </div>

      {/* Chakra cost overlay badge (top-center, shown on hover when different from card cost) */}
      {displayCost !== undefined && displayCost !== card.chakra && (
        <div
          style={{
            position: 'absolute',
            top: '-6px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            backgroundColor: '#1e3a5f',
            border: '2px solid #2d5a8e',
            borderRadius: '10px',
            padding: '1px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              color: '#60a5fa',
              fontSize: '11px',
              fontWeight: 700,
            }}
          >
            Cost: {effectiveCost}
          </span>
        </div>
      )}

      {/* Cannot afford indicator */}
      {!canAfford && isPlayable && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 55,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              backgroundColor: 'rgba(0,0,0,0.7)',
              borderRadius: '4px',
              padding: '2px 8px',
            }}
          >
            <span
              style={{
                color: '#ef4444',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              Not enough chakra
            </span>
          </div>
        </div>
      )}

      {/* Selection glow effect */}
      {isSelected && (
        <div
          style={{
            position: 'absolute',
            inset: '-4px',
            borderRadius: '12px',
            border: '1px solid rgba(234, 179, 8, 0.3)',
            pointerEvents: 'none',
            zIndex: -1,
          }}
        />
      )}
    </motion.div>
  );
}

const CardInHand = memo(CardInHandInner);
export default CardInHand;
