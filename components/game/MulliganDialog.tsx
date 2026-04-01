'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import type { CharacterCard } from '@/lib/engine/types';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { getCardName, getCardTitle, getCardGroup, getCardKeyword } from '@/lib/utils/cardLocale';
import { effectDescriptionsFr } from '@/lib/data/effectTranslationsFr';
import { effectDescriptionsEn } from '@/lib/data/effectDescriptionsEn';
import { playSound } from '@/lib/sound/SoundManager';
import { useGameScale } from './GameScaleContext';
import {
  PopupOverlay,
  PopupCornerFrame,
  PopupTitle,
  PopupActionButton,
  PopupDismissLink,
  PanelFrame,
} from './PopupPrimitives';

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
      initial={{ y: 30, opacity: 0, scale: 0.85 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 200,
        damping: 20,
        delay: index * 0.1,
      }}
      whileHover={{ y: -4 }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      className="relative card-aspect no-select"
      style={{
        width: dims.mulliganCard.w + 'px',
        height: dims.mulliganCard.h + 'px',
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
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
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

      {/* Chakra badge — square */}
      <div
        className="absolute top-1 left-1 w-5 h-5 flex items-center justify-center text-[10px] font-bold"
        style={{
          backgroundColor: 'rgba(12, 12, 18, 0.9)',
          color: '#c4a35a',
          border: '1px solid rgba(196, 163, 90, 0.5)',
        }}
      >
        {card.chakra}
      </div>

      {/* Rarity indicator */}
      <div
        className="absolute top-1 right-1 px-1 text-[8px] font-medium"
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
      <PanelFrame accentColor="rgba(196, 163, 90, 0.25)" padding="12px 14px">
        <div
          className="overflow-y-auto flex flex-col gap-2"
          style={{ maxHeight: 'min(280px, 40vh)' }}
        >
          {/* Header: Name + Rarity */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold leading-tight" style={{ color: '#e0e0e0' }}>
              {getCardName(card, locale)}
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 shrink-0 font-bold"
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
            <span className="font-body text-xs -mt-1" style={{ color: '#999999' }}>
              {title}
            </span>
          )}

          {/* Stats row */}
          <div
            className="flex items-center gap-4 p-2"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderLeft: '2px solid rgba(196, 163, 90, 0.3)',
            }}
          >
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-body text-[10px] uppercase tracking-wider" style={{ color: '#888888' }}>
                {t('collection.details.cost')}
              </span>
              <span className="text-base font-bold" style={{ color: '#c4a35a' }}>
                {card.chakra}
              </span>
            </div>
            <div className="w-px h-6 shrink-0" style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-body text-[10px] uppercase tracking-wider" style={{ color: '#888888' }}>
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
                  className="text-[10px] px-1.5 py-0.5"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    color: '#999999',
                    borderLeft: '2px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  {getCardKeyword(kw, locale)}
                </span>
              ))}
            </div>
          )}

          {/* Group */}
          {card.group && (
            <span className="font-body text-[10px]" style={{ color: '#777777' }}>
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
                    className="flex flex-col gap-0.5 p-2"
                    style={{
                      backgroundColor: `${effectTypeColors[effect.type] ?? '#888888'}08`,
                      borderLeft: `2px solid ${effectTypeColors[effect.type] ?? '#888888'}40`,
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
      </PanelFrame>
    </motion.div>
  );
}

export function MulliganDialog() {
  const t = useTranslations();
  const visibleState = useGameStore((s) => s.visibleState);
  const performAction = useGameStore((s) => s.performAction);
  const isProcessing = useGameStore((s) => s.isProcessing);
  const coinFlipComplete = useUIStore((s) => s.coinFlipComplete);
  const [selectedCard, setSelectedCard] = useState<CharacterCard | null>(null);

  // Wait for coin flip animation to finish before showing mulligan
  if (!visibleState || visibleState.phase !== 'mulligan' || !coinFlipComplete) return null;

  const hand = visibleState.myState.hand;
  const hasMulliganed = visibleState.myState.hasMulliganed;

  // If already mulliganed, show waiting message
  if (hasMulliganed) {
    return (
      <PopupOverlay>
        <PopupCornerFrame accentColor="rgba(196, 163, 90, 0.2)" maxWidth="400px" padding="32px 28px">
          <div className="flex flex-col items-center gap-4">
            <span className="font-body text-sm" style={{ color: '#888888' }}>
              {t('game.mulliganWaiting')}
            </span>
          </div>
        </PopupCornerFrame>
      </PopupOverlay>
    );
  }

  const handleKeep = () => {
    if (isProcessing) return;
    playSound('mulligan');
    performAction({ type: 'MULLIGAN', doMulligan: false });
  };

  const handleMulligan = () => {
    if (isProcessing) return;
    playSound('mulligan');
    performAction({ type: 'MULLIGAN', doMulligan: true });
  };

  const toggleSelect = (card: CharacterCard) => {
    setSelectedCard((prev) => (prev?.id === card.id ? null : card));
  };

  return (
    <PopupOverlay onClickBg={() => setSelectedCard(null)}>
      <PopupCornerFrame
        accentColor="rgba(196, 163, 90, 0.35)"
        maxWidth="750px"
        padding="28px 24px"
      >
        <div
          className="flex flex-col items-center gap-5"
          style={{ maxHeight: '85vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Scrollable content */}
          <div className="flex flex-col items-center gap-5 overflow-y-auto w-full shrink min-h-0">
            {/* Title */}
            <PopupTitle accentColor="#c4a35a" size="lg">
              {t('game.mulligan.title')}
            </PopupTitle>

            <span className="font-body text-sm text-center" style={{ color: '#888888' }}>
              {t('game.mulligan.description')}
            </span>

            {/* Edge badge */}
            <span
              className="font-body text-xs text-center px-3 py-1.5"
              style={{
                color: visibleState.edgeHolder === visibleState.myPlayer ? '#c4a35a' : '#b33e3e',
                backgroundColor: visibleState.edgeHolder === visibleState.myPlayer
                  ? 'rgba(196, 163, 90, 0.08)'
                  : 'rgba(179, 62, 62, 0.08)',
                borderLeft: `3px solid ${visibleState.edgeHolder === visibleState.myPlayer
                  ? 'rgba(196, 163, 90, 0.4)'
                  : 'rgba(179, 62, 62, 0.4)'}`,
              }}
            >
              {visibleState.edgeHolder === visibleState.myPlayer
                ? t('game.mulligan.youHaveEdge')
                : t('game.mulligan.opponentHasEdge')}
            </span>

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
              <span className="font-body text-[11px]" style={{ color: '#555555' }}>
                {t('game.mulligan.clickHint')}
              </span>
            )}

            {/* Inline card detail */}
            <AnimatePresence mode="wait">
              {selectedCard && (
                <MulliganCardDetail key={selectedCard.id} card={selectedCard} />
              )}
            </AnimatePresence>
          </div>

          {/* Buttons — pinned outside scroll area */}
          <div className="flex gap-4 items-center shrink-0">
            <PopupActionButton onClick={handleKeep} disabled={isProcessing} accentColor="#c4a35a">
              {t('game.mulligan.keep')}
            </PopupActionButton>
            <PopupDismissLink onClick={handleMulligan}>
              {t('game.mulligan.redraw')}
            </PopupDismissLink>
          </div>
        </div>
      </PopupCornerFrame>
    </PopupOverlay>
  );
}
