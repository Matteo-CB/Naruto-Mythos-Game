'use client';

import { create } from 'zustand';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import { MAX_COPIES_PER_VERSION, MISSION_CARDS_PER_PLAYER } from '@/lib/engine/types';
import { resolveCardId } from '@/lib/data/cardLoader';

interface SavedDeck {
  id: string;
  name: string;
  cardIds: string[];
  missionIds: string[];
}

interface AddCheckResult {
  allowed: boolean;
  reason?: string;
  reasonKey?: string;
  reasonParams?: Record<string, string | number>;
}

interface DeckBuilderStore {
  // Deck state
  deckName: string;
  deckChars: CharacterCard[];
  deckMissions: MissionCard[];

  // Saved decks
  savedDecks: SavedDeck[];
  isLoading: boolean;
  isSaving: boolean;

  // Currently loaded deck ID (for tracking edits)
  loadedDeckId: string | null;

  // Inline error for failed add
  addError: string | null;
  addErrorKey: string | null;
  addErrorParams: Record<string, string | number> | null;

  // Actions
  setDeckName: (name: string) => void;
  addChar: (card: CharacterCard) => void;
  removeChar: (index: number) => void;
  addMission: (card: MissionCard) => void;
  removeMission: (index: number) => void;
  clearDeck: () => void;
  clearAddError: () => void;
  reorderChars: (fromIndex: number, toIndex: number) => void;
  sortCharsByCost: () => void;

  // Validation helpers
  canAddChar: (card: CharacterCard) => AddCheckResult;
  canAddMission: (card: MissionCard) => AddCheckResult;

  // Persistence
  saveDeck: () => Promise<void>;
  loadSavedDecks: () => Promise<void>;
  loadDeck: (deckId: string, allChars: CharacterCard[], allMissions: MissionCard[]) => Promise<void>;
  deleteDeck: (deckId: string) => Promise<void>;
}

export type { AddCheckResult };

/**
 * Normalize a card ID for version comparison.
 * All variants of the same card number count as the same version:
 * KS-108-R, KS-108-RA, KS-108-MV, KS-108-SV → all normalize to "KS-108"
 * Max 2 copies total across ALL variants of the same card number.
 */
function normalizeVersionId(id: string): string {
  // Extract set + number: "KS-108-R" → "KS-108", "KS-108-RA" → "KS-108"
  const match = id.match(/^(KS-\d+)/);
  if (match) return match[1];
  // Legacy format fallback: strip suffix
  return id.replace(/\s*A$/, '').trim();
}

