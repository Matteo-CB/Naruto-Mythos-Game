'use client';

import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type {
  VisibleMission,
  VisibleCharacter,
  PlayerID,
  MissionRank,
} from '@/lib/engine/types';
import { useBannedCards } from '@/lib/hooks/useBannedCards';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { HoloFoilOverlay } from '@/components/cards/HoloFoilOverlay';
import { getCardName } from '@/lib/utils/cardLocale';
import { useGameScale } from './GameScaleContext';

interface CharacterSlotProps {
  character: VisibleCharacter;
  isOwn: boolean;
  missionIndex: number;
  myPlayer: PlayerID;
}

const CharacterSlot = React.memo(function CharacterSlot({ character, isOwn, missionIndex, myPlayer }: CharacterSlotProps) {
  const t = useTranslations();
  const locale = useLocale();
  const dims = useGameScale();
  const selectTarget = useUIStore((s) => s.selectTarget);
  const selectedTargetId = useUIStore((s) => s.selectedTargetId);
  const showPreview = useUIStore((s) => s.showPreview);
  const hidePreview = useUIStore((s) => s.hidePreview);
  const pinCard = useUIStore((s) => s.pinCard);
  const zoomCard = useUIStore((s) => s.zoomCard);

  const isSandboxMode = useGameStore((s) => s.isSandboxMode);
  const sandboxDefeatCharacter = useGameStore((s) => s.sandboxDefeatCharacter);
  const sandboxReturnToHand = useGameStore((s) => s.sandboxReturnToHand);
  const sandboxHideCharacter = useGameStore((s) => s.sandboxHideCharacter);
  const sandboxRevealCharacter = useGameStore((s) => s.sandboxRevealCharacter);
  const sandboxAddPowerToken = useGameStore((s) => s.sandboxAddPowerToken);
  const [showSandboxMenu, setShowSandboxMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const isMyTurn = useGameStore((s) =>
    !s.isProcessing &&
    s.visibleState?.phase === 'action' &&
    s.visibleState?.activePlayer === s.visibleState?.myPlayer,
  );

  const isSelected = selectedTargetId === character.instanceId;
  const isHidden = character.isHidden;

  const hasCardData = !!character.card;

  const effectPopupMinimized = useUIStore((s) => s.effectPopupMinimized);

  const isRevealable = isOwn && isHidden && isMyTurn && hasCardData && !effectPopupMinimized;

  const isReHidden = isHidden && character.wasRevealedAtLeastOnce;
  
  const isUnknownHiddenEnemy = isHidden && !isOwn && !character.wasRevealedAtLeastOnce;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isMyTurn) {

      if (!isUnknownHiddenEnemy && character.card) {
        pinCard(character.card);
      }
      return;
    }
    if (isRevealable) {
      selectTarget(character.instanceId);
      
      if (character.card) {
        pinCard(character.card);
      }
      return;
    }
    
    if (!isUnknownHiddenEnemy && character.card) {
      pinCard(character.card);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isUnknownHiddenEnemy && character.card) {
      zoomCard(character.card);
    }
  };

  const imagePath = hasCardData ? normalizeImagePath(character.card?.image_file) : null;

  const totalPower = character.effectivePower;
  const manualPowerMode = useSettingsStore((s) => s.manualPowerMode);

  const handleMouseEnter = (e: React.MouseEvent) => {
    
    if (isUnknownHiddenEnemy || !character.card) return;
    showPreview(character.card, { x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    hidePreview();
  };

  const isLastPlayed = character.isLastPlayed;

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!isSandboxMode) return;
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setShowSandboxMenu(true);
  };

  return (
    <>
    
    {showSandboxMenu && isSandboxMode && (
      <>
        <div className="fixed inset-0 z-[80]" onClick={() => setShowSandboxMenu(false)} />
        <div
          className="fixed z-[81] flex flex-col py-1 rounded"
          style={{
            left: menuPos.x,
            top: menuPos.y,
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            minWidth: '120px',
            transform: 'translateY(-50%)',
          }}
        >
          <button onClick={() => { sandboxReturnToHand(missionIndex, character.instanceId); setShowSandboxMenu(false); }}
            className="px-3 py-1.5 text-[10px] text-left text-[#ccc] hover:bg-[#262626] transition-colors">
            {t('sandbox.returnToHand')}
          </button>
          <button onClick={() => { sandboxDefeatCharacter(missionIndex, character.instanceId); setShowSandboxMenu(false); }}
            className="px-3 py-1.5 text-[10px] text-left text-[#b33e3e] hover:bg-[#262626] transition-colors">
            {t('sandbox.defeat')}
          </button>
          {!character.isHidden && (
            <button onClick={() => { sandboxHideCharacter(missionIndex, character.instanceId); setShowSandboxMenu(false); }}
              className="px-3 py-1.5 text-[10px] text-left text-[#ccc] hover:bg-[#262626] transition-colors">
              {t('sandbox.hide')}
            </button>
          )}
          {character.isHidden && (
            <button onClick={() => { sandboxRevealCharacter(missionIndex, character.instanceId); setShowSandboxMenu(false); }}
              className="px-3 py-1.5 text-[10px] text-left text-[#ccc] hover:bg-[#262626] transition-colors">
              {t('sandbox.reveal')}
            </button>
          )}
          <button onClick={() => { sandboxAddPowerToken(missionIndex, character.instanceId, 1); setShowSandboxMenu(false); }}
            className="px-3 py-1.5 text-[10px] text-left text-[#c4a35a] hover:bg-[#262626] transition-colors">
            +1 {t('sandbox.powerToken')}
          </button>
          <button onClick={() => { sandboxAddPowerToken(missionIndex, character.instanceId, -1); setShowSandboxMenu(false); }}
            className="px-3 py-1.5 text-[10px] text-left text-[#888] hover:bg-[#262626] transition-colors">
            -1 {t('sandbox.powerToken')}
          </button>
        </div>
      </>
    )}
    <motion.div
      initial={false}
      animate={{
        scale: 1,
        opacity: 1,
        y: 0,
      }}
      whileHover={undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-anchor={`slot:${missionIndex}:${isOwn ? 'me' : 'opp'}:${character.instanceId}`}
      className="relative no-select"
      style={{
        width: dims.missionCard.w + 'px',
        height: dims.missionCard.h + 'px',
        borderRadius: '6px',
        cursor: isRevealable ? 'pointer' : (!isUnknownHiddenEnemy && character.card ? 'pointer' : 'default'),
        border: isSelected
          ? '2px solid #c4a35a'
          : isLastPlayed
            ? '2px solid rgba(255, 255, 255, 0.7)'
            : '1px solid rgba(255, 255, 255, 0.08)',
        overflow: 'hidden',
        boxShadow: isSelected
          ? '0 0 16px rgba(196, 163, 90, 0.4), 0 4px 12px rgba(0, 0, 0, 0.5)'
          : isLastPlayed
            ? '0 0 12px rgba(255, 255, 255, 0.4), 0 0 4px rgba(255, 255, 255, 0.2), 0 2px 8px rgba(0, 0, 0, 0.4)'
            : '0 2px 8px rgba(0, 0, 0, 0.4)',
        contain: 'layout style',
      }}
    >
      {isHidden && !isReHidden ? (
        
        <img
          src="/images/card-back.webp"
          alt={t('card.back')}
          draggable={false}
          className="w-full h-full object-cover"
        />
      ) : isReHidden ? (
        
        <>
          {imagePath ? (
            <div
              className="w-full h-full bg-cover bg-center"
              style={{
                backgroundImage: `url('${imagePath}')`,
                imageRendering: 'crisp-edges',
                filter: 'grayscale(100%) brightness(0.5)',
                opacity: 0.6,
              }}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ backgroundColor: '#1a1a1a', filter: 'grayscale(100%) brightness(0.5)', opacity: 0.6 }}
            >
              <span className="text-[8px] text-center px-0.5" style={{ color: '#888888' }}>
                {character.card ? getCardName(character.card, locale as 'en' | 'fr') : '???'}
              </span>
            </div>
          )}
        </>
      ) : (

        <>
          {imagePath ? (
            <>
              <div
                className="w-full h-full bg-cover bg-center"
                style={{ backgroundImage: `url('${imagePath}')`, imageRendering: 'crisp-edges' }}
              />
              {character.card?.isHolo && <HoloFoilOverlay />}
            </>
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ backgroundColor: '#1a1a1a' }}
            >
              <span className="text-[8px] text-center px-0.5" style={{ color: '#888888' }}>
                {character.card ? getCardName(character.card, locale as 'en' | 'fr') : '???'}
              </span>
            </div>
          )}
        </>
      )}

      {!isHidden && (character.attachments?.length ?? 0) > 0 && (
        <div
          className="absolute bottom-0.5 left-0.5 z-10 flex flex-col gap-0.5"
          onClick={(e) => { e.stopPropagation(); pinCard(character.attachments![0].card as never); }}
          title={character.attachments!.map((a) => getCardName(a.card, locale as 'en' | 'fr')).join(', ')}
          style={{ cursor: 'pointer' }}
        >
          {character.attachments!.slice(0, 2).map((att) => (
            <div
              key={att.instanceId}
              style={{
                width: dims.isMobile ? '20px' : '16px',
                height: dims.isMobile ? '26px' : '21px',
                backgroundImage: att.card.image_file ? `url('${normalizeImagePath(att.card.image_file)}')` : undefined,
                backgroundColor: '#141414',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                borderRadius: '2px',
                boxShadow: '0 0 8px rgba(196, 163, 90, 0.45)',
              }}
            />
          ))}
        </div>
      )}

      {!isHidden && (
        <div
          className={`absolute bottom-0.5 right-0.5 flex items-center justify-center font-bold tabular-nums${character.powerTokens > 0 ? ' power-glow' : ''}`}
          style={{
            minWidth: dims.isMobile ? '26px' : '22px',
            height: dims.isMobile ? '22px' : '18px',
            padding: '0 4px',
            fontSize: dims.isMobile ? '15px' : '11px',
            backgroundColor: character.powerTokens > 0 ? 'rgba(196, 163, 90, 0.25)' : 'rgba(0, 0, 0, 0.85)',
            color: character.powerTokens > 0 ? '#f0d890' : '#e0e0e0',
            border: character.powerTokens > 0 ? '1px solid rgba(196, 163, 90, 0.5)' : '1px solid rgba(255,255,255,0.1)',
            textShadow: character.powerTokens > 0 ? '0 0 6px rgba(196, 163, 90, 0.6)' : 'none',
            fontFamily: "'NJNaruto', Arial, sans-serif",
          }}
        >
          {manualPowerMode ? '?' : totalPower}
        </div>
      )}

      {character.powerTokens > 0 && (
        <div
          className="absolute top-0.5 right-0.5 flex flex-col items-end gap-0.5"
          style={{ pointerEvents: 'none' }}
        >
          {Array.from({ length: Math.min(character.powerTokens, 5) }).map((_, i) => (
            <motion.div
              key={`token-${i}`}
              initial={false}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              style={{
                width: dims.isMobile ? '13px' : '11px',
                height: dims.isMobile ? '13px' : '11px',
                backgroundColor: '#c4a35a',
                border: '1px solid #a8893a',
                boxShadow: '0 1px 4px rgba(0,0,0,0.6), 0 0 4px rgba(196, 163, 90, 0.3)',
                transform: 'rotate(45deg)',
              }}
            />
          ))}
          {character.powerTokens > 5 && (
            <motion.span
              initial={false}
              animate={{ opacity: 1, scale: 1 }}
              className="font-bold pr-0.5"
              style={{ fontSize: dims.isMobile ? '11px' : '8px', color: '#f0d890', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
            >
              +{character.powerTokens - 5}
            </motion.span>
          )}
        </div>
      )}

      {!isHidden && character.card && (
        <div
          className="absolute top-0.5 left-0.5 flex items-center justify-center font-bold"
          style={{
            width: dims.isMobile ? '24px' : '20px',
            height: dims.isMobile ? '24px' : '20px',
            fontSize: dims.isMobile ? '13px' : '9px',
            backgroundColor: 'rgba(196, 163, 90, 0.9)',
            color: '#0a0a0a',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
            fontFamily: "'NJNaruto', Arial, sans-serif",
          }}
        >
          {character.card.chakra}
        </div>
      )}

      {(character.stackSize > 1 || character.controlledBy !== character.originalOwner) && (
        <div className="absolute bottom-0.5 left-0.5 flex flex-col gap-0.5 items-start">
          {character.controlledBy !== character.originalOwner && (
            <motion.div
              initial={false}
              animate={{ scale: 1 }}
              className="px-1 py-0.5 font-bold flex items-center stack-pulse"
              style={{
                fontSize: dims.isMobile ? '10px' : '8px',
                backgroundColor: 'rgba(138, 92, 246, 0.25)',
                color: '#b89bff',
                border: '1px solid rgba(138, 92, 246, 0.55)',
                textShadow: '0 0 4px rgba(138, 92, 246, 0.45)',
              }}
            >
              <span style={{ fontSize: dims.isMobile ? '9px' : '7px', letterSpacing: '0.5px' }}>{t('game.board.controlled')}</span>
            </motion.div>
          )}
          {character.stackSize > 1 && (
            <motion.div
              initial={false}
              animate={{ scale: 1 }}
              className="px-1 py-0.5 font-bold flex items-center gap-0.5 stack-pulse"
              style={{
                fontSize: dims.isMobile ? '10px' : '8px',
                backgroundColor: 'rgba(62, 139, 62, 0.25)',
                color: '#5cb85c',
                border: '1px solid rgba(62, 139, 62, 0.5)',
                textShadow: '0 0 4px rgba(62, 139, 62, 0.4)',
              }}
            >
              <span style={{ fontSize: dims.isMobile ? '9px' : '7px', letterSpacing: '0.5px' }}>{t('game.board.up')}</span>
              <span>{character.stackSize}</span>
            </motion.div>
          )}
        </div>
      )}
    </motion.div>
    </>
  );
},
  (prev, next) =>
    prev.character.instanceId === next.character.instanceId &&
    prev.character.powerTokens === next.character.powerTokens &&
    prev.character.isHidden === next.character.isHidden &&
    prev.character.wasRevealedAtLeastOnce === next.character.wasRevealedAtLeastOnce &&
    prev.character.effectivePower === next.character.effectivePower &&
    prev.character.stackSize === next.character.stackSize &&
    prev.character.controlledBy === next.character.controlledBy &&
    prev.character.originalOwner === next.character.originalOwner &&
    prev.character.card?.id === next.character.card?.id &&
    prev.isOwn === next.isOwn,
);

