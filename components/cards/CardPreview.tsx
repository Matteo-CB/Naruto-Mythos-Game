'use client';

import { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { CharacterCard, MissionCard, CardEffect, Rarity } from '@/lib/engine/types';

// ---------------------
// Utility
// ---------------------
function normalizeImagePath(imageFile?: string): string | null {
  if (!imageFile) return null;
  const normalized = imageFile.replace(/\\/g, '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

const RARITY_LABELS: Record<Rarity, string> = {
  C: 'Common',
  UC: 'Uncommon',
  R: 'Rare',
  RA: 'Rare Art',
  S: 'Secret',
  M: 'Mythos',
  Legendary: 'Legendary',
  Mission: 'Mission',
};

const RARITY_COLORS: Record<Rarity, string> = {
  C: '#6b7280',
  UC: '#22c55e',
  R: '#3b82f6',
  RA: '#a855f7',
  S: '#eab308',
  M: '#ef4444',
  Legendary: '#eab308',
  Mission: '#6b7280',
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
export interface CardPreviewProps {
  card: CharacterCard | MissionCard | null;
  visible: boolean;
  position?: { x: number; y: number };
  powerTokens?: number;
}

// ---------------------
// Component
// ---------------------
function CardPreviewInner({ card, visible, position, powerTokens = 0 }: CardPreviewProps) {
  const t = useTranslations();
  const imageSrc = useMemo(
    () => (card ? normalizeImagePath(card.image_file) : null),
    [card?.image_file]
  );

  return (
    <AnimatePresence>
      {visible && card && (
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          style={{
            position: 'fixed',
            zIndex: 1000,
            top: position?.y ?? '50%',
            left: position?.x ?? '50%',
            transform: position ? undefined : 'translate(-50%, -50%)',
            width: '320px',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              backgroundColor: '#141414',
              border: '1px solid #2a2a2a',
              borderRadius: '12px',
              overflow: 'hidden',
            }}
          >
            {/* Card image section */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: card.card_type === 'mission' ? '3.5 / 2.5' : '2.5 / 2',
                backgroundColor: '#1a1a1a',
                overflow: 'hidden',
              }}
            >
              {card.has_visual && imageSrc ? (
                <img
                  src={imageSrc}
                  alt={card.name_fr}
                  draggable={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#1a1a1a',
                  }}
                >
                  <span
                    style={{
                      color: '#444444',
                      fontSize: '14px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    {card.name_fr}
                  </span>
                </div>
              )}

              {/* Rarity indicator top-right */}
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  backgroundColor: 'rgba(0,0,0,0.7)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  border: `1px solid ${RARITY_COLORS[card.rarity]}`,
                }}
              >
                <span
                  style={{
                    color: RARITY_COLORS[card.rarity],
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  {RARITY_LABELS[card.rarity]}
                </span>
              </div>
            </div>

            {/* Info section */}
            <div style={{ padding: '12px 14px' }}>
              {/* Name and title */}
              <div style={{ marginBottom: '8px' }}>
                <div
                  style={{
                    color: '#e0e0e0',
                    fontSize: '16px',
                    fontWeight: 700,
                    lineHeight: 1.2,
                  }}
                >
                  {card.name_fr}
                </div>
                {card.title_fr && (
                  <div
                    style={{
                      color: '#888888',
                      fontSize: '12px',
                      lineHeight: 1.3,
                      marginTop: '2px',
                    }}
                  >
                    {card.title_fr}
                  </div>
                )}
              </div>

              {/* Stats row */}
              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  marginBottom: '8px',
                  flexWrap: 'wrap',
                }}
              >
                {card.card_type === 'character' && card.chakra !== undefined && (
                  <StatBadge label={t('game.chakra')} value={String(card.chakra)} color="#2d5a8e" />
                )}
                {card.card_type === 'character' && (
                  <StatBadge
                    label={t('game.power')}
                    value={String((card.power ?? 0) + powerTokens)}
                    color={powerTokens > 0 ? '#dc2626' : '#6b2121'}
                    extra={powerTokens > 0 ? `(+${powerTokens})` : undefined}
                  />
                )}
                {card.card_type === 'mission' && 'basePoints' in card && (
                  <StatBadge
                    label={t('collection.basePoints')}
                    value={String((card as MissionCard).basePoints)}
                    color="#6b7280"
                  />
                )}
              </div>

              {/* Keywords */}
              {card.keywords && card.keywords.length > 0 && (
                <div style={{ marginBottom: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {card.keywords.map((kw) => (
                    <span
                      key={kw}
                      style={{
                        backgroundColor: '#1e1e1e',
                        color: '#aaaaaa',
                        fontSize: '11px',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        border: '1px solid #2a2a2a',
                      }}
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              )}

              {/* Group */}
              {card.group && (
                <div
                  style={{
                    color: '#888888',
                    fontSize: '11px',
                    marginBottom: '8px',
                  }}
                >
                  {card.group}
                </div>
              )}

              {/* Effects */}
              {card.effects && card.effects.length > 0 && (
                <div
                  style={{
                    borderTop: '1px solid #222222',
                    paddingTop: '8px',
                  }}
                >
                  {card.effects.map((effect: CardEffect, idx: number) => (
                    <div key={idx} style={{ marginBottom: idx < card.effects.length - 1 ? '6px' : 0 }}>
                      <span
                        style={{
                          color: EFFECT_TYPE_COLORS[effect.type] || '#888888',
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          marginRight: '6px',
                        }}
                      >
                        {effect.type}
                      </span>
                      <span
                        className="font-body"
                        style={{
                          color: '#c0c0c0',
                          fontSize: '12px',
                          lineHeight: 1.4,
                        }}
                      >
                        {effect.description}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Card ID */}
              <div
                style={{
                  color: '#444444',
                  fontSize: '10px',
                  marginTop: '8px',
                  textAlign: 'right',
                }}
              >
                {card.id}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------
// Sub-components
// ---------------------
function StatBadge({
  label,
  value,
  color,
  extra,
}: {
  label: string;
  value: string;
  color: string;
  extra?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      <div
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            color: '#e0e0e0',
            fontSize: '12px',
            fontWeight: 700,
          }}
        >
          {value}
        </span>
      </div>
      <div>
        <span style={{ color: '#888888', fontSize: '10px' }}>{label}</span>
        {extra && (
          <span
            style={{
              color: '#dc2626',
              fontSize: '10px',
              marginLeft: '3px',
            }}
          >
            {extra}
          </span>
        )}
      </div>
    </div>
  );
}

const CardPreview = memo(CardPreviewInner);
export default CardPreview;
