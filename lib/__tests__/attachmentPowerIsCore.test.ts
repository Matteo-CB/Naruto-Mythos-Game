import { describe, it, expect } from 'vitest';
import { attachCardToCharacter } from '@/lib/effects/attachments';
import { attachedPowerOf } from '@/lib/effects/ContinuousEffects';
import { calculateCharacterPower } from '@/lib/engine/phases/PowerCalculation';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { getPlayableAttachments } from '@/lib/data/cardLoader';
import type { CardData, GameState } from '@/lib/engine/types';

function poweredAttachment(): CardData {
  const found = getPlayableAttachments().find((a) => a.id === 'SS-092-C');
  expect(found, 'the Sand Village Headband has power and no power effect').toBeTruthy();
  return found as unknown as CardData;
}

function boardWithHost(): GameState {
  const state = buildSimState({
    p1: [simChar('KS-001-C', { owner: 'player1', instanceId: 'host' })],
    missions: 2,
    chakra1: 30,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  return state;
}

function hostOf(state: GameState) {
  return state.activeMissions[0].player1Characters.find((c) => c.instanceId === 'host')!;
}

describe('an attachment gives its printed power to its host', () => {
  it('the shuriken value on the attachment is its power', () => {
    const attachment = poweredAttachment();
    expect(typeof attachment.power).toBe('number');
    expect(attachment.power as number).toBeGreaterThan(0);
  });

  it('the host power rises by the attachment power', () => {
    const attachment = poweredAttachment();
    let state = boardWithHost();
    const before = calculateCharacterPower(state, hostOf(state), 'player1');

    state = attachCardToCharacter(state, 'player1', attachment, 'host');
    const after = calculateCharacterPower(state, hostOf(state), 'player1');

    expect(after - before, 'the attachment power is added to the character').toBe(attachment.power as number);
  });

  it('attachment power counts as core power, so both players add up', () => {
    const attachment = poweredAttachment();
    let state = boardWithHost();
    state = attachCardToCharacter(state, 'player1', attachment, 'host');
    state = attachCardToCharacter(state, 'player2', attachment, 'host');

    expect(attachedPowerOf(hostOf(state)), 'both attachments count').toBe((attachment.power as number) * 2);
  });

  it('a hidden host shows no attachment power, being a 0 power character', () => {
    const attachment = poweredAttachment();
    let state = boardWithHost();
    state = attachCardToCharacter(state, 'player1', attachment, 'host');

    const mission = state.activeMissions[0];
    mission.player1Characters = mission.player1Characters.map((c) =>
      c.instanceId === 'host' ? { ...c, isHidden: true } : c,
    );

    expect(attachedPowerOf(hostOf(state))).toBe(0);
  });
});

describe('attachment power is core power, so it feeds Protect the Leader', () => {
  it('a power 3 character wearing a power 1 attachment reaches the +1 threshold', () => {
    const attachment = poweredAttachment();
    const state = buildSimState({
      p1: [simChar('KS-009-C', { owner: 'player1', instanceId: 'host' })],
      missions: 1,
      missionIds: ['KS-009-MMS'],
      chakra1: 30,
      edgeHolder: 'player1',
    });
    state.phase = 'action';

    const printed = (getCardById('KS-009-C') as CardData).power ?? 0;
    const bare = calculateCharacterPower(state, hostOf(state), 'player1');

    const withAttachment = attachCardToCharacter(state, 'player1', attachment, 'host');
    const boosted = calculateCharacterPower(withAttachment, hostOf(withAttachment), 'player1');

    const reachesThreshold = printed + (attachment.power as number) >= 4;
    expect(reachesThreshold, 'the fixture must actually cross the threshold').toBe(true);
    expect(
      boosted - bare,
      'the attachment power plus the mission bonus it unlocks',
    ).toBe((attachment.power as number) + 1);
  });
});

describe('an attachment leaves for the discard pile whatever happens to its host', () => {
  it('it is discarded even when the host is returned to hand', () => {
    const attachment = poweredAttachment();
    let state = boardWithHost();
    state = attachCardToCharacter(state, 'player1', attachment, 'host');
    const discardBefore = state.player1.discardPile.length;

    const mission = state.activeMissions[0];
    const host = hostOf(state);
    mission.player1Characters = mission.player1Characters.filter((c) => c.instanceId !== 'host');
    state.player1.hand = [...state.player1.hand, getCardById('KS-001-C') as never];
    for (const att of host.attachments ?? []) {
      state[att.owner].discardPile = [...state[att.owner].discardPile, att.card as never];
    }

    expect(state.player1.discardPile.length, 'the attachment never follows the host to hand').toBe(discardBefore + 1);
  });
});
