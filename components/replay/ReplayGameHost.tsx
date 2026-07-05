'use client';

import React, { useEffect, useRef, useState } from 'react';
import GameBoard from '@/components/game/GameBoard';
import { GameScaleContext, DESKTOP_FIXED_DIMS } from '@/components/game/GameScaleContext';
import { useGameStore } from '@/stores/gameStore';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { GameState, PlayerID } from '@/lib/engine/types';

const BASE_W = 1600;
const BASE_H = 1000;

export function ReplayGameHost({
  state,
  viewAs,
  playerNames,
}: {
  state: GameState;
  viewAs: PlayerID;
  playerNames: { player1: string; player2: string };
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const compute = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setScale(Math.min(r.width / BASE_W, r.height / BASE_H));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
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
    <div
      ref={boxRef}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a' }}
    >
      <div style={{ width: BASE_W * scale, height: BASE_H * scale, position: 'relative', flexShrink: 0 }}>
        <div
          style={{
            width: BASE_W,
            height: BASE_H,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
            ['--game-board-w' as string]: `${BASE_W}px`,
            ['--game-board-h' as string]: `${BASE_H}px`,
          } as React.CSSProperties}
        >
          <GameScaleContext.Provider value={DESKTOP_FIXED_DIMS}>
            <GameBoard />
          </GameScaleContext.Provider>
        </div>
      </div>
    </div>
  );
}
