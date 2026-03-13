'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { GameState, PlayerID, CharacterInPlay, ActiveMission, CharacterCard, MissionCard } from '@/lib/engine/types';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { getCardName } from '@/lib/utils/cardLocale';
import { calculateCharacterPower } from '@/lib/engine/phases/PowerCalculation';

// ----- Color maps (matching game board exactly) -----

const rankColorMap: Record<string, string> = {
  D: '#3e8b3e',
  C: '#c4a35a',
  B: '#b37e3e',
  A: '#b33e3e',
};

const phaseColorMap: Record<string, string> = {
  start: '#3e8b3e',
  action: '#c4a35a',
  mission: '#9B59B6',
  end: '#b33e3e',
  gameOver: '#FFD700',
  mulligan: '#5A7ABB',
};

// ----- Character Slot (matching MissionLane.tsx CharacterSlot) -----

function ReplayCard({
  char,
  state,
  locale,
  index,
  onCardClick,
}: {
  char: CharacterInPlay;
  state: GameState;
  locale: 'en' | 'fr';
  index: number;
  onCardClick?: (card: CharacterCard | MissionCard) => void;
}) {
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  const imagePath = normalizeImagePath(topCard.image_file);
  const power = calculateCharacterPower(state, char, char.controlledBy);
  const hasPowerTokens = char.powerTokens > 0;
  const isReHidden = char.isHidden && char.wasRevealedAtLeastOnce;
  const stackSize = char.stack.length + 1;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onCardClick && topCard) onCardClick(topCard);
  };

  // Never-revealed hidden card: show card back
  if (char.isHidden && !isReHidden) {
    return (
      <motion.div
        layout
        layoutId={char.instanceId}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25, delay: index * 0.04 }}
        className="relative no-select shrink-0"
        style={{
          width: '72px',
          height: '100px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
          cursor: onCardClick ? 'pointer' : 'default',
        }}
        onClick={handleClick}
      >
        <img
          src="/images/card-back.webp"
          alt="Hidden"
          draggable={false}
          className="w-full h-full object-cover"
        />
        {/* Power tokens still visible on hidden cards */}
        {hasPowerTokens && (
          <div className="absolute top-0.5 right-0.5 flex flex-col items-end gap-0.5" style={{ pointerEvents: 'none' }}>
            {Array.from({ length: Math.min(char.powerTokens, 5) }).map((_, i) => (
              <motion.div
                key={`token-${i}`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.08, type: 'spring', stiffness: 400, damping: 15 }}
                style={{
                  width: '11px',
                  height: '11px',
                  backgroundColor: '#c4a35a',
                  border: '1px solid #a8893a',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.6), 0 0 4px rgba(196, 163, 90, 0.3)',
                  transform: 'rotate(45deg)',
                }}
              />
            ))}
            {char.powerTokens > 5 && (
              <span className="text-[8px] font-bold pr-0.5" style={{ color: '#f0d890', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                +{char.powerTokens - 5}
              </span>
            )}
          </div>
        )}
      </motion.div>
    );
  }

  // Re-hidden card: greyed-out face (public knowledge)
  if (isReHidden) {
    return (
      <motion.div
        layout
        layoutId={char.instanceId}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25, delay: index * 0.04 }}
        className="relative no-select shrink-0"
        style={{
          width: '72px',
          height: '100px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
          cursor: onCardClick ? 'pointer' : 'default',
        }}
        onClick={handleClick}
      >
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
              {getCardName(topCard, locale)}
            </span>
          </div>
        )}
        {/* Power tokens on re-hidden cards */}
        {hasPowerTokens && (
          <div className="absolute top-0.5 right-0.5 flex flex-col items-end gap-0.5" style={{ pointerEvents: 'none' }}>
            {Array.from({ length: Math.min(char.powerTokens, 5) }).map((_, i) => (
              <motion.div
                key={`token-${i}`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.08, type: 'spring', stiffness: 400, damping: 15 }}
                style={{
                  width: '11px',
                  height: '11px',
                  backgroundColor: '#c4a35a',
                  border: '1px solid #a8893a',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.6), 0 0 4px rgba(196, 163, 90, 0.3)',
                  transform: 'rotate(45deg)',
                }}
              />
            ))}
          </div>
        )}
      </motion.div>
    );
  }

  // Visible card: full rendering matching game board
  return (
    <motion.div
      layout
      layoutId={char.instanceId}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25, delay: index * 0.04 }}
      className="relative no-select shrink-0"
      style={{
        width: '72px',
        height: '100px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
        cursor: onCardClick ? 'pointer' : 'default',
      }}
      onClick={handleClick}
    >
      {imagePath ? (
        <div
          className="w-full h-full bg-cover bg-center"
          style={{ backgroundImage: `url('${imagePath}')`, imageRendering: 'crisp-edges' }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
          <span className="text-[8px] text-center px-0.5" style={{ color: '#888888' }}>
            {getCardName(topCard, locale)}
          </span>
        </div>
      )}

      {/* Power display (bottom-right) */}
      <div
        className={`absolute bottom-0.5 right-0.5 flex items-center justify-center text-[11px] font-bold tabular-nums${hasPowerTokens ? ' power-glow' : ''}`}
        style={{
          minWidth: '22px',
          height: '18px',
          padding: '0 4px',
          backgroundColor: hasPowerTokens ? 'rgba(196, 163, 90, 0.25)' : 'rgba(0, 0, 0, 0.85)',
          color: hasPowerTokens ? '#f0d890' : '#e0e0e0',
          border: hasPowerTokens ? '1px solid rgba(196, 163, 90, 0.5)' : '1px solid rgba(255,255,255,0.1)',
          textShadow: hasPowerTokens ? '0 0 6px rgba(196, 163, 90, 0.6)' : 'none',
          fontFamily: "'NJNaruto', Arial, sans-serif",
        }}
      >
        {power}
      </div>

      {/* Power token diamonds (top-right) */}
      {hasPowerTokens && (
        <div className="absolute top-0.5 right-0.5 flex flex-col items-end gap-0.5" style={{ pointerEvents: 'none' }}>
          {Array.from({ length: Math.min(char.powerTokens, 5) }).map((_, i) => (
            <motion.div
              key={`token-${i}`}
              initial={{ scale: 0, y: -10, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ delay: i * 0.08, type: 'spring', stiffness: 400, damping: 15 }}
              style={{
                width: '11px',
                height: '11px',
                backgroundColor: '#c4a35a',
                border: '1px solid #a8893a',
                boxShadow: '0 1px 4px rgba(0,0,0,0.6), 0 0 4px rgba(196, 163, 90, 0.3)',
                transform: 'rotate(45deg)',
              }}
            />
          ))}
          {char.powerTokens > 5 && (
            <motion.span
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, type: 'spring', stiffness: 300 }}
              className="text-[8px] font-bold pr-0.5"
              style={{ color: '#f0d890', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
            >
              +{char.powerTokens - 5}
            </motion.span>
          )}
        </div>
      )}

      {/* Chakra cost (top-left) */}
      <div
        className="absolute top-0.5 left-0.5 w-5 h-5 flex items-center justify-center text-[9px] font-bold"
        style={{
          backgroundColor: 'rgba(196, 163, 90, 0.9)',
          color: '#0a0a0a',
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
          fontFamily: "'NJNaruto', Arial, sans-serif",
        }}
      >
        {topCard.chakra}
      </div>

      {/* Stack/upgrade indicator */}
      {stackSize > 1 && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="absolute bottom-0.5 left-0.5 px-1 py-0.5 text-[8px] font-bold flex items-center gap-0.5 stack-pulse"
          style={{
            backgroundColor: 'rgba(62, 139, 62, 0.25)',
            color: '#5cb85c',
            border: '1px solid rgba(62, 139, 62, 0.5)',
            textShadow: '0 0 4px rgba(62, 139, 62, 0.4)',
          }}
        >
          <span style={{ fontSize: '7px', letterSpacing: '0.5px' }}>UP</span>
          <span>{stackSize}</span>
        </motion.div>
      )}
    </motion.div>
  );
}

