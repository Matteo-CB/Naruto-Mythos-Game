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
  scale: number;
  isCompact: boolean;
  
  isMobile: boolean;
  
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



function computeScale(vw: number, vh: number): number {
  const isMobile = vh < 500;
  
  
  const refW = isMobile ? 1000 : 1600;
  const refH = isMobile ? 600 : 1000;
  const raw = Math.min(vw / refW, vh / refH);
  const minScale = isMobile ? 0.45 : 0.55;
  return Math.max(minScale, Math.min(raw, 1.15));
}

function s(base: number, scale: number): number {
  return Math.round(base * scale);
}

function buildDimensions(scale: number, vw: number, vh: number): GameDimensions {
  const isMobile = vh < 500;

  
  
  
  
  
  const emptyLaneMinW = isMobile ? Math.round(110 * scale) : s(BASE.emptyLaneMinW, scale);
  const emptyLaneMaxW = isMobile ? Math.round(170 * scale) : s(BASE.emptyLaneMaxW, scale);
  
  
  
  const missionMaxW = isMobile ? Math.round(70 * scale) : s(BASE.missionMaxW, scale);
  const sidePileW = isMobile ? Math.round(38 * scale) : s(BASE.sidePileW, scale);
  const handMinW = isMobile ? Math.round(240 * scale) : s(BASE.handMinW, scale);
  const opponentMinW = isMobile ? Math.round(150 * scale) : s(BASE.opponentMinW, scale);

  
  
  const opponentHandH = isMobile ? Math.round(44 * scale) : s(BASE.opponentHandH, scale);
  const playerHandH = isMobile ? Math.round(110 * scale) : s(BASE.playerHandH, scale);
  const handFanSpacing = isMobile ? Math.round(38 * scale) : s(BASE.handFanSpacing, scale);
  const opponentFanSpacing = isMobile ? Math.round(14 * scale) : s(BASE.opponentFanSpacing, scale);
  const opponentContainerH = isMobile ? Math.round(36 * scale) : s(BASE.opponentContainerH, scale);

  
  const handCardW = isMobile ? Math.round(78 * scale) : s(BASE.handCardW, scale);
  const handCardH = isMobile ? Math.round(109 * scale) : s(BASE.handCardH, scale);
  const opponentCardW = isMobile ? Math.round(32 * scale) : s(BASE.opponentCardW, scale);
  const opponentCardH = isMobile ? Math.round(45 * scale) : s(BASE.opponentCardH, scale);

  
  
  const missionCardW = isMobile ? Math.round(48 * scale) : s(BASE.missionCardW, scale);
  const missionCardH = isMobile ? Math.round(68 * scale) : s(BASE.missionCardH, scale);

  return {
    scale,
    isCompact: scale < 0.8,
    isMobile,
    handCard: { w: handCardW, h: handCardH },
    missionCard: { w: missionCardW, h: missionCardH },
    sideCard: { w: s(BASE.sideCardW, scale), h: s(BASE.sideCardH, scale) },
    opponentCard: { w: opponentCardW, h: opponentCardH },
    opponentHandH,
    playerHandH,
    sidePileW,
    handFanSpacing,
    handFanArc: isMobile ? Math.round(2 * scale) : s(BASE.handFanArc, scale),
    handContainerH: isMobile ? Math.round(100 * scale) : s(BASE.handContainerH, scale),
    handMinW,
    opponentFanSpacing,
    opponentContainerH,
    opponentMinW,
    missionMaxW,
    emptyLaneMinW,
    emptyLaneMaxW,
    animHand: { w: s(BASE.animHandW, scale), h: s(BASE.animHandH, scale) },
    animBoard: { w: s(BASE.animBoardW, scale), h: s(BASE.animBoardH, scale) },
    animDeck: { w: s(BASE.animDeckW, scale), h: s(BASE.animDeckH, scale) },
    targetCard: { w: isMobile ? Math.round(60 * scale) : s(BASE.targetCardW, scale), h: isMobile ? Math.round(84 * scale) : s(BASE.targetCardH, scale) },
    mulliganCard: { w: isMobile ? Math.round(90 * scale) : s(BASE.mulliganCardW, scale), h: isMobile ? Math.round(126 * scale) : s(BASE.mulliganCardH, scale) },
    handSelectorCard: { w: isMobile ? Math.round(80 * scale) : s(BASE.handSelectorCardW, scale), h: isMobile ? Math.round(112 * scale) : s(BASE.handSelectorCardH, scale) },
    previewMed: { w: s(BASE.previewMedW, scale), h: s(BASE.previewMedH, scale) },
    previewLg: { w: s(BASE.previewLgW, scale), h: s(BASE.previewLgH, scale) },
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



export const GameScaleContext = createContext<GameDimensions>(buildDimensions(1.0, 1400, 900));

export const DESKTOP_FIXED_DIMS: GameDimensions = buildDimensions(1.0, 1600, 1000);

export const MOBILE_FIXED_DIMS: GameDimensions = {
  ...DESKTOP_FIXED_DIMS,
  handCard: { w: 120, h: 168 },
  missionCard: { w: 108, h: 151 },
  sideCard: { w: 78, h: 110 },
  opponentCard: { w: 64, h: 90 },
  targetCard: { w: 92, h: 128 },
  mulliganCard: { w: 156, h: 218 },
  handSelectorCard: { w: 144, h: 202 },
  previewMed: { w: 192, h: 269 },
  previewLg: { w: 240, h: 336 },
  handFanSpacing: 72,
  handContainerH: 150,
  playerHandH: 190,
  opponentHandH: 105,
  opponentFanSpacing: 24,
  opponentContainerH: 72,
  sidePileW: 108,
  missionMaxW: 200,
  emptyLaneMinW: 300,
  emptyLaneMaxW: 380,
};

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
