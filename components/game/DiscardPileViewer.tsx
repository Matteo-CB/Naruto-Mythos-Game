'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { CharacterCard } from '@/lib/engine/types';
import { normalizeImagePath } from '@/lib/utils/imagePath';

interface DiscardPileViewerProps {
  cards: CharacterCard[];
  onClose: () => void;
  title: string;
}

export function DiscardPileViewer({ cards, onClose, title }: DiscardPileViewerProps) {
  return (
    <AnimatePresence>
      <motion.div
        key="discard-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-250 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="relative rounded-xl overflow-hidden flex flex-col"
          style={{
            maxWidth: '720px',
            width: '90vw',
            maxHeight: '80vh',
            backgroundColor: 'rgba(10, 10, 14, 0.98)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-3 shrink-0"
            style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold" style={{ color: '#e0e0e0' }}>
                {title}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded tabular-nums"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: '#888888',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                {cards.length}
              </span>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer"
              style={{
                backgroundColor: 'rgba(179, 62, 62, 0.12)',
                color: '#b33e3e',
                border: '1px solid rgba(179, 62, 62, 0.3)',
              }}
            >
              X
            </button>
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
                {cards.map((card, i) => {
                  const imagePath = normalizeImagePath(card.image_file);

                  return (
                    <motion.div
                      key={`${card.id}-${i}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03, duration: 0.15 }}
                      className="flex flex-col items-center gap-1 p-1.5 rounded-lg"
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                      }}
                    >
                      {imagePath ? (
                        <img
                          src={imagePath}
                          alt={card.name_fr}
                          draggable={false}
                          className="w-full rounded"
                          style={{ aspectRatio: '5/7', objectFit: 'cover' }}
                        />
                      ) : (
                        <div
                          className="w-full rounded flex items-center justify-center"
                          style={{
                            aspectRatio: '5/7',
                            backgroundColor: '#1a1a1a',
                          }}
                        >
                          <span className="text-[9px]" style={{ color: '#555' }}>?</span>
                        </div>
                      )}
                      <span
                        className="text-[9px] text-center leading-tight w-full truncate"
                        style={{ color: '#999999' }}
                        title={card.name_fr}
                      >
                        {card.name_fr}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
