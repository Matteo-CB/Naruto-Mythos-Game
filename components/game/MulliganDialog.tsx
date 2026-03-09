'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import type { CharacterCard } from '@/lib/engine/types';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { getCardName, getCardTitle, getCardGroup, getCardKeyword } from '@/lib/utils/cardLocale';
import { effectDescriptionsFr } from '@/lib/data/effectTranslationsFr';
import { effectDescriptionsEn } from '@/lib/data/effectDescriptionsEn';
import { useGameScale } from './GameScaleContext';

const effectTypeColors: Record<string, string> = {
  MAIN: '#c4a35a',
  AMBUSH: '#b33e3e',
  UPGRADE: '#3e8b3e',
  SCORE: '#6a6abb',
};

const rarityColors: Record<string, string> = {
  C: '#888888',
  UC: '#3e8b3e',
  R: '#c4a35a',
  RA: '#c4a35a',
  S: '#b33e3e',
  SV: '#b33e3e',
  M: '#6a6abb',
  L: '#e0c040',
};

function MulliganCard({
  card,
  index,
  isSelected,
  onSelect,
}: {
  card: CharacterCard;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const locale = useLocale();
  const dims = useGameScale();
  const imagePath = normalizeImagePath(card.image_file);

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
      whileHover={{ scale: 1.05, y: -4 }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      className="relative card-aspect no-select"
      style={{
        width: dims.mulliganCard.w + 'px',
        height: dims.mulliganCard.h + 'px',
        borderRadius: '8px',
        border: isSelected ? '2px solid #c4a35a' : '1px solid rgba(255, 255, 255, 0.1)',
        overflow: 'hidden',
        flexShrink: 0,
        cursor: 'pointer',
        boxShadow: isSelected
          ? '0 0 16px rgba(196, 163, 90, 0.4), 0 4px 16px rgba(0, 0, 0, 0.5)'
          : '0 4px 16px rgba(0, 0, 0, 0.5)',
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
            {getCardName(card, locale as 'en' | 'fr')}
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
          {getCardName(card, locale as 'en' | 'fr')}
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

function MulliganCardDetail({ card }: { card: CharacterCard }) {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'fr';
  const title = getCardTitle(card, locale);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="w-full overflow-hidden"
    >
      <div
        className="rounded-lg overflow-y-auto p-3.5 flex flex-col gap-2"
        style={{
          backgroundColor: 'rgba(10, 10, 14, 0.95)',
          border: '1px solid rgba(196, 163, 90, 0.2)',
          maxHeight: 'min(280px, 40vh)',
        }}
      >
        {/* Header: Name + Rarity */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold leading-tight" style={{ color: '#e0e0e0' }}>
            {getCardName(card, locale)}
          </span>
          <span
            className="text-[10px] rounded px-1.5 py-0.5 shrink-0 font-bold"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${rarityColors[card.rarity] ?? '#888'}`,
              color: rarityColors[card.rarity] ?? '#888',
            }}
          >
            {card.rarity}
          </span>
        </div>

        {/* Title */}
        {title && (
          <span className="text-xs -mt-1" style={{ color: '#999999' }}>
            {title}
          </span>
        )}

        {/* Stats row */}
        <div
          className="flex items-center gap-4 p-2 rounded-md"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: '#888888' }}>
              {t('collection.details.cost')}
            </span>
            <span className="text-base font-bold" style={{ color: '#c4a35a' }}>
              {card.chakra}
            </span>
          </div>
          <div className="w-px h-6 shrink-0" style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: '#888888' }}>
              {t('collection.details.power')}
            </span>
            <span className="text-base font-bold" style={{ color: '#e0e0e0' }}>
              {card.power}
            </span>
          </div>
        </div>

        {/* Keywords */}
        {card.keywords && card.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {card.keywords.map((kw) => (
              <span
                key={kw}
                className="text-[10px] rounded px-1.5 py-0.5"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: '#999999',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                }}
              >
                {getCardKeyword(kw, locale)}
              </span>
            ))}
          </div>
        )}

        {/* Group */}
        {card.group && (
          <span className="text-[10px]" style={{ color: '#777777' }}>
            {t('collection.details.group')}: {getCardGroup(card.group, locale)}
          </span>
        )}

        {/* Effects */}
        {card.effects && card.effects.length > 0 && (
          <div
            className="flex flex-col gap-2 pt-2 mt-0.5"
            style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#888888' }}>
              {t('card.effects')}
            </span>
            {card.effects.map((effect, i) => {
              const raFallbackId = card.id.endsWith('-RA') ? card.id.replace('-RA', '-R') : undefined;
              const frDescs = effectDescriptionsFr[card.id] ?? (raFallbackId ? effectDescriptionsFr[raFallbackId] : undefined);
              const enDescs = effectDescriptionsEn[card.id] ?? (raFallbackId ? effectDescriptionsEn[raFallbackId] : undefined);
              const description =
                locale === 'fr'
                  ? (frDescs?.[i] ?? enDescs?.[i] ?? effect.description)
                  : (enDescs?.[i] ?? effect.description);

              return (
                <div
                  key={i}
                  className="flex flex-col gap-0.5 p-2 rounded"
                  style={{
                    backgroundColor: `${effectTypeColors[effect.type] ?? '#888888'}08`,
                    border: `1px solid ${effectTypeColors[effect.type] ?? '#888888'}15`,
                  }}
                >
                  <span
                    className="text-[10px] font-bold uppercase"
                    style={{ color: effectTypeColors[effect.type] ?? '#888888' }}
                  >
                    {t(`card.effectTypes.${effect.type}` as
                      | 'card.effectTypes.MAIN'
                      | 'card.effectTypes.UPGRADE'
                      | 'card.effectTypes.AMBUSH'
                      | 'card.effectTypes.SCORE'
                    )}
                  </span>
                  <span className="font-body text-[11px] leading-snug" style={{ color: '#aaaaaa' }}>
                    {description}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function MulliganDialog() {
  const t = useTranslations();
  const visibleState = useGameStore((s) => s.visibleState);
  const performAction = useGameStore((s) => s.performAction);
  const isProcessing = useGameStore((s) => s.isProcessing);
  const [selectedCard, setSelectedCard] = useState<CharacterCard | null>(null);

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
            {t('game.mulliganWaiting')}
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

  const toggleSelect = (card: CharacterCard) => {
    setSelectedCard((prev) => (prev?.id === card.id ? null : card));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-40 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
      onClick={() => setSelectedCard(null)}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="flex flex-col items-center gap-5 rounded-xl p-6 overflow-y-auto"
        style={{
          backgroundColor: 'rgba(8, 8, 12, 0.92)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 16px 64px rgba(0, 0, 0, 0.7)',
          maxWidth: '750px',
          maxHeight: '90vh',
          width: '95vw',
        }}
        onClick={(e) => e.stopPropagation()}
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
          <span
            className="text-xs text-center px-3 py-1.5 rounded-md"
            style={{
              color: visibleState.edgeHolder === visibleState.myPlayer ? '#c4a35a' : '#b33e3e',
              backgroundColor: visibleState.edgeHolder === visibleState.myPlayer
                ? 'rgba(196, 163, 90, 0.1)'
                : 'rgba(179, 62, 62, 0.1)',
              border: `1px solid ${visibleState.edgeHolder === visibleState.myPlayer
                ? 'rgba(196, 163, 90, 0.3)'
                : 'rgba(179, 62, 62, 0.3)'}`,
            }}
          >
            {visibleState.edgeHolder === visibleState.myPlayer
              ? t('game.mulligan.youHaveEdge')
              : t('game.mulligan.opponentHasEdge')}
          </span>
        </div>

        {/* Cards */}
        <div className="flex gap-3 justify-center flex-wrap">
          {hand.map((card, i) => (
            <MulliganCard
              key={`${card.id}-${i}`}
              card={card}
              index={i}
              isSelected={selectedCard?.id === card.id}
              onSelect={() => toggleSelect(card)}
            />
          ))}
        </div>

        {/* Click hint */}
        {!selectedCard && (
          <span className="text-[11px]" style={{ color: '#555555' }}>
            {t('game.mulligan.clickHint')}
          </span>
        )}

        {/* Inline card detail */}
        <AnimatePresence mode="wait">
          {selectedCard && (
            <MulliganCardDetail key={selectedCard.id} card={selectedCard} />
          )}
        </AnimatePresence>

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