function MissionCardDisplay({
  mission,
  index,
  myPlayer,
}: {
  mission: VisibleMission;
  index: number;
  myPlayer: PlayerID;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const dims = useGameScale();
  const showPreview = useUIStore((s) => s.showPreview);
  const hidePreview = useUIStore((s) => s.hidePreview);
  const pinCard = useUIStore((s) => s.pinCard);
  const zoomCard = useUIStore((s) => s.zoomCard);
  const isSandboxMode = useGameStore((s) => s.isSandboxMode);
  const sandboxSwapMission = useGameStore((s) => s.sandboxSwapMission);
  const sandboxReturnAllFromMission = useGameStore((s) => s.sandboxReturnAllFromMission);
  const [showMissionMenu, setShowMissionMenu] = useState(false);
  const [missionMenuPos, setMissionMenuPos] = useState({ x: 0, y: 0 });
  const [showSwapModal, setShowSwapModal] = useState(false);
  const rankColors: Record<MissionRank, string> = {
    D: '#3e8b3e',
    C: '#c4a35a',
    B: '#b37e3e',
    A: '#b33e3e',
  };

  const imagePath = normalizeImagePath(mission.card.image_file);

  const totalPoints = mission.basePoints + mission.rankBonus;

  const handleMissionContextMenu = (e: React.MouseEvent) => {
    if (!isSandboxMode) return;
    e.preventDefault();
    e.stopPropagation();
    setMissionMenuPos({ x: e.clientX, y: e.clientY });
    setShowMissionMenu(true);
  };

  return (
    <>
    
    {showMissionMenu && isSandboxMode && (
      <>
        <div className="fixed inset-0 z-[80]" onClick={() => setShowMissionMenu(false)} />
        <div
          className="fixed z-[81] flex flex-col py-1 rounded"
          style={{
            left: missionMenuPos.x,
            top: missionMenuPos.y,
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            minWidth: '140px',
            transform: 'translateY(-50%)',
          }}
        >
          <button onClick={() => { setShowMissionMenu(false); setShowSwapModal(true); }}
            className="px-3 py-1.5 text-[10px] text-left text-[#c4a35a] hover:bg-[#262626] transition-colors">
            {t('sandbox.swapMission')}
          </button>
          <button onClick={() => { sandboxReturnAllFromMission(index); setShowMissionMenu(false); }}
            className="px-3 py-1.5 text-[10px] text-left text-[#ccc] hover:bg-[#262626] transition-colors">
            {t('sandbox.clearMission')}
          </button>
        </div>
      </>
    )}

    {showSwapModal && isSandboxMode && (
      <MissionSwapModal
        missionIndex={index}
        currentMissionId={mission.card.id}
        onSwap={(newId) => { sandboxSwapMission(index, newId); setShowSwapModal(false); }}
        onClose={() => setShowSwapModal(false)}
      />
    )}

    <div
      data-anchor={`mission:${index}`}
      className="relative mission-aspect no-select"
      style={{
        width: '100%',
        maxWidth: dims.missionMaxW + 'px',
        border: `2px solid ${rankColors[mission.rank]}`,
        borderRadius: '6px',
        overflow: 'hidden',
        cursor: 'pointer',
        boxShadow: `0 0 12px ${rankColors[mission.rank]}30, 0 4px 12px rgba(0, 0, 0, 0.5)`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        pinCard(mission.card, {
          rank: mission.rank,
          basePoints: mission.basePoints,
          rankBonus: mission.rankBonus,
        });
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        zoomCard(mission.card, {
          rank: mission.rank,
          basePoints: mission.basePoints,
          rankBonus: mission.rankBonus,
        });
      }}
      onContextMenu={handleMissionContextMenu}
      onMouseEnter={(e) => {
        showPreview(mission.card, { x: e.clientX, y: e.clientY }, {
          rank: mission.rank,
          basePoints: mission.basePoints,
          rankBonus: mission.rankBonus,
        });
      }}
      onMouseLeave={() => hidePreview()}
    >
      {imagePath ? (
        <div
          className="w-full h-full bg-cover bg-center"
          style={{
            backgroundImage: `url('${imagePath}')`,
            minHeight: '65px',
            imageRendering: 'crisp-edges',
          }}
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ backgroundColor: '#1a1a1a', minHeight: '65px' }}
        >
          <span className="text-[9px] text-center px-1" style={{ color: '#888888' }}>
            {getCardName(mission.card, locale as 'en' | 'fr')}
          </span>
        </div>
      )}

      <div
        className="absolute top-1 left-1 px-1.5 py-0.5 font-bold"
        style={{
          fontSize: dims.isMobile ? '13px' : '10px',
          backgroundColor: rankColors[mission.rank],
          color: '#0a0a0a',
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
          fontFamily: "'NJNaruto', Arial, sans-serif",
        }}
      >
        {mission.rank}
      </div>

      <div
        className="absolute top-1 right-1 px-1 py-0.5 font-bold tabular-nums"
        style={{
          fontSize: dims.isMobile ? '12px' : '9px',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          color: '#c4a35a',
          fontFamily: "'NJNaruto', Arial, sans-serif",
        }}
      >
        {totalPoints} {t('game.board.pts')}
      </div>

      {mission.wonBy && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        >
          <span
            className="font-bold px-3 py-1"
            style={{
              fontSize: dims.isMobile ? '16px' : '14px',
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              color: mission.wonBy === 'draw' ? '#888888' : mission.wonBy === myPlayer ? '#c4a35a' : '#b33e3e',
            }}
          >
            {mission.wonBy === 'draw' ? t('game.board.draw') : mission.wonBy === myPlayer ? t('game.board.won') : t('game.board.lost')}
          </span>
        </motion.div>
      )}
    </div>

    {(mission.attachments?.length ?? 0) > 0 && (
      <div className="flex gap-1 justify-center" style={{ width: '100%', maxWidth: dims.missionMaxW + 'px', marginTop: '2px' }}>
        {mission.attachments!.map((att) => (
          <div
            key={att.instanceId}
            onClick={(e) => { e.stopPropagation(); pinCard(att.card as never); }}
            title={getCardName(att.card, locale as 'en' | 'fr')}
            style={{
              width: '36%',
              aspectRatio: '3.5 / 1.1',
              borderRadius: '3px',
              backgroundImage: att.card.image_file ? `url('${normalizeImagePath(att.card.image_file)}')` : undefined,
              backgroundColor: '#141414',
              backgroundSize: 'cover',
              backgroundPosition: 'center 30%',
              boxShadow: att.owner === myPlayer ? '0 0 8px rgba(196, 163, 90, 0.5)' : '0 0 8px rgba(179, 62, 62, 0.5)',
              cursor: 'pointer',
            }}
          />
        ))}
      </div>
    )}
    </>
  );
}

