'use client';

import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';

// ── Base dimensions (designed for ~1400×900 viewport) ──────────────

const BASE = {
  // Card sizes
  handCardW: 80, handCardH: 112,
  missionCardW: 72, missionCardH: 100,
  sideCardW: 56, sideCardH: 78,
  opponentCardW: 44, opponentCardH: 62,
  // Section heights
  opponentHandH: 85,
  playerHandH: 150,
  sidePileW: 80,
  // Hand spacing
  handFanSpacing: 48,
  handFanArc: 3,
  handContainerH: 110,
  handMinW: 400,
  // Opponent hand spacing
  opponentFanSpacing: 18,
  opponentContainerH: 56,
  opponentMinW: 250,
  // Mission lane
  missionMaxW: 140,
  emptyLaneMinW: 230,
  emptyLaneMaxW: 320,
  // Animation card sizes
  animHandW: 120, animHandH: 168,
  animBoardW: 130, animBoardH: 182,
  animDeckW: 48, animDeckH: 68,
  // Modal card sizes
  targetCardW: 64, targetCardH: 90,
  mulliganCardW: 115, mulliganCardH: 161,
  handSelectorCardW: 110, handSelectorCardH: 154,
  previewMedW: 140, previewMedH: 196,
  previewLgW: 180, previewLgH: 252,
} as const;

// ── Computed dimensions interface ──────────────────────────────────

export interface GameDimensions {
  scale: number;
  isCompact: boolean;
  // Card sizes
  handCard: { w: number; h: number };
  missionCard: { w: number; h: number };
  sideCard: { w: number; h: number };
  opponentCard: { w: number; h: number };
  // Sections
  opponentHandH: number;
  playerHandH: number;
  sidePileW: number;
  // Hand
  handFanSpacing: number;
  handFanArc: number;
  handContainerH: number;
  handMinW: number;
  // Opponent hand
  opponentFanSpacing: number;
  opponentContainerH: number;
  opponentMinW: number;
  // Mission
  missionMaxW: number;
  emptyLaneMinW: number;
  emptyLaneMaxW: number;
  // Animations
  animHand: { w: number; h: number };
  animBoard: { w: number; h: number };
  animDeck: { w: number; h: number };
  // Modals
  targetCard: { w: number; h: number };
  mulliganCard: { w: number; h: number };
  handSelectorCard: { w: number; h: number };
  previewMed: { w: number; h: number };
  previewLg: { w: number; h: number };
}

// ── Scale computation ──────────────────────────────────────────────

function computeScale(vw: number, vh: number): number {
  const raw = Math.min(vw / 1400, vh / 900);
  return Math.max(0.55, Math.min(raw, 1.0));
}

function s(base: number, scale: number): number {
  return Math.round(base * scale);
}

function buildDimensions(scale: number): GameDimensions {
  return {
    scale,
    isCompact: scale < 0.8,
    handCard: { w: s(BASE.handCardW, scale), h: s(BASE.handCardH, scale) },
    missionCard: { w: s(BASE.missionCardW, scale), h: s(BASE.missionCardH, scale) },
    sideCard: { w: s(BASE.sideCardW, scale), h: s(BASE.sideCardH, scale) },
    opponentCard: { w: s(BASE.opponentCardW, scale), h: s(BASE.opponentCardH, scale) },
    opponentHandH: s(BASE.opponentHandH, scale),
    playerHandH: s(BASE.playerHandH, scale),
    sidePileW: s(BASE.sidePileW, scale),
    handFanSpacing: s(BASE.handFanSpacing, scale),
    handFanArc: s(BASE.handFanArc, scale),
    handContainerH: s(BASE.handContainerH, scale),
    handMinW: s(BASE.handMinW, scale),
    opponentFanSpacing: s(BASE.opponentFanSpacing, scale),
    opponentContainerH: s(BASE.opponentContainerH, scale),
    opponentMinW: s(BASE.opponentMinW, scale),
    missionMaxW: s(BASE.missionMaxW, scale),
    emptyLaneMinW: s(BASE.emptyLaneMinW, scale),
    emptyLaneMaxW: s(BASE.emptyLaneMaxW, scale),
    animHand: { w: s(BASE.animHandW, scale), h: s(BASE.animHandH, scale) },
    animBoard: { w: s(BASE.animBoardW, scale), h: s(BASE.animBoardH, scale) },
    animDeck: { w: s(BASE.animDeckW, scale), h: s(BASE.animDeckH, scale) },
    targetCard: { w: s(BASE.targetCardW, scale), h: s(BASE.targetCardH, scale) },
    mulliganCard: { w: s(BASE.mulliganCardW, scale), h: s(BASE.mulliganCardH, scale) },
    handSelectorCard: { w: s(BASE.handSelectorCardW, scale), h: s(BASE.handSelectorCardH, scale) },
    previewMed: { w: s(BASE.previewMedW, scale), h: s(BASE.previewMedH, scale) },
    previewLg: { w: s(BASE.previewLgW, scale), h: s(BASE.previewLgH, scale) },
  };
}

// ── External store for viewport size (avoids redundant listeners) ──

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

// ── Context ────────────────────────────────────────────────────────

const GameScaleContext = createContext<GameDimensions>(buildDimensions(1.0));

export function GameScaleProvider({ children }: { children: React.ReactNode }) {
  const sizeKey = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const dims = useMemo(() => {
    const [w, h] = sizeKey.split('x').map(Number);
    return buildDimensions(computeScale(w, h));
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
