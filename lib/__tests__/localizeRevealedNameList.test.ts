import { describe, it, expect } from 'vitest';
import { localizeMessageParams } from '@/lib/i18n/localizeMessageParams';
import { getCardById } from '@/lib/data/cardIndex';
import { getCardName } from '@/lib/utils/cardLocale';
import type { CardData } from '@/lib/engine/types';

const FIRST = getCardById('KS-009-C') as CardData;
const SECOND = getCardById('KS-005-C') as CardData;

describe('a log line listing several revealed cards names them in the reader language', () => {
  it('every name in the list is translated', () => {
    const value = `${FIRST.name_fr}, ${SECOND.name_fr}`;
    const out = localizeMessageParams({ card: 'GAARA', id: 'SS-046-UC', revealed: value }, 'ja');

    expect(out?.revealed, 'both names follow the reader locale')
      .toBe(`${getCardName(FIRST, 'ja')}, ${getCardName(SECOND, 'ja')}`);
  });

  it('a single name still works', () => {
    const out = localizeMessageParams({ revealed: FIRST.name_fr as string }, 'ja');
    expect(out?.revealed).toBe(getCardName(FIRST, 'ja'));
  });

  it('a placeholder that is not a card list is left untouched', () => {
    expect(localizeMessageParams({ revealed: '-' }, 'ja')?.revealed, 'nothing to translate').toBe('-');
    expect(localizeMessageParams({ revealed: 'aucune carte' }, 'ja')?.revealed, 'free text stays as written')
      .toBe('aucune carte');
  });

  it('a partly unknown list is left untouched rather than half translated', () => {
    const mixed = `${FIRST.name_fr}, CARTE INCONNUE`;
    expect(localizeMessageParams({ revealed: mixed }, 'ja')?.revealed, 'all or nothing').toBe(mixed);
  });

  it('French readers keep the original value', () => {
    const value = `${FIRST.name_fr}, ${SECOND.name_fr}`;
    expect(localizeMessageParams({ revealed: value }, 'fr')?.revealed).toBe(value);
  });
});
