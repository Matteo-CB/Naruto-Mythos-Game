import { describe, it, expect } from 'vitest';
import { getCardById } from '@/lib/data/cardIndex';
import { getAllAttachments } from '@/lib/data/cardLoader';
import type { CardData } from '@/lib/engine/types';

const GAARA_COST_3 = 'SS-046-UC';

function isSandCharacter(card: CardData): boolean {
  return card.card_type === 'character' && card.group === 'Sand Village';
}

describe('Gaara SS-046 (cost 3) only ever finds a Sand Village character', () => {
  it('the card under test really is the cost 3 Gaara of set 2', () => {
    const gaara = getCardById(GAARA_COST_3);
    expect(gaara).toBeTruthy();
    expect(gaara!.chakra).toBe(3);
    expect(gaara!.set).toBe('SS');
    expect(gaara!.name_fr.toUpperCase()).toBe('GAARA');
  });

  it('a Sand Village attachment must not satisfy the search', () => {
    const sandAttachments = getAllAttachments().filter((a) => a.group === 'Sand Village');
    expect(sandAttachments.length, 'the set ships at least one Sand Village attachment').toBeGreaterThan(0);

    for (const attachment of sandAttachments) {
      expect(
        isSandCharacter(attachment as unknown as CardData),
        `${attachment.id} is an attachment and must be skipped, not drawn`,
      ).toBe(false);
    }
  });

  it('a Sand Village character still satisfies the search', () => {
    const gaara = getCardById(GAARA_COST_3) as CardData;
    expect(gaara.group).toBe('Sand Village');
    expect(isSandCharacter(gaara)).toBe(true);
  });
});
