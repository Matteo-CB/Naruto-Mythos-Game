'use client';

import { create } from 'zustand';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import { MAX_COPIES_PER_VERSION, MISSION_CARDS_PER_PLAYER } from '@/lib/engine/types';
import { resolveCardId } from '@/lib/data/cardLoader';
import { compareBySetOrder } from '@/lib/cards/order';
import { computeDeckEvolvingPoints, isEvolvingCompatible } from '@/lib/evolving/computePoints';
import { isLockedVariantCard } from '@/lib/variants/isVariant';
import { isHoloId, holoBaseId, holoIdFor, isHoloEligibleCard } from '@/lib/holo/holoId';
import { cardVersionKey } from '@/lib/cards/versionKey';
import { useToastStore } from '@/stores/toastStore';

interface SavedDeck {
  id: string;
  name: string;
  cardIds: string[];
  missionIds: string[];
  evolvingPoints: number;
  evolvingCompatible: boolean;
}

interface AddCheckResult {
  allowed: boolean;
  reason?: string;
  reasonKey?: string;
  reasonParams?: Record<string, string | number>;
}

interface DeckBuilderStore {

  deckName: string;
  deckChars: CharacterCard[];
  deckMissions: MissionCard[];


  savedDecks: SavedDeck[];
  isLoading: boolean;
  isSaving: boolean;


  loadedDeckId: string | null;

  isDirty: boolean;


  addError: string | null;
  addErrorKey: string | null;
  addErrorParams: Record<string, string | number> | null;

  evolvingMode: boolean;

  unlockedVariantIds: Set<string>;


  setDeckName: (name: string) => void;
  addChar: (card: CharacterCard) => void;
  removeChar: (index: number) => void;
  toggleCharHolo: (index: number) => void;
  canUseHolo: (card: CharacterCard) => boolean;
  removeLockedVariants: () => number;
  addMission: (card: MissionCard) => void;
  removeMission: (index: number) => void;
  clearDeck: () => void;
  clearAddError: () => void;
  reorderChars: (fromIndex: number, toIndex: number) => void;
  sortCharsByCost: () => void;
  sortCharsByName: () => void;
  setEvolvingMode: (on: boolean) => void;
  setUnlockedVariantIds: (ids: Set<string>) => void;


  canAddChar: (card: CharacterCard) => AddCheckResult;
  canAddMission: (card: MissionCard) => AddCheckResult;
  computeCurrentEvolvingPoints: () => number;
  isCurrentDeckEvolvingCompatible: () => boolean;


  saveDeck: () => Promise<void>;
  loadSavedDecks: () => Promise<void>;
  loadDeck: (deckId: string, allChars: CharacterCard[], allMissions: MissionCard[]) => Promise<void>;
  duplicateDeck: (deckId: string, allChars: CharacterCard[], allMissions: MissionCard[], copySuffix: string) => Promise<void>;
  deleteDeck: (deckId: string) => Promise<void>;
}

export type { AddCheckResult };


function normalizeVersionId(id: string): string {
  return cardVersionKey(id);
}

