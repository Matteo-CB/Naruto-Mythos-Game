'use client';

import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import type { VisibleCharacter, VisibleMission, MissionRank } from '@/lib/engine/types';

// ----- Target Character Card -----

interface TargetCharacterProps {
  character: VisibleCharacter;
  isValidTarget: boolean;
  onSelect: (instanceId: string) => void;
}

function TargetCharacter({ character, isValidTarget, onSelect }: TargetCharacterProps) {
  const t = useTranslations();
  const isHidden = character.isHidden;
  const canSeeCard = character.isOwn && character.card;

  const imagePath =
    canSeeCard && character.card?.image_file
      ? (character.card.image_file.replace(/\\/g, '/').startsWith('/') ? character.card.image_file.replace(/\\/g, '/') : `/${character.card.image_file.replace(/\\/g, '/')}`)
      : !isHidden && character.card?.image_file
        ? (character.card.image_file.replace(/\\/g, '/').startsWith('/') ? character.card.image_file.replace(/\\/g, '/') : `/${character.card.image_file.replace(/\\/g, '/')}`)
        : null;

  const totalPower = character.effectivePower;
  const displayName = character.card?.name_fr ?? (isHidden ? '???' : 'Unknown');

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
        width: '64px',
        height: '90px',
        borderRadius: '5px',
        border: isValidTarget
          ? '2px solid #c4a35a'
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
            border: '2px solid #c4a35a',
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
          alt=""
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
    </motion.div>
  );
}

// ----- Mission Lane for Target Selection -----

interface TargetMissionLaneProps {
  mission: VisibleMission;
  missionIndex: number;
  validTargets: string[];
  onSelect: (instanceId: string) => void;
}

function TargetMissionLane({ mission, missionIndex, validTargets, onSelect }: TargetMissionLaneProps) {
  const t = useTranslations();
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

  // Check if any character in this mission is a valid target
  const hasValidTargets = allChars.some(c => validTargets.includes(c.instanceId));

  return (
    <div
      className="flex flex-col items-center gap-2 px-2"
      style={{
        opacity: hasValidTargets ? 1 : 0.4,
        minWidth: '120px',
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
        {mission.card.name_fr}
      </span>

      {/* Opponent characters (top) */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-[9px]" style={{ color: '#555555' }}>{t('game.opponent')}</span>
        <div className="flex flex-wrap gap-1 justify-center" style={{ minHeight: '94px' }}>
          {mission.player2Characters.map(char => (
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
          {mission.player1Characters.map(char => (
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
  const pendingTargetSelection = useGameStore((s) => s.pendingTargetSelection);
  const selectTarget = useGameStore((s) => s.selectTarget);
  const declineTarget = useGameStore((s) => s.declineTarget);
  const visibleState = useGameStore((s) => s.visibleState);

  const handleSelect = useCallback(
    (targetId: string) => {
      selectTarget(targetId);
    },
    [selectTarget],
  );

  const handleDecline = useCallback(() => {
    declineTarget();
  }, [declineTarget]);

  if (!pendingTargetSelection || !visibleState) return null;

  const { validTargets, description, onDecline } = pendingTargetSelection;
  const canDecline = !!onDecline;

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
            className="text-sm font-medium uppercase tracking-wider"
            style={{ color: '#c4a35a' }}
          >
            {t('game.selectTarget')}
          </span>
          <span
            className="text-xs text-center leading-relaxed"
            style={{ color: '#e0e0e0' }}
          >
            {description}
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
            {t('game.board.skip')}
          </motion.button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
