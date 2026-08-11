'use client';

import { memo, useMemo } from 'react';
import { effectTypeLabel } from '@/lib/cards/effectTypeLabel';
import { hasCombatStats } from '@/lib/cards/orientation';
import { useLocale } from 'next-intl';
import type { CardData, CharacterCard, MissionCard, Rarity } from '@/lib/engine/types';
import { getCardEffectDescription } from '@/lib/data/effectDescriptions';
import CardBack from './CardBack';
import { CardArtFallback } from './CardArtFallback';
import { HoloFoilOverlay } from './HoloFoilOverlay';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { ChakraIcon, PowerIcon, CHAKRA_COLOR_SOFT, POWER_COLOR_BRIGHT } from '@/components/icons/GameIcons';
import { getCardName, getCardTitle } from '@/lib/utils/cardLocale';
import { cardAspectRatio } from '@/lib/cards/orientation';

const RARITY_COLORS: Record<Rarity, string> = {
  C: '#6b7280',
  UC: '#22c55e',
  R: '#3b82f6',
  RA: '#a855f7',
  S: '#eab308',
  SV: '#eab308',
  M: '#ef4444',
  MV: '#ef4444',
  L: '#eab308',
  SP: '#06b6d4',
  SPV: '#06b6d4',
  POP: '#e84393',
  POPV: '#e84393',
  CHIBI: '#10b981',
  CHIBIV: '#10b981',
  SHINOBI: '#d97706',
  SHINOBIV: '#d97706',
  MMS: '#6b7280',
};

export interface CardFaceProps {
  card: CardData;
  powerTokens?: number;
  className?: string;
  showEffects?: boolean;
  banned?: boolean;
}

function CardFaceInner({ card, powerTokens = 0, className = '', showEffects = false, banned = false }: CardFaceProps) {
  const locale = useLocale();

  if (banned) {
    return <CardBack className={className} />;
  }
  const imageSrc = useMemo(() => normalizeImagePath(card.image_file), [card.image_file]);
  const rarityColor = RARITY_COLORS[card.rarity] || '#6b7280';
  const totalPower = hasCombatStats(card) ? (card.power ?? 0) + powerTokens : 0;
  const hasImage = card.has_visual && imageSrc;

  return (
    <div
      className={`relative overflow-hidden rounded-lg select-none ${className}`}
      style={{
        aspectRatio: cardAspectRatio(card),
        backgroundColor: '#141414',
      }}
    >
      
      {hasImage ? (
        <img
          src={imageSrc}
          alt={getCardName(card, locale as 'en' | 'fr')}
          draggable={false}
          loading="lazy"
          decoding="async"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      ) : (
        <CardArtFallback card={card} />
      )}

      {hasImage && card.isHolo && <HoloFoilOverlay imageUrl={imageSrc} />}

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

      {(card.card_type === 'character' || card.card_type === 'attachment') && card.chakra !== undefined && (
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
              gap: '6%',
            }}
          >
            <ChakraIcon size="min(0.5em, 32%)" color={CHAKRA_COLOR_SOFT} />
            <span
              style={{
                color: '#e0e0e0',
                fontWeight: 700,
                fontSize: '0.7em',
                lineHeight: 1,
                fontFamily: "'NJNaruto', Arial, sans-serif",
              }}
            >
              {card.chakra}
            </span>
          </div>
        </div>
      )}

      {hasCombatStats(card) && (
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
              gap: '6%',
            }}
          >
            <PowerIcon size="min(0.5em, 32%)" color={POWER_COLOR_BRIGHT} />
            <span
              style={{
                color: powerTokens > 0 ? '#fca5a5' : '#e0e0e0',
                fontWeight: 700,
                fontSize: '0.7em',
                lineHeight: 1,
                fontFamily: "'NJNaruto', Arial, sans-serif",
              }}
            >
              {totalPower}
            </span>
          </div>
        </div>
      )}

      {powerTokens > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '22%',
            right: '4%',
            backgroundColor: '#7c2d12',
            borderRadius: '4px',
            padding: '1px 4px',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
          }}
        >
          <PowerIcon size="0.5em" color={POWER_COLOR_BRIGHT} />
          <span
            style={{
              color: '#fca5a5',
              fontSize: '0.55em',
              fontWeight: 600,
              fontFamily: "'NJNaruto', Arial, sans-serif",
            }}
          >
            +{powerTokens}
          </span>
        </div>
      )}

      {hasImage && (
        <div
          style={{
            position: 'absolute',
            bottom: '8%',
            left: '6%',
            right: hasCombatStats(card) ? '26%' : '6%',
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
            const description = getCardEffectDescription(card.id, idx, locale, effect.description);
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
                {effectTypeLabel(effect.type)}
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
    case 'DUEL': return '#ef4444';
    default: return '#888888';
  }
}

const CardFace = memo(CardFaceInner);
export default CardFace;
