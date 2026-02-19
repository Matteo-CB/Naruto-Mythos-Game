'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import type {
  VisibleMission,
  VisibleCharacter,
  PlayerID,
  MissionRank,
} from '@/lib/engine/types';

// ----- Sub-components -----

interface CharacterSlotProps {
  character: VisibleCharacter;
  isOwn: boolean;
  missionIndex: number;
  myPlayer: PlayerID;
}

function CharacterSlot({ character, isOwn, missionIndex, myPlayer }: CharacterSlotProps) {
  const t = useTranslations();
  const selectTarget = useUIStore((s) => s.selectTarget);
  const selectedTargetId = useUIStore((s) => s.selectedTargetId);
  const showPreview = useUIStore((s) => s.showPreview);
  const hidePreview = useUIStore((s) => s.hidePreview);
  const pinCard = useUIStore((s) => s.pinCard);
  const visibleState = useGameStore((s) => s.visibleState);
  const isProcessing = useGameStore((s) => s.isProcessing);

  const isMyTurn =
    visibleState?.activePlayer === visibleState?.myPlayer &&
    visibleState?.phase === 'action' &&
    !isProcessing;

  const isSelected = selectedTargetId === character.instanceId;
  const isHidden = character.isHidden;
  // card data is present for own cards (hidden or not) AND for opponent's visible cards
  const hasCardData = !!character.card;

  // Determine if this is a revealable character (own hidden character)
  const isRevealable = isOwn && isHidden && isMyTurn && hasCardData;

  // Hover preview: show for own hidden cards and any visible card with data
  const isHiddenEnemy = character.isHidden && !isOwn;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Pin card on click (for own cards and opponent visible cards)
    if (!isHiddenEnemy && character.card) {
      pinCard(character.card);
    }
    if (!isMyTurn) return;
    if (isRevealable) {
      selectTarget(character.instanceId);
    }
  };

  // Image path: show for ANY card that has card data + image_file (own or opponent visible)
  const imagePath =
    hasCardData && character.card?.image_file
      ? (character.card.image_file.replace(/\\/g, '/').startsWith('/') ? character.card.image_file.replace(/\\/g, '/') : `/${character.card.image_file.replace(/\\/g, '/')}`)
      : null;

  // Effective power display (includes continuous modifiers from engine)
  const totalPower = character.effectivePower;

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (isHiddenEnemy || !character.card) return;
    showPreview(character.card, { x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    hidePreview();
  };

  return (
    <motion.div
      layout
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{
        scale: 1,
        opacity: 1,
        y: 0,
      }}
      whileHover={isRevealable ? { scale: 1.06, y: -4 } : { scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative no-select"
      style={{
        width: '72px',
        height: '100px',
        borderRadius: '5px',
        cursor: isRevealable ? 'pointer' : (!isHiddenEnemy && character.card ? 'pointer' : 'default'),
        border: isSelected
          ? '2px solid #c4a35a'
          : isRevealable
            ? '2px solid #3e8b3e'
            : '1px solid rgba(255, 255, 255, 0.08)',
        overflow: 'hidden',
        boxShadow: isSelected
          ? '0 0 16px rgba(196, 163, 90, 0.4), 0 4px 12px rgba(0, 0, 0, 0.5)'
          : '0 2px 8px rgba(0, 0, 0, 0.4)',
      }}
    >
      {isHidden ? (
        <img
          src="/images/card-back.webp"
          alt=""
          draggable={false}
          className="w-full h-full object-cover"
        />
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
              <span className="text-[8px] text-center px-0.5" style={{ color: '#888888' }}>
                {character.card?.name_fr ?? '???'}
              </span>
            </div>
          )}
        </>
      )}

      {/* Power display (bottom-right) for visible cards */}
      {!isHidden && (
        <div
          className="absolute bottom-0.5 right-0.5 rounded px-1 py-0.5 text-[10px] font-bold tabular-nums"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            color: character.powerTokens > 0 ? '#c4a35a' : '#e0e0e0',
          }}
        >
          {totalPower}
        </div>
      )}

      {/* Power tokens indicator */}
      {character.powerTokens > 0 && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-0.5 right-0.5 rounded-full w-5 h-5 flex items-center justify-center text-[9px] font-bold"
          style={{
            backgroundColor: '#c4a35a',
            color: '#0a0a0a',
            boxShadow: '0 0 6px rgba(196, 163, 90, 0.5)',
          }}
        >
          +{character.powerTokens}
        </motion.div>
      )}

      {/* Chakra cost (top-left) for visible cards */}
      {!isHidden && character.card && (
        <div
          className="absolute top-0.5 left-0.5 rounded-full w-5 h-5 flex items-center justify-center text-[9px] font-bold"
          style={{
            backgroundColor: 'rgba(196, 163, 90, 0.9)',
            color: '#0a0a0a',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
          }}
        >
          {character.card.chakra}
        </div>
      )}

      {/* Stack size indicator */}
      {character.stackSize > 1 && (
        <div
          className="absolute bottom-0.5 left-0.5 rounded px-0.5 py-0.5 text-[8px] font-medium"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            color: '#aaaaaa',
          }}
        >
          x{character.stackSize}
        </div>
      )}
    </motion.div>
  );
}

// ----- Mission Card Component -----

