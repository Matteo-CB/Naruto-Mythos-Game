'use client';

import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocale } from 'next-intl';
import type { CardData, CharacterCard, MissionCard } from '@/lib/engine/types';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { getCardName } from '@/lib/utils/cardLocale';
import { useUIStore } from '@/stores/uiStore';
import { PopupOverlay, PopupCornerFrame, PopupMinimizeX } from './PopupPrimitives';

interface DiscardPileViewerProps {
  cards: CardData[];
  onClose: () => void;
  title: string;
}

export function DiscardPileViewer({ cards, onClose, title }: DiscardPileViewerProps) {
  const locale = useLocale();
  const zoomCard = useUIStore((s) => s.zoomCard);

  const handleDetails = useCallback((card: CardData) => {
    zoomCard(card as CharacterCard | MissionCard);
  }, [zoomCard]);

  return (
    <AnimatePresence>
      <PopupOverlay onClickBg={onClose}>
        <PopupCornerFrame
          accentColor="rgba(196, 163, 90, 0.3)"
          maxWidth="720px"
          padding="0"
        >
          <div
            className="flex flex-col"
            style={{ maxHeight: '80vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-3 shrink-0"
              style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold uppercase tracking-wider" style={{ color: '#c4a35a' }}>
                  {title}
                </span>
                <span
                  className="text-xs px-2 py-0.5 tabular-nums"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    color: '#888888',
                    borderLeft: '2px solid rgba(196, 163, 90, 0.3)',
                  }}
                >
                  {cards.length}
                </span>
              </div>
              <PopupMinimizeX onClick={onClose} />
            </div>

            {/* Card grid */}
            <div className="p-4 overflow-y-auto flex-1">
              {cards.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <span className="text-sm" style={{ color: '#555555' }}>
                    --
                  </span>
                </div>
              ) : (
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))' }}>
                  {[...cards].reverse().map((card, i) => {
                    const imagePath = normalizeImagePath(card.image_file);

                    return (
                      <motion.div
                        key={`${card.id}-${i}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03, duration: 0.15 }}
                        className="group relative flex flex-col items-center gap-1 p-1.5 cursor-pointer"
                        onClick={() => handleDetails(card)}
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                        }}
                      >
                        <div className="relative w-full">
                          {imagePath ? (
                            <img
                              src={imagePath}
                              alt={getCardName(card, locale as 'en' | 'fr')}
                              draggable={false}
                              className="w-full"
                              style={{ aspectRatio: '5/7', objectFit: 'cover' }}
                            />
                          ) : (
                            <div
                              className="w-full flex items-center justify-center"
                              style={{
                                aspectRatio: '5/7',
                                backgroundColor: '#1a1a1a',
                              }}
                            >
                              <span className="text-[9px]" style={{ color: '#555' }}>?</span>
                            </div>
                          )}
                        </div>
                        <span
                          className="text-[9px] text-center leading-tight w-full truncate"
                          style={{ color: '#999999' }}
                          title={getCardName(card, locale as 'en' | 'fr')}
                        >
                          {getCardName(card, locale as 'en' | 'fr')}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </PopupCornerFrame>
      </PopupOverlay>
    </AnimatePresence>
  );
}
