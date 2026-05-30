import { describe, it, expect, beforeEach } from 'vitest';
import type { CharacterCard } from '@/lib/engine/types';
import { useDeckBuilderStore } from '@/stores/deckBuilderStore';

function mockChar(id: string, rarity: CharacterCard['rarity']): CharacterCard {
  return {
    id,
    cardId: id,
    set: 'KS',
    number: parseInt(id.split('-')[1], 10) || 0,
    name_fr: id,
    title_fr: '',
    name_en: id,
    title_en: '',
    rarity,
    card_type: 'character',
    has_visual: true,
    chakra: 1,
    power: 1,
    keywords: [],
    group: '',
    effects: [],
  };
}

describe('deckBuilderStore variant lock', () => {
  beforeEach(() => {
    useDeckBuilderStore.getState().clearDeck();
    useDeckBuilderStore.getState().setUnlockedVariantIds(new Set<string>());
  });

  it('refuses to add a locked variant', () => {
    const card = mockChar('KS-133-MV', 'MV');
    useDeckBuilderStore.getState().addChar(card);
    const state = useDeckBuilderStore.getState();
    expect(state.deckChars).toHaveLength(0);
    expect(state.addErrorKey).toBe('deckBuilder.error.variantLocked');
  });

  it('accepts a non-variant card unchanged', () => {
    const card = mockChar('KS-104-R', 'R');
    useDeckBuilderStore.getState().addChar(card);
    expect(useDeckBuilderStore.getState().deckChars).toHaveLength(1);
    expect(useDeckBuilderStore.getState().addErrorKey).toBeNull();
  });

  it('accepts an unlocked variant', () => {
    useDeckBuilderStore.getState().setUnlockedVariantIds(new Set(['KS-133-MV']));
    const card = mockChar('KS-133-MV', 'MV');
    useDeckBuilderStore.getState().addChar(card);
    expect(useDeckBuilderStore.getState().deckChars).toHaveLength(1);
    expect(useDeckBuilderStore.getState().addErrorKey).toBeNull();
  });

  it('canAddChar returns the locked reason without mutating deck', () => {
    const card = mockChar('KS-117-L', 'L');
    const result = useDeckBuilderStore.getState().canAddChar(card);
    expect(result.allowed).toBe(false);
    expect(result.reasonKey).toBe('deckBuilder.error.variantLocked');
    expect(useDeckBuilderStore.getState().deckChars).toHaveLength(0);
  });

  it('rejects a locked variant even with 0 prior copies (priority over copy cap check)', () => {
    const card = mockChar('KS-140-SV', 'SV');
    const result = useDeckBuilderStore.getState().canAddChar(card);
    expect(result.allowed).toBe(false);
    expect(result.reasonKey).toBe('deckBuilder.error.variantLocked');
  });
});
