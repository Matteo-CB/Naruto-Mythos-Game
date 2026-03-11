'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { GameState, PlayerID, CharacterInPlay, ActiveMission, CharacterCard } from '@/lib/engine/types';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { getCardName } from '@/lib/utils/cardLocale';
import { calculateCharacterPower } from '@/lib/engine/phases/PowerCalculation';

// ----- Color maps -----

const rarityColorMap: Record<string, string> = {
  C: '#888888',
  UC: '#3E8B3E',
  R: '#5A7ABB',
  RA: '#5A7ABB',
  S: '#9B59B6',
  SV: '#9B59B6',
  M: '#C4A35A',
  MV: '#C4A35A',
  L: '#FFD700',
  MMS: '#B37E3E',
};

const rankColorMap: Record<string, string> = {
  D: '#3E8B3E',
  C: '#5A7ABB',
  B: '#9B59B6',
  A: '#C4A35A',
};

const phaseColorMap: Record<string, string> = {
  start: '#3E8B3E',
  action: '#c4a35a',
  mission: '#9B59B6',
  end: '#b33e3e',
  gameOver: '#FFD700',
  mulligan: '#5A7ABB',
};

// ----- Sub-components -----

function ReplayCard({
  char,
  state,
  locale,
  index,
}: {
  char: CharacterInPlay;
  state: GameState;
  locale: 'en' | 'fr';
  index: number;
}) {
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  const imagePath = normalizeImagePath(topCard.image_file);
  const rarityColor = rarityColorMap[topCard.rarity] ?? '#888888';
  const name = getCardName(topCard, locale);
  const power = calculateCharacterPower(state, char, char.controlledBy);
  const hasPowerTokens = char.powerTokens > 0;

  if (char.isHidden) {
    return (
      <motion.div
        layout
        layoutId={char.instanceId}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        className="relative rounded-md overflow-hidden shrink-0"
        style={{
          width: 'var(--replay-card-w)',
          height: 'var(--replay-card-h)',
          backgroundColor: '#12121a',
          border: '1px solid #2a2a3a',
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.02) 4px, rgba(255,255,255,0.02) 5px)`,
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span style={{ color: '#3a3a4a', fontSize: '20px', fontWeight: 'bold', fontFamily: "'NJNaruto', Arial, sans-serif" }}>?</span>
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 text-center py-0.5"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: '#555', fontSize: '7px' }}
        >
          HIDDEN
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      layoutId={char.instanceId}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="relative rounded-md overflow-hidden shrink-0"
      style={{
        width: 'var(--replay-card-w)',
        height: 'var(--replay-card-h)',
        border: `1.5px solid ${rarityColor}`,
        boxShadow: `0 2px 8px rgba(0,0,0,0.4), 0 0 1px ${rarityColor}40`,
      }}
    >
      {imagePath ? (
        <img
          src={imagePath}
          alt={name}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: '#1a1a2e' }} />
      )}

      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 12px rgba(0,0,0,0.4)' }} />

      {/* Card name */}
      <div
        className="absolute bottom-0 left-0 right-0 px-0.5 py-0.5 text-center truncate"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: '#e0e0e0',
          fontSize: 'var(--replay-card-name-fs)',
          lineHeight: '1.2',
        }}
      >
        {name}
      </div>

      {/* Chakra cost badge */}
      <div
        className="absolute top-0 left-0 flex items-center justify-center"
        style={{
          width: 'var(--replay-badge-size)',
          height: 'var(--replay-badge-size)',
          backgroundColor: 'rgba(90, 122, 187, 0.95)',
          color: '#fff',
          fontSize: 'var(--replay-badge-fs)',
          fontWeight: 'bold',
          borderBottomRightRadius: '4px',
          fontFamily: "'NJNaruto', Arial, sans-serif",
        }}
      >
        {topCard.chakra}
      </div>

      {/* Power badge */}
      <div
        className="absolute top-0 right-0 flex items-center justify-center"
        style={{
          width: 'var(--replay-badge-size)',
          height: 'var(--replay-badge-size)',
          backgroundColor: hasPowerTokens
            ? 'rgba(196, 163, 90, 0.95)'
            : 'rgba(179, 62, 62, 0.95)',
          color: '#fff',
          fontSize: 'var(--replay-badge-fs)',
          fontWeight: 'bold',
          borderBottomLeftRadius: '4px',
          fontFamily: "'NJNaruto', Arial, sans-serif",
        }}
      >
        {power}
      </div>

      {/* Power tokens indicator */}
      {hasPowerTokens && (
        <div
          className="absolute bottom-[16px] right-0 px-1"
          style={{
            backgroundColor: 'rgba(196, 163, 90, 0.95)',
            color: '#0a0a0a',
            fontSize: '8px',
            fontWeight: 'bold',
            borderTopLeftRadius: '3px',
            borderBottomLeftRadius: '3px',
            fontFamily: "'NJNaruto', Arial, sans-serif",
          }}
        >
          +{char.powerTokens}
        </div>
      )}

      {/* Stack indicator */}
      {char.stack.length > 0 && (
        <div
          className="absolute bottom-[16px] left-0 px-1"
          style={{
            backgroundColor: 'rgba(155, 89, 182, 0.95)',
            color: '#fff',
            fontSize: '8px',
            fontWeight: 'bold',
            borderTopRightRadius: '3px',
            borderBottomRightRadius: '3px',
            fontFamily: "'NJNaruto', Arial, sans-serif",
          }}
        >
          x{char.stack.length + 1}
        </div>
      )}
    </motion.div>
  );
}

function ReplayHandCard({
  card,
  locale,
  index,
}: {
  card: CharacterCard;
  locale: 'en' | 'fr';
  index: number;
}) {
  const imagePath = normalizeImagePath(card.image_file);
  const name = getCardName(card, locale);
  const rarityColor = rarityColorMap[card.rarity] ?? '#888888';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className="relative rounded overflow-hidden shrink-0"
      style={{
        width: 'var(--replay-hand-w)',
        height: 'var(--replay-hand-h)',
        border: `1px solid ${rarityColor}`,
        boxShadow: `0 1px 4px rgba(0,0,0,0.3)`,
      }}
    >
      {imagePath ? (
        <img
          src={imagePath}
          alt={name}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: '#1a1a2e' }} />
      )}
      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 8px rgba(0,0,0,0.3)' }} />

      {/* Name */}
      <div
        className="absolute bottom-0 left-0 right-0 px-0.5 py-px text-center truncate"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: '#e0e0e0',
          fontSize: 'var(--replay-hand-name-fs)',
        }}
      >
        {name}
      </div>

      {/* Chakra */}
      <div
        className="absolute top-0 left-0 flex items-center justify-center"
        style={{
          width: 'var(--replay-hand-badge)',
          height: 'var(--replay-hand-badge)',
          backgroundColor: 'rgba(90, 122, 187, 0.95)',
          color: '#fff',
          fontSize: 'var(--replay-hand-badge-fs)',
          fontWeight: 'bold',
          borderBottomRightRadius: '3px',
          fontFamily: "'NJNaruto', Arial, sans-serif",
        }}
      >
        {card.chakra}
      </div>

      {/* Power */}
      <div
        className="absolute top-0 right-0 flex items-center justify-center"
        style={{
          width: 'var(--replay-hand-badge)',
          height: 'var(--replay-hand-badge)',
          backgroundColor: 'rgba(179, 62, 62, 0.95)',
          color: '#fff',
          fontSize: 'var(--replay-hand-badge-fs)',
          fontWeight: 'bold',
          borderBottomLeftRadius: '3px',
          fontFamily: "'NJNaruto', Arial, sans-serif",
        }}
      >
        {card.power}
      </div>
    </motion.div>
  );
}

function CharacterSlot({
  chars,
  state,
  locale,
  player,
  isTop,
}: {
  chars: CharacterInPlay[];
  state: GameState;
  locale: 'en' | 'fr';
  player: PlayerID;
  isTop: boolean;
}) {
  const playerColor = player === 'player1' ? 'rgba(196, 163, 90, 0.06)' : 'rgba(179, 62, 62, 0.06)';
  const borderColor = player === 'player1' ? 'rgba(196, 163, 90, 0.08)' : 'rgba(179, 62, 62, 0.08)';

  return (
    <div
      className="flex flex-wrap gap-1 justify-center p-1.5 flex-1"
      style={{
        minHeight: '50px',
        backgroundColor: chars.length > 0 ? playerColor : 'transparent',
        borderTop: !isTop ? `1px solid ${borderColor}` : 'none',
        borderBottom: isTop ? `1px solid ${borderColor}` : 'none',
        alignItems: isTop ? 'flex-end' : 'flex-start',
        alignContent: isTop ? 'flex-end' : 'flex-start',
      }}
    >
      <AnimatePresence mode="popLayout">
        {chars.map((char, i) => (
          <ReplayCard key={char.instanceId} char={char} state={state} locale={locale} index={i} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ReplayMissionLane({
  mission,
  state,
  locale,
}: {
  mission: ActiveMission;
  state: GameState;
  locale: 'en' | 'fr';
}) {
  const t = useTranslations();
  const missionName = getCardName(mission.card, locale);
  const rankColor = rankColorMap[mission.rank] ?? '#888';
  const totalPoints = mission.basePoints + mission.rankBonus;
  const missionImage = mission.card.image_file ? normalizeImagePath(mission.card.image_file) : null;

  const p1Power = mission.player1Characters.reduce(
    (sum, c) => sum + calculateCharacterPower(state, c, c.controlledBy), 0
  );
  const p2Power = mission.player2Characters.reduce(
    (sum, c) => sum + calculateCharacterPower(state, c, c.controlledBy), 0
  );

  const wonBorderColor = mission.wonBy === 'draw'
    ? 'rgba(136, 136, 136, 0.4)'
    : mission.wonBy === 'player1'
      ? 'rgba(196, 163, 90, 0.5)'
      : mission.wonBy === 'player2'
        ? 'rgba(179, 62, 62, 0.5)'
        : 'rgba(255, 255, 255, 0.08)';

  return (
    <div
      className="flex flex-col rounded-lg overflow-hidden flex-1"
      style={{
        backgroundColor: 'rgba(10, 10, 14, 0.7)',
        border: `1px solid ${wonBorderColor}`,
        transition: 'border-color 0.3s ease',
        minWidth: 0,
      }}
    >
      {/* Player 2 characters */}
      <CharacterSlot chars={mission.player2Characters} state={state} locale={locale} player="player2" isTop={true} />

      {/* Power comparison bar (P2) */}
      {(mission.player2Characters.length > 0 || mission.player1Characters.length > 0) && (
        <div className="flex items-center justify-center px-2 py-0.5" style={{ backgroundColor: 'rgba(179,62,62,0.06)' }}>
          <span className="text-[9px] font-bold tabular-nums" style={{ color: '#b33e3e', fontFamily: "'NJNaruto', Arial, sans-serif" }}>
            {p2Power}
          </span>
        </div>
      )}

      {/* Mission card center */}
      <div
        className="relative w-full px-2 py-2 text-center overflow-hidden shrink-0"
        style={{
          borderTop: `1px solid ${rankColor}30`,
          borderBottom: `1px solid ${rankColor}30`,
          minHeight: '52px',
        }}
      >
        {missionImage && (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${missionImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: 0.2,
            }}
          />
        )}
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }} />
        <div className="relative z-10">
          <div className="flex items-center justify-center gap-1.5">
            <span
              className="text-[11px] font-bold uppercase px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: `${rankColor}25`,
                color: rankColor,
                fontFamily: "'NJNaruto', Arial, sans-serif",
                letterSpacing: '0.05em',
              }}
            >
              {mission.rank}
            </span>
            <span className="text-[11px] truncate font-medium" style={{ color: '#e0e0e0', maxWidth: '140px' }}>
              {missionName}
            </span>
          </div>
          <div className="flex items-center justify-center gap-2 mt-1">
            <span
              className="text-[10px] font-bold"
              style={{ color: rankColor, fontFamily: "'NJNaruto', Arial, sans-serif" }}
            >
              {totalPoints} pts
            </span>
            {mission.wonBy && (
              <span
                className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: mission.wonBy === 'draw' ? 'rgba(136,136,136,0.2)' : mission.wonBy === 'player1' ? 'rgba(196,163,90,0.2)' : 'rgba(179,62,62,0.2)',
                  color: mission.wonBy === 'draw' ? '#888' : mission.wonBy === 'player1' ? '#c4a35a' : '#b33e3e',
                }}
              >
                {mission.wonBy === 'draw' ? '=' : mission.wonBy === 'player1' ? 'P1' : 'P2'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Power comparison bar (P1) */}
      {(mission.player2Characters.length > 0 || mission.player1Characters.length > 0) && (
        <div className="flex items-center justify-center px-2 py-0.5" style={{ backgroundColor: 'rgba(196,163,90,0.06)' }}>
          <span className="text-[9px] font-bold tabular-nums" style={{ color: '#c4a35a', fontFamily: "'NJNaruto', Arial, sans-serif" }}>
            {p1Power}
          </span>
        </div>
      )}

      {/* Player 1 characters */}
      <CharacterSlot chars={mission.player1Characters} state={state} locale={locale} player="player1" isTop={false} />
    </div>
  );
}

function EmptyMissionSlot({ turnIndex }: { turnIndex: number }) {
  const t = useTranslations();
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg flex-1"
      style={{
        minHeight: '120px',
        backgroundColor: 'rgba(10, 10, 14, 0.3)',
        border: '1px dashed rgba(255, 255, 255, 0.06)',
        minWidth: 0,
      }}
    >
      <span className="text-[11px] font-medium" style={{ color: 'rgba(255, 255, 255, 0.1)', fontFamily: "'NJNaruto', Arial, sans-serif" }}>
        {t('game.turn', { turn: turnIndex + 1 })}
      </span>
    </div>
  );
}

function PlayerBar({
  player,
  state,
  playerNames,
  isTop,
}: {
  player: PlayerID;
  state: GameState;
  playerNames: { player1: string; player2: string };
  isTop: boolean;
}) {
  const t = useTranslations();
  const ps = state[player];
  const isEdgeHolder = state.edgeHolder === player;
  const isActive = state.activePlayer === player;
  const color = player === 'player1' ? '#c4a35a' : '#b33e3e';
  const bgColor = player === 'player1' ? 'rgba(196, 163, 90, 0.04)' : 'rgba(179, 62, 62, 0.04)';

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5 shrink-0"
      style={{
        backgroundColor: isActive ? bgColor : 'rgba(0,0,0,0.2)',
        borderBottom: isTop ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
        borderTop: !isTop ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
        backdropFilter: 'blur(6px)',
      }}
    >
      {/* Left: name + badges */}
      <div className="flex items-center gap-2">
        {isActive && (
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        )}
        <span className="text-xs font-bold" style={{ color }}>
          {playerNames[player]}
        </span>
        {isEdgeHolder && (
          <span
            className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider"
            style={{
              backgroundColor: 'rgba(196, 163, 90, 0.12)',
              color: '#c4a35a',
              border: '1px solid rgba(196, 163, 90, 0.25)',
            }}
          >
            Edge
          </span>
        )}
        {ps.hasPassed && (
          <span
            className="text-[8px] px-1.5 py-0.5 rounded uppercase tracking-wider"
            style={{
              backgroundColor: 'rgba(136, 136, 136, 0.08)',
              color: '#666',
              border: '1px solid rgba(136,136,136,0.15)',
            }}
          >
            {t('game.pass')}
          </span>
        )}
      </div>

      {/* Right: stats */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-wider" style={{ color: '#555' }}>
            {t('game.chakra')}
          </span>
          <span
            className="text-xs font-bold tabular-nums px-1.5 py-0.5 rounded"
            style={{ color: '#5A7ABB', backgroundColor: 'rgba(90,122,187,0.08)' }}
          >
            {ps.chakra}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-wider" style={{ color: '#555' }}>
            {t('game.score')}
          </span>
          <span
            className="text-xs font-bold tabular-nums px-1.5 py-0.5 rounded"
            style={{ color, backgroundColor: `${color}12` }}
          >
            {ps.missionPoints}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[8px] tabular-nums" style={{ color: '#555' }}>
            {t('game.hand')}: {ps.hand.length}
          </span>
          <span className="text-[8px] tabular-nums" style={{ color: '#444' }}>
            {t('game.deck')}: {ps.deck.length}
          </span>
        </div>
      </div>
    </div>
  );
}

function HandRow({
  cards,
  locale,
  player,
}: {
  cards: CharacterCard[];
  locale: 'en' | 'fr';
  player: PlayerID;
}) {
  const bgColor = player === 'player1' ? 'rgba(196, 163, 90, 0.02)' : 'rgba(179, 62, 62, 0.02)';

  return (
    <div
      className="flex items-center justify-center gap-1 px-3 py-1 overflow-x-auto shrink-0"
      style={{
        minHeight: '52px',
        backgroundColor: bgColor,
        backdropFilter: 'blur(4px)',
      }}
    >
      <AnimatePresence mode="popLayout">
        {cards.map((card, i) => (
          <ReplayHandCard key={`hand-${card.cardId}-${i}`} card={card} locale={locale} index={i} />
        ))}
      </AnimatePresence>
      {cards.length === 0 && (
        <span className="text-[9px]" style={{ color: '#333' }}>-</span>
      )}
    </div>
  );
}

// ----- Main ReplayBoard (Fullscreen) -----

interface ReplayBoardProps {
  state: GameState;
  playerNames: { player1: string; player2: string };
  locale: 'en' | 'fr';
  backgroundUrl?: string;
}

export function ReplayBoard({ state, playerNames, locale, backgroundUrl }: ReplayBoardProps) {
  const t = useTranslations();
  const phaseColor = phaseColorMap[state.phase] ?? '#888';

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{
        ['--replay-card-w' as string]: '72px',
        ['--replay-card-h' as string]: '100px',
        ['--replay-card-name-fs' as string]: '7.5px',
        ['--replay-badge-size' as string]: '17px',
        ['--replay-badge-fs' as string]: '9px',
        ['--replay-hand-w' as string]: '56px',
        ['--replay-hand-h' as string]: '78px',
        ['--replay-hand-name-fs' as string]: '6px',
        ['--replay-hand-badge' as string]: '14px',
        ['--replay-hand-badge-fs' as string]: '8px',
      }}
    >
      {/* Turn / Phase banner */}
      <div
        className="flex items-center justify-center gap-3 px-4 py-1.5 shrink-0"
        style={{
          backgroundColor: `${phaseColor}12`,
          borderBottom: `1px solid ${phaseColor}20`,
        }}
      >
        <span
          className="text-xs font-bold uppercase tracking-[0.15em]"
          style={{ color: '#c4a35a', fontFamily: "'NJNaruto', Arial, sans-serif" }}
        >
          {t('game.turn', { turn: state.turn })}
        </span>
        <span className="text-[10px]" style={{ color: '#444' }}>/</span>
        <span
          className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded"
          style={{
            color: phaseColor,
            backgroundColor: `${phaseColor}18`,
          }}
        >
          {t(`game.phase.${state.phase}`)}
        </span>
      </div>

      {/* Player 2 stats */}
      <PlayerBar player="player2" state={state} playerNames={playerNames} isTop={true} />

      {/* Player 2 hand */}
      <HandRow cards={state.player2.hand} locale={locale} player="player2" />

      {/* Mission area - fills remaining space */}
      <div className="flex-1 flex items-stretch gap-2 px-3 py-1.5 min-h-0 overflow-hidden">
        {Array.from({ length: 4 }).map((_, slotIdx) => {
          const mission = state.activeMissions[slotIdx];
          if (mission) {
            return (
              <ReplayMissionLane
                key={`mission-${slotIdx}`}
                mission={mission}
                state={state}
                locale={locale}
              />
            );
          }
          return <EmptyMissionSlot key={`empty-${slotIdx}`} turnIndex={slotIdx} />;
        })}
      </div>

      {/* Player 1 hand */}
      <HandRow cards={state.player1.hand} locale={locale} player="player1" />

      {/* Player 1 stats */}
      <PlayerBar player="player1" state={state} playerNames={playerNames} isTop={false} />
    </div>
  );
}
