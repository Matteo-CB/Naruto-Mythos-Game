'use client';

import { useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { getCardName } from '@/lib/utils/cardLocale';
import { useGameScale } from './GameScaleContext';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import {
  PopupOverlay,
  PopupCornerFrame,
  PopupTitle,
  PopupDescription,
  PopupDismissLink,
  PopupMinimizePill,
  PopupMinimizeX,
} from './PopupPrimitives';

interface HandCardInfo {
  index: number;
  card: {
    name_fr: string;
    name_en?: string;
    title_fr?: string;
    title_en?: string;
    chakra?: number;
    power?: number;
    image_file?: string;
    missionLabel?: string;
    id?: string;
    cardId?: string;
    number?: number;
    rarity?: string;
    keywords?: string[];
    group?: string;
    effects?: Array<{ type: string; description: string }>;
    card_type?: string;
  };
  targetId?: string;
}

function HandCard({
  cardInfo,
  onSelect,
  idx,
}: {
  cardInfo: HandCardInfo;
  onSelect: (index: string) => void;
  idx: number;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const dims = useGameScale();
  const zoomCard = useUIStore((s) => s.zoomCard);
  const { card, index } = cardInfo;

  const imagePath = normalizeImagePath(card.image_file);

  return (
    <motion.div
      layout
      initial={{ y: 30, opacity: 0, rotate: -2 }}
      animate={{ y: 0, opacity: 1, rotate: 0 }}
      transition={{ delay: idx * 0.06, type: 'spring', stiffness: 220, damping: 18 }}
      whileHover={{ scale: 1.06, y: -6, rotate: 1 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => onSelect(cardInfo.targetId ?? String(index))}
      className="relative no-select"
      style={{
        width: dims.handSelectorCard.w + 'px',
        aspectRatio: '5 / 7',
        cursor: 'pointer',
        border: '2px solid rgba(196, 163, 90, 0.4)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
        transition: 'border-color 0.2s',
        flexShrink: 0,
      }}
    >
      {/* Hover accent — left border fills on hover via CSS */}
      <div
        className="absolute left-0 top-0 bottom-0"
        style={{ width: '3px', backgroundColor: '#c4a35a', opacity: 0.6 }}
      />

      {/* Card image */}
      {imagePath ? (
        <div
          className="w-full h-full bg-cover bg-center"
          style={{ backgroundImage: `url('${imagePath}')` }}
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ backgroundColor: '#1a1a1a' }}
        >
          <span className="text-[10px] text-center px-1" style={{ color: '#888888' }}>
            {getCardName(card as Parameters<typeof getCardName>[0], locale as 'en' | 'fr')}
          </span>
        </div>
      )}

      {/* Chakra cost badge (top-left) */}
      {card.chakra !== undefined && (
        <div
          className="absolute top-1 left-1 w-5 h-5 flex items-center justify-center text-[9px] font-bold"
          style={{
            backgroundColor: 'rgba(12, 12, 18, 0.9)',
            color: '#c4a35a',
            border: '1px solid rgba(196, 163, 90, 0.5)',
          }}
        >
          {card.chakra}
        </div>
      )}

      {/* Power badge (bottom-right) */}
      {card.power !== undefined && (
        <div
          className="absolute bottom-1 right-1 px-1.5 py-0.5 text-[10px] font-bold"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            color: '#e0e0e0',
          }}
        >
          {card.power}
        </div>
      )}

      {/* Mission label for hidden board characters */}
      {card.missionLabel && (
        <div
          className="absolute top-1 right-1 px-1.5 py-0.5 text-[8px] font-bold uppercase"
          style={{
            backgroundColor: 'rgba(138, 92, 246, 0.9)',
            color: '#fff',
          }}
        >
          {card.missionLabel}
        </div>
      )}

      {/* Card name overlay */}
      <div
        className="absolute inset-x-0 bottom-0 text-center py-1 text-[8px] font-medium truncate px-1"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          color: '#c4a35a',
        }}
      >
        {getCardName(card as Parameters<typeof getCardName>[0], locale as 'en' | 'fr')}
      </div>

      {/* Details button */}
      <button
        onClick={(e) => { e.stopPropagation(); zoomCard(card as CharacterCard | MissionCard); }}
        className="absolute bottom-7 right-1 px-1.5 py-0.5 text-[8px] font-bold cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
        style={{
          backgroundColor: 'rgba(0,0,0,0.85)',
          color: '#c4a35a',
          border: '1px solid rgba(196,163,90,0.3)',
        }}
      >
        {t('game.board.details')}
      </button>
    </motion.div>
  );
}

export function HandCardSelector() {
  const t = useTranslations();
  const pendingTargetSelection = useGameStore((s) => s.pendingTargetSelection);
  const selectTarget = useGameStore((s) => s.selectTarget);
  const declineTarget = useGameStore((s) => s.declineTarget);
  const effectPopupMinimized = useUIStore((s) => s.effectPopupMinimized);
  const minimizeEffectPopup = useUIStore((s) => s.minimizeEffectPopup);
  const restoreEffectPopup = useUIStore((s) => s.restoreEffectPopup);

  const prevPendingIdRef = useRef<string | null>(null);
  const currentPendingId = pendingTargetSelection?.descriptionKey ?? pendingTargetSelection?.description ?? null;
  useEffect(() => {
    if (currentPendingId && currentPendingId !== prevPendingIdRef.current) {
      restoreEffectPopup();
    }
    prevPendingIdRef.current = currentPendingId;
  }, [currentPendingId, restoreEffectPopup]);

  const handleSelect = useCallback(
    (targetId: string) => {
      selectTarget(targetId);
    },
    [selectTarget],
  );

  const handleDecline = useCallback(() => {
    declineTarget();
  }, [declineTarget]);

  if (!pendingTargetSelection || pendingTargetSelection.selectionType !== 'CHOOSE_FROM_HAND') {
    return null;
  }

  const { handCards, description, descriptionKey, descriptionParams, onDecline, playerName } = pendingTargetSelection;
  const canDecline = !!onDecline;
  const displayName = playerName || t('game.you');

  if (!handCards || handCards.length === 0) return null;

  if (effectPopupMinimized) {
    const effectDesc = descriptionKey
      ? t(descriptionKey, descriptionParams as Record<string, string> | undefined)
      : (description || t('game.board.restoreEffect'));
    return <PopupMinimizePill text={effectDesc} onRestore={restoreEffectPopup} />;
  }

  return (
    <AnimatePresence>
      <PopupOverlay>
        <PopupCornerFrame accentColor="rgba(196, 163, 90, 0.35)" maxWidth="720px">
          <PopupMinimizeX onClick={minimizeEffectPopup} />

          <PopupTitle accentColor="#c4a35a" size="lg">
            {t('game.mustChooseCard', { player: displayName })}
          </PopupTitle>

          <PopupDescription>
            {descriptionKey ? t(descriptionKey, descriptionParams ?? {}) : description}
          </PopupDescription>

          {/* Hand cards */}
          <div
            className="flex flex-wrap gap-3 px-2 py-3 mb-4 justify-center"
            style={{ maxWidth: '100%' }}
          >
            {handCards.map((cardInfo, idx) => (
              <HandCard
                key={`hand-${cardInfo.index}`}
                cardInfo={cardInfo}
                onSelect={handleSelect}
                idx={idx}
              />
            ))}
          </div>

          {canDecline && (
            <div className="flex justify-center">
              <PopupDismissLink onClick={handleDecline}>
                {t('game.board.skip')}
              </PopupDismissLink>
            </div>
          )}
        </PopupCornerFrame>
      </PopupOverlay>
    </AnimatePresence>
  );
}
