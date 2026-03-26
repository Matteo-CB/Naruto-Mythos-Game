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
import {
  PopupOverlay,
  PopupCornerFrame,
  PopupTitle,
  PopupDescription,
  PopupActionButton,
  PopupDismissLink,
  PopupMinimizePill,
  PopupMinimizeX,
  PopupTargetCount,
} from './PopupPrimitives';
import { TargetOrderPopup } from './TargetOrderPopup';

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
        borderRadius: '8px',
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
          className="absolute inset-0"
          style={{
            borderRadius: '8px',
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
          className="absolute bottom-0.5 right-0.5 px-1 text-[9px] font-bold tabular-nums"
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
          className="absolute top-0.5 right-0.5 px-1 py-px text-[7px] font-bold cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
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

// ----- Ordered Defeat Board Popup -----
// Shows all missions with all characters. Valid targets glow. Player clicks targets in order (1, 2, 3...).
// Hidden enemy cards show as card backs. Confirm button sends the ordered list.

function OrderedDefeatPopup({
  missions, validTargets, myPlayer, description, descriptionKey, descriptionParams,
  onConfirm, onDecline, canDecline,
}: {
  missions: VisibleMission[];
  validTargets: string[];
  myPlayer: string;
  description: string;
  descriptionKey?: string;
  descriptionParams?: Record<string, string>;
  onConfirm: (orderedIds: string[]) => void;
  onDecline?: () => void;
  canDecline?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const minimizeEffectPopup = useUIStore((s) => s.minimizeEffectPopup);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const allSelected = orderedIds.length === validTargets.length;

  const toggleTarget = useCallback((id: string) => {
    setOrderedIds(prev => {
      if (prev.includes(id)) return prev.slice(0, prev.indexOf(id));
      if (prev.length >= validTargets.length) return prev;
      return [...prev, id];
    });
  }, [validTargets.length]);

  const rankColors: Record<string, string> = { D: '#3e8b3e', C: '#c4a35a', B: '#b37e3e', A: '#b33e3e' };

  return (
    <AnimatePresence>
      <PopupOverlay>
        <PopupCornerFrame accentColor="rgba(196, 163, 90, 0.25)" maxWidth="90vw" padding="20px 16px" backgroundColor="rgba(4, 4, 8, 0.95)" fitContent>
          <PopupMinimizeX onClick={minimizeEffectPopup} />
          <PopupTitle accentColor="#c4a35a" size="lg">
            {descriptionKey ? t(descriptionKey, descriptionParams ?? {}) : description}
          </PopupTitle>

          <div className="text-center mb-3">
            <span className="text-xs" style={{ color: '#888' }}>
              {t('game.effect.orderedDefeat.progress', { selected: String(orderedIds.length), total: String(validTargets.length) })}
            </span>
          </div>

          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 180, damping: 18 }}
            className="flex justify-center gap-4 overflow-x-auto px-2 py-3 mb-4"
          >
            {missions.map((mission, mIdx) => {
              const oppChars = myPlayer === 'player1' ? mission.player2Characters : mission.player1Characters;
              const myChars = myPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
              const hasTargets = [...oppChars, ...myChars].some(c => validTargets.includes(c.instanceId));

              return (
                <div key={`od-mission-${mIdx}`} className="flex flex-col items-center gap-2 px-2"
                  style={{ opacity: hasTargets ? 1 : 0.35, minWidth: '120px' }}>
                  <div className="px-2 py-0.5 text-[10px] font-bold text-center"
                    style={{ backgroundColor: hasTargets ? rankColors[mission.rank] || '#1a1a1a' : '#1a1a1a', color: hasTargets ? '#0a0a0a' : '#333' }}>
                    {t('game.board.missionRank', { rank: mission.rank })}
                  </div>
                  <span className="text-[10px] text-center truncate" style={{ color: '#888', maxWidth: '110px' }}>
                    {getCardName(mission.card, locale as 'en' | 'fr')}
                  </span>

                  {/* Opponent side */}
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[9px]" style={{ color: '#555' }}>{t('game.opponent')}</span>
                    <div className="flex flex-wrap gap-1 justify-center" style={{ minHeight: '94px' }}>
                      {oppChars.map(char => {
                        const isValid = validTargets.includes(char.instanceId);
                        const orderIdx = orderedIds.indexOf(char.instanceId);
                        const isSelected = orderIdx >= 0;
                        return (
                          <OrderedDefeatCard key={char.instanceId} character={char} isValid={isValid}
                            isSelected={isSelected} orderNumber={isSelected ? orderIdx + 1 : undefined}
                            onClick={() => isValid && toggleTarget(char.instanceId)} />
                        );
                      })}
                    </div>
                  </div>

                  <div className="w-full h-px" style={{ backgroundColor: hasTargets ? '#333' : '#1a1a1a' }} />

                  {/* Player side */}
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[9px]" style={{ color: '#555' }}>{t('game.you')}</span>
                    <div className="flex flex-wrap gap-1 justify-center" style={{ minHeight: '94px' }}>
                      {myChars.map(char => {
                        const isValid = validTargets.includes(char.instanceId);
                        const orderIdx = orderedIds.indexOf(char.instanceId);
                        const isSelected = orderIdx >= 0;
                        return (
                          <OrderedDefeatCard key={char.instanceId} character={char} isValid={isValid}
                            isSelected={isSelected} orderNumber={isSelected ? orderIdx + 1 : undefined}
                            onClick={() => isValid && toggleTarget(char.instanceId)} />
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </motion.div>

          <div className="flex justify-center gap-3">
            {allSelected && (
              <PopupActionButton accentColor="#c4a35a" onClick={() => onConfirm(orderedIds)}>
                {t('game.board.confirm')}
              </PopupActionButton>
            )}
            {canDecline && onDecline && (
              <PopupDismissLink onClick={onDecline}>{t('game.board.skip')}</PopupDismissLink>
            )}
          </div>
        </PopupCornerFrame>
      </PopupOverlay>
    </AnimatePresence>
  );
}

function OrderedDefeatCard({ character, isValid, isSelected, orderNumber, onClick }: {
  character: VisibleCharacter;
  isValid: boolean;
  isSelected: boolean;
  orderNumber?: number;
  onClick: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const isHidden = character.isHidden;
  const canSeeCard = character.isOwn || !isHidden || character.wasRevealedAtLeastOnce;
  const topCard = character.topCard ?? character.card;
  const displayName = topCard ? getCardName(topCard, locale as 'en' | 'fr') : '???';
  const imagePath = topCard?.image_file ? normalizeImagePath(topCard.image_file) : null;

  return (
    <motion.div
      whileHover={isValid ? { scale: 1.08, y: -3 } : {}}
      whileTap={isValid ? { scale: 0.95 } : {}}
      onClick={isValid ? onClick : undefined}
      className="relative no-select"
      style={{
        width: '65px', height: '91px', cursor: isValid ? 'pointer' : 'default',
        opacity: isValid ? 1 : 0.3,
        border: isSelected ? '2px solid #c4a35a' : isValid ? '2px solid rgba(196, 163, 90, 0.5)' : '1px solid #333',
        boxShadow: isSelected ? '0 0 12px rgba(196, 163, 90, 0.6)' : isValid ? '0 0 8px rgba(196, 163, 90, 0.2)' : 'none',
      }}
    >
      {isHidden && !canSeeCard ? (
        <img src="/images/card-back.webp" alt={t('card.back')} draggable={false} className="w-full h-full object-cover" />
      ) : imagePath ? (
        <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url('${imagePath}')` }} />
      ) : (
        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
          <span className="text-[7px] text-center px-0.5" style={{ color: '#888' }}>{displayName}</span>
        </div>
      )}

      {/* Order number badge */}
      {isSelected && orderNumber && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <span className="text-2xl font-black" style={{ color: '#c4a35a', textShadow: '0 0 8px rgba(196,163,90,0.8)' }}>
            {orderNumber}
          </span>
        </div>
      )}

      {/* Power */}
      {!isHidden && topCard && (
        <div className="absolute bottom-0.5 right-0.5 px-1 text-[9px] font-bold tabular-nums"
          style={{ backgroundColor: 'rgba(0,0,0,0.8)', color: character.powerTokens > 0 ? '#c4a35a' : '#e0e0e0' }}>
          {character.effectivePower}
        </div>
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
        borderRadius: '10px',
        border: isMissionTarget ? '2px solid rgba(196, 163, 90, 0.9)' : '2px solid transparent',
        boxShadow: isMissionTarget ? '0 0 14px rgba(196, 163, 90, 0.4)' : 'none',
        padding: '8px',
      }}
    >
      {/* Mission rank label */}
      <div
        className="px-2 py-0.5 text-[10px] font-bold text-center"
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
        className="flex items-center justify-center gap-2 w-full px-2 py-0.5"
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

  // Queued order for sequential defeat/hide (player chose full order in popup)
  const queuedOrderRef = useRef<string[]>([]);

  // Auto-submit queued targets when a new sequential prompt arrives
  useEffect(() => {
    if (!pendingTargetSelection || queuedOrderRef.current.length === 0) return;
    const eTstQ = pendingTargetSelection.engineTargetSelectionType ?? '';
    const isSeqHide = eTstQ.includes('CHOOSE_HIDE_TARGET') || eTstQ === 'KYUBI134_CHOOSE_HIDE_TARGETS';
    const isSeqDefeat = eTstQ.includes('CHOOSE_DEFEAT_TARGET');
    if (!isSeqHide && !isSeqDefeat) {
      queuedOrderRef.current = [];
      return;
    }
    // Find the next queued target that's still valid
    const vt = new Set(pendingTargetSelection.validTargets);
    let nextTarget: string | null = null;
    while (queuedOrderRef.current.length > 0) {
      const candidate = queuedOrderRef.current.shift()!;
      if (vt.has(candidate)) {
        nextTarget = candidate;
        break;
      }
    }
    if (nextTarget) {
      // Small delay to let state propagate
      const timer = setTimeout(() => selectTarget(nextTarget!), 80);
      return () => clearTimeout(timer);
    }
    // No valid queued target found — clear queue, user will see popup
    queuedOrderRef.current = [];
  }, [pendingTargetSelection, selectTarget]);

  if (!pendingTargetSelection || !visibleState) return null;

  // Hand selection is handled by HandCardSelector
  if (pendingTargetSelection.selectionType === 'CHOOSE_FROM_HAND') return null;

  // Minimized floating pill — user can click to restore the popup
  if (effectPopupMinimized) {
    const effectDesc = pendingTargetSelection.descriptionKey
      ? t(pendingTargetSelection.descriptionKey, pendingTargetSelection.descriptionParams as Record<string, string> | undefined)
      : (pendingTargetSelection.description || t('game.board.restoreEffect'));
    return <PopupMinimizePill text={effectDesc} onRestore={restoreEffectPopup} />;
  }

  const { validTargets, description, descriptionKey, descriptionParams, onDecline, declineLabelKey, playerName, revealedCard } = pendingTargetSelection;
  const canDecline = !!onDecline;
  const displayName = playerName || t('game.you');
  const isInfoReveal = pendingTargetSelection.selectionType === 'INFO_REVEAL';

  // ---- Detect multi-target hide/defeat and render ORDER popup ----
  const eTst = pendingTargetSelection.engineTargetSelectionType ?? '';
  const isHideOrder = eTst.includes('CHOOSE_HIDE_TARGET') || eTst === 'KYUBI134_CHOOSE_HIDE_TARGETS';
  const isDefeatOrder = eTst.includes('CHOOSE_DEFEAT_TARGET');
  const maxSel = pendingTargetSelection.maxSelections;
  const isMultiTargetEffect = maxSel === undefined || maxSel >= validTargets.length;
  if ((isHideOrder || isDefeatOrder) && validTargets.length > 1 && isMultiTargetEffect && visibleState && queuedOrderRef.current.length === 0) {
    // Build order targets from visible state characters
    const orderTargets: Array<{ instanceId: string; name_fr: string; name_en?: string; image_file?: string; chakra?: number; power?: number; missionIndex: number; missionRank?: string; isHidden?: boolean; isOwn?: boolean }> = [];
    for (const targetId of validTargets) {
      for (let mIdx = 0; mIdx < visibleState.activeMissions.length; mIdx++) {
        const mission = visibleState.activeMissions[mIdx];
        for (const c of [...mission.player1Characters, ...mission.player2Characters]) {
          if (c.instanceId === targetId && c.card) {
            orderTargets.push({
              instanceId: c.instanceId,
              name_fr: c.card.name_fr,
              name_en: (c.card as any).name_en,
              image_file: c.card.image_file,
              chakra: c.card.chakra,
              power: c.effectivePower,
              missionIndex: mIdx,
              missionRank: mission.rank,
              isHidden: c.isHidden,
              isOwn: c.isOwn,
            });
            break;
          }
        }
      }
    }
    if (orderTargets.length > 1) {
      return (
        <TargetOrderPopup
          mode={isDefeatOrder ? 'defeat' : 'hide'}
          targets={orderTargets}
          description={description}
          descriptionKey={descriptionKey}
          descriptionParams={descriptionParams}
          onConfirm={(orderedIds) => {
            // Store remaining targets in queue, submit the first
            queuedOrderRef.current = orderedIds.slice(1);
            handleSelect(orderedIds[0]);
          }}
          onDecline={canDecline ? handleDecline : undefined}
          canDecline={canDecline}
        />
      );
    }
  }

  // ---- ORDERED_DEFEAT popup (Gaara 120, Ichibi 130, Naruto 133) ----
  if (eTst === 'ORDERED_DEFEAT' && visibleState && validTargets.length > 0) {
    return (
      <OrderedDefeatPopup
        missions={visibleState.activeMissions as VisibleMission[]}
        validTargets={validTargets}
        myPlayer={visibleState.myPlayer}
        description={description}
        descriptionKey={descriptionKey}
        descriptionParams={descriptionParams as Record<string, string> | undefined}
        onConfirm={(orderedIds) => handleSelect(JSON.stringify(orderedIds))}
        onDecline={canDecline ? handleDecline : undefined}
        canDecline={canDecline}
      />
    );
  }

  // ---- REORDER_DISCARD popup ----
  const isReorderDiscard = eTst === 'REORDER_DISCARD';
  if (isReorderDiscard && validTargets.length > 1 && visibleState) {
    // Determine whose discard pile to read from the pending effect's effectDescription
    let reorderDiscardOwner: string | undefined;
    const reorderPendingEffect = visibleState.pendingEffects?.find((e: any) => e.targetSelectionType === 'REORDER_DISCARD');
    try { reorderDiscardOwner = JSON.parse(reorderPendingEffect?.effectDescription ?? '{}').discardOwner; } catch { /* ignore */ }
    const isOwnDiscard = reorderDiscardOwner === visibleState.myPlayer;
    const targetDiscard = isOwnDiscard
      ? (visibleState.myState.discardPile ?? [])
      : (visibleState.opponentState.discardPile ?? []);
    const count = validTargets.length;
    const lastN = targetDiscard.slice(-count);
    const discardTargets: Array<{ instanceId: string; name_fr: string; name_en?: string; image_file?: string; chakra?: number; power?: number; missionIndex: number; isHidden?: boolean; isOwn?: boolean }> = [];
    // Map index-based unique IDs back to original card IDs for engine submission
    const discardIdMap: Record<string, string> = {};
    for (let di = 0; di < lastN.length; di++) {
      const card = lastN[di];
      const originalId = (card as any).instanceId || (card as any).id || `card-${di}`;
      // Use index-based unique ID to distinguish duplicate cards (e.g. 2x Temari)
      const uniqueId = `discard_${di}`;
      discardIdMap[uniqueId] = originalId;
      const wasHidden = !!(card as any).wasHiddenBeforeDefeat;
      discardTargets.push({
        instanceId: uniqueId,
        name_fr: wasHidden && !isOwnDiscard ? '???' : ((card as any).name_fr ?? ''),
        name_en: wasHidden && !isOwnDiscard ? undefined : (card as any).name_en,
        image_file: wasHidden && !isOwnDiscard ? undefined : (card as any).image_file,
        chakra: wasHidden && !isOwnDiscard ? undefined : (card as any).chakra,
        power: wasHidden && !isOwnDiscard ? undefined : (card as any).power,
        missionIndex: 0,
        isHidden: wasHidden && !isOwnDiscard,
        isOwn: isOwnDiscard,
      });
    }
    if (discardTargets.length > 1) {
      return (
        <TargetOrderPopup
          mode="defeat"
          targets={discardTargets}
          description={description}
          descriptionKey={descriptionKey}
          descriptionParams={descriptionParams}
          sourceCardName=""
          onConfirm={(orderedIds) => {
            // Map unique popup IDs back to original card IDs for engine
            const originalIds = orderedIds.map(id => discardIdMap[id] ?? id);
            handleSelect(JSON.stringify(originalIds));
          }}
        />
      );
    }
  }

  // ---- DRAW_CARD UI (Sakura 011 and future draw effects) ----
  if (pendingTargetSelection.selectionType === 'DRAW_CARD') {
    const deckCount = pendingTargetSelection.deckSize ?? 0;
    return (
      <AnimatePresence>
        <PopupOverlay>
          <PopupCornerFrame accentColor="rgba(196, 163, 90, 0.4)" maxWidth="420px">
            <PopupMinimizeX onClick={minimizeEffectPopup} />
            <PopupTitle accentColor="#c4a35a" size="lg">
              {descriptionKey ? t(descriptionKey, descriptionParams ?? {}) : description}
            </PopupTitle>

            {/* Deck visual */}
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 180, damping: 16, delay: 0.15 }}
              className="relative mb-6 mx-auto"
              style={{ width: '80px', height: '112px' }}
            >
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
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  borderRadius: '6px',
                  border: '2px solid rgba(196, 163, 90, 0.7)',
                  boxShadow: '0 0 18px rgba(196, 163, 90, 0.3)',
                }}
              >
                <img src="/images/card-back.webp" alt={t('card.back')} draggable={false} className="w-full h-full object-cover" />
              </div>
              <div
                className="absolute -bottom-3 -right-3 w-7 h-7 flex items-center justify-center text-[10px] font-bold"
                style={{
                  backgroundColor: 'rgba(12,12,18,0.95)',
                  color: '#c4a35a',
                  border: '2px solid #c4a35a',
                  transform: 'rotate(45deg)',
                }}
              >
                <span style={{ transform: 'rotate(-45deg)' }}>{deckCount}</span>
              </div>
            </motion.div>

            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="font-body text-[11px] mb-6 block text-center"
              style={{ color: '#555555' }}
            >
              {t('game.effect.sakura011DrawDeck', { count: deckCount })}
            </motion.span>

            <div className="flex items-center justify-center gap-6">
              <PopupActionButton onClick={() => handleSelect('confirm')} accentColor="#c4a35a" disabled={deckCount === 0}>
                {t('game.effect.sakura011DrawBtn')}
              </PopupActionButton>
              {canDecline && (
                <PopupDismissLink onClick={handleDecline}>
                  {t('game.board.skip')}
                </PopupDismissLink>
              )}
            </div>
          </PopupCornerFrame>
        </PopupOverlay>
      </AnimatePresence>
    );
  }

  // ---- CONFIRM_HIDE / CONFIRM_DEFEAT UI ----
  if (pendingTargetSelection.selectionType === 'CONFIRM_HIDE' || pendingTargetSelection.selectionType === 'CONFIRM_DEFEAT') {
    const isDefeat = pendingTargetSelection.selectionType === 'CONFIRM_DEFEAT';
    const cardData = pendingTargetSelection.confirmCardData;
    const accentColor = isDefeat ? '#b33e3e' : '#4a9eff';
    const imagePath = cardData?.image_file ? normalizeImagePath(cardData.image_file) : null;
    const confirmLabelKey = isDefeat ? 'game.effect.confirmDefeatBtn' : 'game.effect.confirmHideBtn';

    return (
      <AnimatePresence>
        <PopupOverlay>
          <PopupCornerFrame accentColor={`${accentColor}66`} maxWidth="400px">
            <PopupMinimizeX onClick={minimizeEffectPopup} />
            <PopupTitle accentColor={accentColor} size="lg">
              {descriptionKey ? t(descriptionKey, descriptionParams ?? {}) : description}
            </PopupTitle>

            {/* Card display */}
            <motion.div
              initial={{ scale: 0.7, rotateY: 15, opacity: 0 }}
              animate={{ scale: 1, rotateY: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 150, damping: 14, delay: 0.15 }}
              className="relative mb-6 mx-auto"
              style={{
                width: '100px',
                height: '140px',
                overflow: 'hidden',
                border: `2px solid ${accentColor}88`,
                boxShadow: `0 0 24px ${accentColor}25, 0 8px 24px rgba(0, 0, 0, 0.5)`,
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
              {/* Action badge — skewed strip */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className="text-[10px] font-bold uppercase px-3 py-1"
                  style={{
                    backgroundColor: `${accentColor}dd`,
                    color: '#ffffff',
                    letterSpacing: '0.12em',
                    transform: 'skewX(-4deg)',
                    boxShadow: `0 2px 12px ${accentColor}40`,
                  }}
                >
                  <span style={{ display: 'inline-block', transform: 'skewX(4deg)' }}>
                    {isDefeat ? t('game.effect.defeatBadge') : t('game.effect.hideBadge')}
                  </span>
                </span>
              </div>
              <div
                className="absolute inset-x-0 bottom-0 px-1 py-1 text-center"
                style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
              >
                <span className="text-[9px] font-bold truncate block" style={{ color: '#e0e0e0' }}>
                  {cardData ? (locale === 'en' && cardData.name_en ? cardData.name_en : cardData.name_fr) : '???'}
                </span>
              </div>
              {cardData && (
                <button
                  onClick={(e) => { e.stopPropagation(); useUIStore.getState().zoomCard(cardData as CharacterCard); }}
                  className="absolute top-1 right-1 px-1.5 py-0.5 text-[8px] font-bold cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: 'rgba(0,0,0,0.85)', color: '#c4a35a', border: '1px solid rgba(196,163,90,0.3)' }}
                >
                  {t('game.board.details')}
                </button>
              )}
            </motion.div>

            <div className="flex items-center justify-center gap-6">
              <PopupActionButton onClick={() => handleSelect('confirm')} accentColor={accentColor}>
                {t(confirmLabelKey)}
              </PopupActionButton>
              {canDecline && (
                <PopupDismissLink onClick={handleDecline}>
                  {t('game.board.skip')}
                </PopupDismissLink>
              )}
            </div>
          </PopupCornerFrame>
        </PopupOverlay>
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
        <PopupOverlay>
          <PopupCornerFrame accentColor="rgba(138, 92, 246, 0.4)" maxWidth="740px">
            <PopupMinimizeX onClick={minimizeEffectPopup} />
            <PopupTitle accentColor="#8b5cf6" size="lg">
              {revealedCard?.revealTitleKey
                ? t(revealedCard.revealTitleKey)
                : t('game.board.chooseTarget')}
            </PopupTitle>

            {revealedCard?.revealResultKey && (
              <PopupDescription accentColor="rgba(138, 92, 246, 0.4)">
                {t(revealedCard.revealResultKey)}
              </PopupDescription>
            )}

            {/* Cards grid */}
            <div className="flex flex-wrap gap-3 mb-6 justify-center">
              {cards.map((card, idx) => {
                const imgPath = card.image_file ? normalizeImagePath(card.image_file) : null;
                const isSelectable = card.isSummon || card.isMatch;
                const isSelected = multiSelectChoices.has(String(idx));
                const borderColor = isSelected ? '#4aff6b' : isSelectable ? '#8b5cf6' : '#333333';
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
                      overflow: 'hidden',
                      border: `2px solid ${borderColor}`,
                      boxShadow: isSelected
                        ? '0 0 20px rgba(74, 255, 107, 0.4), 0 4px 16px rgba(0, 0, 0, 0.6)'
                        : isSelectable
                          ? '0 0 12px rgba(138, 92, 246, 0.3), 0 4px 16px rgba(0, 0, 0, 0.6)'
                          : '0 4px 16px rgba(0, 0, 0, 0.6)',
                      opacity: isSelectable ? 1 : 0.45,
                      cursor: isSelectable ? 'pointer' : 'default',
                      transform: isSelected ? 'translateY(-4px)' : undefined,
                      transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
                    }}
                  >
                    {imgPath ? (
                      <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url('${imgPath}')` }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
                        <span className="text-xs text-center px-2" style={{ color: '#888888' }}>
                          {locale === 'en' && card.name_en ? card.name_en : card.name_fr}
                        </span>
                      </div>
                    )}

                    {/* Selection indicator — animated border accent */}
                    {isSelected && (
                      <motion.div
                        className="absolute inset-0"
                        style={{ borderLeft: '3px solid #4aff6b', borderBottom: '3px solid #4aff6b', pointerEvents: 'none' }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      />
                    )}

                    <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 text-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}>
                      <div className="text-[10px] font-bold" style={{ color: '#e0e0e0' }}>
                        {locale === 'en' && card.name_en ? card.name_en : card.name_fr}
                      </div>
                      {isSelectable && (
                        <div className="text-[9px] mt-0.5" style={{ color: isSelected ? '#4aff6b' : '#8b5cf6' }}>
                          {card.isSummon ? t('game.effect.tayuya065Summon') : card.isMatch ? t('game.effect.kiba026Match') : ''}
                        </div>
                      )}
                    </div>
                    <div
                      className="absolute top-1 left-1 w-5 h-5 flex items-center justify-center text-[9px] font-bold"
                      style={{ backgroundColor: 'rgba(0,0,0,0.85)', color: '#4a9eff', border: '1px solid #4a9eff' }}
                    >
                      {card.chakra}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="flex items-center justify-center gap-6">
              <PopupDismissLink onClick={skipMultiSelect}>
                {t('game.board.skip')}
              </PopupDismissLink>
              <PopupActionButton
                onClick={confirmMultiSelect}
                accentColor="#4aff6b"
                disabled={multiSelectChoices.size === 0}
              >
                {t('game.board.confirm')} ({multiSelectChoices.size})
              </PopupActionButton>
            </div>
          </PopupCornerFrame>
        </PopupOverlay>
      </AnimatePresence>
    );
  }

  // Multi-card reveal mode (Tayuya 065 UPGRADE etc.)
  if (isInfoReveal && pendingTargetSelection.revealedCards && pendingTargetSelection.revealedCards.length > 0) {
    const cards = pendingTargetSelection.revealedCards;
    const resultColor = '#c4a35a';

    return (
      <AnimatePresence>
        <PopupOverlay>
          <PopupCornerFrame accentColor="rgba(138, 92, 246, 0.4)" maxWidth="740px">
            <PopupMinimizeX onClick={minimizeEffectPopup} />
            <PopupTitle accentColor="#8b5cf6" size="lg">
              {revealedCard?.revealTitleKey
                ? t(revealedCard.revealTitleKey)
                : t('game.effect.tayuya065UpgradeRevealTitle')}
            </PopupTitle>

            <div className="flex flex-wrap gap-3 mb-5 justify-center">
              {cards.map((card, idx) => {
                const imgPath = card.image_file ? normalizeImagePath(card.image_file) : null;
                const isHighlight = card.isSummon || card.isMatch;
                const borderColor = isHighlight ? '#4aff6b' : card.isDiscarded ? '#b33e3e' : '#333333';
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
                      overflow: 'hidden',
                      border: `2px solid ${borderColor}`,
                      boxShadow: isHighlight
                        ? `0 0 16px ${borderColor}30, 0 4px 16px rgba(0, 0, 0, 0.6)`
                        : card.isDiscarded
                          ? '0 0 12px rgba(179, 62, 62, 0.3), 0 4px 16px rgba(0, 0, 0, 0.6)'
                          : '0 4px 16px rgba(0, 0, 0, 0.6)',
                      opacity: card.isDiscarded ? 0.55 : 1,
                    }}
                  >
                    {imgPath ? (
                      <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url('${imgPath}')` }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
                        <span className="text-xs text-center px-2" style={{ color: '#888888' }}>{locale === 'en' && card.name_en ? card.name_en : card.name_fr}</span>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 text-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}>
                      <div className="text-[10px] font-bold" style={{ color: '#e0e0e0' }}>{locale === 'en' && card.name_en ? card.name_en : card.name_fr}</div>
                      {(isHighlight || card.isDiscarded) && (
                        <div className="text-[9px] mt-0.5" style={{ color: isHighlight ? '#4aff6b' : '#b33e3e' }}>
                          {card.isSummon ? t('game.effect.tayuya065Summon') : card.isMatch ? t('game.effect.kiba026Match') : t('game.effect.cardDiscarded')}
                        </div>
                      )}
                    </div>
                    <div className="absolute top-1 left-1 w-5 h-5 flex items-center justify-center text-[9px] font-bold" style={{ backgroundColor: 'rgba(0,0,0,0.85)', color: '#4a9eff', border: '1px solid #4a9eff' }}>
                      {card.chakra}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); useUIStore.getState().zoomCard(card as unknown as CharacterCard); }}
                      className="absolute top-1 right-1 px-1.5 py-0.5 text-[8px] font-bold cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
                      style={{ backgroundColor: 'rgba(0,0,0,0.85)', color: '#8b5cf6', border: '1px solid rgba(138,92,246,0.4)' }}
                    >
                      {t('game.board.details')}
                    </button>
                  </motion.div>
                );
              })}
            </div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mb-5 text-center">
              <span className="font-body text-sm" style={{ color: resultColor }}>
                {revealedCard?.revealResultKey ? t(revealedCard.revealResultKey) : t('game.effect.tayuya065UpgradeRevealNone')}
              </span>
            </motion.div>

            <div className="flex justify-center">
              <PopupActionButton onClick={() => handleSelect('confirm')} accentColor={resultColor}>
                {t('game.board.confirm')}
              </PopupActionButton>
            </div>
          </PopupCornerFrame>
        </PopupOverlay>
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
        <PopupOverlay>
          <PopupCornerFrame accentColor={`${resultColor}55`} maxWidth="420px">
            <PopupMinimizeX onClick={minimizeEffectPopup} />
            <PopupTitle accentColor="#8b5cf6" size="lg">
              {revealedCard.revealTitleKey
                ? t(revealedCard.revealTitleKey)
                : t('game.effect.orochimaruReveal')}
            </PopupTitle>

            {/* Card display */}
            <motion.div
              initial={{ scale: 0.3, rotateY: 180, opacity: 0 }}
              animate={{ scale: 1, rotateY: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 120, damping: 14, delay: 0.2 }}
              className="relative mb-5 mx-auto"
              style={{
                width: dims.previewLg.w + 'px',
                height: dims.previewLg.h + 'px',
                overflow: 'hidden',
                border: `2px solid ${resultColor}88`,
                boxShadow: `0 0 24px ${resultColor}20, 0 8px 32px rgba(0, 0, 0, 0.6)`,
              }}
            >
              {imagePath ? (
                <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url('${imagePath}')` }} />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
                  <span className="text-sm text-center px-2" style={{ color: '#888888' }}>{locale === 'en' && revealedCard.name_en ? revealedCard.name_en : revealedCard.name_fr}</span>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 px-2 py-2 text-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}>
                <div className="text-xs font-bold" style={{ color: '#e0e0e0' }}>{locale === 'en' && revealedCard.name_en ? revealedCard.name_en : revealedCard.name_fr}</div>
                <div className="text-[10px] mt-0.5" style={{ color: '#888888' }}>{t('collection.details.cost')}: {revealedCard.chakra} | {t('collection.details.power')}: {revealedCard.power}</div>
              </div>
              <div className="absolute top-1.5 left-1.5 w-6 h-6 flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: 'rgba(0,0,0,0.85)', color: '#4a9eff', border: '1px solid #4a9eff' }}>
                {revealedCard.chakra}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); useUIStore.getState().zoomCard(revealedCard as unknown as CharacterCard); }}
                className="absolute top-1.5 right-1.5 px-2 py-1 text-[9px] font-bold cursor-pointer"
                style={{ backgroundColor: 'rgba(0,0,0,0.85)', color: '#8b5cf6', border: '1px solid rgba(138,92,246,0.4)' }}
              >
                {t('game.board.details')}
              </button>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mb-5 text-center">
              <span className="font-body text-sm" style={{ color: resultColor }}>
                {revealedCard.revealResultKey
                  ? t(revealedCard.revealResultKey)
                  : revealedCard.canSteal ? t('game.effect.orochimaruSteal') : t('game.effect.orochimaruTooExpensive')}
              </span>
            </motion.div>

            <div className="flex justify-center">
              <PopupActionButton onClick={() => handleSelect('confirm')} accentColor={resultColor}>
                {t('game.board.confirm')}
              </PopupActionButton>
            </div>
          </PopupCornerFrame>
        </PopupOverlay>
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
        <PopupOverlay>
          <PopupCornerFrame accentColor="rgba(196, 163, 90, 0.35)" maxWidth="520px">
            <PopupMinimizeX onClick={minimizeEffectPopup} />
            <PopupTitle accentColor="#c4a35a" size="lg">
              {descriptionKey ? t(descriptionKey, descriptionParams ?? {}) : description}
            </PopupTitle>

            <div className="flex gap-6 items-start justify-center">
              {/* Fresh play option — only shown when FRESH is a valid choice */}
              {validTargets.includes('FRESH') && (
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 180, damping: 16 }}
                className="flex flex-col items-center gap-3"
              >
                <motion.button
                  whileHover={{ scale: 1.05, borderColor: '#4a9eff' }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleSelect('FRESH')}
                  className="flex flex-col items-center gap-2 px-6 py-5 cursor-pointer"
                  style={{
                    backgroundColor: 'rgba(74, 158, 255, 0.06)',
                    border: '1px solid rgba(74, 158, 255, 0.4)',
                    borderLeft: '3px solid #4a9eff',
                    minWidth: '120px',
                  }}
                >
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#4a9eff' }}>
                    {t('game.effect.freshPlay')}
                  </span>
                  <span className="font-body text-[10px]" style={{ color: '#888888' }}>
                    {t('game.effect.freshPlayDesc')}
                  </span>
                </motion.button>
              </motion.div>
              )}

              {/* Divider — only shown when both fresh and upgrade are available */}
              {validTargets.includes('FRESH') && upgradeChars.length > 0 && (
              <div className="flex flex-col items-center justify-center self-stretch">
                <div className="w-px flex-1" style={{ backgroundColor: '#262626' }} />
                <span className="text-[10px] py-2" style={{ color: '#444444' }}>{t('game.effect.or')}</span>
                <div className="w-px flex-1" style={{ backgroundColor: '#262626' }} />
              </div>
              )}

              {/* Upgrade targets */}
              <motion.div
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 180, damping: 16 }}
                className="flex flex-col items-center gap-3"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#c4a35a' }}>
                  {t('game.effect.upgradeOver')}
                </span>
                <div className="flex gap-2 flex-wrap justify-center">
                  {upgradeChars.map(({ char }) => (
                    <TargetCharacter key={char.instanceId} character={char} isValidTarget={true} onSelect={handleSelect} />
                  ))}
                </div>
              </motion.div>
            </div>
          </PopupCornerFrame>
        </PopupOverlay>
      </AnimatePresence>
    );
  }

  // ---- Defeat / Hide order choice — new ordering popup ----
  if (
    (pendingTargetSelection.selectionType === 'ORDER_DEFEAT_TARGETS' ||
     pendingTargetSelection.selectionType === 'ORDER_HIDE_TARGETS') &&
    pendingTargetSelection.orderTargets &&
    pendingTargetSelection.orderTargets.length > 0
  ) {
    const orderMode = pendingTargetSelection.selectionType === 'ORDER_DEFEAT_TARGETS' ? 'defeat' as const : 'hide' as const;
    return (
      <TargetOrderPopup
        mode={orderMode}
        targets={pendingTargetSelection.orderTargets}
        description={description}
        descriptionKey={descriptionKey}
        descriptionParams={descriptionParams}
        sourceCardName={pendingTargetSelection.sourceCardName}
        onConfirm={(orderedIds) => {
          // Submit ordered targets as comma-separated string
          handleSelect(orderedIds.join(','));
        }}
        onDecline={canDecline ? handleDecline : undefined}
        canDecline={canDecline}
      />
    );
  }

  // ---- Effect Order Choice — floating bottom bar with card thumbnails ----
  if (pendingTargetSelection.selectionType === 'CHOOSE_EFFECT_ORDER' && pendingTargetSelection.effectOrderChoices) {
    const choices = pendingTargetSelection.effectOrderChoices;
    return (
      <AnimatePresence>
        <motion.div
          key="effect-order-bar"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          className="fixed z-50 flex flex-col items-center gap-2"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'auto',
          }}
        >
          {/* Title */}
          <div
            className="px-4 py-1.5 text-center uppercase tracking-widest"
            style={{
              fontSize: '10px',
              fontWeight: 700,
              color: '#c4a35a',
              backgroundColor: 'rgba(4, 4, 8, 0.85)',
              border: '1px solid rgba(196, 163, 90, 0.25)',
              letterSpacing: '0.2em',
            }}
          >
            {t('game.effect.chooseEffectOrder')}
          </div>

          {/* Card choices side by side */}
          <div className="flex items-stretch gap-3">
            {choices.map((choice, idx) => {
              const imgPath = choice.sourceCardImage ? normalizeImagePath(choice.sourceCardImage) : null;
              const effectLabel = choice.effectType === 'UPGRADE' ? 'UPGRADE'
                : choice.effectType === 'AMBUSH' ? 'AMBUSH'
                : choice.effectType === 'MAIN' ? 'MAIN'
                : choice.effectType === 'SCORE' ? 'SCORE' : choice.effectType;
              const accentColors = ['#c4a35a', '#4a9eff', '#e06050', '#50c878'];
              const accent = accentColors[idx % accentColors.length];

              return (
                <motion.button
                  key={choice.effectId}
                  whileHover={{ scale: 1.04, y: -4 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => pendingTargetSelection.onSelect(choice.effectId)}
                  className="relative flex flex-col items-center cursor-pointer no-select"
                  style={{
                    width: '140px',
                    backgroundColor: 'rgba(4, 4, 8, 0.92)',
                    border: `2px solid ${accent}`,
                    overflow: 'hidden',
                    boxShadow: `0 0 20px ${accent}30, 0 4px 24px rgba(0,0,0,0.6)`,
                  }}
                >
                  {/* Pulsing border glow */}
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    style={{ border: `2px solid ${accent}` }}
                    animate={{
                      boxShadow: [
                        `inset 0 0 8px ${accent}20`,
                        `inset 0 0 16px ${accent}40`,
                        `inset 0 0 8px ${accent}20`,
                      ],
                    }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  />

                  {/* Card image */}
                  <div className="relative w-full" style={{ height: '100px' }}>
                    {imgPath ? (
                      <img
                        src={imgPath}
                        alt={choice.sourceCardName}
                        draggable={false}
                        className="w-full h-full object-cover object-top"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"
                        style={{ backgroundColor: 'rgba(30,30,30,0.8)' }}>
                        <span style={{ color: '#555', fontSize: '11px' }}>?</span>
                      </div>
                    )}
                    {/* Darkening at bottom for text readability */}
                    <div className="absolute bottom-0 left-0 right-0 h-8"
                      style={{ background: 'linear-gradient(transparent, rgba(4,4,8,0.95))' }} />
                  </div>

                  {/* Effect type badge */}
                  <div
                    className="w-full px-2 py-1.5 text-center"
                    style={{ backgroundColor: `${accent}15` }}
                  >
                    <span
                      className="uppercase tracking-wider font-bold"
                      style={{ fontSize: '11px', color: accent, letterSpacing: '0.15em' }}
                    >
                      {effectLabel}
                    </span>
                  </div>

                  {/* Card name */}
                  <div className="w-full px-2 py-2 text-center" style={{ minHeight: '36px' }}>
                    <span
                      className="font-bold leading-tight"
                      style={{ fontSize: '11px', color: '#d0d0d0' }}
                    >
                      {choice.sourceCardName}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ---- Generic CONFIRM popup ----
  if (pendingTargetSelection.selectionType === 'EFFECT_CONFIRM') {
    const confirmTarget = validTargets[0];
    let confirmImage: string | null = null;
    let confirmName = '';

    if (confirmTarget?.startsWith('KS-') && confirmTarget?.includes('-MMS')) {
      for (const m of visibleState.activeMissions) {
        if (m.card?.id === confirmTarget) {
          confirmImage = normalizeImagePath(m.card.image_file);
          confirmName = getCardName(m.card as MissionCard & { name_en?: string; name_fr: string }, locale as 'en' | 'fr');
          break;
        }
      }
    } else if (confirmTarget) {
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
        <PopupOverlay>
          <PopupCornerFrame accentColor="rgba(196, 163, 90, 0.35)" maxWidth="440px">
            <PopupMinimizeX onClick={minimizeEffectPopup} />
            <PopupTitle accentColor="#c4a35a" size="md">
              {descriptionKey ? t(descriptionKey, descriptionParams ?? {}) : description}
            </PopupTitle>

            {confirmImage && (
              <motion.div
                initial={{ scale: 0.7, rotateY: 15, opacity: 0 }}
                animate={{ scale: 1, rotateY: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 150, damping: 14, delay: 0.15 }}
                className="relative mb-6 mx-auto"
                style={{
                  width: (confirmTarget?.includes('-MMS')) ? '200px' : '120px',
                  height: (confirmTarget?.includes('-MMS')) ? '143px' : '168px',
                  overflow: 'hidden',
                  border: '2px solid rgba(196, 163, 90, 0.5)',
                  boxShadow: '0 0 20px rgba(196, 163, 90, 0.15), 0 8px 24px rgba(0, 0, 0, 0.5)',
                }}
              >
                <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url('${confirmImage}')` }} />
                <div className="absolute inset-x-0 bottom-0 px-1 py-1 text-center" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}>
                  <span className="text-[9px] font-bold truncate block" style={{ color: '#e0e0e0' }}>{confirmName}</span>
                </div>
              </motion.div>
            )}

            <div className="flex items-center justify-center gap-6">
              <PopupActionButton onClick={() => handleSelect(confirmTarget)}>
                {t('game.board.confirm')}
              </PopupActionButton>
              {canDecline && (
                <PopupDismissLink onClick={handleDecline}>
                  {t('game.board.skip')}
                </PopupDismissLink>
              )}
            </div>
          </PopupCornerFrame>
        </PopupOverlay>
      </AnimatePresence>
    );
  }

  // ---- Default: Board target selection ----
  // Detect mission-only targeting (all valid targets are mission indices like '0','1','2','3')
  const isMissionOnlyTargeting = validTargets.length > 0 && validTargets.every(t => /^\d+$/.test(t));
  const missionCount = visibleState.activeMissions.length;
  // Adaptive width: fit content for mission-only, wider for character targeting
  const popupMaxWidth = isMissionOnlyTargeting ? '90vw' : '85vw';

  return (
    <AnimatePresence>
      <PopupOverlay>
        <PopupCornerFrame accentColor="rgba(196, 163, 90, 0.25)" maxWidth={popupMaxWidth} padding="20px 16px" backgroundColor="rgba(4, 4, 8, 0.95)" fitContent={isMissionOnlyTargeting}>
          <PopupMinimizeX onClick={minimizeEffectPopup} />
          <PopupTitle accentColor="#c4a35a" size="lg">
            {t('game.mustChooseTarget', { player: displayName })}
          </PopupTitle>

          <motion.div
            initial={{ x: -12, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.12, duration: 0.35 }}
            className="mb-5 py-3 text-center mx-auto"
            style={{
              color: '#aaaaaa',
              fontSize: '12px',
              maxWidth: '420px',
            }}
          >
            {descriptionKey ? t(descriptionKey, descriptionParams ?? {}) : description}
          </motion.div>

          <div className="flex justify-center mb-2">
            <PopupTargetCount count={validTargets.length} accentColor="#c4a35a" />
          </div>

          {/* Board view with targets highlighted */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 180, damping: 18 }}
            className="flex justify-center gap-4 overflow-x-auto px-2 py-3 mb-4"
            style={{ maxWidth: '100%' }}
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

          {canDecline && (
            <div className="flex justify-center mt-2">
              <PopupDismissLink onClick={handleDecline}>
                {declineLabelKey ? t(declineLabelKey) : t('game.board.skip')}
              </PopupDismissLink>
            </div>
          )}
        </PopupCornerFrame>
      </PopupOverlay>
    </AnimatePresence>
  );
}
