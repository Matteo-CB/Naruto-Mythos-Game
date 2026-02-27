'use client';

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

// ----- Sub-components -----

function ReplayCard({
  char,
  isSpectator,
  state,
  locale,
}: {
  char: CharacterInPlay;
  isSpectator: boolean;
  state: GameState;
  locale: 'en' | 'fr';
}) {
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  const imagePath = normalizeImagePath(topCard.image_file);
  const rarityColor = rarityColorMap[topCard.rarity] ?? '#888888';
  const name = getCardName(topCard, locale);
  const power = calculateCharacterPower(state, char, char.controlledBy);

  if (char.isHidden && !isSpectator) {
    // Face-down card
    return (
      <motion.div
        layout
        layoutId={char.instanceId}
        className="relative rounded overflow-hidden"
        style={{
          width: '52px',
          height: '72px',
          backgroundColor: '#1a1a2e',
          border: '1px solid #333',
        }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ color: '#555', fontSize: '8px' }}
        >
          ?
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      layoutId={char.instanceId}
      className="relative rounded overflow-hidden"
      style={{
        width: '52px',
        height: '72px',
        border: `1px solid ${char.isHidden ? '#555' : rarityColor}`,
        opacity: char.isHidden ? 0.6 : 1,
      }}
    >
      {/* Card image */}
      {imagePath ? (
        <img
          src={imagePath}
          alt={name}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: '#1a1a2e' }}
        />
      )}

      {/* Dark overlay for readability */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
      />

      {/* Hidden indicator */}
      {char.isHidden && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            border: '1px dashed #666',
          }}
        >
          <span style={{ color: '#888', fontSize: '7px' }}>HIDDEN</span>
        </div>
      )}

      {/* Card name */}
      <div
        className="absolute bottom-0 left-0 right-0 px-0.5 py-px text-center truncate"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: '#e0e0e0',
          fontSize: '6px',
          lineHeight: '1.2',
        }}
      >
        {name}
      </div>

      {/* Chakra cost badge */}
      <div
        className="absolute top-0 left-0 flex items-center justify-center"
        style={{
          width: '14px',
          height: '14px',
          backgroundColor: 'rgba(90, 122, 187, 0.9)',
          color: '#fff',
          fontSize: '8px',
          fontWeight: 'bold',
          borderBottomRightRadius: '3px',
        }}
      >
        {topCard.chakra}
      </div>

      {/* Power badge */}
      <div
        className="absolute top-0 right-0 flex items-center justify-center"
        style={{
          width: '14px',
          height: '14px',
          backgroundColor: char.powerTokens > 0
            ? 'rgba(196, 163, 90, 0.9)'
            : 'rgba(179, 62, 62, 0.9)',
          color: '#fff',
          fontSize: '8px',
          fontWeight: 'bold',
          borderBottomLeftRadius: '3px',
        }}
      >
        {power}
      </div>

      {/* Power tokens indicator */}
      {char.powerTokens > 0 && (
        <div
          className="absolute bottom-[12px] right-0 px-0.5"
          style={{
            backgroundColor: 'rgba(196, 163, 90, 0.9)',
            color: '#fff',
            fontSize: '6px',
            fontWeight: 'bold',
            borderTopLeftRadius: '2px',
            borderBottomLeftRadius: '2px',
          }}
        >
          +{char.powerTokens}
        </div>
      )}

      {/* Stack indicator */}
      {char.stack.length > 0 && (
        <div
          className="absolute bottom-[12px] left-0 px-0.5"
          style={{
            backgroundColor: 'rgba(155, 89, 182, 0.9)',
            color: '#fff',
            fontSize: '6px',
            fontWeight: 'bold',
            borderTopRightRadius: '2px',
            borderBottomRightRadius: '2px',
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
}: {
  card: CharacterCard;
  locale: 'en' | 'fr';
}) {
  const imagePath = normalizeImagePath(card.image_file);
  const name = getCardName(card, locale);
  const rarityColor = rarityColorMap[card.rarity] ?? '#888888';

  return (
    <motion.div
      layout
      className="relative rounded overflow-hidden shrink-0"
      style={{
        width: '44px',
        height: '62px',
        border: `1px solid ${rarityColor}`,
      }}
    >
      {imagePath ? (
        <img
          src={imagePath}
          alt={name}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: '#1a1a2e' }} />
      )}
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0, 0, 0, 0.2)' }} />

      {/* Name */}
      <div
        className="absolute bottom-0 left-0 right-0 px-0.5 py-px text-center truncate"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: '#e0e0e0',
          fontSize: '5px',
        }}
      >
        {name}
      </div>

      {/* Chakra */}
      <div
        className="absolute top-0 left-0 flex items-center justify-center"
        style={{
          width: '12px',
          height: '12px',
          backgroundColor: 'rgba(90, 122, 187, 0.9)',
          color: '#fff',
          fontSize: '7px',
          fontWeight: 'bold',
          borderBottomRightRadius: '2px',
        }}
      >
        {card.chakra}
      </div>

      {/* Power */}
      <div
        className="absolute top-0 right-0 flex items-center justify-center"
        style={{
          width: '12px',
          height: '12px',
          backgroundColor: 'rgba(179, 62, 62, 0.9)',
          color: '#fff',
          fontSize: '7px',
          fontWeight: 'bold',
          borderBottomLeftRadius: '2px',
        }}
      >
        {card.power}
      </div>
    </motion.div>
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

  return (
    <div
      className="flex flex-col items-center rounded-lg overflow-hidden"
      style={{
        backgroundColor: 'rgba(10, 10, 14, 0.6)',
        border: `1px solid ${mission.wonBy ? (mission.wonBy === 'player1' ? 'rgba(196, 163, 90, 0.4)' : 'rgba(179, 62, 62, 0.4)') : 'rgba(255, 255, 255, 0.06)'}`,
      }}
    >
      {/* Player 2 characters */}
      <div className="flex flex-wrap gap-1 justify-center p-1 min-h-[40px] items-end">
        <AnimatePresence mode="popLayout">
          {mission.player2Characters.map((char) => (
            <ReplayCard key={char.instanceId} char={char} isSpectator={true} state={state} locale={locale} />
          ))}
        </AnimatePresence>
      </div>

      {/* Mission card with image */}
      <div
        className="relative w-full px-2 py-1.5 text-center overflow-hidden"
        style={{
          borderTop: `1px solid ${rankColor}40`,
          borderBottom: `1px solid ${rankColor}40`,
          minHeight: '48px',
        }}
      >
        {/* Mission card image background */}
        {missionImage && (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${missionImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: 0.25,
            }}
          />
        )}
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }} />
        <div className="relative z-10">
          <div className="flex items-center justify-center gap-1.5">
            <span
              className="text-[9px] font-bold uppercase px-1 rounded"
              style={{ backgroundColor: `${rankColor}30`, color: rankColor }}
            >
              {mission.rank}
            </span>
            <span className="text-[9px] truncate font-medium" style={{ color: '#e0e0e0' }}>
              {missionName}
            </span>
          </div>
          <div className="flex items-center justify-center gap-1 mt-0.5">
            <span className="text-[8px] font-semibold" style={{ color: rankColor }}>
              {totalPoints} pts
            </span>
            {mission.wonBy && (
              <span
                className="text-[7px] font-bold uppercase"
                style={{ color: mission.wonBy === 'player1' ? '#c4a35a' : '#b33e3e' }}
              >
                {mission.wonBy === 'player1' ? 'P1' : 'P2'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Player 1 characters */}
      <div className="flex flex-wrap gap-1 justify-center p-1 min-h-[40px] items-start">
        <AnimatePresence mode="popLayout">
          {mission.player1Characters.map((char) => (
            <ReplayCard key={char.instanceId} char={char} isSpectator={true} state={state} locale={locale} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ReplayStatsBar({
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

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-1.5"
      style={{
        backgroundColor: isActive ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
        borderBottom: isTop ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
        borderTop: !isTop ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold" style={{ color }}>
          {playerNames[player]}
        </span>
        {isEdgeHolder && (
          <span
            className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase"
            style={{ backgroundColor: 'rgba(196, 163, 90, 0.15)', color: '#c4a35a', border: '1px solid rgba(196, 163, 90, 0.3)' }}
          >
            Edge
          </span>
        )}
        {ps.hasPassed && (
          <span
            className="text-[8px] px-1.5 py-0.5 rounded uppercase"
            style={{ backgroundColor: 'rgba(136, 136, 136, 0.1)', color: '#888' }}
          >
            {t('game.pass')}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Chakra */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] uppercase" style={{ color: '#666' }}>
            {t('game.chakra')}
          </span>
          <span className="text-xs font-bold tabular-nums" style={{ color: '#5A7ABB' }}>
            {ps.chakra}
          </span>
        </div>

        {/* Mission points */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] uppercase" style={{ color: '#666' }}>
            {t('game.score')}
          </span>
          <span className="text-xs font-bold tabular-nums" style={{ color }}>
            {ps.missionPoints}
          </span>
        </div>

        {/* Hand / Deck sizes */}
        <div className="flex items-center gap-1">
          <span className="text-[8px]" style={{ color: '#555' }}>
            {t('game.hand')}: {ps.hand.length}
          </span>
          <span className="text-[8px]" style={{ color: '#555' }}>
            {t('game.deck')}: {ps.deck.length}
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
}

export function ReplayBoard({ state, playerNames, locale }: ReplayBoardProps) {
  const t = useTranslations();

  const phaseKey = `game.phase.${state.phase}`;

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: '#0a0a0e',
        border: '1px solid #262626',
      }}
    >
      {/* Turn / Phase banner */}
      <div
        className="flex items-center justify-center gap-2 px-3 py-1.5"
        style={{ backgroundColor: 'rgba(196, 163, 90, 0.06)', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
      >
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#c4a35a' }}>
          {t('game.turn', { turn: state.turn })}
        </span>
        <span className="text-[10px]" style={{ color: '#666' }}>-</span>
        <span className="text-[10px] uppercase" style={{ color: '#888' }}>
          {t(phaseKey)}
        </span>
      </div>

      {/* Player 2 stats */}
      <ReplayStatsBar player="player2" state={state} playerNames={playerNames} isTop={true} />

      {/* Player 2 hand */}
      <div
        className="flex items-center justify-center gap-1 px-2 py-1 overflow-x-auto"
        style={{ minHeight: '40px', backgroundColor: 'rgba(179, 62, 62, 0.03)' }}
      >
        <AnimatePresence mode="popLayout">
          {state.player2.hand.map((card, i) => (
            <ReplayHandCard key={`p2-hand-${card.cardId}-${i}`} card={card} locale={locale} />
          ))}
        </AnimatePresence>
        {state.player2.hand.length === 0 && (
          <span className="text-[9px]" style={{ color: '#555' }}>
            -
          </span>
        )}
      </div>

      {/* Mission area — fixed 4-column grid so layout doesn't shift */}
      <div className="grid grid-cols-4 gap-1.5 px-2 py-2 min-h-[160px] sm:min-h-[200px]">
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
          return (
            <div
              key={`empty-${slotIdx}`}
              className="flex items-center justify-center rounded-lg"
              style={{
                backgroundColor: 'rgba(10, 10, 14, 0.3)',
                border: '1px dashed rgba(255, 255, 255, 0.06)',
              }}
            >
              <span className="text-[9px]" style={{ color: 'rgba(255, 255, 255, 0.12)' }}>
                {t('game.turn', { turn: slotIdx + 1 })}
              </span>
            </div>
          );
        })}
      </div>

      {/* Player 1 hand */}
      <div
        className="flex items-center justify-center gap-1 px-2 py-1 overflow-x-auto"
        style={{ minHeight: '40px', backgroundColor: 'rgba(196, 163, 90, 0.03)' }}
      >
        <AnimatePresence mode="popLayout">
          {state.player1.hand.map((card, i) => (
            <ReplayHandCard key={`p1-hand-${card.cardId}-${i}`} card={card} locale={locale} />
          ))}
        </AnimatePresence>
        {state.player1.hand.length === 0 && (
          <span className="text-[9px]" style={{ color: '#555' }}>
            -
          </span>
        )}
      </div>

      {/* Player 1 stats */}
      <ReplayStatsBar player="player1" state={state} playerNames={playerNames} isTop={false} />
    </div>
  );
}
