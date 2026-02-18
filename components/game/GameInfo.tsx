'use client';

import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { ChakraPool } from './ChakraPool';
import { ScoreDisplay } from './ScoreDisplay';
import { EdgeToken } from './EdgeToken';
import type { GamePhase } from '@/lib/engine/types';

const phaseTranslationKeys: Record<string, string> = {
  setup: 'game.phase.start',
  mulligan: 'game.phase.mulligan',
  start: 'game.phase.start',
  action: 'game.phase.action',
  mission: 'game.phase.mission',
  end: 'game.phase.end',
  gameOver: 'game.phase.gameOver',
};

function Divider() {
  return (
    <div className="my-0.5 h-px" style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)' }} />
  );
}

function InfoRow({ label, value, valueColor = '#e0e0e0' }: { label: string; value: string | number; valueColor?: string }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span style={{ color: '#888888' }}>{label}</span>
      <span className="tabular-nums font-medium" style={{ color: valueColor }}>{value}</span>
    </div>
  );
}

export function GameInfo() {
  const t = useTranslations();
  const visibleState = useGameStore((s) => s.visibleState);

  if (!visibleState) return null;

  const {
    turn,
    phase,
    activePlayer,
    edgeHolder,
    myPlayer,
    myState,
    opponentState,
    missionDeckSize,
  } = visibleState;

  const isMyTurn = activePlayer === myPlayer;

  const translatedPhase = phaseTranslationKeys[phase]
    ? t(phaseTranslationKeys[phase])
    : phase;

  return (
    <div className="flex flex-col gap-2.5 p-3 h-full overflow-y-auto">
      {/* Turn + Phase + Active — combined card */}
      <div
        className="flex flex-col gap-2 p-2.5 rounded-lg"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        <div className="flex items-center justify-between">
          <span
            className="text-[10px] uppercase tracking-wider font-medium"
            style={{ color: '#888888' }}
          >
            {t('game.turnLabel')}
          </span>
          <div className="flex items-baseline gap-1">
            <span
              className="text-xl font-bold tabular-nums"
              style={{ color: '#c4a35a' }}
            >
              {turn}
            </span>
            <span className="text-[10px]" style={{ color: '#555555' }}>
              / 4
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span
            className="text-[10px] uppercase tracking-wider font-medium"
            style={{ color: '#888888' }}
          >
            {t('game.board.phaseLabel')}
          </span>
          <span className="text-xs font-semibold" style={{ color: '#e0e0e0' }}>
            {translatedPhase}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span
            className="text-[10px] uppercase tracking-wider font-medium"
            style={{ color: '#888888' }}
          >
            {t('game.board.activeLabel')}
          </span>
          <span
            className="text-xs font-semibold"
            style={{ color: isMyTurn ? '#c4a35a' : '#b33e3e' }}
          >
            {isMyTurn ? t('game.yourTurn') : t('game.opponentTurn')}
          </span>
        </div>
      </div>

      {/* Edge Token */}
      <EdgeToken holder={edgeHolder} myPlayer={myPlayer} />

      <Divider />

      {/* Score Display */}
      <ScoreDisplay
        playerScore={myState.missionPoints}
        opponentScore={opponentState.missionPoints}
        playerLabel={t('game.you')}
        opponentLabel={t('game.opponent')}
      />

      <Divider />

      {/* Chakra */}
      <div className="flex flex-col gap-1.5">
        <span
          className="text-[10px] uppercase tracking-wider font-medium"
          style={{ color: '#888888' }}
        >
          {t('game.chakra')}
        </span>
        <InfoRow label={t('game.you')} value={myState.chakra} valueColor="#c4a35a" />
        <InfoRow label={t('game.opponent')} value={opponentState.chakra} valueColor="#b33e3e" />
      </div>

      <Divider />

      {/* Decks */}
      <div className="flex flex-col gap-1.5">
        <span
          className="text-[10px] uppercase tracking-wider font-medium"
          style={{ color: '#888888' }}
        >
          {t('game.deck')}
        </span>
        <InfoRow label={t('game.you')} value={myState.deck.length} valueColor="#c4a35a" />
        <InfoRow label={t('game.opponent')} value={opponentState.deckSize} valueColor="#b33e3e" />
        <InfoRow label={t('game.board.missionDeck')} value={missionDeckSize} valueColor="#888888" />
      </div>

      <Divider />

      {/* Discard piles */}
      <div className="flex flex-col gap-1.5">
        <span
          className="text-[10px] uppercase tracking-wider font-medium"
          style={{ color: '#888888' }}
        >
          {t('game.discard')}
        </span>
        <InfoRow label={t('game.you')} value={myState.discardPile.length} valueColor="#888888" />
        <InfoRow label={t('game.opponent')} value={opponentState.discardPileSize} valueColor="#888888" />
      </div>

      {/* Pass status */}
      {phase === 'action' && (
        <>
          <Divider />
          <div className="flex flex-col gap-1.5">
            <span
              className="text-[10px] uppercase tracking-wider font-medium"
              style={{ color: '#888888' }}
            >
              {t('game.pass')}
            </span>
            <div className="flex justify-between items-center text-xs">
              <span style={{ color: '#888888' }}>{t('game.you')}</span>
              <span
                className="font-medium"
                style={{
                  color: myState.hasPassed ? '#b33e3e' : '#3e8b3e',
                }}
              >
                {myState.hasPassed ? t('game.pass') : t('game.play')}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span style={{ color: '#888888' }}>{t('game.opponent')}</span>
              <span
                className="font-medium"
                style={{
                  color: opponentState.hasPassed ? '#b33e3e' : '#3e8b3e',
                }}
              >
                {opponentState.hasPassed ? t('game.pass') : t('game.play')}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
