'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import type { VisibleCharacter, VisibleMission, MissionRank, CharacterCard, MissionCard } from '@/lib/engine/types';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { getCardName } from '@/lib/utils/cardLocale';
import { useGameScale } from './GameScaleContext';

// ----- Minimize Button (reused in every popup overlay) -----

function MinimizeButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations();
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="no-select"
      style={{
        alignSelf: 'flex-end',
        marginBottom: '-8px',
        marginRight: 'clamp(12px, 8vw, 80px)',
        width: '32px',
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(196, 163, 90, 0.15)',
        border: '2px solid rgba(196, 163, 90, 0.5)',
        borderRadius: '50%',
        color: '#c4a35a',
        fontSize: '18px',
        lineHeight: '1',
        cursor: 'pointer',
        fontWeight: 700,
        boxShadow: '0 0 12px rgba(196, 163, 90, 0.25)',
        zIndex: 60,
      }}
      title={t('game.board.minimize')}
    >
      &#x2715;
    </button>
  );
}

// ----- Target Character Card -----

interface TargetCharacterProps {
  character: VisibleCharacter;
  isValidTarget: boolean;
  onSelect: (instanceId: string) => void;
}

function TargetCharacter({ character, isValidTarget, onSelect }: TargetCharacterProps) {
  const t = useTranslations();
  const locale = useLocale();
  const dims = useGameScale();
  const zoomCard = useUIStore((s) => s.zoomCard);
  const isHidden = character.isHidden;
  const canSeeCard = (character.isOwn || character.wasRevealedAtLeastOnce) && character.card;

  const imagePath = (canSeeCard || !isHidden)
    ? normalizeImagePath(character.card?.image_file)
    : null;

  const totalPower = character.effectivePower;
  const displayName = character.card ? getCardName(character.card, locale as 'en' | 'fr') : (isHidden ? '???' : 'Unknown');

  const handleClick = () => {
    if (isValidTarget) {
      onSelect(character.instanceId);
    }
  };

  return (
    <motion.div
      layout
      whileHover={isValidTarget ? { scale: 1.08 } : {}}
      whileTap={isValidTarget ? { scale: 0.95 } : {}}
      onClick={handleClick}
      className="relative no-select"
      style={{
        width: dims.targetCard.w + 'px',
        height: dims.targetCard.h + 'px',
        borderRadius: '5px',
        border: isValidTarget
          ? '2px solid rgba(196, 163, 90, 0.9)'
          : '1px solid #262626',
        overflow: 'hidden',
        cursor: isValidTarget ? 'pointer' : 'default',
        opacity: isValidTarget ? 1 : 0.35,
        boxShadow: isValidTarget
          ? '0 0 14px rgba(196, 163, 90, 0.4)'
          : 'none',
      }}
    >
      {/* Pulsing glow for valid targets */}
      {isValidTarget && (
        <motion.div
          className="absolute inset-0 rounded"
          style={{
            border: '2px solid rgba(196, 163, 90, 0.9)',
            pointerEvents: 'none',
          }}
          animate={{
            boxShadow: [
              '0 0 8px rgba(196, 163, 90, 0.3)',
              '0 0 18px rgba(196, 163, 90, 0.6)',
              '0 0 8px rgba(196, 163, 90, 0.3)',
            ],
          }}
          transition={{ repeat: Infinity, duration: 1.2 }}
        />
      )}

      {isHidden && !canSeeCard ? (
        <img
          src="/images/card-back.webp"
          alt={t('card.back')}
          draggable={false}
          className="w-full h-full object-cover"
        />
      ) : isHidden && canSeeCard ? (
        <>
          {imagePath ? (
            <div
              className="w-full h-full bg-cover bg-center"
              style={{
                backgroundImage: `url('${imagePath}')`,
                filter: 'brightness(0.4)',
              }}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ backgroundColor: '#1a1a1a' }}
            >
              <span className="text-[8px]" style={{ color: '#444444' }}>
                {displayName}
              </span>
            </div>
          )}
          <div
            className="absolute inset-x-0 top-0 text-center py-0.5 text-[8px] font-medium"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#888888' }}
          >
            {t('card.hidden')}
          </div>
        </>
      ) : (
        <>
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
              <span className="text-[7px] text-center px-0.5" style={{ color: '#888888' }}>
                {displayName}
              </span>
            </div>
          )}
        </>
      )}

      {/* Power display */}
      {!isHidden && (
        <div
          className="absolute bottom-0.5 right-0.5 rounded px-1 text-[9px] font-bold tabular-nums"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: character.powerTokens > 0 ? '#c4a35a' : '#e0e0e0',
          }}
        >
          {totalPower}
        </div>
      )}

      {/* Name overlay for valid targets */}
      {isValidTarget && (
        <div
          className="absolute inset-x-0 bottom-0 text-center py-0.5 text-[7px] font-medium truncate px-0.5"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: '#c4a35a',
          }}
        >
          {displayName}
        </div>
      )}

      {/* Details button (visible cards only) */}
      {character.card && !isHidden && (
        <button
          onClick={(e) => { e.stopPropagation(); zoomCard(character.card as CharacterCard | MissionCard); }}
          className="absolute top-0.5 right-0.5 rounded px-1 py-px text-[7px] font-bold cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
          style={{
            backgroundColor: 'rgba(0,0,0,0.85)',
            color: '#c4a35a',
            border: '1px solid rgba(196,163,90,0.4)',
          }}
        >
          {t('game.board.details')}
        </button>
      )}
    </motion.div>
  );
}