export const useDeckBuilderStore = create<DeckBuilderStore>((set, get) => ({
  
  deckName: '',
  deckChars: [],
  deckMissions: [],
  savedDecks: [],
  isLoading: false,
  isSaving: false,
  loadedDeckId: null,
  isDirty: false,
  addError: null,
  addErrorKey: null,
  addErrorParams: null,
  evolvingMode: false,
  unlockedVariantIds: new Set<string>(),

  setUnlockedVariantIds: (ids: Set<string>) => {
    set({ unlockedVariantIds: ids });
  },

  setEvolvingMode: (on: boolean) => {
    set({ evolvingMode: on });
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('nmtcg-deckbuilder-evolving-mode', on ? '1' : '0');
      }
    } catch { /* ignore */ }
  },

  computeCurrentEvolvingPoints: () => {
    const { deckChars } = get();
    return computeDeckEvolvingPoints(deckChars.map((c) => c.id));
  },

  isCurrentDeckEvolvingCompatible: () => {
    const { deckChars, deckMissions } = get();
    return isEvolvingCompatible(
      deckChars.map((c) => c.id),
      deckMissions.map((m) => m.id),
    );
  },

  setDeckName: (name: string) => {
    set({ deckName: name, isDirty: true });
  },

  canAddChar: (card: CharacterCard): AddCheckResult => {
    const { deckChars, unlockedVariantIds } = get();
    if (isLockedVariantCard(card) && !unlockedVariantIds.has(card.id)) {
      return {
        allowed: false,
        reason: 'Variant locked',
        reasonKey: 'deckBuilder.error.variantLocked',
      };
    }
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
    if (deckMissions.some((m) => normalizeVersionId(m.id) === normalizeVersionId(card.id))) {
      return { allowed: false, reason: `${card.name_fr} already in deck`, reasonKey: 'deckBuilder.error.alreadyInDeck', reasonParams: { name: card.name_fr } };
    }
    return { allowed: true };
  },

  addChar: (card: CharacterCard) => {
    const check = get().canAddChar(card);
    if (!check.allowed) {
      set({ addError: check.reason || null, addErrorKey: check.reasonKey || null, addErrorParams: check.reasonParams || null });
      if (check.reasonKey === 'deckBuilder.error.variantLocked') {
        useToastStore.getState().showToast({
          type: 'info',
          messageKey: 'collection.lockedToastMessage',
          dedupeKey: `variant-locked-${card.id}`,
          durationMs: 3500,
        });
      }
      return;
    }
    set({ deckChars: [...get().deckChars, card], addError: null, addErrorKey: null, addErrorParams: null, isDirty: true });
  },

  removeChar: (index: number) => {
    const { deckChars } = get();
    const updated = [...deckChars];
    updated.splice(index, 1);
    set({ deckChars: updated, isDirty: true });
  },

  canUseHolo: (card: CharacterCard): boolean => {
    if (!isHoloEligibleCard(card)) return false;
    return get().unlockedVariantIds.has(holoIdFor(card.id));
  },

  toggleCharHolo: (index: number) => {
    const { deckChars } = get();
    const card = deckChars[index];
    if (!card) return;
    if (card.isHolo) {
      const updated = [...deckChars];
      updated[index] = { ...card, isHolo: false };
      set({ deckChars: updated, isDirty: true });
      return;
    }
    if (!isHoloEligibleCard(card)) return;
    if (!get().canUseHolo(card)) {
      useToastStore.getState().showToast({
        type: 'info',
        messageKey: 'deckBuilder.holoLockedToast',
        dedupeKey: `holo-locked-${card.id}`,
        durationMs: 3500,
      });
      return;
    }
    const updated = [...deckChars];
    updated[index] = { ...card, isHolo: true };
    set({ deckChars: updated, isDirty: true });
  },

  removeLockedVariants: () => {
    const { deckChars, unlockedVariantIds } = get();
    let downgraded = 0;
    const kept = deckChars
      .filter((c) => !(isLockedVariantCard(c) && !unlockedVariantIds.has(c.id)))
      .map((c) => {
        if (c.isHolo && !unlockedVariantIds.has(holoIdFor(c.id))) {
          downgraded++;
          return { ...c, isHolo: false };
        }
        return c;
      });
    const removed = deckChars.length - kept.length;
    if (removed > 0 || downgraded > 0) set({ deckChars: kept, isDirty: true });
    return removed + downgraded;
  },

  addMission: (card: MissionCard) => {
    const check = get().canAddMission(card);
    if (!check.allowed) {
      set({ addError: check.reason || null, addErrorKey: check.reasonKey || null, addErrorParams: check.reasonParams || null });
      return;
    }
    set({ deckMissions: [...get().deckMissions, card], addError: null, addErrorKey: null, addErrorParams: null, isDirty: true });
  },

  removeMission: (index: number) => {
    const { deckMissions } = get();
    const updated = [...deckMissions];
    updated.splice(index, 1);
    set({ deckMissions: updated, isDirty: true });
  },

  clearDeck: () => {
    set({
      deckName: '',
      deckChars: [],
      deckMissions: [],
      loadedDeckId: null,
      isDirty: false,
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
      const nameDiff = a.name_fr.localeCompare(b.name_fr);
      if (nameDiff !== 0) return nameDiff;
      return compareBySetOrder(a, b);
    });
    set({ deckChars: sorted });
  },

  sortCharsByName: () => {
    const { deckChars } = get();
    const sorted = [...deckChars].sort((a, b) => {
      const nameDiff = a.name_fr.localeCompare(b.name_fr);
      if (nameDiff !== 0) return nameDiff;
      const costDiff = (a.chakra ?? 0) - (b.chakra ?? 0);
      if (costDiff !== 0) return costDiff;
      return compareBySetOrder(a, b);
    });
    set({ deckChars: sorted });
  },

  saveDeck: async () => {
    const { deckName, deckChars, deckMissions, loadedDeckId } = get();

    const name = deckName.trim() || 'Untitled Deck';
    const cardIds = deckChars.map((c) => (c.isHolo ? holoIdFor(c.id) : c.id));
    const missionIds = deckMissions.map((m) => m.id);

    set({ isSaving: true });

    const throwApiError = (data: { error?: string; errorKey?: string }, fallback: string) => {
      const err = new Error(data.error || fallback) as Error & { errorKey?: string };
      if (typeof data.errorKey === 'string') err.errorKey = data.errorKey;
      throw err;
    };

    try {
      if (loadedDeckId) {
        const res = await fetch(`/api/decks/${loadedDeckId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, cardIds, missionIds }),
          credentials: 'include',
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throwApiError(data, 'Failed to update deck');
        }
        set({ isDirty: false });
      } else {
        const res = await fetch('/api/decks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, cardIds, missionIds }),
          credentials: 'include',
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throwApiError(data, 'Failed to save deck');
        }

        const created = await res.json();
        set({ loadedDeckId: created.id, isDirty: false });
      }

      
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
        
        set({ savedDecks: [] });
        return;
      }

      const data = await res.json();
      const decks: SavedDeck[] = data.map((d: Record<string, unknown>) => ({
        id: d.id as string,
        name: d.name as string,
        cardIds: d.cardIds as string[],
        missionIds: d.missionIds as string[],
        evolvingPoints: typeof d.evolvingPoints === 'number' ? d.evolvingPoints : 0,
        evolvingCompatible: d.evolvingCompatible === true,
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

      
      const charMap = new Map(allChars.map((c) => [c.id, c]));
      const missionMap = new Map(allMissions.map((m) => [m.id, m]));

      const resolvedChars: CharacterCard[] = [];
      for (const id of cardIds) {
        const holo = isHoloId(id);
        const resolved = resolveCardId(holoBaseId(id));
        const card = charMap.get(resolved);
        if (card) resolvedChars.push(holo ? { ...card, isHolo: true } : card);
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
        isDirty: false,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  duplicateDeck: async (
    deckId: string,
    allChars: CharacterCard[],
    allMissions: MissionCard[],
    copySuffix: string,
  ) => {
    await get().loadDeck(deckId, allChars, allMissions);
    const { deckName } = get();
    set({
      loadedDeckId: null,
      deckName: `${deckName} ${copySuffix}`.slice(0, 100),
      isDirty: true,
    });
  },

  deleteDeck: async (deckId: string) => {
    const res = await fetch(`/api/decks/${deckId}`, {
      method: 'DELETE',
      credentials: 'include',
    }).catch(() => null);

    if (!res) {
      const err = new Error('Failed to delete deck') as Error & { errorKey?: string };
      err.errorKey = 'deckBuilder.failedToDelete';
      throw err;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const err = new Error(data.error || 'Failed to delete deck') as Error & { errorKey?: string };
      err.errorKey = typeof data.errorKey === 'string' ? data.errorKey : 'deckBuilder.failedToDelete';
      throw err;
    }

    const { loadedDeckId } = get();
    if (loadedDeckId === deckId) {
      get().clearDeck();
    }

    await get().loadSavedDecks();
  },
}));
