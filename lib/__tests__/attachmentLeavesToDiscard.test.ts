import { describe, expect, it } from 'vitest';
import { attachCardToCharacter, rescueOrphanedAttachments } from '@/lib/effects/attachments';
import { defeatCharacterInPlay } from '@/lib/effects/defeatUtils';
import { getCardById } from '@/lib/data/cardIndex';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { CardData, GameState } from '@/lib/engine/types';

const ATTACHMENT = 'SS-092-C';

function boardWithAttachment(): GameState {
  let state = buildSimState({
    p1: [simChar('KS-001-C', { owner: 'player1', instanceId: 'host' })],
    missions: 1,
    chakra1: 30,
    edgeHolder: 'player1',
  });
  state = attachCardToCharacter(state, 'player1', getCardById(ATTACHMENT) as CardData, 'host');
  return state;
}

function hostOf(state: GameState) {
  return state.activeMissions[0].player1Characters.find((c) => c.instanceId === 'host');
}

function discardIds(state: GameState): string[] {
  return state.player1.discardPile.map((c) => c.id);
}

describe('an attachment always reaches a discard pile when its host leaves play', () => {
  it('is attached to start with', () => {
    const state = boardWithAttachment();
    expect(hostOf(state)?.attachments?.length).toBe(1);
    expect(discardIds(state)).not.toContain(ATTACHMENT);
  });

  it('goes to the discard pile when the host is defeated', () => {
    const state = boardWithAttachment();
    const after = defeatCharacterInPlay(state, 0, 'host', 'player1Characters', false, 'player1');
    expect(discardIds(after)).toContain(ATTACHMENT);
  });

  it('goes to the discard pile when the host is bounced to hand by any path', () => {
    const before = boardWithAttachment();
    const host = hostOf(before);
    expect(host).toBeDefined();

    const missions = [...before.activeMissions];
    missions[0] = {
      ...missions[0],
      player1Characters: missions[0].player1Characters.filter((c) => c.instanceId !== 'host'),
    };
    const bounced: GameState = {
      ...before,
      activeMissions: missions,
      player1: { ...before.player1, hand: [...before.player1.hand, host!.card] },
    };

    expect(discardIds(bounced)).not.toContain(ATTACHMENT);

    const rescued = rescueOrphanedAttachments(before, bounced);
    expect(discardIds(rescued)).toContain(ATTACHMENT);
    expect(rescued.player1.hand.map((c) => c.id)).not.toContain(ATTACHMENT);
  });

  it('is not duplicated when the removal path already discarded it', () => {
    const before = boardWithAttachment();
    const after = defeatCharacterInPlay(before, 0, 'host', 'player1Characters', false, 'player1');
    const rescued = rescueOrphanedAttachments(before, after);
    expect(discardIds(rescued).filter((id) => id === ATTACHMENT).length).toBe(1);
  });
});