function MissionSwapModal({
  missionIndex,
  currentMissionId,
  onSwap,
  onClose,
}: {
  missionIndex: number;
  currentMissionId: string;
  onSwap: (newMissionCardId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const allMissions = useMemo(() => {
    try {
      const { getAllMissions } = require('@/lib/data/cardIndex');
      return getAllMissions() as import('@/lib/engine/types').MissionCard[];
    } catch {
      return [];
    }
  }, []);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl max-h-[80vh] mx-4 overflow-hidden flex flex-col rounded-lg"
        style={{ backgroundColor: '#111', border: '1px solid #333' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #262626' }}>
          <span className="text-xs uppercase tracking-wider font-bold" style={{ color: '#c4a35a' }}>
            {t('sandbox.swapMission')}
          </span>
          <button onClick={onClose} className="text-xs px-2 py-1" style={{ color: '#888', border: '1px solid #333' }}>
            {t('sandbox.close')}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {allMissions.map((m) => {
              const imgPath = normalizeImagePath(m.image_file);
              const isCurrent = m.id === currentMissionId;
              return (
                <button
                  key={m.id}
                  onClick={() => { if (!isCurrent) onSwap(m.cardId || m.id); }}
                  className="relative w-full overflow-hidden group"
                  style={{
                    aspectRatio: '7/5',
                    backgroundColor: '#1a1a1a',
                    border: isCurrent ? '2px solid #c4a35a' : '1px solid #333',
                    opacity: isCurrent ? 0.5 : 1,
                    cursor: isCurrent ? 'default' : 'pointer',
                  }}
                >
                  {imgPath ? (
                    <img src={imgPath} alt={getCardName(m, locale as 'en' | 'fr')} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-[9px] text-center px-1" style={{ color: '#666' }}>
                        {getCardName(m, locale as 'en' | 'fr')}
                      </span>
                    </div>
                  )}
                  <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center truncate px-1 py-0.5"
                    style={{ backgroundColor: 'rgba(0,0,0,0.85)', color: '#ccc' }}>
                    {getCardName(m, locale as 'en' | 'fr')}
                  </span>
                  {isCurrent && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                      <span className="text-[10px] font-bold" style={{ color: '#c4a35a' }}>{t('sandbox.currentMission')}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MissionLaneProps {
  mission: VisibleMission;
  missionIndex: number;
}

export const MissionLane = React.memo(function MissionLane({ mission, missionIndex }: MissionLaneProps) {
  const t = useTranslations();
  const dims = useGameScale();
  const visibleState = useGameStore((s) => s.visibleState);
  const isProcessing = useGameStore((s) => s.isProcessing);
  const selectedCardIndex = useUIStore((s) => s.selectedCardIndex);
  const selectedMissionIndex = useUIStore((s) => s.selectedMissionIndex);
  const selectMission = useUIStore((s) => s.selectMission);

  if (!visibleState) return null;

  const { myPlayer } = visibleState;

  const isMyTurn =
    visibleState.activePlayer === visibleState.myPlayer &&
    visibleState.phase === 'action' &&
    !isProcessing;

  const effectPopupMinimized_ml = useUIStore((s) => s.effectPopupMinimized);

  const isTargetable = isMyTurn && selectedCardIndex !== null && !effectPopupMinimized_ml;
  const isSelected = selectedMissionIndex === missionIndex;

  const myChars =
    myPlayer === 'player1'
      ? mission.player1Characters
      : mission.player2Characters;
  const oppChars =
    myPlayer === 'player1'
      ? mission.player2Characters
      : mission.player1Characters;

  const myPower = useMemo(
    () => myChars.reduce((sum, c) => sum + c.effectivePower, 0),
    [myChars],
  );
  const oppPower = useMemo(
    () => oppChars.reduce((sum, c) => sum + c.effectivePower, 0),
    [oppChars],
  );

  const handleClick = () => {
    if (!isTargetable) return;
    if (selectedMissionIndex === missionIndex) {
      selectMission(null);
    } else {
      selectMission(missionIndex);
    }
  };

  const totalPoints = mission.basePoints + mission.rankBonus;
  const rankColor: Record<MissionRank, string> = {
    D: '#3e8b3e', C: '#c4a35a', B: '#b37e3e', A: '#b33e3e',
  };
  const rc = rankColor[mission.rank];

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      onClick={handleClick}
      className="flex flex-col items-center gap-0.5 px-1 py-0.5 h-full"
      style={{
        minWidth: dims.emptyLaneMinW + 'px',
        maxWidth: dims.emptyLaneMaxW + 'px',
        flex: '1 1 0',
        cursor: isTargetable ? 'pointer' : 'default',
        backgroundColor: 'rgba(10, 10, 10, 0.35)',
        border: '1px solid rgba(255, 255, 255, 0.04)',
      }}
    >
      
      <div
        className="flex-1 flex flex-col min-h-0"
      >
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden min-h-0"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}
        >
          <div className="flex flex-wrap gap-0.5 justify-center content-end min-h-full">
            {oppChars.map((char) => (
              <CharacterSlot
                key={char.instanceId}
                character={char}
                isOwn={false}
                missionIndex={missionIndex}
                myPlayer={myPlayer}
              />
            ))}
          </div>
        </div>
        
        {oppChars.length > 0 && (
          <div className="shrink-0 flex justify-center py-0.5">
            <span
              className="font-bold tabular-nums"
              style={{ fontSize: dims.isMobile ? '15px' : '10px', lineHeight: 1.1, color: '#b33e3e', fontFamily: "'NJNaruto', Arial, sans-serif" }}
            >
              {oppPower}
            </span>
          </div>
        )}
      </div>

      <div className="relative w-full flex justify-center shrink-0">
        
        {isSelected && (
          <div
            className="absolute inset-0 -m-1.5"
            style={{
              border: '2px solid #c4a35a',
              borderRadius: '8px',
              boxShadow: '0 0 16px rgba(196, 163, 90, 0.4)',
              pointerEvents: 'none',
            }}
          />
        )}
        <MissionCardDisplay mission={mission} index={missionIndex} myPlayer={myPlayer} />
      </div>

      <div
        className="flex-1 flex flex-col min-h-0"
      >
        
        {myChars.length > 0 && (
          <div className="shrink-0 flex justify-center py-0.5">
            <span
              className="font-bold tabular-nums"
              style={{ fontSize: dims.isMobile ? '15px' : '10px', lineHeight: 1.1, color: '#c4a35a', fontFamily: "'NJNaruto', Arial, sans-serif" }}
            >
              {myPower}
            </span>
          </div>
        )}
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden min-h-0"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}
        >
          <div className="flex flex-wrap gap-0.5 justify-center content-start min-h-full">
            {myChars.map((char) => (
              <CharacterSlot
                key={char.instanceId}
                character={char}
                isOwn={true}
                missionIndex={missionIndex}
                myPlayer={myPlayer}
              />
            ))}
          </div>
        </div>
      </div>

      {!dims.isMobile && (
        <div
          className="shrink-0 flex items-center justify-center gap-1 w-full px-1.5 py-0.5"
          style={{
            backgroundColor: `${rc}15`,
            fontFamily: "'NJNaruto', Arial, sans-serif",
          }}
        >
          <span
            className="text-[10px] font-bold px-1"
            style={{ backgroundColor: rc, color: '#0a0a0a' }}
          >
            {mission.rank}
          </span>
          <span
            className="text-[11px] font-bold tabular-nums"
            style={{ color: rc }}
          >
            {totalPoints}
          </span>
        </div>
      )}
    </motion.div>
  );
},
  (prev, next) =>
    prev.missionIndex === next.missionIndex &&
    prev.mission.player1Characters === next.mission.player1Characters &&
    prev.mission.player2Characters === next.mission.player2Characters &&
    prev.mission.card?.id === next.mission.card?.id &&
    prev.mission.wonBy === next.mission.wonBy,
);