function MissionCardDisplay({
  mission,
  index,
}: {
  mission: VisibleMission;
  index: number;
}) {
  const t = useTranslations();
  const showPreview = useUIStore((s) => s.showPreview);
  const hidePreview = useUIStore((s) => s.hidePreview);
  const pinCard = useUIStore((s) => s.pinCard);
  const rankColors: Record<MissionRank, string> = {
    D: '#3e8b3e',
    C: '#c4a35a',
    B: '#b37e3e',
    A: '#b33e3e',
  };

  const imagePath = mission.card.image_file
    ? (mission.card.image_file.replace(/\\/g, '/').startsWith('/') ? mission.card.image_file.replace(/\\/g, '/') : `/${mission.card.image_file.replace(/\\/g, '/')}`)
    : null;

  const totalPoints = mission.basePoints + mission.rankBonus;

  return (
    <div
      className="relative mission-aspect no-select"
      style={{
        width: '100%',
        maxWidth: '140px',
        borderRadius: '8px',
        border: `2px solid ${rankColors[mission.rank]}`,
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
          }}
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ backgroundColor: '#1a1a1a', minHeight: '65px' }}
        >
          <span className="text-[9px] text-center px-1" style={{ color: '#888888' }}>
            {mission.card.name_fr}
          </span>
        </div>
      )}

      {/* Rank badge */}
      <div
        className="absolute top-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-bold"
        style={{
          backgroundColor: rankColors[mission.rank],
          color: '#0a0a0a',
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
        }}
      >
        {mission.rank}
      </div>

      {/* Points badge */}
      <div
        className="absolute top-1 right-1 rounded px-1 py-0.5 text-[9px] font-bold tabular-nums"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          color: '#c4a35a',
        }}
      >
        {totalPoints} {t('game.board.pts')}
      </div>

      {/* Won indicator */}
      {mission.wonBy && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        >
          <span
            className="text-sm font-bold px-3 py-1 rounded"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              color: mission.wonBy === 'player1' ? '#c4a35a' : '#b33e3e',
            }}
          >
            {t('game.board.won')}
          </span>
        </motion.div>
      )}
    </div>
  );
}

// ----- Main MissionLane -----

interface MissionLaneProps {
  mission: VisibleMission;
  missionIndex: number;
}

export function MissionLane({ mission, missionIndex }: MissionLaneProps) {
  const t = useTranslations();
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

  // Determine if this lane is a valid drop target (card selected, ready to target mission)
  const isTargetable = isMyTurn && selectedCardIndex !== null;
  const isSelected = selectedMissionIndex === missionIndex;

  // Separate characters by side (player's characters and opponent's characters)
  const myChars =
    myPlayer === 'player1'
      ? mission.player1Characters
      : mission.player2Characters;
  const oppChars =
    myPlayer === 'player1'
      ? mission.player2Characters
      : mission.player1Characters;

  // Power totals (effectivePower includes continuous modifiers from engine)
  const myPower = myChars.reduce((sum, c) => sum + c.effectivePower, 0);
  const oppPower = oppChars.reduce((sum, c) => {
    // Can't see hidden enemy effective power
    if (c.isHidden && !c.isOwn) return sum;
    return sum + c.effectivePower;
  }, 0);

  const handleClick = () => {
    if (!isTargetable) return;
    if (selectedMissionIndex === missionIndex) {
      selectMission(null);
    } else {
      selectMission(missionIndex);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: missionIndex * 0.1 }}
      onClick={handleClick}
      className="flex flex-col items-center gap-0.5 rounded-xl px-1.5 py-1 h-full"
      style={{
        minWidth: '230px',
        maxWidth: '320px',
        flex: '1 1 0',
        cursor: isTargetable ? 'pointer' : 'default',
        backgroundColor: 'rgba(10, 10, 10, 0.35)',
        backdropFilter: 'blur(4px)',
        border: '1px solid rgba(255, 255, 255, 0.04)',
      }}
    >
      {/* Opponent power total */}
      <div
        className="flex items-center gap-1 rounded-md px-2 py-0.5 shrink-0"
        style={{ backgroundColor: 'rgba(179, 62, 62, 0.1)' }}
      >
        <span className="text-[9px] uppercase tracking-wider" style={{ color: '#666666' }}>
          {t('game.board.pwr')}
        </span>
        <span
          className="text-xs font-bold tabular-nums"
          style={{ color: '#b33e3e' }}
        >
          {oppPower}
        </span>
      </div>

      {/* Opponent characters */}
      <div
        className="flex-1 flex flex-wrap gap-0.5 justify-center content-end min-h-0"
      >
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

      {/* Mission card with targeting indicator */}
      <div className="relative w-full flex justify-center shrink-0">
        {/* Drop zone highlight */}
        {isTargetable && (
          <motion.div
            animate={{
              boxShadow: isSelected
                ? '0 0 24px rgba(196, 163, 90, 0.5)'
                : '0 0 10px rgba(196, 163, 90, 0.2)',
            }}
            transition={{ repeat: Infinity, repeatType: 'reverse', duration: 1 }}
            className="absolute inset-0 rounded-lg -m-1.5"
            style={{
              border: isSelected
                ? '2px solid #c4a35a'
                : '2px dashed rgba(196, 163, 90, 0.4)',
              pointerEvents: 'none',
            }}
          />
        )}
        <MissionCardDisplay mission={mission} index={missionIndex} />
      </div>

      {/* Player characters */}
      <div
        className="flex-1 flex flex-wrap gap-0.5 justify-center content-start min-h-0"
      >
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

      {/* Player power total */}
      <div
        className="flex items-center gap-1 rounded-md px-2 py-0.5 shrink-0"
        style={{ backgroundColor: 'rgba(196, 163, 90, 0.1)' }}
      >
        <span className="text-[9px] uppercase tracking-wider" style={{ color: '#666666' }}>
          {t('game.board.pwr')}
        </span>
        <span
          className="text-xs font-bold tabular-nums"
          style={{ color: '#c4a35a' }}
        >
          {myPower}
        </span>
      </div>
    </motion.div>
  );
}
