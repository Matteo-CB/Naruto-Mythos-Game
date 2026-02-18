'use client';

import { create } from 'zustand';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import { MAX_COPIES_PER_VERSION, MISSION_CARDS_PER_PLAYER } from '@/lib/engine/types';

interface SavedDeck {
  id: string;
  name: string;
  cardIds: string[];
  missionIds: string[];
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

  // Actions
  setDeckName: (name: string) => void;
  addChar: (card: CharacterCard) => void;
  removeChar: (index: number) => void;
  addMission: (card: MissionCard) => void;
  removeMission: (index: number) => void;
  clearDeck: () => void;

  // Persistence
  saveDeck: () => Promise<void>;
  loadSavedDecks: () => Promise<void>;
  loadDeck: (deckId: string, allChars: CharacterCard[], allMissions: MissionCard[]) => Promise<void>;
  deleteDeck: (deckId: string) => Promise<void>;
}

/**
 * Normalize a card ID for version comparison.
 * Rare Art variants (suffix " A") are treated as the same version
 * as the base card, per deck construction rules.
 */
function normalizeVersionId(id: string): string {
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

  setDeckName: (name: string) => {
    set({ deckName: name });
  },

  addChar: (card: CharacterCard) => {
    const { deckChars } = get();

    // Enforce max 2 copies of the same version (RA variants normalized)
    const baseVersion = normalizeVersionId(card.id);
    const count = deckChars.filter(
      (c) => normalizeVersionId(c.id) === baseVersion,
    ).length;

    if (count >= MAX_COPIES_PER_VERSION) return;

    set({ deckChars: [...deckChars, card] });
  },

  removeChar: (index: number) => {
    const { deckChars } = get();
    const updated = [...deckChars];
    updated.splice(index, 1);
    set({ deckChars: updated });
  },

  addMission: (card: MissionCard) => {
    const { deckMissions } = get();

    // Enforce max 3 missions
    if (deckMissions.length >= MISSION_CARDS_PER_PLAYER) return;

    // No duplicate mission IDs
    if (deckMissions.some((m) => m.id === card.id)) return;

    set({ deckMissions: [...deckMissions, card] });
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
    });
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
      const res = await fetch('/api/decks');

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
      const res = await fetch(`/api/decks/${deckId}`);

      if (!res.ok) {
        throw new Error('Failed to load deck');
      }

      const data = await res.json();
      const { name, cardIds, missionIds } = data as {
        name: string;
        cardIds: string[];
        missionIds: string[];
      };

      // Resolve card IDs back to full card objects
      const charMap = new Map(allChars.map((c) => [c.id, c]));
      const missionMap = new Map(allMissions.map((m) => [m.id, m]));

      const resolvedChars: CharacterCard[] = [];
      for (const id of cardIds) {
        const card = charMap.get(id);
        if (card) resolvedChars.push(card);
      }

      const resolvedMissions: MissionCard[] = [];
      for (const id of missionIds) {
        const card = missionMap.get(id);
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
