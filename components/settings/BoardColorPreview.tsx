'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import GameBoard from '@/components/game/GameBoard';
import { BoardPaletteOverride } from '@/components/game/BoardPaletteContext';
import { BoardPreviewFrame } from './BoardPreviewFrame';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildPreviewBoardState } from '@/lib/game/previewBoardState';
import type { ResolvedBoardPalette } from '@/lib/game/boardPalette';

const RESTORED_GAME_KEYS = [
  'gameState',
  'visibleState',
  'humanPlayer',
  'aiPlayer',
  'isAIGame',
  'isHotseatGame',
  'isSandboxMode',
  'isSimMode',
  'isReplayMode',
  'isBoardPreview',
  'isOnlineGame',
  'hotseatSwitchPending',
  'hotseatNextPlayer',
  'isProcessing',
  'gameOver',
  'winner',
  'isAnimating',
  'animationQueue',
  'pendingTargetSelection',
  'replayInitialState',
  'actionError',
  'actionErrorKey',
  'actionErrorParams',
  'playerDisplayNames',
] as const;

const RESTORED_UI_KEYS = ['coinFlipComplete', 'missionDeckIntroComplete', 'showGameLog'] as const;

export function BoardColorPreview({ palette }: { palette: ResolvedBoardPalette }) {
  const t = useTranslations('settings');
  const [previewState] = useState(() => buildPreviewBoardState());
  const [playerNames] = useState(() => ({
    player1: t('boardPreviewYou'),
    player2: t('boardPreviewOpponent'),
  }));

  useEffect(() => {
    const gameSnapshot: Record<string, unknown> = {};
    const gameState = useGameStore.getState() as unknown as Record<string, unknown>;
    for (const key of RESTORED_GAME_KEYS) gameSnapshot[key] = gameState[key];

    const uiSnapshot: Record<string, unknown> = {};
    const uiState = useUIStore.getState() as unknown as Record<string, unknown>;
    for (const key of RESTORED_UI_KEYS) uiSnapshot[key] = uiState[key];

    useUIStore.setState({ coinFlipComplete: true, missionDeckIntroComplete: true, showGameLog: false });
    useGameStore.setState({
      gameState: previewState,
      visibleState: GameEngine.getVisibleState(previewState, 'player1'),
      humanPlayer: 'player1',
      aiPlayer: null,
      isAIGame: false,
      isHotseatGame: false,
      isSandboxMode: false,
      isSimMode: true,
      isReplayMode: true,
      isBoardPreview: true,
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

    return () => {
      useGameStore.setState(gameSnapshot as never);
      useUIStore.setState(uiSnapshot as never);
    };
  }, [previewState, playerNames]);

  return (
    <div aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <BoardPreviewFrame>
        <BoardPaletteOverride palette={palette}>
          <GameBoard />
        </BoardPaletteOverride>
      </BoardPreviewFrame>
    </div>
  );
}
