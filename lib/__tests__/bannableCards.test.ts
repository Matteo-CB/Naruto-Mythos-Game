import { describe, expect, it } from 'vitest';
import { getBannableCards } from '@/lib/data/bannableCards';
import { getPlayableAttachments, getPlayableCharacters, getPlayableMissions } from '@/lib/data/cardLoader';

describe('the ban list covers every card type a deck can hold', () => {
  it('lists attachments alongside characters and missions', () => {
    const ids = new Set(getBannableCards().map((c) => c.id));

    const attachments = getPlayableAttachments();
    expect(attachments.length, 'set 2 ships attachments, the fixture must not be empty').toBeGreaterThan(0);
    for (const attachment of attachments) {
      expect(ids.has(attachment.id), `attachment ${attachment.id} must be bannable`).toBe(true);
    }
    for (const character of getPlayableCharacters()) {
      expect(ids.has(character.id)).toBe(true);
    }
    for (const mission of getPlayableMissions()) {
      expect(ids.has(mission.id)).toBe(true);
    }
  });

  it('holds no duplicate entry', () => {
    const all = getBannableCards();
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
  });
});
