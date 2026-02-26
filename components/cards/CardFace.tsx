'use client';

import { memo, useMemo } from 'react';
import { useLocale } from 'next-intl';
import type { CharacterCard, MissionCard, Rarity } from '@/lib/engine/types';
import { effectDescriptionsFr } from '@/lib/data/effectTranslationsFr';
import { effectDescriptionsEn } from '@/lib/data/effectDescriptionsEn';
import CardBack from './CardBack';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { getCardName, getCardTitle, getCardGroup, getCardKeyword } from '@/lib/utils/cardLocale';

// ---------------------
// Rarity bar color mapping (no gradients, solid colors only)
// ---------------------
const RARITY_COLORS: Record<Rarity, string> = {
  C: '#6b7280',       // gray
  UC: '#22c55e',      // green
  R: '#3b82f6',       // blue
  RA: '#a855f7',      // purple
  S: '#eab308',       // gold
  SV: '#eab308',      // gold (Secret Variant)
  M: '#ef4444',       // red
  MV: '#ef4444',      // red (Mythos Variant)
  L: '#eab308',       // gold
  MMS: '#6b7280',     // gray
};

// ---------------------
// Props
// ---------------------
export interface CardFaceProps {
  card: CharacterCard | MissionCard;
  powerTokens?: number;
  className?: string;
  showEffects?: boolean;
  banned?: boolean;
}

// ---------------------
// Component
// ---------------------
function CardFaceInner({ card, powerTokens = 0, className = '', showEffects = false, banned = false }: CardFaceProps) {
  const locale = useLocale();

  // Banned cards always show card back
  if (banned) {
    return <CardBack className={className} />;
  }
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
          alt={getCardName(card, locale as 'en' | 'fr')}
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
        /* Text-based card face for cards without images */
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#111111',
            border: `2px solid ${rarityColor}40`,
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            padding: '8%',
          }}
        >
          {/* Rarity accent line at top */}
          <div style={{
            width: '40%',
            height: '2px',
            backgroundColor: rarityColor,
            marginBottom: '6%',
            opacity: 0.6,
          }} />
          {/* Character name */}
          <div style={{
            color: '#d0d0d0',
            fontSize: '0.65em',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            lineHeight: 1.2,
            marginBottom: '2%',
          }}>
            {getCardName(card, locale as 'en' | 'fr')}
          </div>
          {/* Title */}
          {getCardTitle(card, locale as 'en' | 'fr') && (
            <div style={{
              color: '#777777',
              fontSize: '0.45em',
              lineHeight: 1.3,
              marginBottom: '4%',
              fontStyle: 'italic',
            }}>
              {getCardTitle(card, locale as 'en' | 'fr')}
            </div>
          )}
          {/* Group */}
          {card.group && (
            <div style={{
              color: '#666666',
              fontSize: '0.4em',
              marginBottom: '3%',
            }}>
              {getCardGroup(card.group, locale as 'en' | 'fr')}
            </div>
          )}
          {/* Keywords */}
          {card.keywords && card.keywords.length > 0 && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '2px',
              marginBottom: '3%',
            }}>
              {card.keywords.map((kw) => (
                <span
                  key={kw}
                  style={{
                    backgroundColor: '#1a1a1a',
                    color: '#888888',
                    fontSize: '0.35em',
                    padding: '1px 4px',
                    borderRadius: '2px',
                    border: '1px solid #2a2a2a',
                  }}
                >
                  {getCardKeyword(kw, locale as 'en' | 'fr')}
                </span>
              ))}
            </div>
          )}
          {/* Spacer */}
          <div style={{ flex: 1 }} />
          {/* Card ID at bottom */}
          <div style={{
            color: '#3a3a3a',
            fontSize: '0.35em',
            textAlign: 'right',
          }}>
            {card.id}
          </div>
        </div>
      )}

      {/* Dark overlay for text readability at bottom (only for cards with images) */}
      {hasImage && (
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
      )}

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

      {/* Name and title (bottom-left) — only for cards with images */}
      {hasImage && (
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
            {getCardName(card, locale as 'en' | 'fr')}
          </div>
          {getCardTitle(card, locale as 'en' | 'fr') && (
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
              {getCardTitle(card, locale as 'en' | 'fr')}
            </div>
          )}
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
          {card.effects.map((effect, idx) => {
            const raFallbackId = card.id.endsWith('-RA') ? card.id.replace('-RA', '-R') : undefined;
            const frDescriptions = effectDescriptionsFr[card.id] ?? (raFallbackId ? effectDescriptionsFr[raFallbackId] : undefined);
            const enDescriptions = effectDescriptionsEn[card.id] ?? (raFallbackId ? effectDescriptionsEn[raFallbackId] : undefined);
            const description = locale === 'fr'
              ? (frDescriptions?.[idx] ?? effect.description)
              : (enDescriptions?.[idx] ?? effect.description);
            return (
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
                {description}
              </div>
            </div>
            );
          })}
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
