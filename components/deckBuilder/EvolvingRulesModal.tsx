'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { EVOLVING_CARDS } from '@/lib/evolving/cardCosts';
import { EVOLVING_MAX_POINTS } from '@/lib/evolving/constants';
import { getEvolvingColorForBracket } from '@/lib/evolving/colors';
import { getCharacterById } from '@/lib/data/cardIndex';
import { getCardName, getCardTitle } from '@/lib/utils/cardLocale';

function extractCardNumber(cardId: string): string {
  const m = cardId.match(/^[A-Z]+-(\d+)/);
  return m ? m[1] : '';
}

function extractCardRarity(cardId: string): string {
  const m = cardId.match(/^[A-Z]+-\d+-([A-Z]+)$/);
  return m ? m[1] : '';
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const GOLD = '#c4a35a';
const PANEL_BG = '#111111';
const BORDER = '#262626';
const TEXT_LIGHT = '#e0e0e0';
const TEXT_DIM = '#888888';

export function EvolvingRulesModal({ open, onClose }: Props) {
  const t = useTranslations('evolving.rules');
  const locale = useLocale() as 'en' | 'fr';
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const sortedCards = Array.from(EVOLVING_CARDS.entries()).sort(([, a], [, b]) => {
    if (a.pointCost !== b.pointCost) return b.pointCost - a.pointCost;
    return 0;
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-100 flex items-end sm:items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="evolving-rules-title"
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="w-full sm:max-w-160 max-h-[92vh] sm:max-h-[80vh] overflow-hidden flex flex-col"
            style={{
              backgroundColor: PANEL_BG,
              border: `1px solid ${BORDER}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-4 sm:px-5 py-3 shrink-0"
              style={{ borderBottom: `1px solid ${BORDER}` }}
            >
              <h2
                id="evolving-rules-title"
                className="text-sm sm:text-base font-bold uppercase tracking-[0.18em]"
                style={{ color: GOLD }}
              >
                {t('title')}
              </h2>
              <button
                ref={closeRef}
                onClick={onClose}
                aria-label={t('close')}
                className="w-8 h-8 flex items-center justify-center text-lg font-bold transition-colors"
                style={{
                  color: TEXT_DIM,
                  border: `1px solid ${BORDER}`,
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = TEXT_LIGHT; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = TEXT_DIM; }}
              >
                x
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
              <div className="flex flex-col gap-3">
                <p className="text-xs sm:text-sm leading-relaxed" style={{ color: TEXT_LIGHT }}>
                  {t('intro', { max: EVOLVING_MAX_POINTS })}
                </p>
                <p className="text-xs sm:text-sm leading-relaxed" style={{ color: TEXT_LIGHT }}>
                  {t('costRule')}
                </p>
                <p className="text-xs sm:text-sm leading-relaxed" style={{ color: TEXT_LIGHT }}>
                  {t('bonusRule')}
                </p>
                <p className="text-xs sm:text-sm leading-relaxed" style={{ color: TEXT_LIGHT }}>
                  {t('setRule')}
                </p>
                <p className="text-xs sm:text-sm leading-relaxed" style={{ color: TEXT_LIGHT }}>
                  {t('freeRule')}
                </p>
              </div>

              <h3
                className="mt-5 mb-2 text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em]"
                style={{ color: TEXT_DIM }}
              >
                {t('cardListTitle')}
              </h3>

              <div className="flex flex-col">
                {sortedCards.map(([cardId, cost]) => {
                  const color = getEvolvingColorForBracket(cost.pointCost as 1 | 2 | 3 | 4 | 5);
                  const isFlat = cost.costMode === 'flat';
                  const card = getCharacterById(cardId);
                  const number = extractCardNumber(cardId);
                  const rarity = extractCardRarity(cardId);
                  return (
                    <div
                      key={cardId}
                      className="flex items-center justify-between gap-2 py-2 px-2"
                      style={{ borderTop: `1px solid ${BORDER}` }}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className="shrink-0 inline-flex items-center justify-center text-[10px] font-bold tabular-nums"
                          style={{
                            color,
                            border: `1px solid ${color}`,
                            backgroundColor: 'rgba(0,0,0,0.3)',
                            width: '24px',
                            height: '24px',
                            borderRadius: '3px',
                          }}
                        >
                          {cost.pointCost}
                        </span>
                        <span className="text-xs sm:text-sm truncate" style={{ color: TEXT_LIGHT }}>
                          {card ? getCardName(card, locale) : cardId}
                          <span className="ml-1 font-normal" style={{ color: TEXT_DIM }}>
                            ({card ? getCardTitle(card, locale) : '?'} {number} {rarity})
                          </span>
                        </span>
                      </div>
                      {isFlat && (
                        <span
                          className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 shrink-0"
                          style={{
                            color: GOLD,
                            border: `1px solid ${GOLD}`,
                            borderRadius: '3px',
                          }}
                        >
                          {t('flatBadge')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              className="px-4 sm:px-5 py-3 shrink-0"
              style={{ borderTop: `1px solid ${BORDER}` }}
            >
              <button
                onClick={onClose}
                className="w-full px-4 py-2 text-xs sm:text-sm font-bold uppercase tracking-wider transition-all"
                style={{
                  backgroundColor: GOLD,
                  color: '#0a0a0a',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {t('close')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
