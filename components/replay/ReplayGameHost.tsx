'use client';

import React, { useEffect, useState } from 'react';
import GameBoard from '@/components/game/GameBoard';
import { ScaledGameRoot } from '@/components/game/ScaledGameRoot';
import { GameScaleProvider } from '@/components/game/GameScaleContext';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { GameState, PlayerID } from '@/lib/engine/types';

function useIsCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return coarse;
}

export function ReplayGameHost({
  state,
  viewAs,
  playerNames,
}: {
  state: GameState;
  viewAs: PlayerID;
  playerNames: { player1: string; player2: string };
}) {
  const coarse = useIsCoarsePointer();

  useEffect(() => {
    useUIStore.getState().setCoinFlipComplete(true);
    useUIStore.getState().setMissionDeckIntroComplete(true);
  }, []);

  useEffect(() => {
    useGameStore.setState({
      gameState: state,
      visibleState: GameEngine.getVisibleState(state, viewAs),
      humanPlayer: viewAs,
      aiPlayer: null,
      isAIGame: false,
      isHotseatGame: false,
      isSandboxMode: false,
      isSimMode: true,
      isReplayMode: true,
      isOnlineGame: false,
      hotseatSwitchPending: false,
      hotseatNextPlayer: null,
      isProcessing: false,
      gameOver: false,
      winner: null,
      isAnimating: false,
      animationQueue: [],
      pendingTargetSelection: null,
      replayInitialState: null,
      actionError: null,
      actionErrorKey: null,
      actionErrorParams: null,
      playerDisplayNames: playerNames,
    });
  }, [state, viewAs, playerNames]);

  useEffect(() => () => { useGameStore.getState().resetGame(); }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', backgroundColor: 'transparent' }}>
      {coarse ? (
        <ScaledGameRoot>
          <GameBoard />
        </ScaledGameRoot>
      ) : (
        <GameScaleProvider>
          <GameBoard />
        </GameScaleProvider>
      )}
    </div>
  );
}