// ----- Fanned Hand Card -----

function FannedHandCard({
  card,
  locale,
  index,
  total,
  cardW,
  cardH,
  fanSpacing,
  fanArc,
  fanRotation,
  onCardClick,
}: {
  card: CharacterCard;
  locale: 'en' | 'fr';
  index: number;
  total: number;
  cardW: number;
  cardH: number;
  fanSpacing: number;
  fanArc: number;
  fanRotation: number;
  onCardClick?: (card: CharacterCard | MissionCard) => void;
}) {
  const imagePath = normalizeImagePath(card.image_file);
  const name = getCardName(card, locale);
  const midpoint = (total - 1) / 2;
  const offset = index - midpoint;
  const rotation = offset * fanRotation;
  const translateX = offset * fanSpacing;
  const translateY = Math.abs(offset) * fanArc;

  return (
    <motion.div
      layout
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1, rotate: rotation, x: translateX }}
      exit={{ y: -20, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20, delay: index * 0.03 }}
      className="absolute no-select"
      style={{
        width: cardW + 'px',
        height: cardH + 'px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        overflow: 'hidden',
        transform: `translateY(${translateY}px)`,
        zIndex: index,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
        cursor: onCardClick ? 'pointer' : 'default',
      }}
      onClick={(e) => { e.stopPropagation(); onCardClick?.(card); }}
    >
      {imagePath ? (
        <div
          className="w-full h-full bg-cover bg-center"
          style={{ backgroundImage: `url('${imagePath}')`, imageRendering: 'crisp-edges' }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
          <span className="text-[7px] text-center px-0.5" style={{ color: '#888888' }}>{name}</span>
        </div>
      )}
      {/* Name overlay */}
      <div
        className="absolute bottom-0 left-0 right-0 px-0.5 py-px text-center truncate"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)', color: '#e0e0e0', fontSize: '7px', lineHeight: '1.3' }}
      >
        {name}
      </div>
      {/* Chakra badge */}
      <div
        className="absolute top-0 left-0 flex items-center justify-center text-[8px] font-bold"
        style={{
          width: '16px',
          height: '16px',
          backgroundColor: 'rgba(196, 163, 90, 0.9)',
          color: '#0a0a0a',
          fontFamily: "'NJNaruto', Arial, sans-serif",
        }}
      >
        {card.chakra}
      </div>
      {/* Power badge */}
      <div
        className="absolute top-0 right-0 flex items-center justify-center text-[8px] font-bold"
        style={{
          width: '16px',
          height: '16px',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          color: '#e0e0e0',
          border: '1px solid rgba(255,255,255,0.1)',
          fontFamily: "'NJNaruto', Arial, sans-serif",
        }}
      >
        {card.power}
      </div>
    </motion.div>
  );
}