// ----- Mission Lane for Target Selection -----

interface TargetMissionLaneProps {
  mission: VisibleMission;
  missionIndex: number;
  validTargets: string[];
  onSelect: (instanceId: string) => void;
  myPlayer: string;
}

function TargetMissionLane({ mission, missionIndex, validTargets, onSelect, myPlayer }: TargetMissionLaneProps) {
  const t = useTranslations();
  const locale = useLocale();
  const rankColors: Record<MissionRank, string> = {
    D: '#3e8b3e',
    C: '#c4a35a',
    B: '#b37e3e',
    A: '#b33e3e',
  };

  const allChars = [
    ...mission.player1Characters,
    ...mission.player2Characters,
  ];

  // Calculate total power per side
  const myChars = myPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
  const oppChars = myPlayer === 'player1' ? mission.player2Characters : mission.player1Characters;
  const myPower = myChars.reduce((sum, c) => sum + (c.isHidden ? 0 : c.effectivePower), 0);
  const oppPower = oppChars.reduce((sum, c) => sum + (c.isHidden && !c.isOwn ? 0 : c.effectivePower), 0);

  // Check if the valid targets are mission indices (e.g. '0', '1', '2') vs character instance IDs
  const isMissionTarget = validTargets.includes(String(missionIndex));

  // Check if any character in this mission is a valid target
  const hasValidCharTargets = allChars.some(c => validTargets.includes(c.instanceId));
  const hasValidTargets = isMissionTarget || hasValidCharTargets;

  const handleMissionClick = () => {
    if (isMissionTarget) {
      onSelect(String(missionIndex));
    }
  };

  return (
    <div
      className="flex flex-col items-center gap-2 px-2"
      onClick={isMissionTarget ? handleMissionClick : undefined}
      style={{
        opacity: hasValidTargets ? 1 : 0.4,
        minWidth: '120px',
        cursor: isMissionTarget ? 'pointer' : 'default',
        borderRadius: '8px',
        border: isMissionTarget ? '2px solid rgba(196, 163, 90, 0.9)' : '2px solid transparent',
        boxShadow: isMissionTarget ? '0 0 14px rgba(196, 163, 90, 0.4)' : 'none',
        padding: '8px',
      }}
    >
      {/* Mission rank label */}
      <div
        className="rounded px-2 py-0.5 text-[10px] font-bold text-center"
        style={{
          backgroundColor: hasValidTargets ? rankColors[mission.rank] : '#1a1a1a',
          color: hasValidTargets ? '#0a0a0a' : '#333333',
        }}
      >
        {t('game.board.missionRank', { rank: mission.rank })}
      </div>

      {/* Mission name */}
      <span
        className="text-[10px] text-center truncate"
        style={{
          color: hasValidTargets ? '#888888' : '#333333',
          maxWidth: '110px',
        }}
      >
        {getCardName(mission.card, locale as 'en' | 'fr')}
      </span>

      {/* Power comparison bar */}
      <div
        className="flex items-center justify-center gap-2 w-full rounded px-2 py-0.5"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      >
        <span
          className="text-[10px] font-bold tabular-nums"
          style={{ color: myPower > oppPower ? '#4aff6b' : myPower < oppPower ? '#ff6b6b' : '#888888' }}
        >
          {myPower}
        </span>
        <span className="text-[9px]" style={{ color: '#555555' }}>vs</span>
        <span
          className="text-[10px] font-bold tabular-nums"
          style={{ color: oppPower > myPower ? '#ff6b6b' : oppPower < myPower ? '#4aff6b' : '#888888' }}
        >
          {oppPower}
        </span>
      </div>

      {/* Opponent characters (top) */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-[9px]" style={{ color: '#555555' }}>{t('game.opponent')}</span>
        <div className="flex flex-wrap gap-1 justify-center" style={{ minHeight: '94px' }}>
          {(myPlayer === 'player1' ? mission.player2Characters : mission.player1Characters).map(char => (
            <TargetCharacter
              key={char.instanceId}
              character={char}
              isValidTarget={validTargets.includes(char.instanceId)}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>

      {/* Divider */}
      <div
        className="w-full h-px"
        style={{
          backgroundColor: hasValidTargets ? '#333333' : '#1a1a1a',
        }}
      />

      {/* Player characters (bottom) */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-[9px]" style={{ color: '#555555' }}>{t('game.you')}</span>
        <div className="flex flex-wrap gap-1 justify-center" style={{ minHeight: '94px' }}>
          {(myPlayer === 'player1' ? mission.player1Characters : mission.player2Characters).map(char => (
            <TargetCharacter
              key={char.instanceId}
              character={char}
              isValidTarget={validTargets.includes(char.instanceId)}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ----- Main Target Selector -----

export function TargetSelector() {
  const t = useTranslations();
  const locale = useLocale();
  const dims = useGameScale();
  const pendingTargetSelection = useGameStore((s) => s.pendingTargetSelection);
  const selectTarget = useGameStore((s) => s.selectTarget);
  const declineTarget = useGameStore((s) => s.declineTarget);
  const visibleState = useGameStore((s) => s.visibleState);

  const effectPopupMinimized = useUIStore((s) => s.effectPopupMinimized);
  const minimizeEffectPopup = useUIStore((s) => s.minimizeEffectPopup);
  const restoreEffectPopup = useUIStore((s) => s.restoreEffectPopup);

  // Auto-restore when pending selection changes (new effect arrives)
  const prevPendingIdRef = useRef<string | null>(null);
  const currentPendingId = pendingTargetSelection?.descriptionKey ?? pendingTargetSelection?.description ?? null;
  useEffect(() => {
    if (currentPendingId && currentPendingId !== prevPendingIdRef.current) {
      restoreEffectPopup();
    }
    prevPendingIdRef.current = currentPendingId;
  }, [currentPendingId, restoreEffectPopup]);

  const handleSelect = useCallback(
    (targetId: string) => {
      selectTarget(targetId);
    },
    [selectTarget],
  );

  const handleDecline = useCallback(() => {
    declineTarget();
  }, [declineTarget]);

  // Multi-select state for Kiba 026 / Tayuya 065 UPGRADE CHOOSE
  const [multiSelectChoices, setMultiSelectChoices] = useState<Set<string>>(new Set());

  if (!pendingTargetSelection || !visibleState) return null;

  // Hand selection is handled by HandCardSelector
  if (pendingTargetSelection.selectionType === 'CHOOSE_FROM_HAND') return null;

  // Minimized floating pill — user can click to restore the popup
  if (effectPopupMinimized) {
    const effectDesc = pendingTargetSelection.descriptionKey
      ? t(pendingTargetSelection.descriptionKey, pendingTargetSelection.descriptionParams as Record<string, string> | undefined)
      : (pendingTargetSelection.description || t('game.board.restoreEffect'));
    // Truncate to 40 chars for the pill
    const pillText = effectDesc.length > 40 ? effectDesc.slice(0, 37) + '...' : effectDesc;
    return (
      <motion.button
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        onClick={restoreEffectPopup}
        className="fixed z-50 flex items-center gap-2 no-select"
        style={{
          bottom: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 18px',
          background: 'rgba(196, 163, 90, 0.95)',
          color: '#0a0a0a',
          borderRadius: '24px',
          fontSize: '13px',
          fontWeight: 700,
          cursor: 'pointer',
          border: '1px solid rgba(255, 215, 0, 0.4)',
          boxShadow: '0 4px 20px rgba(196, 163, 90, 0.5)',
        }}
      >
        <span style={{ fontSize: '16px', lineHeight: 1 }}>&#x25B2;</span>
        {pillText}
      </motion.button>
    );
  }

  const { validTargets, description, descriptionKey, descriptionParams, onDecline, declineLabelKey, playerName, revealedCard } = pendingTargetSelection;
  const canDecline = !!onDecline;
  const displayName = playerName || t('game.you');
  const isInfoReveal = pendingTargetSelection.selectionType === 'INFO_REVEAL';

  // ---- DRAW_CARD UI (Sakura 011 and future draw effects) ----
  if (pendingTargetSelection.selectionType === 'DRAW_CARD') {
    const deckCount = pendingTargetSelection.deckSize ?? 0;
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.88)' }}
        >
          <MinimizeButton onClick={minimizeEffectPopup} />
          {/* Title */}
          <motion.span
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-sm font-bold uppercase tracking-widest mb-6"
            style={{ color: '#c4a35a' }}
          >
            {descriptionKey ? t(descriptionKey, descriptionParams ?? {}) : description}
          </motion.span>

          {/* Deck visual */}
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 180, damping: 16, delay: 0.15 }}
            className="relative mb-8"
            style={{ width: '80px', height: '112px' }}
          >
            {/* Stack shadows */}
            {[3, 2, 1].map((offset) => (
              <div
                key={offset}
                className="absolute"
                style={{
                  top: `-${offset * 2}px`,
                  left: `${offset * 1}px`,
                  width: '80px',
                  height: '112px',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                }}
              >
                <img src="/images/card-back.webp" alt={t('card.back')} draggable={false} className="w-full h-full object-cover" style={{ opacity: 0.5 - offset * 0.1 }} />
              </div>
            ))}
            {/* Top card */}
            <div
              className="absolute inset-0 rounded-md overflow-hidden"
              style={{
                borderRadius: '6px',
                border: '2px solid rgba(196, 163, 90, 0.9)',
                boxShadow: '0 0 18px rgba(196, 163, 90, 0.5)',
              }}
            >
              <img src="/images/card-back.webp" alt={t('card.back')} draggable={false} className="w-full h-full object-cover" />
            </div>
            {/* Card count badge */}
            <div
              className="absolute -bottom-3 -right-3 rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold"
              style={{
                backgroundColor: '#c4a35a',
                color: '#0a0a0a',
                border: '2px solid #0a0a0a',
              }}
            >
              {deckCount}
            </div>
          </motion.div>

          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="font-body text-xs mb-8"
            style={{ color: '#555555' }}
          >
            {t('game.effect.sakura011DrawDeck', { count: deckCount })}
          </motion.span>

          {/* Action buttons */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex gap-4"
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleSelect('confirm')}
              disabled={deckCount === 0}
              className="px-8 py-3 rounded-lg text-sm font-medium uppercase tracking-wider cursor-pointer"
              style={{
                backgroundColor: deckCount > 0 ? '#c4a35a' : '#2a2a2a',
                color: deckCount > 0 ? '#0a0a0a' : '#555555',
                border: `1px solid ${deckCount > 0 ? '#c4a35a' : '#333333'}`,
                boxShadow: deckCount > 0 ? '0 4px 16px rgba(196, 163, 90, 0.4)' : 'none',
              }}
            >
              {t('game.effect.sakura011DrawBtn')}
            </motion.button>
            {canDecline && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleDecline}
                className="px-8 py-3 rounded-lg text-sm font-medium uppercase tracking-wider cursor-pointer"
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
        </motion.div>
      </AnimatePresence>
    );
  }

  // ---- CONFIRM_HIDE / CONFIRM_DEFEAT UI (Kiba 113 step 2, future confirmations) ----
  if (pendingTargetSelection.selectionType === 'CONFIRM_HIDE' || pendingTargetSelection.selectionType === 'CONFIRM_DEFEAT') {
    const isDefeat = pendingTargetSelection.selectionType === 'CONFIRM_DEFEAT';
    const cardData = pendingTargetSelection.confirmCardData;
    const accentColor = isDefeat ? '#b33e3e' : '#4a9eff';
    const imagePath = cardData?.image_file ? normalizeImagePath(cardData.image_file) : null;
    const confirmLabelKey = isDefeat ? 'game.effect.confirmDefeatBtn' : 'game.effect.confirmHideBtn';

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.88)' }}
        >
          <MinimizeButton onClick={minimizeEffectPopup} />
          {/* Title */}
          <motion.span
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-sm font-bold uppercase tracking-widest mb-6"
            style={{ color: accentColor }}
          >
            {descriptionKey ? t(descriptionKey, descriptionParams ?? {}) : description}
          </motion.span>

          {/* Card display */}
          <motion.div
            initial={{ scale: 0.7, rotateY: 15, opacity: 0 }}
            animate={{ scale: 1, rotateY: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 150, damping: 14, delay: 0.15 }}
            className="relative mb-8"
            style={{
              width: '100px',
              height: '140px',
              borderRadius: '8px',
              overflow: 'hidden',
              border: `2px solid ${accentColor}`,
              boxShadow: `0 0 24px ${accentColor}50`,
            }}
          >
            {imagePath ? (
              <div
                className="w-full h-full bg-cover bg-center"
                style={{
                  backgroundImage: `url('${imagePath}')`,
                  filter: isDefeat ? 'brightness(0.6) saturate(0.5)' : 'brightness(0.5)',
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
                <span className="text-[8px] text-center px-1" style={{ color: '#888888' }}>
                  {cardData ? (locale === 'en' && cardData.name_en ? cardData.name_en : cardData.name_fr) : '???'}
                </span>
              </div>
            )}
            {/* Action overlay badge */}
            <div
              className="absolute inset-0 flex items-center justify-center"
            >
              <span
                className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded"
                style={{
                  backgroundColor: `${accentColor}cc`,
                  color: '#ffffff',
                }}
              >
                {isDefeat ? t('game.effect.defeatBadge') : t('game.effect.hideBadge')}
              </span>
            </div>
            {/* Name overlay */}
            <div
              className="absolute inset-x-0 bottom-0 px-1 py-1 text-center"
              style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
            >
              <span className="text-[9px] font-bold truncate block" style={{ color: '#e0e0e0' }}>
                {cardData ? (locale === 'en' && cardData.name_en ? cardData.name_en : cardData.name_fr) : '???'}
              </span>
            </div>

            {/* Details button */}
            {cardData && (
              <button
                onClick={(e) => { e.stopPropagation(); useUIStore.getState().zoomCard(cardData as CharacterCard); }}
                className="absolute top-1 right-1 rounded px-1.5 py-0.5 text-[8px] font-bold cursor-pointer"
                style={{
                  backgroundColor: 'rgba(0,0,0,0.85)',
                  color: '#c4a35a',
                  border: '1px solid rgba(196,163,90,0.4)',
                }}
              >
                {t('game.board.details')}
              </button>
            )}
          </motion.div>

          {/* Action buttons */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex gap-4"
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleSelect('confirm')}
              className="px-8 py-3 rounded-lg text-sm font-medium uppercase tracking-wider cursor-pointer"
              style={{
                backgroundColor: accentColor,
                color: '#ffffff',
                border: `1px solid ${accentColor}`,
                boxShadow: `0 4px 16px ${accentColor}40`,
              }}
            >
              {t(confirmLabelKey)}
            </motion.button>
            {canDecline && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleDecline}
                className="px-8 py-3 rounded-lg text-sm font-medium uppercase tracking-wider cursor-pointer"
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
        </motion.div>
      </AnimatePresence>
    );
  }

  // Multi-select card choose mode (Kiba 026 / Tayuya 065 UPGRADE CHOOSE)
  if (pendingTargetSelection.isMultiSelect && pendingTargetSelection.revealedCards && pendingTargetSelection.revealedCards.length > 0) {
    const cards = pendingTargetSelection.revealedCards;
    const maxSel = pendingTargetSelection.maxSelections ?? 1;

    const toggleCard = (idx: number) => {
      const key = String(idx);
      setMultiSelectChoices(prev => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else if (next.size < maxSel) {
          next.add(key);
        }
        return next;
      });
    };

    const confirmMultiSelect = () => {
      if (multiSelectChoices.size === 0) {
        handleSelect('skip');
      } else {
        handleSelect(Array.from(multiSelectChoices).join(','));
      }
      setMultiSelectChoices(new Set());
    };

    const skipMultiSelect = () => {
      handleSelect('skip');
      setMultiSelectChoices(new Set());
    };

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}
        >
          <MinimizeButton onClick={minimizeEffectPopup} />
          {/* Title */}
          <motion.span
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-sm font-bold uppercase tracking-widest mb-4"
            style={{ color: '#c4a35a' }}
          >
            {revealedCard?.revealTitleKey
              ? t(revealedCard.revealTitleKey)
              : t('game.board.chooseTarget')}
          </motion.span>

          {/* Hint text */}
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="font-body text-xs mb-6 text-center"
            style={{ color: '#a0a0a0' }}
          >
            {revealedCard?.revealResultKey
              ? t(revealedCard.revealResultKey)
              : ''}
          </motion.span>

          {/* Cards grid - clickable with selection indicator */}
          <div className="flex flex-wrap gap-3 mb-6 justify-center" style={{ maxWidth: '720px' }}>
            {cards.map((card, idx) => {
              const imgPath = card.image_file ? normalizeImagePath(card.image_file) : null;
              const isSelectable = card.isSummon || card.isMatch;
              const isSelected = multiSelectChoices.has(String(idx));
              const borderColor = isSelected ? '#4aff6b' : isSelectable ? 'rgba(196, 163, 90, 0.9)' : '#555555';
              return (
                <motion.div
                  key={idx}
                  initial={{ scale: 0.3, rotateY: 180, opacity: 0 }}
                  animate={{ scale: 1, rotateY: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 120, damping: 14, delay: 0.2 + idx * 0.1 }}
                  className="relative"
                  onClick={() => isSelectable && toggleCard(idx)}
                  style={{
                    width: dims.previewMed.w + 'px',
                    height: dims.previewMed.h + 'px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: `3px solid ${borderColor}`,
                    boxShadow: isSelected
                      ? '0 0 24px rgba(74, 255, 107, 0.5), 0 4px 16px rgba(0, 0, 0, 0.6)'
                      : isSelectable
                        ? '0 0 12px rgba(196, 163, 90, 0.3), 0 4px 16px rgba(0, 0, 0, 0.6)'
                        : '0 4px 16px rgba(0, 0, 0, 0.6)',
                    opacity: isSelectable ? 1 : 0.5,
                    cursor: isSelectable ? 'pointer' : 'default',
                    transform: isSelected ? 'translateY(-4px)' : undefined,
                    transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
                  }}
                >
                  {imgPath ? (
                    <div
                      className="w-full h-full bg-cover bg-center"
                      style={{ backgroundImage: `url('${imgPath}')` }}
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ backgroundColor: '#1a1a1a' }}
                    >
                      <span className="text-xs text-center px-2" style={{ color: '#888888' }}>
                        {locale === 'en' && card.name_en ? card.name_en : card.name_fr}
                      </span>
                    </div>
                  )}

                  {/* Selection check overlay */}
                  {isSelected && (
                    <div
                      className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{ backgroundColor: '#4aff6b', color: '#0a0a0a' }}
                    >
                      ✓
                    </div>
                  )}

                  {/* Card name overlay */}
                  <div
                    className="absolute inset-x-0 bottom-0 px-2 py-1.5 text-center"
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
                  >
                    <div className="text-[10px] font-bold" style={{ color: '#e0e0e0' }}>
                      {locale === 'en' && card.name_en ? card.name_en : card.name_fr}
                    </div>
                    {isSelectable && (
                      <div className="text-[9px] mt-0.5" style={{ color: isSelected ? '#4aff6b' : '#c4a35a' }}>
                        {card.isSummon ? t('game.effect.tayuya065Summon') : card.isMatch ? t('game.effect.kiba026Match') : ''}
                      </div>
                    )}
                  </div>

                  {/* Chakra badge */}
                  <div
                    className="absolute top-1 left-1 rounded-full w-6 h-6 flex items-center justify-center text-[10px] font-bold"
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.85)',
                      color: '#4a9eff',
                      border: '1px solid #4a9eff',
                    }}
                  >
                    {card.chakra}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="flex gap-4">
            {/* Skip / Draw none button */}
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={skipMultiSelect}
              className="px-6 py-3 rounded-lg text-sm font-medium uppercase tracking-wider cursor-pointer"
              style={{
                backgroundColor: 'transparent',
                color: '#888888',
                border: '1px solid #555555',
              }}
            >
              {t('game.board.skip')}
            </motion.button>

            {/* Confirm selection button */}
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={confirmMultiSelect}
              disabled={multiSelectChoices.size === 0}
              className="px-6 py-3 rounded-lg text-sm font-medium uppercase tracking-wider cursor-pointer"
              style={{
                backgroundColor: multiSelectChoices.size > 0 ? '#4aff6b' : '#333333',
                color: multiSelectChoices.size > 0 ? '#0a0a0a' : '#666666',
                border: `1px solid ${multiSelectChoices.size > 0 ? '#4aff6b' : '#444444'}`,
                boxShadow: multiSelectChoices.size > 0 ? '0 4px 16px rgba(74, 255, 107, 0.3)' : 'none',
              }}
            >
              {t('game.board.confirm')} ({multiSelectChoices.size})
            </motion.button>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Multi-card reveal mode (Tayuya 065 UPGRADE etc.)
  if (isInfoReveal && pendingTargetSelection.revealedCards && pendingTargetSelection.revealedCards.length > 0) {
    const cards = pendingTargetSelection.revealedCards;
    const resultColor = '#c4a35a';

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}
        >
          <MinimizeButton onClick={minimizeEffectPopup} />
          {/* Title */}
          <motion.span
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-sm font-bold uppercase tracking-widest mb-6"
            style={{ color: '#c4a35a' }}
          >
            {revealedCard?.revealTitleKey
              ? t(revealedCard.revealTitleKey)
              : t('game.effect.tayuya065UpgradeRevealTitle')}
          </motion.span>

          {/* Cards grid */}
          <div className="flex flex-wrap gap-3 mb-6 justify-center" style={{ maxWidth: '720px' }}>
            {cards.map((card, idx) => {
              const imgPath = card.image_file ? normalizeImagePath(card.image_file) : null;
              const isHighlight = card.isSummon || card.isMatch;
              const borderColor = isHighlight ? '#4aff6b' : card.isDiscarded ? '#b33e3e' : '#555555';
              return (
                <motion.div
                  key={idx}
                  initial={{ scale: 0.3, rotateY: 180, opacity: 0 }}
                  animate={{ scale: 1, rotateY: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 120, damping: 14, delay: 0.2 + idx * 0.1 }}
                  className="relative"
                  style={{
                    width: dims.previewMed.w + 'px',
                    height: dims.previewMed.h + 'px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: `2px solid ${borderColor}`,
                    boxShadow: isHighlight
                      ? `0 0 20px ${borderColor}40, 0 4px 16px rgba(0, 0, 0, 0.6)`
                      : card.isDiscarded
                        ? `0 0 16px rgba(179, 62, 62, 0.4), 0 4px 16px rgba(0, 0, 0, 0.6)`
                        : '0 4px 16px rgba(0, 0, 0, 0.6)',
                    opacity: card.isDiscarded ? 0.6 : 1,
                  }}
                >
                  {imgPath ? (
                    <div
                      className="w-full h-full bg-cover bg-center"
                      style={{ backgroundImage: `url('${imgPath}')` }}
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ backgroundColor: '#1a1a1a' }}
                    >
                      <span className="text-xs text-center px-2" style={{ color: '#888888' }}>
                        {locale === 'en' && card.name_en ? card.name_en : card.name_fr}
                      </span>
                    </div>
                  )}

                  {/* Card name overlay */}
                  <div
                    className="absolute inset-x-0 bottom-0 px-2 py-1.5 text-center"
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
                  >
                    <div className="text-[10px] font-bold" style={{ color: '#e0e0e0' }}>
                      {locale === 'en' && card.name_en ? card.name_en : card.name_fr}
                    </div>
                    {(isHighlight || card.isDiscarded) && (
                      <div className="text-[9px] mt-0.5" style={{ color: isHighlight ? '#4aff6b' : '#b33e3e' }}>
                        {card.isSummon ? t('game.effect.tayuya065Summon') : card.isMatch ? t('game.effect.kiba026Match') : t('game.effect.cardDiscarded')}
                      </div>
                    )}
                  </div>

                  {/* Chakra badge */}
                  <div
                    className="absolute top-1 left-1 rounded-full w-6 h-6 flex items-center justify-center text-[10px] font-bold"
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.85)',
                      color: '#4a9eff',
                      border: '1px solid #4a9eff',
                    }}
                  >
                    {card.chakra}
                  </div>

                  {/* Details button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); useUIStore.getState().zoomCard(card as unknown as CharacterCard); }}
                    className="absolute top-1 right-1 rounded px-1.5 py-0.5 text-[8px] font-bold cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.85)',
                      color: '#c4a35a',
                      border: '1px solid rgba(196,163,90,0.4)',
                    }}
                  >
                    {t('game.board.details')}
                  </button>
                </motion.div>
              );
            })}
          </div>

          {/* Result text */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mb-6 text-center"
          >
            <span
              className="font-body text-sm font-medium"
              style={{ color: resultColor }}
            >
              {revealedCard?.revealResultKey
                ? t(revealedCard.revealResultKey)
                : t('game.effect.tayuya065UpgradeRevealNone')}
            </span>
          </motion.div>

          {/* Confirm button */}
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleSelect('confirm')}
            className="px-8 py-3 rounded-lg text-sm font-medium uppercase tracking-wider cursor-pointer"
            style={{
              backgroundColor: resultColor,
              color: '#0a0a0a',
              border: `1px solid ${resultColor}`,
              boxShadow: `0 4px 16px ${resultColor}40`,
            }}
          >
            {t('game.board.confirm')}
          </motion.button>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Info reveal mode: show the revealed card with a confirm button
  if (isInfoReveal && revealedCard) {
    const imagePath = revealedCard.image_file ? normalizeImagePath(revealedCard.image_file) : null;
    const hasCustomKeys = !!revealedCard.revealTitleKey;
    const resultColor = hasCustomKeys ? '#c4a35a' : (revealedCard.canSteal ? '#c4a35a' : '#b33e3e');

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}
        >
          <MinimizeButton onClick={minimizeEffectPopup} />
          {/* Title */}
          <motion.span
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-sm font-bold uppercase tracking-widest mb-6"
            style={{ color: '#c4a35a' }}
          >
            {revealedCard.revealTitleKey
              ? t(revealedCard.revealTitleKey)
              : t('game.effect.orochimaruReveal')}
          </motion.span>

          {/* Card display */}
          <motion.div
            initial={{ scale: 0.3, rotateY: 180, opacity: 0 }}
            animate={{ scale: 1, rotateY: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 120, damping: 14, delay: 0.2 }}
            className="relative mb-6"
            style={{
              width: dims.previewLg.w + 'px',
              height: dims.previewLg.h + 'px',
              borderRadius: '10px',
              overflow: 'hidden',
              border: `2px solid ${resultColor}`,
              boxShadow: `0 0 30px ${resultColor}40, 0 8px 32px rgba(0, 0, 0, 0.6)`,
            }}
          >
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
                <span className="text-sm text-center px-2" style={{ color: '#888888' }}>
                  {locale === 'en' && revealedCard.name_en ? revealedCard.name_en : revealedCard.name_fr}
                </span>
              </div>
            )}

            {/* Card name overlay */}
            <div
              className="absolute inset-x-0 bottom-0 px-2 py-2 text-center"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
            >
              <div className="text-xs font-bold" style={{ color: '#e0e0e0' }}>
                {locale === 'en' && revealedCard.name_en ? revealedCard.name_en : revealedCard.name_fr}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: '#888888' }}>
                {t('collection.details.cost')}: {revealedCard.chakra} | {t('collection.details.power')}: {revealedCard.power}
              </div>
            </div>

            {/* Chakra badge */}
            <div
              className="absolute top-1.5 left-1.5 rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                color: '#4a9eff',
                border: '1px solid #4a9eff',
              }}
            >
              {revealedCard.chakra}
            </div>

            {/* Details button */}
            <button
              onClick={(e) => { e.stopPropagation(); useUIStore.getState().zoomCard(revealedCard as unknown as CharacterCard); }}
              className="absolute top-1.5 right-1.5 rounded px-2 py-1 text-[9px] font-bold cursor-pointer"
              style={{
                backgroundColor: 'rgba(0,0,0,0.85)',
                color: '#c4a35a',
                border: '1px solid rgba(196,163,90,0.4)',
              }}
            >
              {t('game.board.details')}
            </button>
          </motion.div>

          {/* Result text */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mb-6 text-center"
          >
            <span
              className="font-body text-sm font-medium"
              style={{ color: resultColor }}
            >
              {revealedCard.revealResultKey
                ? t(revealedCard.revealResultKey)
                : revealedCard.canSteal
                  ? t('game.effect.orochimaruSteal')
                  : t('game.effect.orochimaruTooExpensive')}
            </span>
          </motion.div>

          {/* Confirm button */}
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleSelect('confirm')}
            className="px-8 py-3 rounded-lg text-sm font-medium uppercase tracking-wider cursor-pointer"
            style={{
              backgroundColor: resultColor,
              color: '#0a0a0a',
              border: `1px solid ${resultColor}`,
              boxShadow: `0 4px 16px ${resultColor}40`,
            }}
          >
            {t('game.board.confirm')}
          </motion.button>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ---- EFFECT_PLAY_UPGRADE_OR_FRESH: choose between fresh play and upgrade ----
  if (pendingTargetSelection.selectionType === 'EFFECT_PLAY_UPGRADE_OR_FRESH') {
    const upgradeTargets = validTargets.filter(id => id !== 'FRESH');
    // Find the upgrade target characters from active missions
    const upgradeChars: { char: VisibleCharacter; missionIdx: number }[] = [];
    for (const mission of visibleState.activeMissions) {
      const myChars = visibleState.myPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
      for (const c of myChars) {
        if (upgradeTargets.includes(c.instanceId)) {
          upgradeChars.push({ char: c, missionIdx: visibleState.activeMissions.indexOf(mission) });
        }
      }
    }

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.88)' }}
        >
          <MinimizeButton onClick={minimizeEffectPopup} />
          {/* Title */}
          <motion.span
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-sm font-bold uppercase tracking-widest mb-6"
            style={{ color: '#c4a35a' }}
          >
            {descriptionKey ? t(descriptionKey, descriptionParams ?? {}) : description}
          </motion.span>

          <div className="flex gap-6 items-start">
            {/* Fresh play option */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 180, damping: 16 }}
              className="flex flex-col items-center gap-3"
            >
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleSelect('FRESH')}
                className="flex flex-col items-center gap-2 px-6 py-5 rounded-lg cursor-pointer"
                style={{
                  backgroundColor: 'rgba(74, 158, 255, 0.1)',
                  border: '2px solid #4a9eff',
                  boxShadow: '0 0 16px rgba(74, 158, 255, 0.3)',
                  minWidth: '120px',
                }}
              >
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#4a9eff' }}>
                  {t('game.effect.freshPlay')}
                </span>
                <span className="text-[10px]" style={{ color: '#888888' }}>
                  {t('game.effect.freshPlayDesc')}
                </span>
              </motion.button>
            </motion.div>

            {/* Divider */}
            <div className="flex flex-col items-center justify-center self-stretch">
              <div className="w-px flex-1" style={{ backgroundColor: '#333333' }} />
              <span className="text-[10px] py-2" style={{ color: '#555555' }}>{t('game.effect.or')}</span>
              <div className="w-px flex-1" style={{ backgroundColor: '#333333' }} />
            </div>

            {/* Upgrade targets */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 180, damping: 16 }}
              className="flex flex-col items-center gap-3"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#c4a35a' }}>
                {t('game.effect.upgradeOver')}
              </span>
              <div className="flex gap-2 flex-wrap justify-center">
                {upgradeChars.map(({ char }) => (
                  <TargetCharacter
                    key={char.instanceId}
                    character={char}
                    isValidTarget={true}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            </motion.div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ---- Generic CONFIRM popup for missions and character CONFIRMs ----
  if (pendingTargetSelection.selectionType === 'EFFECT_CONFIRM') {
    const confirmTarget = validTargets[0];
    let confirmImage: string | null = null;
    let confirmName = '';

    // Mission CONFIRM: find mission card image
    if (confirmTarget?.startsWith('KS-') && confirmTarget?.includes('-MMS')) {
      for (const m of visibleState.activeMissions) {
        if (m.card?.id === confirmTarget) {
          confirmImage = normalizeImagePath(m.card.image_file);
          confirmName = getCardName(m.card as MissionCard & { name_en?: string; name_fr: string }, locale as 'en' | 'fr');
          break;
        }
      }
    } else if (confirmTarget) {
      // Character CONFIRM: find character on board
      for (const m of visibleState.activeMissions) {
        for (const c of [...m.player1Characters, ...m.player2Characters]) {
          if (c.instanceId === confirmTarget && c.card) {
            confirmImage = normalizeImagePath(c.card.image_file);
            confirmName = getCardName(c.card, locale as 'en' | 'fr');
            break;
          }
        }
      }
    }

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.88)' }}
        >
          <MinimizeButton onClick={minimizeEffectPopup} />
          {/* Title */}
          <motion.span
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-sm font-bold uppercase tracking-widest mb-6 text-center px-4 font-body"
            style={{ color: '#c4a35a', maxWidth: '500px' }}
          >
            {descriptionKey ? t(descriptionKey, descriptionParams ?? {}) : description}
          </motion.span>

          {/* Card display */}
          {confirmImage && (
            <motion.div
              initial={{ scale: 0.7, rotateY: 15, opacity: 0 }}
              animate={{ scale: 1, rotateY: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 150, damping: 14, delay: 0.15 }}
              className="relative mb-8"
              style={{
                width: (confirmTarget?.includes('-MMS')) ? '200px' : '120px',
                height: (confirmTarget?.includes('-MMS')) ? '143px' : '168px',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '2px solid #c4a35a',
                boxShadow: '0 0 24px rgba(196, 163, 90, 0.3)',
              }}
            >
              <div
                className="w-full h-full bg-cover bg-center"
                style={{ backgroundImage: `url('${confirmImage}')` }}
              />
              {/* Name overlay */}
              <div
                className="absolute inset-x-0 bottom-0 px-1 py-1 text-center"
                style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
              >
                <span className="text-[9px] font-bold truncate block" style={{ color: '#e0e0e0' }}>
                  {confirmName}
                </span>
              </div>
            </motion.div>
          )}

          {/* Action buttons */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex gap-4"
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleSelect(confirmTarget)}
              className="px-8 py-3 rounded-lg text-sm font-medium uppercase tracking-wider cursor-pointer"
              style={{
                backgroundColor: '#c4a35a',
                color: '#0a0a0a',
                border: '1px solid #c4a35a',
                boxShadow: '0 4px 16px rgba(196, 163, 90, 0.4)',
              }}
            >
              {t('game.board.confirm')}
            </motion.button>
            {canDecline && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleDecline}
                className="px-8 py-3 rounded-lg text-sm font-medium uppercase tracking-wider cursor-pointer"
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
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
      >
        <MinimizeButton onClick={minimizeEffectPopup} />
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
            {t('game.mustChooseTarget', { player: displayName })}
          </span>
        </motion.div>

        {/* Description bar */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 20 }}
          className="mb-6 px-8 py-4 rounded-lg flex flex-col items-center gap-2"
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #333333',
            maxWidth: '600px',
          }}
        >
          <span
            className="font-body text-xs text-center leading-relaxed"
            style={{ color: '#e0e0e0' }}
          >
            {descriptionKey ? t(descriptionKey, descriptionParams ?? {}) : description}
          </span>
          <span
            className="text-[10px]"
            style={{ color: '#555555' }}
          >
            {validTargets.length === 1 ? t('game.board.validTargetOne', { count: validTargets.length }) : t('game.board.validTargets', { count: validTargets.length })}
          </span>
        </motion.div>

        {/* Board view with targets highlighted */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 180, damping: 18 }}
          className="flex gap-4 overflow-x-auto px-4 py-3 rounded-lg"
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #1a1a1a',
            maxWidth: '90vw',
          }}
        >
          {visibleState.activeMissions.map((mission, index) => (
            <TargetMissionLane
              key={`target-mission-${index}`}
              mission={mission}
              missionIndex={index}
              validTargets={validTargets}
              onSelect={handleSelect}
              myPlayer={visibleState.myPlayer}
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
            {declineLabelKey ? t(declineLabelKey) : t('game.board.skip')}
          </motion.button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
