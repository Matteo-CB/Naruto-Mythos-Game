import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDeckBuilderStore } from '@/stores/deckBuilderStore';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';

function makeChar(id: string, name = 'Test'): CharacterCard {
  return {
    id,
    name_en: name,
    name_fr: name,
    title_en: 'Title',
    title_fr: 'Title',
    chakra: 1,
    power: 1,
    effects: [],
    rarity: 'C',
    keywords: [],
    group: '',
    card_type: 'character',
    image_file: '',
    has_visual: false,
    set: 'KS',
  } as never;
}

function makeMission(id: string): MissionCard {
  return {
    id,
    name_en: 'Mission',
    name_fr: 'Mission',
    base_points: 1,
    effects: [],
    rarity: 'Mission',
    card_type: 'mission',
    image_file: '',
    has_visual: false,
    set: 'KS',
  } as never;
}

beforeEach(() => {
  useDeckBuilderStore.setState({
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
  });
});

describe('Phase 4 — deckBuilderStore Evolving integration', () => {
  it('computes 0 points for an empty deck', () => {
    expect(useDeckBuilderStore.getState().computeCurrentEvolvingPoints()).toBe(0);
  });

  it('computes 0 points for a deck with only non-Evolving KS cards', () => {
    useDeckBuilderStore.setState({
      deckChars: [makeChar('KS-001-C'), makeChar('KS-002-C'), makeChar('KS-005-C')],
    });
    expect(useDeckBuilderStore.getState().computeCurrentEvolvingPoints()).toBe(0);
  });

  it('computes 2 points for one Sasuke Chidori (2pt per copy)', () => {
    useDeckBuilderStore.setState({
      deckChars: [makeChar('KS-107-R', 'Sasuke')],
    });
    expect(useDeckBuilderStore.getState().computeCurrentEvolvingPoints()).toBe(2);
  });

  it('computes 5 points for 2 Gaara + 1 Hinata', () => {
    useDeckBuilderStore.setState({
      deckChars: [
        makeChar('KS-120-R', 'Gaara'),
        makeChar('KS-120-R', 'Gaara'),
        makeChar('KS-031-UC', 'Hinata'),
      ],
    });
    expect(useDeckBuilderStore.getState().computeCurrentEvolvingPoints()).toBe(5);
  });

  it('computes 1 point flat for 2 Ton Ton', () => {
    useDeckBuilderStore.setState({
      deckChars: [makeChar('KS-101-C'), makeChar('KS-101-C')],
    });
    expect(useDeckBuilderStore.getState().computeCurrentEvolvingPoints()).toBe(1);
  });

  it('isCurrentDeckEvolvingCompatible returns TRUE for empty deck', () => {
    expect(useDeckBuilderStore.getState().isCurrentDeckEvolvingCompatible()).toBe(true);
  });

  it('isCurrentDeckEvolvingCompatible returns TRUE for 5pt KS deck', () => {
    useDeckBuilderStore.setState({
      deckChars: [
        makeChar('KS-120-R'), makeChar('KS-120-R'),
        makeChar('KS-031-UC'),
      ],
      deckMissions: [makeMission('KS-MSS-01')],
    });
    expect(useDeckBuilderStore.getState().isCurrentDeckEvolvingCompatible()).toBe(true);
  });

  it('isCurrentDeckEvolvingCompatible returns FALSE for 6pt deck (over budget)', () => {
    useDeckBuilderStore.setState({
      deckChars: [
        makeChar('KS-107-R'), makeChar('KS-107-R'),
        makeChar('KS-133-S'), makeChar('KS-133-S'),
      ],
    });
    expect(useDeckBuilderStore.getState().isCurrentDeckEvolvingCompatible()).toBe(false);
  });

  it('isCurrentDeckEvolvingCompatible returns FALSE if deck contains a non-KS card', () => {
    useDeckBuilderStore.setState({
      deckChars: [makeChar('KS-001-C'), makeChar('SS-001-C')],
    });
    expect(useDeckBuilderStore.getState().isCurrentDeckEvolvingCompatible()).toBe(false);
  });

  it('isCurrentDeckEvolvingCompatible returns FALSE if mission is from a non-allowed set', () => {
    useDeckBuilderStore.setState({
      deckChars: [makeChar('KS-001-C')],
      deckMissions: [makeMission('SS-MSS-01')],
    });
    expect(useDeckBuilderStore.getState().isCurrentDeckEvolvingCompatible()).toBe(false);
  });
});

describe('Phase 4 — evolvingMode toggle (persisted to localStorage)', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') localStorage.clear();
  });

  it('starts OFF by default', () => {
    expect(useDeckBuilderStore.getState().evolvingMode).toBe(false);
  });

  it('toggles ON when setEvolvingMode(true) called', () => {
    useDeckBuilderStore.getState().setEvolvingMode(true);
    expect(useDeckBuilderStore.getState().evolvingMode).toBe(true);
  });

  it('toggles OFF when setEvolvingMode(false) called', () => {
    useDeckBuilderStore.getState().setEvolvingMode(true);
    useDeckBuilderStore.getState().setEvolvingMode(false);
    expect(useDeckBuilderStore.getState().evolvingMode).toBe(false);
  });

  it('persists "ON" to localStorage', () => {
    if (typeof window === 'undefined') return;
    useDeckBuilderStore.getState().setEvolvingMode(true);
    expect(localStorage.getItem('nmtcg-deckbuilder-evolving-mode')).toBe('1');
  });

  it('persists "OFF" to localStorage', () => {
    if (typeof window === 'undefined') return;
    useDeckBuilderStore.getState().setEvolvingMode(true);
    useDeckBuilderStore.getState().setEvolvingMode(false);
    expect(localStorage.getItem('nmtcg-deckbuilder-evolving-mode')).toBe('0');
  });

  it('does not throw if localStorage is unavailable', () => {
    if (typeof window === 'undefined') return;
    const original = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      value: { setItem: () => { throw new Error('quota'); } },
      writable: true,
    });
    expect(() => useDeckBuilderStore.getState().setEvolvingMode(true)).not.toThrow();
    expect(useDeckBuilderStore.getState().evolvingMode).toBe(true);
    Object.defineProperty(window, 'localStorage', { value: original, writable: true });
  });
});