// ----- Fanned Card Back -----

function FannedCardBack({
  index,
  total,
  cardW,
  cardH,
  fanSpacing,
  fanArc,
  fanRotation,
}: {
  index: number;
  total: number;
  cardW: number;
  cardH: number;
  fanSpacing: number;
  fanArc: number;
  fanRotation: number;
}) {
  const midpoint = (total - 1) / 2;
  const offset = index - midpoint;
  const rotation = offset * fanRotation;
  const translateX = offset * fanSpacing;
  const translateY = Math.abs(offset) * fanArc;

  return (
    <motion.div
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1, rotate: rotation, x: translateX }}
      transition={{ type: 'spring', stiffness: 200, damping: 20, delay: index * 0.04 }}
      className="absolute no-select"
      style={{
        width: cardW + 'px',
        height: cardH + 'px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        overflow: 'hidden',
        transform: `translateY(${translateY}px)`,
        zIndex: index,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
      }}
    >
      <img
        src="/images/card-back.webp"
        alt="Card back"
        draggable={false}
        className="w-full h-full object-cover"
      />
    </motion.div>
  );
}

// ----- Player Hand (fanned) -----

function PlayerHandRow({
  cards,
  locale,
  player,
  onCardClick,
}: {
  cards: CharacterCard[];
  locale: 'en' | 'fr';
  player: PlayerID;
  onCardClick?: (card: CharacterCard | MissionCard) => void;
}) {
  // Player 1: larger fanned cards, Player 2: smaller
  const isP1 = player === 'player1';
  const cardW = isP1 ? 56 : 44;
  const cardH = isP1 ? 78 : 62;
  const fanSpacing = isP1 ? 42 : 28;
  const fanArc = isP1 ? 2 : 1.2;
  const fanRotation = isP1 ? 2.5 : 2;
  const containerH = isP1 ? 90 : 72;
  const minW = isP1 ? 400 : 300;

  return (
    <div
      className="flex items-center justify-center shrink-0"
      style={{
        height: containerH + 'px',
        backgroundColor: isP1 ? 'rgba(196, 163, 90, 0.02)' : 'rgba(179, 62, 62, 0.02)',
      }}
    >
      <div className="relative flex items-center justify-center" style={{ height: cardH + 'px', minWidth: minW + 'px' }}>
        <AnimatePresence mode="popLayout">
          {cards.map((card, i) => (
            <FannedHandCard
              key={`hand-${card.cardId ?? card.id}-${i}`}
              card={card}
              locale={locale}
              index={i}
              total={cards.length}
              cardW={cardW}
              cardH={cardH}
              fanSpacing={fanSpacing}
              fanArc={fanArc}
              fanRotation={fanRotation}
              onCardClick={onCardClick}
            />
          ))}
        </AnimatePresence>
        {cards.length === 0 && (
          <span className="text-[9px]" style={{ color: '#333' }}>-</span>
        )}
      </div>
    </div>
  );
}

