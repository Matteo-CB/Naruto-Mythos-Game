import { describe, it, expect } from 'vitest';
import cardsJson from '@/lib/data/sets/KS/cards.json';

const ALTERATION_REGEX = /(?:^|\s)(?:MAIN|AMBUSH|UPGRADE|SCORE)\s+effect\b/;

function isAlteration(description: string): boolean {
  return ALTERATION_REGEX.test(description);
}

describe('Copy filter — modifiers (effect alterations) are never copyable', () => {
  it('catches every known "X effect: ..." alteration in the card database', () => {
    const allCards = (cardsJson as { cards: Record<string, { id: string; effects?: Array<{ type: string; description: string }> }> }).cards;
    const alterations: Array<{ cardId: string; type: string; description: string }> = [];
    const missed: Array<{ cardId: string; type: string; description: string }> = [];

    for (const [cardId, card] of Object.entries(allCards)) {
      for (const eff of card.effects ?? []) {
        const desc = eff.description ?? '';
        const looksLikeAlteration = /^\s*(MAIN|AMBUSH|UPGRADE|SCORE)\s+effect[\s:,]/i.test(desc);
        if (looksLikeAlteration) {
          alterations.push({ cardId, type: eff.type, description: desc });
          if (!isAlteration(desc)) {
            missed.push({ cardId, type: eff.type, description: desc });
          }
        }
      }
    }

    expect(alterations.length).toBeGreaterThan(0);
    expect(missed).toEqual([]);
  });

  it('does not false-positive on instants that merely mention "instant effect" in their description', () => {
    expect(isAlteration("Copy any non-Upgrade instant effect ([↯]) from the discarded enemy character.")).toBe(false);
    expect(isAlteration("Copy an instant effect ([↯]) of another friendly Sound Four character in play.")).toBe(false);
  });

  it('catches the canonical alteration patterns from real cards', () => {
    expect(isAlteration("MAIN effect: Instead, the cost limit is 3 or less.")).toBe(true);
    expect(isAlteration("MAIN effect: Instead, play the card paying 2 less.")).toBe(true);
    expect(isAlteration("MAIN effect: Instead, play the card paying 4 less.")).toBe(true);
    expect(isAlteration("MAIN effect: In addition, choose 1 card in the opponent's hand and discard it.")).toBe(true);
    expect(isAlteration("MAIN effect: Instead, defeat them.")).toBe(true);
    expect(isAlteration("MAIN effect: Instead, defeat both of them.")).toBe(true);
    expect(isAlteration("AMBUSH effect: Instead, the Power limit is 5 or less.")).toBe(true);
    expect(isAlteration("AMBUSH effect: In addition, discard 1 card. If you do so, choose 1 card in the opponent's hand and discard it.")).toBe(true);
    expect(isAlteration("MAIN effect: Instead, there's no cost limit.")).toBe(true);
    expect(isAlteration("MAIN effect: Instead, discard the top card from your deck.")).toBe(true);
    expect(isAlteration("MAIN effect: Instead, remove all Power tokens and put them on this character.")).toBe(true);
    expect(isAlteration("MAIN effect: After moving them, hide the enemy character.")).toBe(true);
    expect(isAlteration("MAIN effect: POWERUP X where X is the Power of the enemy character that is being hidden.")).toBe(true);
    expect(isAlteration("MAIN effect: In addition, hide one other enemy character with same name and cost less than the defeated character.")).toBe(true);
  });

  it('lets plain instant effects through', () => {
    expect(isAlteration("Defeat an enemy character with Power 1 or less in this mission.")).toBe(false);
    expect(isAlteration("POWERUP 2.")).toBe(false);
    expect(isAlteration("Gain 2 Chakra.")).toBe(false);
    expect(isAlteration("Move this character.")).toBe(false);
    expect(isAlteration("Look at the opponent's hand.")).toBe(false);
    expect(isAlteration("Discard a card.")).toBe(false);
    expect(isAlteration("Hide an enemy character with cost 3 or less in this mission.")).toBe(false);
  });
});
