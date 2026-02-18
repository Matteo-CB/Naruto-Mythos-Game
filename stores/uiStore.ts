'use client';

import { create } from 'zustand';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';

interface MissionContext {
  rank: string;
  basePoints: number;
  rankBonus: number;
}

interface UIStore {
  // Card preview
  previewCard: CharacterCard | MissionCard | null;
  previewPosition: { x: number; y: number } | null;
  previewMissionContext: MissionContext | null;
  showPreview: (card: CharacterCard | MissionCard, position: { x: number; y: number }, missionContext?: MissionContext) => void;
  hidePreview: () => void;

  // Pinned card preview
  pinnedCard: CharacterCard | MissionCard | null;
  pinnedMissionContext: MissionContext | null;
  pinCard: (card: CharacterCard | MissionCard, missionContext?: MissionContext) => void;
  unpinCard: () => void;
  showFullscreenCard: boolean;
  toggleFullscreenCard: () => void;

  // Selection state
  selectedCardIndex: number | null;
  selectedMissionIndex: number | null;
  selectedTargetId: string | null;
  selectCard: (index: number | null) => void;
  selectMission: (index: number | null) => void;
  selectTarget: (id: string | null) => void;
  clearSelection: () => void;

  // Dialogs
  showConfirmDialog: boolean;
  confirmDialogData: { title: string; message: string; onConfirm: () => void } | null;
  openConfirmDialog: (title: string, message: string, onConfirm: () => void) => void;
  closeConfirmDialog: () => void;

  // Game log
  showGameLog: boolean;
  toggleGameLog: () => void;

  // Turn overlay
  showTurnOverlay: boolean;
  turnOverlayText: string;
  showTurnTransition: (text: string) => void;
  hideTurnOverlay: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  previewCard: null,
  previewPosition: null,
  previewMissionContext: null,
  showPreview: (card, position, missionContext) => set((state) => {
    if (state.pinnedCard) return {}; // Suppress hover preview when a card is pinned
    return { previewCard: card, previewPosition: position, previewMissionContext: missionContext ?? null };
  }),
  hidePreview: () => set((state) => {
    if (state.pinnedCard) return {}; // Don't hide preview when a card is pinned
    return { previewCard: null, previewPosition: null, previewMissionContext: null };
  }),

  pinnedCard: null,
  pinnedMissionContext: null,
  pinCard: (card, missionContext) => set({
    pinnedCard: card,
    pinnedMissionContext: missionContext ?? null,
    previewCard: null,
    previewPosition: null,
    previewMissionContext: null,
  }),
  unpinCard: () => set({
    pinnedCard: null,
    pinnedMissionContext: null,
    showFullscreenCard: false,
  }),
  showFullscreenCard: false,
  toggleFullscreenCard: () => set((state) => ({ showFullscreenCard: !state.showFullscreenCard })),

  selectedCardIndex: null,
  selectedMissionIndex: null,
  selectedTargetId: null,
  selectCard: (index) => set({ selectedCardIndex: index }),
  selectMission: (index) => set({ selectedMissionIndex: index }),
  selectTarget: (id) => set({ selectedTargetId: id }),
  clearSelection: () =>
    set({
      selectedCardIndex: null,
      selectedMissionIndex: null,
      selectedTargetId: null,
    }),

  showConfirmDialog: false,
  confirmDialogData: null,
  openConfirmDialog: (title, message, onConfirm) =>
    set({
      showConfirmDialog: true,
      confirmDialogData: { title, message, onConfirm },
    }),
  closeConfirmDialog: () =>
    set({ showConfirmDialog: false, confirmDialogData: null }),

  showGameLog: false,
  toggleGameLog: () => set((state) => ({ showGameLog: !state.showGameLog })),

  showTurnOverlay: false,
  turnOverlayText: '',
  showTurnTransition: (text) => set({ showTurnOverlay: true, turnOverlayText: text }),
  hideTurnOverlay: () => set({ showTurnOverlay: false }),
}));
