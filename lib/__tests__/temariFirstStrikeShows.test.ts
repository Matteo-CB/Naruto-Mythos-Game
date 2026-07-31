import { describe, it, expect } from 'vitest';
import { getEffectHandler, initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard } from '@/lib/engine/types';

const TEMARI_FS = 'SS-049-C';

describe('Temari SS-049 carries a real FIRST STRIKE effect', () => {
  it('the card really carries a FIRST_STRIKE effect', () => {
    const card = getCardById(TEMARI_FS) as CharacterCard;
    expect(card).toBeTruthy();
    expect(card.chakra).toBe(2);
    expect((card.effects ?? []).some((e) => e.type === 'FIRST_STRIKE')).toBe(true);
  });

  it('a handler is registered for it', () => {
    initializeRegistry();
    expect(getEffectHandler(TEMARI_FS, 'FIRST_STRIKE' as never)).toBeTruthy();
  });
});
