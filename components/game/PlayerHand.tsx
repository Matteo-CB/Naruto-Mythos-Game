'use client';

import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import type { CharacterCard } from '@/lib/engine/types';

import { normalizeImagePath } from '@/lib/utils/imagePath';
import { getCardName } from '@/lib/utils/cardLocale';
import { useGameScale } from './GameScaleContext';

interface PlayerHandProps {
  hand: CharacterCard[];
  chakra: number;
  isSpectatorOpponent?: boolean;
}

interface HandCardProps {
  card: CharacterCard;
  displayIndex: number;
  originalIndex: number;
  total: number;
  isSelected: boolean;
  canAfford: boolean;
  onSelect: (originalIndex: number) => void;
  onPreview: (card: CharacterCard, position: { x: number; y: number }) => void;
  onPreviewHide: () => void;
  onPin: (card: CharacterCard) => void;
  onZoom: (card: CharacterCard) => void;
  fanSpacing: number;
}

function reconcileHandOrder(
  prevOrder: number[],
  prevHand: CharacterCard[],
  newHand: CharacterCard[],
): number[] | null {
  if (newHand.length === 0) return null;

  const usedNewIndices = new Set<number>();
  const newOrder: number[] = [];

  for (const origIdx of prevOrder) {
    const oldCard = prevHand[origIdx];
    if (!oldCard) continue;
    
    const newIdx = newHand.findIndex(
      (c, i) => !usedNewIndices.has(i) && c.id === oldCard.id,
    );
    if (newIdx !== -1) {
      newOrder.push(newIdx);
      usedNewIndices.add(newIdx);
    }
  }

  for (let i = 0; i < newHand.length; i++) {
    if (!usedNewIndices.has(i)) {
      newOrder.push(i);
    }
  }

  if (newOrder.length === newHand.length && newOrder.every((v, i) => v === i)) {
    return null;
  }
  return newOrder;
}

const HandCard = React.memo(function HandCard({
  card,
  displayIndex,
  originalIndex,
  total,
  isSelected,
  canAfford,
  onSelect,
  onPreview,
  onPreviewHide,
  onPin,
  onZoom,
  fanSpacing,
}: HandCardProps) {
  const locale = useLocale();
  const dims = useGameScale();

  const midpoint = (total - 1) / 2;
  const offset = displayIndex - midpoint;
  const rotation = offset * 2.5;
  const translateX = offset * dims.handFanSpacing;
  const arcY = Math.abs(offset) * dims.handFanArc;

  const imagePath = normalizeImagePath(card.image_file);

  const animateProps = useMemo(
    () => ({
      y: isSelected ? -20 : 0,
      opacity: 1,
      rotate: rotation,
      x: translateX,
      scale: isSelected ? 1.08 : 1,
    }),
    [isSelected, rotation, translateX],
  );

  const hoverProps = useMemo(
    () => ({
      y: isSelected ? -20 : -12,
      scale: 1.06,
      zIndex: 100,
    }),
    [isSelected],
  );

  const transitionProps = useMemo(
    () => ({
      type: 'spring' as const,
      stiffness: 300,
      damping: 25,
    }),
    [],
  );

  return (
    <motion.div
      initial={{ y: 100, opacity: 0, rotate: 0 }}
      animate={animateProps}
      whileHover={hoverProps}
      transition={transitionProps}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(originalIndex);
        onPin(card);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onZoom(card);
      }}
      onMouseEnter={(e) => {
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        onPreview(card, { x: rect.left, y: rect.top - 200 });
      }}
      onMouseLeave={() => onPreviewHide()}
      className="absolute no-select"
      style={{
        width: dims.handCard.w + 'px',
        height: dims.handCard.h + 'px',
        borderRadius: '6px',
        border: isSelected
          ? '2px solid #c4a35a'
          : canAfford
            ? '1px solid rgba(255, 255, 255, 0.1)'
            : '1px solid rgba(179, 62, 62, 0.3)',
        overflow: 'hidden',
        zIndex: isSelected ? 50 : displayIndex,
        transform: `translateY(${arcY}px)`,
        opacity: canAfford ? 1 : 0.55,
        boxShadow: isSelected
          ? '0 0 20px rgba(196, 163, 90, 0.4), 0 8px 24px rgba(0, 0, 0, 0.6)'
          : '0 4px 16px rgba(0, 0, 0, 0.5)',
        cursor: 'pointer',
      }}
    >
      
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
          <span className="text-[9px] text-center px-1" style={{ color: '#555555' }}>
            {getCardName(card, locale as 'en' | 'fr')}
          </span>
        </div>
      )}

      <div
        className="absolute inset-x-0 bottom-0 px-1 py-1 flex items-end justify-between"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
        }}
      >
        <span
          className="text-[9px] font-medium truncate leading-tight"
          style={{ color: '#e0e0e0', maxWidth: '60px' }}
        >
          {getCardName(card, locale as 'en' | 'fr')}
        </span>
        <span
          className="text-[10px] font-bold tabular-nums"
          style={{ color: '#c4a35a', fontFamily: "'NJNaruto', Arial, sans-serif" }}
        >
          {card.power}
        </span>
      </div>

      <div
        className="absolute top-1 left-1 w-5 h-5 flex items-center justify-center text-[10px] font-bold"
        style={{
          backgroundColor: canAfford
            ? 'rgba(196, 163, 90, 0.9)'
            : 'rgba(179, 62, 62, 0.9)',
          color: '#0a0a0a',
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
          fontFamily: "'NJNaruto', Arial, sans-serif",
        }}
      >
        {card.chakra}
      </div>

      {!canAfford && (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: 'rgba(10, 10, 10, 0.4)' }}
        />
      )}
    </motion.div>
  );
});

