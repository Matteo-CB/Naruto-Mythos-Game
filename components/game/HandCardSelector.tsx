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

interface HandCardInfo {
  index: number;
  card: {
    name_fr: string;
    name_en?: string;
    title_en?: string;
    chakra?: number;
    power?: number;
    image_file?: string;
    missionLabel?: string;
  };
  targetId?: string;
}

function HandCard({
  cardInfo,
  onSelect,
}: {
  cardInfo: HandCardInfo;
  onSelect: (index: string) => void;
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
      initial={{ y: 30, opacity: 0, scale: 0.9 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 250, damping: 20 }}
      whileHover={{ scale: 1.08, y: -8 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => onSelect(cardInfo.targetId ?? String(index))}
      className="relative no-select"
      style={{
        width: dims.handSelectorCard.w + 'px',
        height: dims.handSelectorCard.h + 'px',
        borderRadius: '8px',
        border: '2px solid rgba(196, 163, 90, 0.5)',
        overflow: 'hidden',
        cursor: 'pointer',
        boxShadow: '0 0 14px rgba(196, 163, 90, 0.3), 0 4px 12px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Pulsing glow */}
      <motion.div
        className="absolute inset-0 rounded-md"
        style={{
          border: '2px solid #c4a35a',
          pointerEvents: 'none',
        }}
        animate={{
          boxShadow: [
            '0 0 6px rgba(196, 163, 90, 0.2)',
            '0 0 16px rgba(196, 163, 90, 0.5)',
            '0 0 6px rgba(196, 163, 90, 0.2)',
          ],
        }}
        transition={{ repeat: Infinity, duration: 1.2 }}
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
          className="absolute top-1 left-1 rounded-full w-6 h-6 flex items-center justify-center text-[10px] font-bold"
          style={{
            backgroundColor: 'rgba(196, 163, 90, 0.9)',
            color: '#0a0a0a',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
          }}
        >
          {card.chakra}
        </div>
      )}

      {/* Power badge (bottom-right) */}
      {card.power !== undefined && (
        <div
          className="absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-[10px] font-bold"
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
          className="absolute top-1 right-1 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase"
          style={{
            backgroundColor: 'rgba(139, 92, 246, 0.9)',
            color: '#fff',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
          }}
        >
          {card.missionLabel}
        </div>
      )}

      {/* Card name overlay */}
      <div
        className="absolute inset-x-0 bottom-0 text-center py-1 text-[8px] font-medium truncate px-1"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: '#c4a35a',
        }}
      >
        {getCardName(card as Parameters<typeof getCardName>[0], locale as 'en' | 'fr')}
      </div>

      {/* Details button */}
      <button
        onClick={(e) => { e.stopPropagation(); zoomCard(card as CharacterCard | MissionCard); }}
        className="absolute bottom-7 right-1 rounded px-1.5 py-0.5 text-[8px] font-bold cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
        style={{
          backgroundColor: 'rgba(0,0,0,0.85)',
          color: '#c4a35a',
          border: '1px solid rgba(196,163,90,0.4)',
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
    const pillText = effectDesc.length > 40 ? effectDesc.slice(0, 37) + '...' : effectDesc;
    return (
      <motion.button
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.97 }}
        onClick={restoreEffectPopup}
        className="fixed z-50 flex items-center gap-2 no-select"
        style={{
          bottom: '14px', left: '50%', transform: 'translateX(-50%)',
          padding: '8px 20px', background: 'rgba(196, 163, 90, 0.92)',
          color: '#0a0a0a', borderRadius: '24px', fontSize: '12px',
          fontWeight: 700, cursor: 'pointer',
          border: '1px solid rgba(255, 215, 0, 0.4)',
          boxShadow: '0 4px 24px rgba(196, 163, 90, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3)',
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ fontSize: '14px', lineHeight: 1 }}>&#x25B2;</span>
        {pillText}
      </motion.button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}
      >
        <div style={{
          width: 'min(90vw, 520px)',
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: '14px',
        }}>
          <motion.button
            onClick={(e) => { e.stopPropagation(); minimizeEffectPopup(); }}
            className="no-select"
            whileHover={{ scale: 1.25, opacity: 1 }}
            whileTap={{ scale: 0.85 }}
            style={{
              background: 'none',
              border: 'none',
              color: '#d4b36a',
              fontSize: '22px',
              lineHeight: '1',
              cursor: 'pointer',
              fontWeight: 300,
              padding: '4px 6px',
              opacity: 0.7,
              textShadow: '0 0 10px rgba(196, 163, 90, 0.5), 0 0 30px rgba(196, 163, 90, 0.15)',
            }}
            title={t('game.board.minimize')}
          >
            &#x2715;
          </motion.button>
        </div>
        {/* Player announcement banner */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          className="mb-5 flex flex-col items-center gap-2"
        >
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            style={{ width: '60px', height: '1px', backgroundColor: 'rgba(196, 163, 90, 0.35)' }}
          />
          <div className="flex items-center gap-3 px-8 py-2">
            <motion.div
              className="rounded-full"
              style={{ width: '8px', height: '8px', backgroundColor: '#c4a35a' }}
              animate={{
                boxShadow: [
                  '0 0 4px rgba(196, 163, 90, 0.3)',
                  '0 0 14px rgba(196, 163, 90, 0.8)',
                  '0 0 4px rgba(196, 163, 90, 0.3)',
                ],
              }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
            <span
              className="text-sm font-bold uppercase"
              style={{ color: '#c4a35a', letterSpacing: '0.2em', textShadow: '0 0 20px rgba(196, 163, 90, 0.2)' }}
            >
              {t('game.mustChooseCard', { player: displayName })}
            </span>
          </div>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.25, duration: 0.4 }}
            style={{ width: '140px', height: '1px', backgroundColor: 'rgba(196, 163, 90, 0.2)' }}
          />
        </motion.div>

        {/* Description */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 20 }}
          className="mb-6 px-6 py-3 rounded"
          style={{
            backgroundColor: 'rgba(8, 8, 12, 0.8)',
            borderLeft: '2px solid rgba(196, 163, 90, 0.4)',
            maxWidth: '500px',
          }}
        >
          <span className="font-body text-xs leading-relaxed" style={{ color: '#d0d0d0' }}>
            {descriptionKey ? t(descriptionKey, descriptionParams ?? {}) : description}
          </span>
        </motion.div>

        {/* Hand cards */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 180, damping: 18 }}
          className="flex gap-3 overflow-x-auto px-6 py-4 rounded-lg"
          style={{
            backgroundColor: 'rgba(6, 6, 10, 0.7)',
            border: '1px solid rgba(196, 163, 90, 0.06)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(196, 163, 90, 0.04)',
            maxWidth: '90vw',
          }}
        >
          {handCards.map((cardInfo) => (
            <HandCard
              key={`hand-${cardInfo.index}`}
              cardInfo={cardInfo}
              onSelect={handleSelect}
            />
          ))}
        </motion.div>

        {/* Skip / Decline button for optional effects */}
        {canDecline && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDecline}
            className="mt-5 px-6 py-2.5 rounded-lg text-xs font-medium uppercase cursor-pointer"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              color: '#777777',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              letterSpacing: '0.12em',
            }}
          >
            {t('game.board.skip')}
          </motion.button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
