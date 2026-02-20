'use client';

import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { normalizeImagePath } from '@/lib/utils/imagePath';

interface HandCardInfo {
  index: number;
  card: {
    name_fr: string;
    chakra?: number;
    power?: number;
    image_file?: string;
  };
}

function HandCard({
  cardInfo,
  onSelect,
}: {
  cardInfo: HandCardInfo;
  onSelect: (index: string) => void;
}) {
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
      onClick={() => onSelect(String(index))}
      className="relative no-select"
      style={{
        width: '110px',
        height: '154px',
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
            {card.name_fr}
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

      {/* Card name overlay */}
      <div
        className="absolute inset-x-0 bottom-0 text-center py-1 text-[8px] font-medium truncate px-1"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: '#c4a35a',
        }}
      >
        {card.name_fr}
      </div>
    </motion.div>
  );
}

export function HandCardSelector() {
  const t = useTranslations();
  const pendingTargetSelection = useGameStore((s) => s.pendingTargetSelection);
  const selectTarget = useGameStore((s) => s.selectTarget);
  const declineTarget = useGameStore((s) => s.declineTarget);

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

  const { handCards, description, onDecline, playerName } = pendingTargetSelection;
  const canDecline = !!onDecline;
  const displayName = playerName || t('game.you');

  if (!handCards || handCards.length === 0) return null;

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
        {/* Player announcement banner */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          className="mb-4 px-10 py-3 rounded-lg flex items-center gap-3"
          style={{
            backgroundColor: 'rgba(196, 163, 90, 0.08)',
            border: '2px solid rgba(196, 163, 90, 0.3)',
            boxShadow: '0 0 24px rgba(196, 163, 90, 0.15)',
          }}
        >
          <motion.div
            className="rounded-full"
            style={{
              width: '10px',
              height: '10px',
              backgroundColor: '#c4a35a',
            }}
            animate={{
              boxShadow: [
                '0 0 4px rgba(196, 163, 90, 0.4)',
                '0 0 12px rgba(196, 163, 90, 0.8)',
                '0 0 4px rgba(196, 163, 90, 0.4)',
              ],
            }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          />
          <span
            className="text-lg font-bold uppercase tracking-wider"
            style={{ color: '#c4a35a' }}
          >
            {t('game.mustChooseCard', { player: displayName })}
          </span>
        </motion.div>

        {/* Description */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 20 }}
          className="mb-8 px-6 py-3 rounded-lg"
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #333333',
            maxWidth: '500px',
          }}
        >
          <span className="text-xs text-center leading-relaxed" style={{ color: '#e0e0e0' }}>
            {description}
          </span>
        </motion.div>

        {/* Hand cards */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 180, damping: 18 }}
          className="flex gap-3 overflow-x-auto px-6 py-4 rounded-lg"
          style={{
            backgroundColor: 'rgba(10, 10, 14, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
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
            className="mt-6 px-6 py-2.5 rounded-md text-sm font-medium uppercase tracking-wider cursor-pointer"
            style={{
              backgroundColor: 'transparent',
              color: '#888888',
              border: '1px solid #333333',
            }}
          >
            {t('game.board.skip')}
          </motion.button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
