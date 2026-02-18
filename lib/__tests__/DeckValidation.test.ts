import { describe, it, expect } from 'vitest';
import { validateDeck } from '../engine/rules/DeckValidation';
import { mockCharacter, mockMission, createTestDeck } from './testHelpers';

describe('Deck Validation', () => {
  it('should accept a valid deck', () => {
    const deck = createTestDeck(30);
    const missions = [mockMission(), mockMission({ id: 'MSS 02' }), mockMission({ id: 'MSS 03' })];

    const result = validateDeck(deck, missions);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should reject a deck with fewer than 30 character cards', () => {
    const deck = createTestDeck(25);
    const missions = [mockMission(), mockMission({ id: 'MSS 02' }), mockMission({ id: 'MSS 03' })];

    const result = validateDeck(deck, missions);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('at least 30'))).toBe(true);
  });

  it('should reject a deck without exactly 3 missions', () => {
    const deck = createTestDeck(30);
    const missions = [mockMission(), mockMission({ id: 'MSS 02' })]; // Only 2

    const result = validateDeck(deck, missions);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('exactly 3'))).toBe(true);
  });

  it('should reject a deck with more than 2 copies of the same version', () => {
    const deck = createTestDeck(27);
    // Add 3 copies of the same card
    const duplicate = mockCharacter({ id: '001/130', name_fr: 'Hiruzen' });
    deck.push(duplicate, duplicate, duplicate);

    const missions = [mockMission(), mockMission({ id: 'MSS 02' }), mockMission({ id: 'MSS 03' })];

    const result = validateDeck(deck, missions);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Too many copies'))).toBe(true);
  });

  it('should treat RA variants as the same version (strip A suffix)', () => {
    const deck = createTestDeck(28);
    // Add 1 normal + 1 RA of the same card (should be 2 of same version)
    const normal = mockCharacter({ id: '108/130', name_fr: 'Naruto' });
    const rareArt = mockCharacter({ id: '108/130 A', name_fr: 'Naruto', is_rare_art: true });
    deck.push(normal, rareArt);

    const missions = [mockMission(), mockMission({ id: 'MSS 02' }), mockMission({ id: 'MSS 03' })];

    const result = validateDeck(deck, missions);
    expect(result.valid).toBe(true); // 2 copies of same version = OK
  });

  it('should reject 3 copies even when mixing normal and RA', () => {
    const deck = createTestDeck(27);
    const normal = mockCharacter({ id: '108/130', name_fr: 'Naruto' });
    const rareArt = mockCharacter({ id: '108/130 A', name_fr: 'Naruto', is_rare_art: true });
    deck.push(normal, normal, rareArt); // 3 copies of version 108/130

    const missions = [mockMission(), mockMission({ id: 'MSS 02' }), mockMission({ id: 'MSS 03' })];

    const result = validateDeck(deck, missions);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Too many copies'))).toBe(true);
  });

  it('should allow different versions of the same character', () => {
    const deck = createTestDeck(26);
    // Different versions (different card numbers)
    deck.push(
      mockCharacter({ id: '074/130', name_fr: 'Gaara', chakra: 2 }),
      mockCharacter({ id: '074/130', name_fr: 'Gaara', chakra: 2 }),
      mockCharacter({ id: '075/130', name_fr: 'Gaara', chakra: 4 }),
      mockCharacter({ id: '075/130', name_fr: 'Gaara', chakra: 4 }),
    );

    const missions = [mockMission(), mockMission({ id: 'MSS 02' }), mockMission({ id: 'MSS 03' })];

    const result = validateDeck(deck, missions);
    expect(result.valid).toBe(true); // 2 of each version = OK
  });

  it('should reject cards without visuals', () => {
    const deck = createTestDeck(29);
    const noVisual = mockCharacter({
      id: '999/130',
      name_fr: 'No Visual',
      has_visual: false,
    });
    deck.push(noVisual);

    const missions = [mockMission(), mockMission({ id: 'MSS 02' }), mockMission({ id: 'MSS 03' })];

    const result = validateDeck(deck, missions);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not playable'))).toBe(true);
  });

  it('should accept larger decks (no max)', () => {
    const deck = createTestDeck(50);
    const missions = [mockMission(), mockMission({ id: 'MSS 02' }), mockMission({ id: 'MSS 03' })];

    const result = validateDeck(deck, missions);
    expect(result.valid).toBe(true);
  });
});