// ----- Opponent Hand (fanned card backs) -----

function OpponentHandRow({ handSize }: { handSize: number }) {
  const cardW = 44;
  const cardH = 62;
  const fanSpacing = 18;
  const fanArc = 1.2;
  const fanRotation = 2;

  return (
    <div
      className="flex items-center justify-center shrink-0"
      style={{ height: '72px', backgroundColor: 'rgba(179, 62, 62, 0.02)' }}
    >
      <div className="relative flex items-center justify-center" style={{ height: cardH + 'px', minWidth: '260px' }}>
        {Array.from({ length: handSize }).map((_, i) => (
          <FannedCardBack
            key={i}
            index={i}
            total={handSize}
            cardW={cardW}
            cardH={cardH}
            fanSpacing={fanSpacing}
            fanArc={fanArc}
            fanRotation={fanRotation}
          />
        ))}
        {handSize === 0 && (
          <span className="text-[9px]" style={{ color: '#333' }}>-</span>
        )}
      </div>
    </div>
  );
}

// ----- Character Area (within mission lane) -----

function CharacterArea({
  chars,
  state,
  locale,
  player,
  isTop,
  onCardClick,
}: {
  chars: CharacterInPlay[];
  state: GameState;
  locale: 'en' | 'fr';
  player: PlayerID;
  isTop: boolean;
  onCardClick?: (card: CharacterCard | MissionCard) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-0.5 justify-center p-1 flex-1 overflow-y-auto overflow-x-hidden"
      style={{
        minHeight: '50px',
        alignItems: isTop ? 'flex-end' : 'flex-start',
        alignContent: isTop ? 'flex-end' : 'flex-start',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.1) transparent',
      }}
    >
      <AnimatePresence mode="popLayout">
        {chars.map((char, i) => (
          <ReplayCard key={char.instanceId} char={char} state={state} locale={locale} index={i} onCardClick={onCardClick} />
        ))}
      </AnimatePresence>
    </div>
  );
}

// ----- Mission Lane -----

