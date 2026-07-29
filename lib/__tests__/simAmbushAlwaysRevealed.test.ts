import { describe, it, expect } from 'vitest';
import { getAllCards } from '@/lib/data/cardLoader';
import { getScenario } from '@/lib/cards/sim/scenarios';

describe('an AMBUSH effect is always demonstrated by revealing a face down card', () => {
  it('no ambush scenario plays the card face up', () => {
    const offenders: string[] = [];

    for (const card of getAllCards()) {
      const effects = card.effects ?? [];
      effects.forEach((effect, index) => {
        if (effect.type !== 'AMBUSH') return;
        const scenario = getScenario(card.id, index);
        if (!scenario) {
          offenders.push(`${card.id}#${index} has no scenario at all`);
          return;
        }
        if (scenario.play.action.type !== 'REVEAL_CHARACTER') {
          offenders.push(`${card.id}#${index} plays ${scenario.play.action.type} instead of revealing`);
        }
      });
    }

    expect(
      offenders,
      `an AMBUSH only happens on a reveal, so the demo must reveal:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