function SortPill({
  label,
  active,
  onClick,
  accentColor = 'rgba(196, 163, 90, 0.4)',
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  accentColor?: string;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="cursor-pointer"
      style={{
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.04em',
        padding: '4px 10px',
        border: 'none',
        backgroundColor: active
          ? 'rgba(196, 163, 90, 0.20)'
          : 'rgba(255, 255, 255, 0.04)',
        color: active ? '#c4a35a' : '#888888',
        lineHeight: 1.3,
      }}
    >
      {label}
    </motion.button>
  );
}

export const PlayerHand = React.memo(function PlayerHand({ hand, chakra, isSpectatorOpponent }: PlayerHandProps) {
  const t = useTranslations();
  const dims = useGameScale();
  const selectedCardIndex = useUIStore((s) => s.selectedCardIndex);
  const selectCard = useUIStore((s) => s.selectCard);
  const showPreview = useUIStore((s) => s.showPreview);
  const hidePreview = useUIStore((s) => s.hidePreview);
  const pinCard = useUIStore((s) => s.pinCard);
  const zoomCard = useUIStore((s) => s.zoomCard);
  const handOrder = useUIStore((s) => s.handOrder);
  const setHandOrder = useUIStore((s) => s.setHandOrder);
  const resetHandOrder = useUIStore((s) => s.resetHandOrder);
  const visibleState = useGameStore((s) => s.visibleState);
  const isProcessing = useGameStore((s) => s.isProcessing);

  const isMyTurn =
    visibleState?.activePlayer === visibleState?.myPlayer &&
    visibleState?.phase === 'action' &&
    !isProcessing;

  const effectPopupMinimized = useUIStore((s) => s.effectPopupMinimized);

  const prevHandRef = useRef<CharacterCard[]>(hand);
  const prevHandLenRef = useRef(hand.length);

  useEffect(() => {
    const prevHand = prevHandRef.current;
    const prevLen = prevHandLenRef.current;
    prevHandRef.current = hand;
    prevHandLenRef.current = hand.length;

    if (prevHand === hand) return;

    const currentOrder = useUIStore.getState().handOrder;
    if (!currentOrder) return; // No custom order to reconcile

    const newOrder = reconcileHandOrder(currentOrder, prevHand, hand);
    setHandOrder(newOrder);
  }, [hand, setHandOrder]);

  const displayHand = useMemo(() => {
    if (!handOrder || handOrder.length !== hand.length) {
      return hand.map((card, i) => ({ card, originalIndex: i }));
    }
    return handOrder.map((origIdx) => ({
      card: hand[origIdx],
      originalIndex: origIdx,
    }));
  }, [hand, handOrder]);

  const handleSelect = useCallback(
    (originalIndex: number) => {
      if (!isMyTurn || effectPopupMinimized) return;
      if (selectedCardIndex === originalIndex) {
        selectCard(null);
      } else {
        selectCard(originalIndex);
      }
    },
    [isMyTurn, effectPopupMinimized, selectedCardIndex, selectCard],
  );

  const moveCardLeft = useCallback(() => {
    if (selectedCardIndex === null || hand.length <= 1) return;
    const currentOrder =
      handOrder && handOrder.length === hand.length
        ? [...handOrder]
        : hand.map((_, i) => i);
    
    const displayIdx = currentOrder.indexOf(selectedCardIndex);
    if (displayIdx <= 0) return;
    
    [currentOrder[displayIdx], currentOrder[displayIdx - 1]] =
      [currentOrder[displayIdx - 1], currentOrder[displayIdx]];
    const isNatural = currentOrder.every((v, i) => v === i);
    setHandOrder(isNatural ? null : currentOrder);
  }, [selectedCardIndex, handOrder, hand, setHandOrder]);

  const moveCardRight = useCallback(() => {
    if (selectedCardIndex === null || hand.length <= 1) return;
    const currentOrder =
      handOrder && handOrder.length === hand.length
        ? [...handOrder]
        : hand.map((_, i) => i);
    const displayIdx = currentOrder.indexOf(selectedCardIndex);
    if (displayIdx < 0 || displayIdx >= currentOrder.length - 1) return;
    [currentOrder[displayIdx], currentOrder[displayIdx + 1]] =
      [currentOrder[displayIdx + 1], currentOrder[displayIdx]];
    const isNatural = currentOrder.every((v, i) => v === i);
    setHandOrder(isNatural ? null : currentOrder);
  }, [selectedCardIndex, handOrder, hand, setHandOrder]);

  const selectedDisplayIdx = useMemo(() => {
    if (selectedCardIndex === null) return -1;
    const currentOrder =
      handOrder && handOrder.length === hand.length
        ? handOrder
        : hand.map((_, i) => i);
    return currentOrder.indexOf(selectedCardIndex);
  }, [selectedCardIndex, handOrder, hand]);

  const canMoveLeft = selectedCardIndex !== null && selectedDisplayIdx > 0;
  const canMoveRight = selectedCardIndex !== null && selectedDisplayIdx >= 0 && selectedDisplayIdx < hand.length - 1;

  const sortByCost = useCallback(() => {
    if (hand.length <= 1) return;
    const indices = hand.map((_, i) => i);
    indices.sort((a, b) => hand[a].chakra - hand[b].chakra || hand[a].power - hand[b].power);
    const isNatural = indices.every((v, i) => v === i);
    setHandOrder(isNatural ? null : indices);
  }, [hand, setHandOrder]);

  const sortByPower = useCallback(() => {
    if (hand.length <= 1) return;
    const indices = hand.map((_, i) => i);
    indices.sort((a, b) => hand[b].power - hand[a].power || hand[a].chakra - hand[b].chakra);
    const isNatural = indices.every((v, i) => v === i);
    setHandOrder(isNatural ? null : indices);
  }, [hand, setHandOrder]);

  const activeSortType = useMemo(() => {
    if (!handOrder || handOrder.length !== hand.length) return null;

    const costSorted = [...hand.keys()].sort(
      (a, b) => hand[a].chakra - hand[b].chakra || hand[a].power - hand[b].power,
    );
    if (handOrder.every((v, i) => v === costSorted[i])) return 'cost';

    const powerSorted = [...hand.keys()].sort(
      (a, b) => hand[b].power - hand[a].power || hand[a].chakra - hand[b].chakra,
    );
    if (handOrder.every((v, i) => v === powerSorted[i])) return 'power';

    return 'custom';
  }, [hand, handOrder]);

  return (
    <div className="flex flex-col items-center gap-1">
      
      <div
        className="relative flex items-center justify-center"
        style={{ height: dims.handContainerH + 'px', minWidth: dims.handMinW + 'px' }}
      >
        {displayHand.map(({ card, originalIndex }, displayIdx) => {
          const canAffordVisible = chakra >= card.chakra;
          const canAffordHidden = chakra >= 1;
          const canAfford = canAffordVisible || canAffordHidden;

          return (
            <HandCard
              key={`${card.id}-${originalIndex}`}
              card={card}
              displayIndex={displayIdx}
              originalIndex={originalIndex}
              total={hand.length}
              isSelected={selectedCardIndex === originalIndex}
              canAfford={isMyTurn ? canAfford : true}
              onSelect={handleSelect}
              onPreview={showPreview}
              onPreviewHide={hidePreview}
              onPin={pinCard}
              onZoom={zoomCard}
              fanSpacing={dims.handFanSpacing}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-3 py-1">
        
        {selectedCardIndex !== null && hand.length > 1 && (
          <div className="flex items-center gap-1">
            <SortPill
              label={t('game.hand.moveLeft')}
              onClick={moveCardLeft}
              accentColor={canMoveLeft ? 'rgba(196, 163, 90, 0.6)' : 'rgba(80,80,80,0.3)'}
            />
            <SortPill
              label={t('game.hand.moveRight')}
              onClick={moveCardRight}
              accentColor={canMoveRight ? 'rgba(196, 163, 90, 0.6)' : 'rgba(80,80,80,0.3)'}
            />
          </div>
        )}

        {hand.length > 1 && !dims.isMobile && (
          <div className="flex items-center gap-2">
            <SortPill
              label={t('game.hand.sortCost')}
              active={activeSortType === 'cost'}
              onClick={sortByCost}
            />
            <SortPill
              label={t('game.hand.sortPower')}
              active={activeSortType === 'power'}
              onClick={sortByPower}
            />
            {handOrder && (
              <SortPill
                label="x"
                onClick={resetHandOrder}
                accentColor="rgba(179, 62, 62, 0.4)"
              />
            )}
          </div>
        )}

        {!dims.isMobile && (
          <span className="text-[11px] tabular-nums" style={{ color: '#888888' }}>
            {t('game.board.handCount', { count: hand.length })}
          </span>
        )}
      </div>
    </div>
  );
});
