'use client';

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { resolveBoardPalette, type ResolvedBoardPalette } from '@/lib/game/boardPalette';

const BoardPaletteOverrideContext = createContext<ResolvedBoardPalette | null>(null);

export function BoardPaletteOverride({ palette, children }: { palette: ResolvedBoardPalette; children: ReactNode }) {
  return <BoardPaletteOverrideContext.Provider value={palette}>{children}</BoardPaletteOverrideContext.Provider>;
}

export function useBoardPalette(): ResolvedBoardPalette {
  const override = useContext(BoardPaletteOverrideContext);
  const stored = useSettingsStore((s) => s.boardPalette);
  return useMemo(() => override ?? resolveBoardPalette(stored), [override, stored]);
}
