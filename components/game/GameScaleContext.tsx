'use client';

import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';



const BASE = {
  
  handCardW: 100, handCardH: 140,
  missionCardW: 90, missionCardH: 126,
  sideCardW: 64, sideCardH: 90,
  opponentCardW: 50, opponentCardH: 70,
  
  opponentHandH: 95,
  playerHandH: 175,
  sidePileW: 90,
  
  handFanSpacing: 58,
  handFanArc: 3,
  handContainerH: 135,
  handMinW: 480,
  
  opponentFanSpacing: 20,
  opponentContainerH: 64,
  opponentMinW: 280,
  
  missionMaxW: 170,
  emptyLaneMinW: 270,
  emptyLaneMaxW: 380,
  
  animHandW: 150, animHandH: 210,
  animBoardW: 160, animBoardH: 224,
  animDeckW: 56, animDeckH: 78,
  
  targetCardW: 72, targetCardH: 100,
  mulliganCardW: 130, mulliganCardH: 182,
  handSelectorCardW: 120, handSelectorCardH: 168,
  previewMedW: 160, previewMedH: 224,
  previewLgW: 200, previewLgH: 280,
} as const;



export interface GameDimensions {
  handCard: { w: number; h: number };
  missionCard: { w: number; h: number };
  sideCard: { w: number; h: number };
  opponentCard: { w: number; h: number };
  
  opponentHandH: number;
  playerHandH: number;
  sidePileW: number;
  
  handFanSpacing: number;
  handFanArc: number;
  handContainerH: number;
  handMinW: number;
  
  opponentFanSpacing: number;
  opponentContainerH: number;
  opponentMinW: number;
  
  missionMaxW: number;
  emptyLaneMinW: number;
  emptyLaneMaxW: number;
  
  animHand: { w: number; h: number };
  animBoard: { w: number; h: number };
  animDeck: { w: number; h: number };
  
  targetCard: { w: number; h: number };
  mulliganCard: { w: number; h: number };
  handSelectorCard: { w: number; h: number };
  previewMed: { w: number; h: number };
  previewLg: { w: number; h: number };
}



function computeScale(_vw: number, _vh: number): number {
  return 1.0;
}

function s(base: number, scale: number): number {
  return Math.round(base * scale);
}

function buildDimensions(_scale: number, _vw: number, _vh: number): GameDimensions {
  return {
    handCard: { w: BASE.handCardW, h: BASE.handCardH },
    missionCard: { w: BASE.missionCardW, h: BASE.missionCardH },
    sideCard: { w: BASE.sideCardW, h: BASE.sideCardH },
    opponentCard: { w: BASE.opponentCardW, h: BASE.opponentCardH },
    opponentHandH: BASE.opponentHandH,
    playerHandH: BASE.playerHandH,
    sidePileW: BASE.sidePileW,
    handFanSpacing: BASE.handFanSpacing,
    handFanArc: BASE.handFanArc,
    handContainerH: BASE.handContainerH,
    handMinW: BASE.handMinW,
    opponentFanSpacing: BASE.opponentFanSpacing,
    opponentContainerH: BASE.opponentContainerH,
    opponentMinW: BASE.opponentMinW,
    missionMaxW: BASE.missionMaxW,
    emptyLaneMinW: BASE.emptyLaneMinW,
    emptyLaneMaxW: BASE.emptyLaneMaxW,
    animHand: { w: BASE.animHandW, h: BASE.animHandH },
    animBoard: { w: BASE.animBoardW, h: BASE.animBoardH },
    animDeck: { w: BASE.animDeckW, h: BASE.animDeckH },
    targetCard: { w: BASE.targetCardW, h: BASE.targetCardH },
    mulliganCard: { w: BASE.mulliganCardW, h: BASE.mulliganCardH },
    handSelectorCard: { w: BASE.handSelectorCardW, h: BASE.handSelectorCardH },
    previewMed: { w: BASE.previewMedW, h: BASE.previewMedH },
    previewLg: { w: BASE.previewLgW, h: BASE.previewLgH },
  };
}



let cachedWidth = typeof window !== 'undefined' ? window.innerWidth : 1400;
let cachedHeight = typeof window !== 'undefined' ? window.innerHeight : 900;
let listeners: Array<() => void> = [];
let resizeTimer: ReturnType<typeof setTimeout> | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      cachedWidth = window.innerWidth;
      cachedHeight = window.innerHeight;
      for (const cb of listeners) cb();
    }, 100);
  });
}

function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function getSnapshot() {
  return `${cachedWidth}x${cachedHeight}`;
}

function getServerSnapshot() {
  return '1400x900';
}



const GameScaleContext = createContext<GameDimensions>(buildDimensions(1.0, 1400, 900));

export function GameScaleProvider({ children }: { children: React.ReactNode }) {
  const sizeKey = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const dims = useMemo(() => {
    const [w, h] = sizeKey.split('x').map(Number);
    return buildDimensions(computeScale(w, h), w, h);
  }, [sizeKey]);

  return (
    <GameScaleContext.Provider value={dims}>
      {children}
    </GameScaleContext.Provider>
  );
}

export function useGameScale(): GameDimensions {
  return useContext(GameScaleContext);
}
