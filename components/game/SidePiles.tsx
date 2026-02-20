'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { DiscardPileViewer } from './DiscardPileViewer';

// Card dimensions for the piles
const CARD_W = 56;
const CARD_H = 78;

// ---------------------
// Deck pile visual
// ---------------------
function DeckPile({ count, accentColor }: { count: number; accentColor: string }) {
  const t = useTranslations();
  const stackLayers = Math.min(count, 4);

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[9px] uppercase tracking-wider font-medium" style={{ color: '#666' }}>
        {t('game.deck')}
      </span>
      <div className="relative" style={{ width: CARD_W + 6, height: CARD_H + 6 }}>
        {/* Stack shadow layers */}
        {Array.from({ length: stackLayers }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded"
            style={{
              width: CARD_W,
              height: CARD_H,
              bottom: i * 2,
              left: (stackLayers - 1 - i) * 1.5,
              backgroundColor: '#15151a',
              border: '1px solid #2a2a32',
            }}
          />
        ))}
        {/* Top card */}
        <motion.div
          key={count}
          initial={{ scale: 0.95, opacity: 0.8 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute rounded overflow-hidden"
          style={{
            width: CARD_W,
            height: CARD_H,
            bottom: 0,
            left: 0,
            border: count > 0
              ? `1.5px solid ${accentColor}40`
              : '1.5px solid #2a2a32',
            opacity: count > 0 ? 1 : 0.3,
            boxShadow: count > 0
              ? `0 4px 12px rgba(0,0,0,0.5), 0 0 8px ${accentColor}15`
              : 'none',
          }}
        >
          <img
            src="/images/card-back.webp"
            alt="Deck"
            className="w-full h-full"
            style={{ objectFit: 'cover' }}
            draggable={false}
          />
        </motion.div>
      </div>
      {/* Count badge */}
      <motion.span
        key={count}
        initial={{ scale: 1.4, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-sm font-bold tabular-nums"
        style={{ color: count > 0 ? accentColor : '#555' }}
      >
        {count}
      </motion.span>
    </div>
  );
}

// ---------------------
// Discard pile visual
// ---------------------
function DiscardPile({
  count,
  accentColor,
  onClick,
}: {
  count: number;
  accentColor: string;
  onClick: () => void;
}) {
  const t = useTranslations();
  const stackLayers = Math.min(count, 3);

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        onClick={onClick}
        className="relative cursor-pointer"
        style={{
          width: CARD_W + 6,
          height: CARD_H + 6,
          background: 'none',
          border: 'none',
          padding: 0,
        }}
        title={`${t('game.discard')}: ${count}`}
      >
        {/* Stack shadow layers */}
        {Array.from({ length: stackLayers }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded"
            style={{
              width: CARD_W,
              height: CARD_H,
              bottom: i * 2,
              left: (stackLayers - 1 - i) * 1.5,
              backgroundColor: '#15151a',
              border: `1px solid ${accentColor}25`,
            }}
          />
        ))}
        {/* Top card or empty slot */}
        {count > 0 ? (
          <div
            className="absolute rounded overflow-hidden"
            style={{
              width: CARD_W,
              height: CARD_H,
              bottom: 0,
              left: 0,
              border: `1.5px solid ${accentColor}50`,
              boxShadow: `0 4px 12px rgba(0,0,0,0.5)`,
            }}
          >
            <img
              src="/images/card-back.webp"
              alt="Discard"
              className="w-full h-full"
              style={{ objectFit: 'cover', filter: 'brightness(0.4) sepia(0.3)' }}
              draggable={false}
            />
          </div>
        ) : (
          <div
            className="absolute rounded flex items-center justify-center"
            style={{
              width: CARD_W,
              height: CARD_H,
              bottom: 0,
              left: 0,
              border: `1.5px dashed rgba(255,255,255,0.08)`,
              backgroundColor: 'rgba(255,255,255,0.02)',
            }}
          />
        )}
      </motion.button>
      {/* Count badge */}
      <motion.span
        key={count}
        initial={{ scale: 1.4, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-sm font-bold tabular-nums"
        style={{ color: count > 0 ? accentColor : '#555' }}
      >
        {count}
      </motion.span>
      <span className="text-[9px] uppercase tracking-wider font-medium" style={{ color: '#666' }}>
        {t('game.discard')}
      </span>
    </div>
  );
}

// ---------------------
// Left side: Opponent piles
// ---------------------
export function OpponentSidePiles() {
  const visibleState = useGameStore((s) => s.visibleState);
  if (!visibleState) return null;

  const { opponentState } = visibleState;
  const deckCount = opponentState.deckSize;
  const discardCount = opponentState.discardPileSize;

  return (
    <aside
      className="flex flex-col items-center justify-center gap-4 shrink-0 py-2"
      style={{
        width: '80px',
        backgroundColor: 'rgba(8, 8, 12, 0.5)',
        backdropFilter: 'blur(4px)',
        borderRight: '1px solid rgba(255, 255, 255, 0.04)',
      }}
    >
      <DeckPile count={deckCount} accentColor="#b33e3e" />
      <DiscardPile
        count={discardCount}
        accentColor="#b33e3e"
        onClick={() => {}}
      />
    </aside>
  );
}

// ---------------------
// Right side: Player piles
// ---------------------
export function PlayerSidePiles() {
  const t = useTranslations();
  const visibleState = useGameStore((s) => s.visibleState);
  const [showDiscard, setShowDiscard] = useState(false);

  if (!visibleState) return null;

  const { myState } = visibleState;
  const deckCount = myState.deck.length;
  const discardCount = myState.discardPile.length;

  return (
    <>
      <aside
        className="flex flex-col items-center justify-center gap-4 shrink-0 py-2"
        style={{
          width: '80px',
          backgroundColor: 'rgba(8, 8, 12, 0.5)',
          backdropFilter: 'blur(4px)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.04)',
        }}
      >
        <DeckPile count={deckCount} accentColor="#c4a35a" />
        <DiscardPile
          count={discardCount}
          accentColor="#c4a35a"
          onClick={() => setShowDiscard(true)}
        />
      </aside>

      <AnimatePresence>
        {showDiscard && (
          <DiscardPileViewer
            cards={myState.discardPile}
            onClose={() => setShowDiscard(false)}
            title={t('game.discard')}
          />
        )}
      </AnimatePresence>
    </>
  );
}
