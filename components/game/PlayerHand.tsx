'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import type { CharacterCard } from '@/lib/engine/types';
import { useBannedCards } from '@/lib/hooks/useBannedCards';

interface PlayerHandProps {
  hand: CharacterCard[];
  chakra: number;
}

interface HandCardProps {
  card: CharacterCard;
  index: number;
  total: number;
  isSelected: boolean;
  canAfford: boolean;
  onSelect: (index: number) => void;
  onPreview: (card: CharacterCard, position: { x: number; y: number }) => void;
  onPreviewHide: () => void;
  onPin: (card: CharacterCard) => void;
}

function HandCard({
  card,
  index,
  total,
  isSelected,
  canAfford,
  onSelect,
  onPreview,
  onPreviewHide,
  onPin,
}: HandCardProps) {
  // Fan effect: spread cards with rotation
  const midpoint = (total - 1) / 2;
  const offset = index - midpoint;
  const rotation = offset * 2.5; // degrees per position from center
  const translateX = offset * 48; // spacing between cards
  const arcY = Math.abs(offset) * 3; // Arc curve

  const { bannedIds } = useBannedCards();
  const isBanned = bannedIds.has(card.id);
  const imagePath = !isBanned && card.image_file
    ? (card.image_file.replace(/\\/g, '/').startsWith('/') ? card.image_file.replace(/\\/g, '/') : `/${card.image_file.replace(/\\/g, '/')}`)
    : null;

  return (
    <motion.div
      layout
      initial={{ y: 100, opacity: 0, rotate: 0 }}
      animate={{
        y: isSelected ? -20 : 0,
        opacity: 1,
        rotate: rotation,
        x: translateX,
        scale: isSelected ? 1.08 : 1,
      }}
      whileHover={{
        y: isSelected ? -20 : -12,
        scale: 1.06,
        zIndex: 100,
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 25,
        delay: index * 0.04,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(index);
        onPin(card);
      }}
      onMouseEnter={(e) => {
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        onPreview(card, { x: rect.left, y: rect.top - 200 });
      }}
      onMouseLeave={() => onPreviewHide()}
      className="absolute no-select cursor-pointer"
      style={{
        width: '80px',
        height: '112px',
        borderRadius: '7px',
        border: isSelected
          ? '2px solid #c4a35a'
          : canAfford
            ? '1px solid rgba(255, 255, 255, 0.1)'
            : '1px solid rgba(179, 62, 62, 0.3)',
        overflow: 'hidden',
        zIndex: isSelected ? 50 : index,
        transform: `translateY(${arcY}px)`,
        opacity: canAfford ? 1 : 0.55,
        boxShadow: isSelected
          ? '0 0 20px rgba(196, 163, 90, 0.4), 0 8px 24px rgba(0, 0, 0, 0.6)'
          : '0 4px 16px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Card image background */}
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
            {card.name_fr}
          </span>
        </div>
      )}

      {/* Card info overlay */}
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
          {card.name_fr}
        </span>
        <span
          className="text-[10px] font-bold tabular-nums"
          style={{ color: '#c4a35a' }}
        >
          {card.power}
        </span>
      </div>

      {/* Chakra cost badge */}
      <div
        className="absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
        style={{
          backgroundColor: canAfford
            ? 'rgba(196, 163, 90, 0.9)'
            : 'rgba(179, 62, 62, 0.9)',
          color: '#0a0a0a',
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
        }}
      >
        {card.chakra}
      </div>

      {/* Unaffordable overlay */}
      {!canAfford && (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: 'rgba(10, 10, 10, 0.4)' }}
        />
      )}
    </motion.div>
  );
}

export function PlayerHand({ hand, chakra }: PlayerHandProps) {
  const t = useTranslations();
  const selectedCardIndex = useUIStore((s) => s.selectedCardIndex);
  const selectCard = useUIStore((s) => s.selectCard);
  const showPreview = useUIStore((s) => s.showPreview);
  const hidePreview = useUIStore((s) => s.hidePreview);
  const pinCard = useUIStore((s) => s.pinCard);
  const visibleState = useGameStore((s) => s.visibleState);
  const isProcessing = useGameStore((s) => s.isProcessing);

  const isMyTurn =
    visibleState?.activePlayer === visibleState?.myPlayer &&
    visibleState?.phase === 'action' &&
    !isProcessing;

  const handleSelect = (index: number) => {
    if (!isMyTurn) return;
    if (selectedCardIndex === index) {
      selectCard(null);
    } else {
      selectCard(index);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Fanned cards */}
      <div
        className="relative flex items-center justify-center"
        style={{ height: '110px', minWidth: '400px' }}
      >
        {hand.map((card, i) => {
          // A card can be played if the player can afford at least 1 chakra (hidden play)
          // or the full cost. We show "can afford" for the hidden cost minimum.
          const canAffordVisible = chakra >= card.chakra;
          const canAffordHidden = chakra >= 1;
          const canAfford = canAffordVisible || canAffordHidden;

          return (
            <HandCard
              key={`${card.id}-${i}`}
              card={card}
              index={i}
              total={hand.length}
              isSelected={selectedCardIndex === i}
              canAfford={isMyTurn ? canAfford : true}
              onSelect={handleSelect}
              onPreview={showPreview}
              onPreviewHide={hidePreview}
              onPin={pinCard}
            />
          );
        })}
      </div>

      {/* Hand count */}
      <span className="text-[11px] tabular-nums" style={{ color: '#888888' }}>
        {t('game.board.handCount', { count: hand.length })}
      </span>
    </div>
  );
}
