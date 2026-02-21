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
          const offset = (idx + 1) * 4;
          return (
            <div
              key={`stack-${idx}`}
              className={className}
              style={{
                position: 'absolute',
                top: `${offset}px`,
                left: `${offset}px`,
                zIndex: idx,
                opacity: 0.5 - idx * 0.12,
                filter: 'brightness(0.5)',
                pointerEvents: 'none',
                outline: '1px solid rgba(62, 139, 62, 0.3)',
                borderRadius: '4px',
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

      {/* Stack/upgrade count indicator */}
      {hasStack && (
        <div
          style={{
            position: 'absolute',
            top: '-5px',
            right: '-5px',
            zIndex: stackSize + 1,
            backgroundColor: 'rgba(62, 139, 62, 0.9)',
            border: '2px solid #5cb85c',
            borderRadius: '50%',
            width: '20px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 8px rgba(62, 139, 62, 0.4), 0 2px 4px rgba(0,0,0,0.5)',
          }}
        >
          <span
            style={{
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 700,
              lineHeight: 1,
              textShadow: '0 1px 2px rgba(0,0,0,0.3)',
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
