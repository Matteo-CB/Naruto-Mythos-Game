'use client';

import { memo, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { MissionCard, MissionRank, PlayerID, CardEffect } from '@/lib/engine/types';

// ---------------------
// Utility
// ---------------------
function normalizeImagePath(imageFile?: string): string | null {
  if (!imageFile) return null;
  const normalized = imageFile.replace(/\\/g, '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

const RANK_COLORS: Record<MissionRank, string> = {
  D: '#6b7280',   // gray
  C: '#22c55e',   // green
  B: '#3b82f6',   // blue
  A: '#eab308',   // gold
};

const EFFECT_TYPE_COLORS: Record<string, string> = {
  MAIN: '#60a5fa',
  UPGRADE: '#a78bfa',
  AMBUSH: '#f97316',
  SCORE: '#eab308',
};

// ---------------------
// Props
// ---------------------
export interface MissionCardProps {
  card: MissionCard;
  rank: MissionRank;
  rankBonus: number;
  wonBy?: PlayerID | null;
  className?: string;
  onClick?: () => void;
  highlight?: boolean;
}

// ---------------------
// Component
// ---------------------
function MissionCardInner({
  card,
  rank,
  rankBonus,
  wonBy,
  className = '',
  onClick,
  highlight = false,
}: MissionCardProps) {
  const t = useTranslations();
  const imageSrc = useMemo(() => normalizeImagePath(card.image_file), [card.image_file]);
  const totalPoints = card.basePoints + rankBonus;
  const hasImage = card.has_visual && imageSrc;

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
      className={`relative overflow-hidden rounded-lg select-none ${className}`}
      style={{
        aspectRatio: '3.5 / 2.5',
        backgroundColor: '#141414',
        border: highlight
          ? '2px solid #eab308'
          : wonBy
            ? '2px solid #22c55e'
            : '1px solid #2a2a2a',
        cursor: onClick ? 'pointer' : 'default',
        opacity: wonBy ? 0.85 : 1,
      }}
    >
      {/* Card art background */}
      {hasImage ? (
        <img
          src={imageSrc}
          alt={card.name_fr}
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: wonBy ? 0.6 : 1,
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#1a1a1a',
          }}
        />
      )}

      {/* Dark overlay for text readability */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.45)',
          pointerEvents: 'none',
        }}
      />

      {/* Rank badge (top-left) */}
      <div
        style={{
          position: 'absolute',
          top: '6%',
          left: '6%',
          width: '22%',
          height: 0,
          paddingBottom: '22%',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '4px',
            backgroundColor: RANK_COLORS[rank],
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              color: '#0a0a0a',
              fontWeight: 800,
              fontSize: '0.9em',
              lineHeight: 1,
            }}
          >
            {rank}
          </span>
        </div>
      </div>

      {/* Points display (top-right) */}
      <div
        style={{
          position: 'absolute',
          top: '6%',
          right: '6%',
          backgroundColor: 'rgba(0,0,0,0.7)',
          borderRadius: '4px',
          padding: '3px 8px',
          border: '1px solid #333333',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '3px',
          }}
        >
          <span
            style={{
              color: '#e0e0e0',
              fontWeight: 700,
              fontSize: '0.8em',
            }}
          >
            {totalPoints}
          </span>
          <span
            style={{
              color: '#666666',
              fontSize: '0.5em',
            }}
          >
            pts
          </span>
        </div>
        <div
          style={{
            color: '#666666',
            fontSize: '0.4em',
            textAlign: 'center',
          }}
        >
          {card.basePoints}+{rankBonus}
        </div>
      </div>

      {/* Mission name (center/bottom area) */}
      <div
        style={{
          position: 'absolute',
          bottom: '25%',
          left: '6%',
          right: '6%',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            color: '#e0e0e0',
            fontWeight: 700,
            fontSize: '0.65em',
            lineHeight: 1.3,
            textShadow: '0 1px 4px rgba(0,0,0,0.9)',
          }}
        >
          {card.name_fr}
        </div>
        {card.name_en && (
          <div
            style={{
              color: '#888888',
              fontSize: '0.45em',
              lineHeight: 1.2,
              marginTop: '2px',
              textShadow: '0 1px 3px rgba(0,0,0,0.9)',
            }}
          >
            {card.name_en}
          </div>
        )}
      </div>

      {/* Effects section (bottom) */}
      {card.effects && card.effects.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '5%',
            left: '5%',
            right: '5%',
            backgroundColor: 'rgba(0,0,0,0.7)',
            borderRadius: '4px',
            padding: '4px 6px',
          }}
        >
          {card.effects.map((effect: CardEffect, idx: number) => (
            <div key={idx} style={{ marginBottom: idx < card.effects.length - 1 ? '2px' : 0 }}>
              <span
                style={{
                  color: EFFECT_TYPE_COLORS[effect.type] || '#888888',
                  fontSize: '0.4em',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  marginRight: '4px',
                }}
              >
                {effect.type}
              </span>
              <span
                style={{
                  color: '#aaaaaa',
                  fontSize: '0.38em',
                  lineHeight: 1.3,
                }}
              >
                {effect.description}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Won-by indicator overlay */}
      {wonBy && (
        <div
          style={{
            position: 'absolute',
            top: '40%',
            left: '10%',
            right: '10%',
            textAlign: 'center',
            backgroundColor: 'rgba(0,0,0,0.75)',
            borderRadius: '4px',
            padding: '4px 8px',
            border: '1px solid #22c55e',
          }}
        >
          <span
            style={{
              color: '#22c55e',
              fontSize: '0.55em',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {t('game.board.won')} - {wonBy === 'player1' ? t('game.log.player1') : t('game.log.player2')}
          </span>
        </div>
      )}
    </div>
  );
}

const MissionCardDisplay = memo(MissionCardInner);
export default MissionCardDisplay;
