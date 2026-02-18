'use client';

import { memo, useMemo } from 'react';
import type { CharacterCard, MissionCard, Rarity } from '@/lib/engine/types';

// ---------------------
// Utility: normalize image_file path from backslash JSON to a valid URL
// ---------------------
function normalizeImagePath(imageFile?: string): string | null {
  if (!imageFile) return null;
  const normalized = imageFile.replace(/\\/g, '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

// ---------------------
// Rarity bar color mapping (no gradients, solid colors only)
// ---------------------
const RARITY_COLORS: Record<Rarity, string> = {
  C: '#6b7280',       // gray
  UC: '#22c55e',      // green
  R: '#3b82f6',       // blue
  RA: '#a855f7',      // purple
  S: '#eab308',       // gold
  M: '#ef4444',       // red
  Legendary: '#eab308', // gold
  Mission: '#6b7280',   // gray
};

// ---------------------
// Props
// ---------------------
export interface CardFaceProps {
  card: CharacterCard | MissionCard;
  powerTokens?: number;
  className?: string;
  showEffects?: boolean;
}

// ---------------------
// Component
// ---------------------
function CardFaceInner({ card, powerTokens = 0, className = '', showEffects = false }: CardFaceProps) {
  const imageSrc = useMemo(() => normalizeImagePath(card.image_file), [card.image_file]);
  const rarityColor = RARITY_COLORS[card.rarity] || '#6b7280';
  const totalPower = card.card_type === 'character' ? (card.power ?? 0) + powerTokens : 0;
  const hasImage = card.has_visual && imageSrc;

  return (
    <div
      className={`relative overflow-hidden rounded-lg select-none ${className}`}
      style={{
        aspectRatio: card.card_type === 'mission' ? '3.5 / 2.5' : '2.5 / 3.5',
        backgroundColor: '#141414',
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
          }}
        />
      ) : (
        /* Silhouette treatment for cards without images */
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#1a1a1a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '60%',
              height: '60%',
              backgroundColor: '#222222',
              borderRadius: '50%',
              opacity: 0.5,
            }}
          />
        </div>
      )}

      {/* Dark overlay for text readability at bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '40%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Chakra cost badge (top-left) - character cards only */}
      {card.card_type === 'character' && card.chakra !== undefined && (
        <div
          style={{
            position: 'absolute',
            top: '4%',
            left: '4%',
            width: '18%',
            height: 0,
            paddingBottom: '18%',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              backgroundColor: '#1e3a5f',
              border: '2px solid #2d5a8e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                color: '#e0e0e0',
                fontWeight: 700,
                fontSize: '0.7em',
                lineHeight: 1,
              }}
            >
              {card.chakra}
            </span>
          </div>
        </div>
      )}

      {/* Power badge (bottom-right) - character cards only */}
      {card.card_type === 'character' && (
        <div
          style={{
            position: 'absolute',
            bottom: '4%',
            right: '4%',
            width: '18%',
            height: 0,
            paddingBottom: '18%',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              backgroundColor: powerTokens > 0 ? '#7c2d12' : '#3f1515',
              border: `2px solid ${powerTokens > 0 ? '#dc2626' : '#6b2121'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                color: powerTokens > 0 ? '#fca5a5' : '#e0e0e0',
                fontWeight: 700,
                fontSize: '0.7em',
                lineHeight: 1,
              }}
            >
              {totalPower}
            </span>
          </div>
        </div>
      )}

      {/* Power tokens indicator */}
      {powerTokens > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '22%',
            right: '4%',
            backgroundColor: '#7c2d12',
            border: '1px solid #dc2626',
            borderRadius: '4px',
            padding: '1px 4px',
          }}
        >
          <span
            style={{
              color: '#fca5a5',
              fontSize: '0.55em',
              fontWeight: 600,
            }}
          >
            +{powerTokens}
          </span>
        </div>
      )}

      {/* Name and title (bottom-left) */}
      <div
        style={{
          position: 'absolute',
          bottom: '8%',
          left: '6%',
          right: card.card_type === 'character' ? '26%' : '6%',
        }}
      >
        <div
          style={{
            color: '#e0e0e0',
            fontWeight: 700,
            fontSize: '0.65em',
            lineHeight: 1.2,
            textShadow: '0 1px 3px rgba(0,0,0,0.9)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {card.name_fr}
        </div>
        {card.title_fr && (
          <div
            style={{
              color: '#888888',
              fontSize: '0.5em',
              lineHeight: 1.2,
              marginTop: '2px',
              textShadow: '0 1px 3px rgba(0,0,0,0.9)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {card.title_fr}
          </div>
        )}
      </div>

      {/* Silhouette name overlay (centered, only for cards without images) */}
      {!hasImage && (
        <div
          style={{
            position: 'absolute',
            top: '40%',
            left: '10%',
            right: '10%',
            textAlign: 'center',
          }}
        >
          <span
            style={{
              color: '#555555',
              fontSize: '0.6em',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {card.name_fr}
          </span>
        </div>
      )}

      {/* Rarity indicator bar (bottom edge) */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: '10%',
          right: '10%',
          height: '3px',
          backgroundColor: rarityColor,
          borderRadius: '2px 2px 0 0',
        }}
      />

      {/* Optional: effect text overlay (for card preview mode) */}
      {showEffects && card.effects && card.effects.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '25%',
            left: '5%',
            right: '5%',
            bottom: '30%',
            backgroundColor: 'rgba(0,0,0,0.8)',
            borderRadius: '4px',
            padding: '4px',
            overflow: 'auto',
          }}
        >
          {card.effects.map((effect, idx) => (
            <div key={idx} style={{ marginBottom: '3px' }}>
              <span
                style={{
                  color: getEffectTypeColor(effect.type),
                  fontSize: '0.45em',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {effect.type}
              </span>
              <div
                style={{
                  color: '#c0c0c0',
                  fontSize: '0.4em',
                  lineHeight: 1.3,
                }}
              >
                {effect.description}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getEffectTypeColor(type: string): string {
  switch (type) {
    case 'MAIN': return '#60a5fa';
    case 'UPGRADE': return '#a78bfa';
    case 'AMBUSH': return '#f97316';
    case 'SCORE': return '#eab308';
    default: return '#888888';
  }
}

const CardFace = memo(CardFaceInner);
export default CardFace;
