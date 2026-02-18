'use client';

import { memo } from 'react';

// ---------------------
// Props
// ---------------------
export interface CardBackProps {
  className?: string;
}

// ---------------------
// Component: Hidden card back
// ---------------------
function CardBackInner({ className = '' }: CardBackProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg select-none ${className}`}
      style={{
        aspectRatio: '2.5 / 3.5',
        backgroundColor: '#1a1a1a',
      }}
    >
      {/* Textured pattern using repeating borders */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: '3px solid #222222',
          borderRadius: '8px',
        }}
      />

      {/* Inner frame */}
      <div
        style={{
          position: 'absolute',
          top: '6%',
          left: '6%',
          right: '6%',
          bottom: '6%',
          border: '1px solid #2a2a2a',
          borderRadius: '4px',
        }}
      />

      {/* Second inner frame for depth */}
      <div
        style={{
          position: 'absolute',
          top: '10%',
          left: '10%',
          right: '10%',
          bottom: '10%',
          border: '1px solid #252525',
          borderRadius: '3px',
        }}
      />

      {/* Texture dots pattern */}
      <div
        style={{
          position: 'absolute',
          inset: '12%',
          backgroundImage:
            'radial-gradient(circle, #222222 1px, transparent 1px)',
          backgroundSize: '8px 8px',
          opacity: 0.4,
        }}
      />

      {/* Center text: MYTHOS */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            backgroundColor: '#1a1a1a',
            padding: '6px 12px',
            borderRadius: '4px',
            border: '1px solid #2a2a2a',
          }}
        >
          <span
            style={{
              color: '#333333',
              fontSize: '0.7em',
              fontWeight: 700,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              userSelect: 'none',
            }}
          >
            MYTHOS
          </span>
        </div>
      </div>

      {/* Corner accents */}
      {/* Top-left */}
      <div
        style={{
          position: 'absolute',
          top: '8%',
          left: '8%',
          width: '10%',
          height: '10%',
          borderTop: '1px solid #333333',
          borderLeft: '1px solid #333333',
        }}
      />
      {/* Top-right */}
      <div
        style={{
          position: 'absolute',
          top: '8%',
          right: '8%',
          width: '10%',
          height: '10%',
          borderTop: '1px solid #333333',
          borderRight: '1px solid #333333',
        }}
      />
      {/* Bottom-left */}
      <div
        style={{
          position: 'absolute',
          bottom: '8%',
          left: '8%',
          width: '10%',
          height: '10%',
          borderBottom: '1px solid #333333',
          borderLeft: '1px solid #333333',
        }}
      />
      {/* Bottom-right */}
      <div
        style={{
          position: 'absolute',
          bottom: '8%',
          right: '8%',
          width: '10%',
          height: '10%',
          borderBottom: '1px solid #333333',
          borderRight: '1px solid #333333',
        }}
      />
    </div>
  );
}

const CardBack = memo(CardBackInner);
export default CardBack;
