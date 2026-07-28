import { describe, it, expect } from 'vitest';
import { getCharacterById, getCardById } from '@/lib/data/cardIndex';
import { getAllAttachments, getPlayableAttachments } from '@/lib/data/cardLoader';
import { holoBaseId } from '@/lib/holo/holoId';

describe('attachments are first class deck cards', () => {
  it('the set ships attachments', () => {
    expect(getAllAttachments().length).toBeGreaterThan(0);
  });

  it('every attachment resolves by id, like a character', () => {
    for (const a of getAllAttachments()) {
      expect(getCardById(a.id), `${a.id} must exist in the card index`).toBeTruthy();
      expect(getCharacterById(a.id), `${a.id} must resolve as a deck card`).toBeTruthy();
    }
  });

  it('an online deck submission accepts a deck containing attachments', () => {
    const attachment = getPlayableAttachments()[0];
    expect(attachment, 'at least one playable attachment').toBeTruthy();

    const submitted = [{ id: attachment.id }, { id: 'KS-001-C' }];
    const rejected: string[] = [];
    for (const c of submitted) {
      const canon = getCharacterById(holoBaseId(c.id));
      if (!canon) rejected.push(c.id);
    }

    expect(rejected, 'no card may be rejected as unknown').toEqual([]);
  });

  it('a deck load never silently drops an attachment', () => {
    const attachment = getPlayableAttachments()[0];
    const cardIds = ['KS-001-C', attachment.id, 'KS-003-C'];

    const resolved = cardIds
      .map((id) => getCharacterById(id))
      .filter(Boolean);

    expect(resolved.length, 'every deck entry must survive resolution').toBe(cardIds.length);
  });

  it('a mission attachment resolves too, not only character attachments', () => {
    const missionAttachment = getAllAttachments().find((a) => a.attach_to === 'mission');
    if (!missionAttachment) return;
    expect(getCharacterById(missionAttachment.id)).toBeTruthy();
  });
});
