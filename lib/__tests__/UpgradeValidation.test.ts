import { describe, it, expect } from 'vitest';
import { canUpgradeCharacter } from '../engine/rules/UpgradeValidation';
import { mockCharacter, mockCharInPlay } from './testHelpers';

describe('Upgrade Validation', () => {
  it('should allow upgrading to a same-name higher-cost card', () => {
    const newCard = mockCharacter({ name_fr: 'Naruto', chakra: 5, power: 5 });
    const target = mockCharInPlay({}, { name_fr: 'Naruto', chakra: 3, power: 3 });

    const result = canUpgradeCharacter(newCard, target, 10);
    expect(result.valid).toBe(true);
    expect(result.costDiff).toBe(2);
  });

  it('should reject upgrade with different character name', () => {
    const newCard = mockCharacter({ name_fr: 'Sasuke', chakra: 5, power: 5 });
    const target = mockCharInPlay({}, { name_fr: 'Naruto', chakra: 3, power: 3 });

    const result = canUpgradeCharacter(newCard, target, 10);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Different character');
  });

  it('should reject upgrade with same cost', () => {
    const newCard = mockCharacter({ name_fr: 'Naruto', chakra: 3, power: 4 });
    const target = mockCharInPlay({}, { name_fr: 'Naruto', chakra: 3, power: 3 });

    const result = canUpgradeCharacter(newCard, target, 10);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('strictly higher');
  });

  it('should reject upgrade with lower cost', () => {
    const newCard = mockCharacter({ name_fr: 'Naruto', chakra: 2, power: 2 });
    const target = mockCharInPlay({}, { name_fr: 'Naruto', chakra: 3, power: 3 });

    const result = canUpgradeCharacter(newCard, target, 10);
    expect(result.valid).toBe(false);
  });

  it('should reject upgrade when not enough chakra for difference', () => {
    const newCard = mockCharacter({ name_fr: 'Naruto', chakra: 5, power: 5 });
    const target = mockCharInPlay({}, { name_fr: 'Naruto', chakra: 3, power: 3 });

    const result = canUpgradeCharacter(newCard, target, 1); // Only 1 chakra, need 2
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Not enough chakra');
  });

  it('should compare names case-insensitively', () => {
    const newCard = mockCharacter({ name_fr: 'NARUTO UZUMAKI', chakra: 5, power: 5 });
    const target = mockCharInPlay({}, { name_fr: 'Naruto Uzumaki', chakra: 3, power: 3 });

    const result = canUpgradeCharacter(newCard, target, 10);
    expect(result.valid).toBe(true);
  });

  it('should use the top card of the stack for comparison', () => {
    const bottomCard = mockCharacter({ name_fr: 'Naruto', chakra: 2, power: 2 });
    const topCard = mockCharacter({ name_fr: 'Naruto', chakra: 4, power: 4 });
    const target = mockCharInPlay(
      { stack: [bottomCard, topCard] },
      { name_fr: 'Naruto', chakra: 4, power: 4 },
    );

    // New card must be higher than the top of stack (cost 4), not bottom (cost 2)
    const card3 = mockCharacter({ name_fr: 'Naruto', chakra: 3, power: 3 });
    const result3 = canUpgradeCharacter(card3, target, 10);
    expect(result3.valid).toBe(false); // 3 <= 4

    const card5 = mockCharacter({ name_fr: 'Naruto', chakra: 5, power: 5 });
    const result5 = canUpgradeCharacter(card5, target, 10);
    expect(result5.valid).toBe(true); // 5 > 4, diff = 1
    expect(result5.costDiff).toBe(1);
  });
});