function ReplayMissionLane({
  mission,
  state,
  locale,
  bottomPlayer,
  onCardClick,
}: {
  mission: ActiveMission;
  state: GameState;
  locale: 'en' | 'fr';
  bottomPlayer: PlayerID;
  onCardClick?: (card: CharacterCard | MissionCard, missionCtx?: { rank: string; basePoints: number; rankBonus: number }) => void;
}) {
  const t = useTranslations();
  const topPlayer: PlayerID = bottomPlayer === 'player1' ? 'player2' : 'player1';
  const missionName = getCardName(mission.card, locale);
  const rankColor = rankColorMap[mission.rank] ?? '#888';
  const totalPoints = mission.basePoints + mission.rankBonus;
  const missionImage = mission.card.image_file ? normalizeImagePath(mission.card.image_file) : null;

  const topChars = bottomPlayer === 'player1' ? mission.player2Characters : mission.player1Characters;
  const bottomChars = bottomPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

  const topPower = topChars.reduce(
    (sum, c) => sum + calculateCharacterPower(state, c, c.controlledBy), 0
  );
  const bottomPower = bottomChars.reduce(
    (sum, c) => sum + calculateCharacterPower(state, c, c.controlledBy), 0
  );

  const wonBorderColor = mission.wonBy === 'draw'
    ? 'rgba(136, 136, 136, 0.4)'
    : mission.wonBy === bottomPlayer
      ? 'rgba(196, 163, 90, 0.5)'
      : mission.wonBy === topPlayer
        ? 'rgba(179, 62, 62, 0.5)'
        : 'rgba(255, 255, 255, 0.04)';

  const handleMissionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCardClick?.(mission.card, { rank: mission.rank, basePoints: mission.basePoints, rankBonus: mission.rankBonus });
  };

  const cardClick = onCardClick ? (card: CharacterCard | MissionCard) => onCardClick(card) : undefined;

  return (
    <div
      className="flex flex-col items-center gap-0.5 px-1 py-0.5 h-full flex-1"
      style={{
        backgroundColor: 'rgba(10, 10, 10, 0.35)',
        border: `1px solid ${wonBorderColor}`,
        transition: 'border-color 0.3s ease',
        minWidth: 0,
      }}
    >
      {/* Top player characters */}
      <CharacterArea chars={topChars} state={state} locale={locale} player={topPlayer} isTop={true} onCardClick={cardClick} />

      {/* Top power total */}
      {(topChars.length > 0 || bottomChars.length > 0) && (
        <div className="flex items-center justify-center px-2 py-0.5 w-full shrink-0">
          <span
            className="text-[10px] font-bold tabular-nums"
            style={{ color: '#b33e3e', fontFamily: "'NJNaruto', Arial, sans-serif" }}
          >
            {topPower}
          </span>
        </div>
      )}

      {/* Mission card */}
      <div
        className="relative w-full shrink-0 overflow-hidden no-select"
        style={{
          border: `2px solid ${rankColor}`,
          boxShadow: `0 0 12px ${rankColor}30, 0 4px 12px rgba(0, 0, 0, 0.5)`,
          cursor: 'pointer',
          minHeight: '52px',
        }}
        onClick={handleMissionClick}
      >
        {missionImage && (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${missionImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: 0.7,
            }}
          />
        )}
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0, 0, 0, 0.15)' }} />
        <div className="relative z-10 px-2 py-2 text-center">
          {/* Rank + name */}
          <div className="flex items-center justify-center gap-1.5">
            <span
              className="text-[10px] font-bold uppercase px-1.5 py-0.5"
              style={{
                backgroundColor: rankColor,
                color: '#0a0a0a',
                fontFamily: "'NJNaruto', Arial, sans-serif",
                letterSpacing: '0.05em',
              }}
            >
              {mission.rank}
            </span>
            <span className="text-[10px] truncate font-medium" style={{ color: '#e0e0e0', maxWidth: '120px' }}>
              {missionName}
            </span>
          </div>
          {/* Points + won indicator */}
          <div className="flex items-center justify-center gap-2 mt-1">
            <span
              className="text-[10px] font-bold"
              style={{ color: rankColor, fontFamily: "'NJNaruto', Arial, sans-serif" }}
            >
              {totalPoints} pts
            </span>
            {mission.wonBy && (
              <span
                className="text-[9px] font-bold uppercase px-1.5 py-0.5"
                style={{
                  backgroundColor: mission.wonBy === 'draw'
                    ? 'rgba(136,136,136,0.2)'
                    : mission.wonBy === bottomPlayer
                      ? 'rgba(196,163,90,0.2)'
                      : 'rgba(179,62,62,0.2)',
                  color: mission.wonBy === 'draw'
                    ? '#888'
                    : mission.wonBy === bottomPlayer
                      ? '#c4a35a'
                      : '#b33e3e',
                  borderLeft: `3px solid ${
                    mission.wonBy === 'draw'
                      ? 'rgba(136,136,136,0.5)'
                      : mission.wonBy === bottomPlayer
                        ? 'rgba(196,163,90,0.6)'
                        : 'rgba(179,62,62,0.6)'
                  }`,
                }}
              >
                {mission.wonBy === 'draw' ? 'DRAW' : mission.wonBy === bottomPlayer ? 'P1' : 'P2'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom power total */}
      {(topChars.length > 0 || bottomChars.length > 0) && (
        <div className="flex items-center justify-center px-2 py-0.5 w-full shrink-0">
          <span
            className="text-[10px] font-bold tabular-nums"
            style={{ color: '#c4a35a', fontFamily: "'NJNaruto', Arial, sans-serif" }}
          >
            {bottomPower}
          </span>
        </div>
      )}

      {/* Bottom player characters */}
      <CharacterArea chars={bottomChars} state={state} locale={locale} player={bottomPlayer} isTop={false} onCardClick={cardClick} />

      {/* Score strip */}
      <div
        className="flex items-center justify-center gap-2 w-full px-2 py-1 shrink-0"
        style={{ backgroundColor: `${rankColor}15` }}
      >
        <span
          className="text-[10px] font-bold px-1.5 py-0.5"
          style={{ backgroundColor: rankColor, color: '#0a0a0a', fontFamily: "'NJNaruto', Arial, sans-serif" }}
        >
          {mission.rank}
        </span>
        <span
          className="text-[11px] font-bold tabular-nums"
          style={{ color: rankColor, fontFamily: "'NJNaruto', Arial, sans-serif" }}
        >
          {totalPoints} pts
        </span>
      </div>
    </div>
  );
}