export const useDeckBuilderStore = create<DeckBuilderStore>((set, get) => ({
  // Initial state
  deckName: '',
  deckChars: [],
  deckMissions: [],
  savedDecks: [],
  isLoading: false,
  isSaving: false,
  loadedDeckId: null,
  addError: null,
  addErrorKey: null,
  addErrorParams: null,

  setDeckName: (name: string) => {
    set({ deckName: name });
  },

  canAddChar: (card: CharacterCard): AddCheckResult => {
    const { deckChars } = get();
    const baseVersion = normalizeVersionId(card.id);
    const count = deckChars.filter(
      (c) => normalizeVersionId(c.id) === baseVersion,
    ).length;
    if (count >= MAX_COPIES_PER_VERSION) {
      return { allowed: false, reason: `Max ${MAX_COPIES_PER_VERSION} copies of ${card.name_fr}`, reasonKey: 'deckBuilder.error.maxCopies', reasonParams: { max: MAX_COPIES_PER_VERSION, name: card.name_fr } };
    }
    return { allowed: true };
  },

  canAddMission: (card: MissionCard): AddCheckResult => {
    const { deckMissions } = get();
    if (deckMissions.length >= MISSION_CARDS_PER_PLAYER) {
      return { allowed: false, reason: `Max ${MISSION_CARDS_PER_PLAYER} missions`, reasonKey: 'deckBuilder.error.maxMissions', reasonParams: { max: MISSION_CARDS_PER_PLAYER } };
    }
    if (deckMissions.some((m) => m.id === card.id)) {
      return { allowed: false, reason: `${card.name_fr} already in deck`, reasonKey: 'deckBuilder.error.alreadyInDeck', reasonParams: { name: card.name_fr } };
    }
    return { allowed: true };
  },

  addChar: (card: CharacterCard) => {
    const check = get().canAddChar(card);
    if (!check.allowed) {
      set({ addError: check.reason || null, addErrorKey: check.reasonKey || null, addErrorParams: check.reasonParams || null });
      return;
    }
    set({ deckChars: [...get().deckChars, card], addError: null, addErrorKey: null, addErrorParams: null });
  },

  removeChar: (index: number) => {
    const { deckChars } = get();
    const updated = [...deckChars];
    updated.splice(index, 1);
    set({ deckChars: updated });
  },

  addMission: (card: MissionCard) => {
    const check = get().canAddMission(card);
    if (!check.allowed) {
      set({ addError: check.reason || null, addErrorKey: check.reasonKey || null, addErrorParams: check.reasonParams || null });
      return;
    }
    set({ deckMissions: [...get().deckMissions, card], addError: null, addErrorKey: null, addErrorParams: null });
  },

  removeMission: (index: number) => {
    const { deckMissions } = get();
    const updated = [...deckMissions];
    updated.splice(index, 1);
    set({ deckMissions: updated });
  },

  clearDeck: () => {
    set({
      deckName: '',
      deckChars: [],
      deckMissions: [],
      loadedDeckId: null,
      addError: null,
    });
  },

  clearAddError: () => {
    set({ addError: null, addErrorKey: null, addErrorParams: null });
  },

  reorderChars: (fromIndex: number, toIndex: number) => {
    const { deckChars } = get();
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= deckChars.length) return;
    if (toIndex < 0 || toIndex >= deckChars.length) return;
    const updated = [...deckChars];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    set({ deckChars: updated });
  },

  sortCharsByCost: () => {
    const { deckChars } = get();
    const sorted = [...deckChars].sort((a, b) => {
      const costDiff = (a.chakra ?? 0) - (b.chakra ?? 0);
      if (costDiff !== 0) return costDiff;
      return a.name_fr.localeCompare(b.name_fr);
    });
    set({ deckChars: sorted });
  },

  saveDeck: async () => {
    const { deckName, deckChars, deckMissions, loadedDeckId } = get();

    const name = deckName.trim() || 'Untitled Deck';
    const cardIds = deckChars.map((c) => c.id);
    const missionIds = deckMissions.map((m) => m.id);

    set({ isSaving: true });

    try {
      if (loadedDeckId) {
        // Update existing deck
        const res = await fetch(`/api/decks/${loadedDeckId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, cardIds, missionIds }),
          credentials: 'include',
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to update deck');
        }
      } else {
        // Create new deck
        const res = await fetch('/api/decks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, cardIds, missionIds }),
          credentials: 'include',
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to save deck');
        }

        const created = await res.json();
        set({ loadedDeckId: created.id });
      }

      // Refresh the saved decks list
      await get().loadSavedDecks();
    } finally {
      set({ isSaving: false });
    }
  },

  loadSavedDecks: async () => {
    set({ isLoading: true });

    try {
      const res = await fetch('/api/decks', { credentials: 'include' });

      if (!res.ok) {
        // If unauthorized or error, just clear the list
        set({ savedDecks: [] });
        return;
      }

      const data = await res.json();
      const decks: SavedDeck[] = data.map((d: Record<string, unknown>) => ({
        id: d.id as string,
        name: d.name as string,
        cardIds: d.cardIds as string[],
        missionIds: d.missionIds as string[],
      }));

      set({ savedDecks: decks });
    } finally {
      set({ isLoading: false });
    }
  },

  loadDeck: async (
    deckId: string,
    allChars: CharacterCard[],
    allMissions: MissionCard[],
  ) => {
    set({ isLoading: true });

    try {
      const res = await fetch(`/api/decks/${deckId}`, { credentials: 'include' });

      if (!res.ok) {
        throw new Error('Failed to load deck');
      }

      const data = await res.json();
      const { name, cardIds, missionIds } = data as {
        name: string;
        cardIds: string[];
        missionIds: string[];
      };

      // Resolve card IDs back to full card objects (supports old IDs via fallback)
      const charMap = new Map(allChars.map((c) => [c.id, c]));
      const missionMap = new Map(allMissions.map((m) => [m.id, m]));

      const resolvedChars: CharacterCard[] = [];
      for (const id of cardIds) {
        const resolved = resolveCardId(id);
        const card = charMap.get(resolved);
        if (card) resolvedChars.push(card);
      }

      const resolvedMissions: MissionCard[] = [];
      for (const id of missionIds) {
        const resolved = resolveCardId(id);
        const card = missionMap.get(resolved);
        if (card) resolvedMissions.push(card);
      }

      set({
        deckName: name,
        deckChars: resolvedChars,
        deckMissions: resolvedMissions,
        loadedDeckId: deckId,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  deleteDeck: async (deckId: string) => {
    try {
      const res = await fetch(`/api/decks/${deckId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete deck');
      }

      // If the deleted deck is the currently loaded one, clear the editor
      const { loadedDeckId } = get();
      if (loadedDeckId === deckId) {
        get().clearDeck();
      }

      // Refresh the saved decks list
      await get().loadSavedDecks();
    } catch {
      // Re-throw so UI can handle
      throw new Error('Failed to delete deck');
    }
  },
}));
