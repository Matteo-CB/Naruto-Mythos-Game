'use client';

import { motion } from 'framer-motion';

// ---------------------
// Props
// ---------------------
export interface LessonBubbleProps {
  title: string;
  description: string;
  position: { top?: string; left?: string; right?: string; bottom?: string };
  arrowSide?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  image?: string;
}

// ---------------------
// Arrow size constants
// ---------------------
const ARROW_SIZE = 8;

// ---------------------
// Slide offset by arrow direction
// When the arrow is on the top, the bubble slides in from above (negative y)
// When the arrow is on the left, the bubble slides in from the left (negative x)
// ---------------------
function getSlideOffset(arrowSide: 'top' | 'bottom' | 'left' | 'right') {
  switch (arrowSide) {
    case 'top':
      return { x: 0, y: -12 };
    case 'bottom':
      return { x: 0, y: 12 };
    case 'left':
      return { x: -12, y: 0 };
    case 'right':
      return { x: 12, y: 0 };
  }
}

// ---------------------
// Arrow CSS styles using the border trick
// ---------------------
function getArrowStyles(side: 'top' | 'bottom' | 'left' | 'right'): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: 0,
    height: 0,
  };

  switch (side) {
    case 'top':
      return {
        ...base,
        top: -ARROW_SIZE,
        left: '50%',
        transform: 'translateX(-50%)',
        borderLeft: `${ARROW_SIZE}px solid transparent`,
        borderRight: `${ARROW_SIZE}px solid transparent`,
        borderBottom: `${ARROW_SIZE}px solid #c4a35a`,
      };
    case 'bottom':
      return {
        ...base,
        bottom: -ARROW_SIZE,
        left: '50%',
        transform: 'translateX(-50%)',
        borderLeft: `${ARROW_SIZE}px solid transparent`,
        borderRight: `${ARROW_SIZE}px solid transparent`,
        borderTop: `${ARROW_SIZE}px solid #c4a35a`,
      };
    case 'left':
      return {
        ...base,
        left: -ARROW_SIZE,
        top: '50%',
        transform: 'translateY(-50%)',
        borderTop: `${ARROW_SIZE}px solid transparent`,
        borderBottom: `${ARROW_SIZE}px solid transparent`,
        borderRight: `${ARROW_SIZE}px solid #c4a35a`,
      };
    case 'right':
      return {
        ...base,
        right: -ARROW_SIZE,
        top: '50%',
        transform: 'translateY(-50%)',
        borderTop: `${ARROW_SIZE}px solid transparent`,
        borderBottom: `${ARROW_SIZE}px solid transparent`,
        borderLeft: `${ARROW_SIZE}px solid #c4a35a`,
      };
  }
}

// ---------------------
// Component
// ---------------------
export function LessonBubble({
  title,
  description,
  position,
  arrowSide = 'left',
  delay = 0,
  image,
}: LessonBubbleProps) {
  const slideOffset = getSlideOffset(arrowSide);

  return (
    <motion.div
      initial={{ opacity: 0, x: slideOffset.x, y: slideOffset.y }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: slideOffset.x, y: slideOffset.y }}
      transition={{
        duration: 0.4,
        delay,
        ease: 'easeOut',
      }}
      style={{
        position: 'absolute',
        ...position,
        maxWidth: '320px',
        padding: '12px 16px',
        backgroundColor: 'rgba(10, 10, 14, 0.92)',
        border: '1px solid rgba(196, 163, 90, 0.3)',
        borderRadius: '8px',
        zIndex: 10,
      }}
    >
      {/* Arrow */}
      <div style={getArrowStyles(arrowSide)} />

      {/* Content */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        {/* Optional thumbnail */}
        {image && (
          <img
            src={image}
            alt=""
            draggable={false}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '6px',
              objectFit: 'cover',
              flexShrink: 0,
            }}
          />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title */}
          <div
            style={{
              color: '#c4a35a',
              fontSize: '0.8rem',
              fontWeight: 700,
              lineHeight: 1.3,
              marginBottom: '4px',
              letterSpacing: '0.02em',
            }}
          >
            {title}
          </div>

          {/* Description */}
          <div
            className="font-body"
            style={{
              color: '#cccccc',
              fontSize: '0.72rem',
              lineHeight: 1.45,
            }}
          >
            {description}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
