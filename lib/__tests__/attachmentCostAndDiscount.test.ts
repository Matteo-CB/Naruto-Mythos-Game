import { describe, it, expect } from 'vitest';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { getPlayableAttachments } from '@/lib/data/cardLoader';
import type { CharacterCard, GameState } from '@/lib/engine/types';

function boardWithRasa(): GameState {
  const state = buildSimState({
    p1: [simChar('SS-051-UC', { owner: 'player1', instanceId: 'rasa' })],
    missions: 2,
    chakra1: 30,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  return state;
}

describe('attachments print their cost on the spiral and their power on the shuriken', () => {
  it('the values match the printed card, not the other way round', () => {
    const expected: Record<string, { chakra: number; power: number }> = {
      'SS-082-C': { chakra: 1, power: 1 },
      'SS-085-UC': { chakra: 2, power: 3 },
      'SS-089-UC': { chakra: 2, power: 3 },
      'SS-092-C': { chakra: 1, power: 2 },
      'SS-099-UC': { chakra: 3, power: 3 },
      'SS-108-C': { chakra: 1, power: 0 },
    };

    for (const attachment of getPlayableAttachments()) {
      const want = expected[attachment.id];
      if (!want) continue;
      expect({ chakra: attachment.chakra, power: attachment.power }, attachment.id).toEqual(want);
    }
  });

  it('no attachment costs more than it gives, which was the swapped-values symptom', () => {
    // Only a character attachment that actually grants Power obeys this: one that hangs on an
    // enemy, or on a mission, or that deliberately weighs its host down, prints 0 or less.
    const donneDeLaPuissance = getPlayableAttachments().filter(
      (a) => a.attach_to !== 'mission' && (a.power ?? 0) > 0,
    );
    const swapped = donneDeLaPuissance.filter((a) => (a.chakra ?? 0) > (a.power ?? 0) + 1);
    expect(swapped.map((a) => a.id)).toEqual([]);
  });

  it('an attachment that costs Chakra without granting Power hangs on an enemy, on a mission, or trains its host', () => {
    for (const a of getPlayableAttachments()) {
      if ((a.power ?? 0) > 0) continue;
      const ligne = (a.effects ?? []).find((e) => e.type === 'ATTACH')?.description ?? '';
      const justifie = a.attach_to === 'mission'
        || /enemy/i.test(ligne)
        || (a.power ?? 0) < 0
        || (a.chakra ?? 0) <= 1;
      expect(justifie, `${a.id} coute ${a.chakra} et ne donne aucune puissance`).toBe(true);
    }
  });
});

describe('Rasa only discounts Sand Village characters', () => {
  it('a Sand Village character costs one less', () => {
    const state = boardWithRasa();
    const character = getCardById('SS-046-UC') as CharacterCard;
    const printed = character.chakra;
    expect(calculateEffectiveCost(state, 'player1', character, 0, false)).toBe(Math.max(0, printed - 1));
  });

  it('a Sand Village attachment keeps its printed cost', () => {
    const state = boardWithRasa();
    for (const id of ['SS-085-UC', 'SS-089-UC', 'SS-092-C']) {
      const attachment = getCardById(id) as unknown as CharacterCard;
      expect(attachment.group, id).toBe('Sand Village');
      expect(calculateEffectiveCost(state, 'player1', attachment, 0, false), id).toBe(attachment.chakra);
    }
  });
});
