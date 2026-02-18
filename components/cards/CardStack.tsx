'use client';

import { memo } from 'react';
import type { CharacterCard, VisibleCharacter } from '@/lib/engine/types';
import CardFace from './CardFace';
import CardBack from './CardBack';

// ---------------------
// Props
// ---------------------
export interface CardStackProps {
  /** The visible character data from the game state */
  character: VisibleCharacter;
  /** Optional additional className for sizing */
  className?: string;
  /** Click handler for the stack */
  onClick?: () => void;
}

// ---------------------
// Component: Evolved card stack showing top card with offset hint of cards beneath
// ---------------------
function CardStackInner({ character, className = '', onClick }: CardStackProps) {
  const { isHidden, card, powerTokens, stackSize } = character;
  const hasStack = stackSize > 1;

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        position: 'relative',
        cursor: onClick ? 'pointer' : 'default',
        // Extra padding at bottom-right to accommodate stacked card offsets
        paddingBottom: hasStack ? '4px' : undefined,
        paddingRight: hasStack ? '4px' : undefined,
      }}
    >
      {/* Stacked card hints behind the top card */}
      {hasStack &&
        Array.from({ length: Math.min(stackSize - 1, 3) }).map((_, idx) => {
          const offset = (idx + 1) * 3;
          return (
            <div
              key={`stack-${idx}`}
              className={className}
              style={{
                position: 'absolute',
                top: `${offset}px`,
                left: `${offset}px`,
                zIndex: idx,
                opacity: 0.4 - idx * 0.1,
                filter: 'brightness(0.6)',
                pointerEvents: 'none',
              }}
            >
              <CardBack />
            </div>
          );
        })}

      {/* Top card */}
      <div
        className={className}
        style={{
          position: 'relative',
          zIndex: stackSize,
        }}
      >
        {isHidden || !card ? (
          <CardBack />
        ) : (
          <CardFace card={card} powerTokens={powerTokens} />
        )}
      </div>

      {/* Stack count indicator */}
      {hasStack && (
        <div
          style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            zIndex: stackSize + 1,
            backgroundColor: '#2a2a2a',
            border: '1px solid #444444',
            borderRadius: '50%',
            width: '18px',
            height: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              color: '#e0e0e0',
              fontSize: '10px',
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {stackSize}
          </span>
        </div>
      )}
    </div>
  );
}

const CardStack = memo(CardStackInner);
export default CardStack;