// ----- Empty Mission Slot -----

function EmptyMissionSlot({ turnIndex }: { turnIndex: number }) {
  const t = useTranslations();
  return (
    <div
      className="flex flex-col items-center justify-center flex-1 h-full"
      style={{
        backgroundColor: 'rgba(10, 10, 10, 0.2)',
        border: '1px solid rgba(255, 255, 255, 0.03)',
        minWidth: 0,
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{ border: '2px dashed rgba(255, 255, 255, 0.06)', padding: '12px 20px' }}
      >
        <span
          className="text-[10px] font-medium"
          style={{ color: 'rgba(255, 255, 255, 0.15)', fontFamily: "'NJNaruto', Arial, sans-serif" }}
        >
          {t('game.turn', { turn: turnIndex + 1 })}
        </span>
      </div>
    </div>
  );
}

// ----- Player Stats Bar -----

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
  // Color based on position (bottom = gold, top = red) not player ID
  const color = isTop ? '#b33e3e' : '#c4a35a';

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5 shrink-0"
      style={{
        backgroundColor: 'rgba(8, 8, 12, 0.85)',
        borderTop: !isTop ? `2px solid ${!isTop ? 'rgba(196, 163, 90, 0.15)' : 'rgba(179, 62, 62, 0.15)'}` : 'none',
        borderBottom: isTop ? `2px solid ${isTop ? 'rgba(179, 62, 62, 0.15)' : 'rgba(196, 163, 90, 0.15)'}` : 'none',
      }}
    >
      {/* Left: name + badges */}
      <div className="flex items-center gap-2.5">
        {/* Active indicator */}
        {isActive && (
          <div style={{ width: '6px', height: '6px', backgroundColor: color, transform: 'rotate(45deg)' }} />
        )}
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color }}>
          {playerNames[player]}
        </span>
        {/* Edge diamond */}
        {isEdgeHolder && (
          <div className="flex items-center gap-1.5">
            <div
              style={{
                width: '8px',
                height: '8px',
                backgroundColor: '#c4a35a',
                transform: 'rotate(45deg)',
                boxShadow: '0 0 6px rgba(196, 163, 90, 0.5)',
              }}
            />
            <span
              className="text-[8px] font-bold uppercase tracking-wider"
              style={{
                color: '#c4a35a',
                backgroundColor: 'rgba(196, 163, 90, 0.08)',
                borderLeft: '2px solid rgba(196, 163, 90, 0.3)',
                padding: '2px 6px',
              }}
            >
              Edge
            </span>
          </div>
        )}
        {ps.hasPassed && (
          <span
            className="text-[8px] uppercase tracking-wider font-bold"
            style={{
              color: '#666',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderLeft: '2px solid rgba(136, 136, 136, 0.2)',
              padding: '2px 6px',
            }}
          >
            {t('game.pass')}
          </span>
        )}
      </div>

      {/* Right: stats */}
      <div className="flex items-center gap-3">
        {/* Chakra */}
        <div
          className="flex items-center gap-1.5 px-2 py-0.5"
          style={{ borderLeft: '2px solid rgba(90, 122, 187, 0.3)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}
        >
          <span className="text-[9px] uppercase tracking-wider" style={{ color: '#555' }}>
            {t('game.chakra')}
          </span>
          <span
            className="text-xs font-bold tabular-nums"
            style={{ color: '#5A7ABB', fontFamily: "'NJNaruto', Arial, sans-serif" }}
          >
            {ps.chakra}
          </span>
        </div>

        {/* Score */}
        <div
          className="flex items-center gap-1.5 px-2 py-0.5"
          style={{ borderLeft: `2px solid ${color}30`, backgroundColor: 'rgba(255, 255, 255, 0.03)' }}
        >
          <span className="text-[9px] uppercase tracking-wider" style={{ color: '#555' }}>
            {t('game.score')}
          </span>
          <span
            className="text-xs font-bold tabular-nums"
            style={{ color, fontFamily: "'NJNaruto', Arial, sans-serif" }}
          >
            {ps.missionPoints}
          </span>
        </div>

        {/* Counts */}
        <div className="flex items-center gap-2 px-2 py-0.5" style={{ borderLeft: '2px solid rgba(255,255,255,0.06)' }}>
          <span className="text-[8px] tabular-nums" style={{ color: '#555' }}>
            {t('game.hand')}: {ps.hand.length}
          </span>
          <span className="text-[8px] tabular-nums" style={{ color: '#444' }}>
            {t('game.deck')}: {ps.deck.length}
          </span>
          <span className="text-[8px] tabular-nums" style={{ color: '#444' }}>
            {t('game.discard')}: {ps.discardPile.length}
          </span>
        </div>
      </div>
    </div>
  );
}

