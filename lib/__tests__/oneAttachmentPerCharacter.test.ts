import { describe, it, expect } from 'vitest';
import { getCharacterAttachTargets, attachCardToCharacter, attachCardToMission } from '@/lib/effects/attachments';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getPlayableAttachments } from '@/lib/data/cardLoader';
import type { CardData, GameState } from '@/lib/engine/types';

function characterAttachment(index = 0): CardData {
  const attachment = getPlayableAttachments().filter((a) => a.attach_to !== 'mission')[index];
  expect(attachment, 'the set ships a character attachment').toBeTruthy();
  return attachment as unknown as CardData;
}

function boardWithOneHost(): GameState {
  const state = buildSimState({
    p1: [simChar('KS-001-C', { owner: 'player1', instanceId: 'host' })],
    missions: 2,
    chakra1: 30,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  return state;
}

function attachmentsOn(state: GameState, instanceId: string): number {
  for (const mission of state.activeMissions) {
    const found = mission.player1Characters.find((c) => c.instanceId === instanceId);
    if (found) return found.attachments?.length ?? 0;
  }
  return -1;
}

describe('each player may have one mission attachment per mission', () => {
  function missionAttachment(): CardData {
    const attachment = getPlayableAttachments().find((a) => a.attach_to === 'mission');
    expect(attachment, 'the set ships a mission attachment').toBeTruthy();
    return attachment as unknown as CardData;
  }

  it('a second one from the same player replaces the first, which is discarded', () => {
    let state = boardWithOneHost();
    state = attachCardToMission(state, 'player1', missionAttachment(), 0);
    const discardBefore = state.player1.discardPile.length;

    state = attachCardToMission(state, 'player1', missionAttachment(), 0);
    const mine = (state.activeMissions[0].attachments ?? []).filter((a) => a.owner === 'player1');
    expect(mine.length, 'one per player per mission').toBe(1);
    expect(state.player1.discardPile.length, 'the replaced one goes to the discard pile').toBe(discardBefore + 1);
  });

  it('the opponent may still attach to the same mission', () => {
    let state = boardWithOneHost();
    state = attachCardToMission(state, 'player1', missionAttachment(), 0);
    state = attachCardToMission(state, 'player2', missionAttachment(), 0);

    const owners = (state.activeMissions[0].attachments ?? []).map((a) => a.owner);
    expect(owners).toEqual(['player1', 'player2']);
  });

  it('the same player may attach to a different mission', () => {
    let state = boardWithOneHost();
    state = attachCardToMission(state, 'player1', missionAttachment(), 0);
    state = attachCardToMission(state, 'player1', missionAttachment(), 1);

    expect(state.activeMissions[0].attachments?.length).toBe(1);
    expect(state.activeMissions[1].attachments?.length).toBe(1);
  });
});

describe('a character can host only one attachment', () => {
  it('an empty character is offered as a host', () => {
    const state = boardWithOneHost();
    const targets = getCharacterAttachTargets(state, 'player1', 0, characterAttachment());
    expect(targets.map((c) => c.instanceId)).toContain('host');
  });

  it('a character carrying one is still a legal host, the old one is replaced', () => {
    let state = boardWithOneHost();
    state = attachCardToCharacter(state, 'player1', characterAttachment(), 'host');
    expect(attachmentsOn(state, 'host')).toBe(1);

    const targets = getCharacterAttachTargets(state, 'player1', 0, characterAttachment(0));
    expect(targets.map((c) => c.instanceId), 'you may replace an existing attachment').toContain('host');
  });

  it('a second attachment replaces the first, which is discarded', () => {
    let state = boardWithOneHost();
    state = attachCardToCharacter(state, 'player1', characterAttachment(), 'host');
    const discardBefore = state.player1.discardPile.length;

    const afterSecond = attachCardToCharacter(state, 'player1', characterAttachment(0), 'host');
    expect(attachmentsOn(afterSecond, 'host'), 'the character keeps exactly one attachment').toBe(1);
    expect(afterSecond.player1.discardPile.length, 'the previous attachment is discarded').toBe(discardBefore + 1);
  });
});
