'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import type { CharacterCard } from '@/lib/engine/types';

function MulliganCard({ card, index }: { card: CharacterCard; index: number }) {
  const imagePath = card.image_file
    ? (card.image_file.replace(/\\/g, '/').startsWith('/') ? card.image_file.replace(/\\/g, '/') : `/${card.image_file.replace(/\\/g, '/')}`)
    : null;

  return (
    <motion.div
      initial={{ y: 40, opacity: 0, rotateY: 90 }}
      animate={{ y: 0, opacity: 1, rotateY: 0 }}
      transition={{
        type: 'spring',
        stiffness: 200,
        damping: 20,
        delay: index * 0.1,
      }}
      className="relative card-aspect no-select"
      style={{
        width: '115px',
        height: '161px',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        overflow: 'hidden',
        flexShrink: 0,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
      }}
    >
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
          <span
            className="text-[10px] text-center px-1"
            style={{ color: '#555555' }}
          >
            {card.name_fr}
          </span>
        </div>
      )}

      {/* Card info overlay */}
      <div
        className="absolute inset-x-0 bottom-0 px-1.5 py-1.5 flex items-end justify-between"
        style={{ background: 'linear-gradient(transparent, rgba(0, 0, 0, 0.85))' }}
      >
        <span
          className="text-[10px] font-medium truncate leading-tight"
          style={{ color: '#e0e0e0', maxWidth: '65px' }}
        >
          {card.name_fr}
        </span>
        <span
          className="text-[11px] font-bold tabular-nums"
          style={{ color: '#c4a35a' }}
        >
          {card.power}
        </span>
      </div>

      {/* Chakra badge */}
      <div
        className="absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
        style={{
          backgroundColor: 'rgba(196, 163, 90, 0.9)',
          color: '#0a0a0a',
        }}
      >
        {card.chakra}
      </div>

      {/* Rarity indicator */}
      <div
        className="absolute top-1 right-1 rounded px-1 text-[8px] font-medium"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: '#888888',
        }}
      >
        {card.rarity}
      </div>
    </motion.div>
  );
}

export function MulliganDialog() {
  const t = useTranslations();
  const visibleState = useGameStore((s) => s.visibleState);
  const performAction = useGameStore((s) => s.performAction);
  const isProcessing = useGameStore((s) => s.isProcessing);

  if (!visibleState || visibleState.phase !== 'mulligan') return null;

  const hand = visibleState.myState.hand;
  const hasMulliganed = visibleState.myState.hasMulliganed;

  // If already mulliganed, show waiting message
  if (hasMulliganed) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-40 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
      >
        <div
          className="rounded-xl p-8 flex flex-col items-center gap-4"
          style={{
            backgroundColor: 'rgba(10, 10, 14, 0.9)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <span className="text-sm" style={{ color: '#888888' }}>
            {t('game.processing')}
          </span>
        </div>
      </motion.div>
    );
  }

  const handleKeep = () => {
    if (isProcessing) return;
    performAction({ type: 'MULLIGAN', doMulligan: false });
  };

  const handleMulligan = () => {
    if (isProcessing) return;
    performAction({ type: 'MULLIGAN', doMulligan: true });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-40 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="flex flex-col items-center gap-6 rounded-xl p-8"
        style={{
          backgroundColor: 'rgba(8, 8, 12, 0.92)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 16px 64px rgba(0, 0, 0, 0.7)',
          maxWidth: '750px',
        }}
      >
        {/* Title */}
        <div className="flex flex-col items-center gap-2">
          <span
            className="text-xl font-bold uppercase tracking-wider"
            style={{ color: '#c4a35a' }}
          >
            {t('game.mulligan.title')}
          </span>
          <span className="text-sm text-center" style={{ color: '#888888' }}>
            {t('game.mulligan.description')}
          </span>
        </div>

        {/* Cards */}
        <div className="flex gap-3 justify-center flex-wrap">
          {hand.map((card, i) => (
            <MulliganCard key={`${card.id}-${i}`} card={card} index={i} />
          ))}
        </div>

        {/* Buttons */}
        <div className="flex gap-4">
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={handleKeep}
            disabled={isProcessing}
            className="px-7 py-3 rounded-lg text-sm font-medium cursor-pointer"
            style={{
              backgroundColor: '#c4a35a',
              color: '#0a0a0a',
              border: '1px solid #c4a35a',
              opacity: isProcessing ? 0.5 : 1,
              boxShadow: '0 4px 16px rgba(196, 163, 90, 0.3)',
            }}
          >
            {t('game.mulligan.keep')}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={handleMulligan}
            disabled={isProcessing}
            className="px-7 py-3 rounded-lg text-sm font-medium cursor-pointer"
            style={{
              backgroundColor: 'rgba(179, 62, 62, 0.1)',
              color: '#b33e3e',
              border: '1px solid rgba(179, 62, 62, 0.4)',
              opacity: isProcessing ? 0.5 : 1,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            }}
          >
            {t('game.mulligan.redraw')}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