// ----- Main ReplayBoard -----

interface ReplayBoardProps {
  state: GameState;
  playerNames: { player1: string; player2: string };
  locale: 'en' | 'fr';
  backgroundUrl?: string;
  viewAs?: PlayerID;
  onCardClick?: (card: CharacterCard | MissionCard, missionCtx?: { rank: string; basePoints: number; rankBonus: number }) => void;
}

export function ReplayBoard({ state, playerNames, locale, backgroundUrl, viewAs, onCardClick }: ReplayBoardProps) {
  const t = useTranslations();
  const phaseColor = phaseColorMap[state.phase] ?? '#888';

  // Determine which player is at the bottom (viewer) and which is at the top (opponent)
  const bottomPlayer: PlayerID = viewAs ?? 'player1';
  const topPlayer: PlayerID = bottomPlayer === 'player1' ? 'player2' : 'player1';

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
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
          className="text-[10px] uppercase tracking-wider px-2 py-0.5"
          style={{
            color: phaseColor,
            backgroundColor: `${phaseColor}18`,
            borderLeft: `2px solid ${phaseColor}40`,
          }}
        >
          {t(`game.phase.${state.phase}`)}
        </span>
      </div>

      {/* Top player stats */}
      <PlayerBar player={topPlayer} state={state} playerNames={playerNames} isTop={true} />

      {/* Top player hand (fanned card-backs) */}
      <OpponentHandRow handSize={state[topPlayer].hand.length} />

      {/* Mission area - fills remaining space */}
      <div className="flex-1 flex items-stretch gap-1.5 px-3 py-1 min-h-0 overflow-hidden">
        {Array.from({ length: 4 }).map((_, slotIdx) => {
          const mission = state.activeMissions[slotIdx];
          if (mission) {
            return (
              <ReplayMissionLane
                key={`mission-${slotIdx}`}
                mission={mission}
                state={state}
                locale={locale}
                bottomPlayer={bottomPlayer}
                onCardClick={onCardClick}
              />
            );
          }
          return <EmptyMissionSlot key={`empty-${slotIdx}`} turnIndex={slotIdx} />;
        })}
      </div>

      {/* Bottom player hand (fanned face-up) */}
      <PlayerHandRow cards={state[bottomPlayer].hand} locale={locale} player={bottomPlayer} onCardClick={onCardClick ? (c) => onCardClick(c) : undefined} />

      {/* Bottom player stats */}
      <PlayerBar player={bottomPlayer} state={state} playerNames={playerNames} isTop={false} />
    </div>
  );
}
