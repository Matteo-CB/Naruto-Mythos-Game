'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { useDeckBuilderStore } from '@/stores/deckBuilderStore';
import { EVOLVING_CARDS } from '@/lib/evolving/cardCosts';
import { EVOLVING_MAX_POINTS } from '@/lib/evolving/constants';
import { getEvolvingColorForBracket } from '@/lib/evolving/colors';
import { getCharacterById } from '@/lib/data/cardIndex';
import { getCardName, getCardTitle } from '@/lib/utils/cardLocale';
import type { CharacterCard } from '@/lib/engine/types';

const GOLD = 'var(--t-accent)';
const PANEL_BG = 'var(--t-bg)';
const BORDER = 'var(--t-border)';
const TEXT_LIGHT = 'var(--t-text)';
const TEXT_DIM = 'var(--t-muted)';
const WARN = '#cc7a30';

interface HelperEntry {
  cardId: string;
  card: CharacterCard;
  pointCost: number;
  costMode: 'per-copy' | 'flat';
  inDeckCount: number;
  flatAlreadyPaid: boolean;
}

function extractCardNumber(cardId: string): string {
  const m = cardId.match(/^[A-Z]+-(\d+)/);
  return m ? m[1] : '';
}

function extractCardRarity(cardId: string): string {
  const m = cardId.match(/^[A-Z]+-\d+-([A-Z]+)$/);
  return m ? m[1] : '';
}

export function EvolvingBuilderHelper() {
  const t = useTranslations('evolving.helper');
  const tRules = useTranslations('evolving.rules');
  const locale = useLocale() as 'en' | 'fr';

  const deckChars = useDeckBuilderStore((s) => s.deckChars);
  const currentPoints = useDeckBuilderStore((s) => s.computeCurrentEvolvingPoints());
  const addChar = useDeckBuilderStore((s) => s.addChar);
  const setEvolvingMode = useDeckBuilderStore((s) => s.setEvolvingMode);

  const remaining = Math.max(0, EVOLVING_MAX_POINTS - currentPoints);
  const overBudget = currentPoints > EVOLVING_MAX_POINTS;

  const entries: HelperEntry[] = useMemo(() => {
    const out: HelperEntry[] = [];
    for (const [cardId, cost] of EVOLVING_CARDS) {
      const card = getCharacterById(cardId);
      if (!card) continue;
      const inDeckCount = deckChars.filter((c) => c.id === cardId).length;
      out.push({
        cardId,
        card,
        pointCost: cost.pointCost,
        costMode: cost.costMode,
        inDeckCount,
        flatAlreadyPaid: cost.costMode === 'flat' && inDeckCount > 0,
      });
    }
    out.sort((a, b) => {
      if (a.pointCost !== b.pointCost) return b.pointCost - a.pointCost;
      return a.cardId.localeCompare(b.cardId);
    });
    return out;
  }, [deckChars]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.22 }}
        className="flex flex-col gap-3 p-3 sm:p-4"
        style={{
          backgroundColor: PANEL_BG,
        }}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em]" style={{ color: GOLD }}>
            {t('title')}
          </h3>
          <button
            onClick={() => setEvolvingMode(false)}
            className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider px-2 py-0.5"
            style={{
              color: TEXT_DIM,
              border: `1px solid ${BORDER}`,
              backgroundColor: 'transparent',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {t('exit')}
          </button>
        </div>

        <div className="text-[10px] sm:text-xs leading-relaxed" style={{ color: TEXT_LIGHT }}>
          {t('description', { max: EVOLVING_MAX_POINTS })}
        </div>

        <div
          className="flex items-center justify-between gap-3 px-3 py-2"
          style={{
            backgroundColor: 'rgba(0,0,0,0.4)',
            border: `1px solid ${BORDER}`,
          }}
        >
          <span className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_DIM }}>
            {t('remainingLabel')}
          </span>
          <span
            className="text-lg sm:text-xl font-bold tabular-nums"
            style={{ color: overBudget ? WARN : GOLD, lineHeight: 1 }}
          >
            {remaining}
            <span className="text-xs" style={{ color: TEXT_DIM }}>/{EVOLVING_MAX_POINTS}</span>
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          {entries.map((e) => {
            const color = getEvolvingColorForBracket(e.pointCost as 1 | 2);
            const projectedAddCost = e.flatAlreadyPaid ? 0 : e.pointCost;
            const wouldExceed = currentPoints + projectedAddCost > EVOLVING_MAX_POINTS;
            const atMaxCopies = e.inDeckCount >= 2;
            const disabled = atMaxCopies || wouldExceed;

            return (
              <div
                key={e.cardId}
                className="flex items-center gap-2 px-2 py-1.5 sm:py-2"
                style={{
                  backgroundColor: e.inDeckCount > 0 ? 'rgba(196,163,90,0.04)' : 'rgba(255,255,255,0.015)',
                  border: `1px solid ${e.inDeckCount > 0 ? color : BORDER}`,
                }}
              >
                <span
                  className="shrink-0 inline-flex items-center justify-center text-[10px] font-bold tabular-nums"
                  style={{
                    color,
                    border: `1px solid ${color}`,
                    backgroundColor: 'rgba(0,0,0,0.3)',
                    width: '22px',
                    height: '22px',
                    borderRadius: '3px',
                  }}
                >
                  {e.pointCost}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] sm:text-xs font-bold truncate" style={{ color: TEXT_LIGHT }}>
                    {getCardName(e.card, locale)}
                    <span className="ml-1 font-normal" style={{ color: TEXT_DIM }}>
                      ({getCardTitle(e.card, locale)} {extractCardNumber(e.cardId)} {extractCardRarity(e.cardId)})
                    </span>
                  </div>
                  {e.costMode === 'flat' && (
                    <div className="mt-0.5">
                      <span className="inline-block px-1 py-0.5 text-[8px]" style={{ color: GOLD, border: `1px solid ${GOLD}` }}>
                        {tRules('flatBadge')}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className="text-[10px] tabular-nums px-1.5 py-0.5"
                    style={{
                      color: e.inDeckCount > 0 ? color : TEXT_DIM,
                      border: `1px solid ${e.inDeckCount > 0 ? color : BORDER}`,
                      minWidth: '32px',
                      textAlign: 'center',
                    }}
                  >
                    {e.inDeckCount}/2
                  </span>
                  <button
                    onClick={() => {
                      if (disabled) return;
                      addChar(e.card);
                    }}
                    disabled={disabled}
                    aria-label={t('addAria', { name: getCardName(e.card, locale) })}
                    className="text-[10px] sm:text-xs font-bold uppercase tracking-wider px-2 py-1"
                    style={{
                      backgroundColor: disabled ? 'transparent' : color,
                      color: disabled ? TEXT_DIM : 'var(--t-bg)',
                      border: `1px solid ${disabled ? BORDER : color}`,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      outline: 'none',
                      opacity: disabled ? 0.5 : 1,
                      minWidth: '32px',
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-[9px] sm:text-[10px]" style={{ color: TEXT_DIM }}>
          {t('hint')}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
