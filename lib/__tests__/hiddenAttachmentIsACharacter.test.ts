import { describe, it, expect } from 'vitest';
import { executeStartPhase } from '@/lib/engine/phases/StartPhase';
import { getEffectHandler, initializeRegistry } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getPlayableAttachments } from '@/lib/data/cardLoader';
import type { EffectType, GameState } from '@/lib/engine/types';

const GAARA_COST_4 = 'SS-078-UC';

function anAttachmentId(): string {
  const attachment = getPlayableAttachments()[0];
  expect(attachment, 'the set ships an attachment').toBeTruthy();
  return attachment.id;
}

function relayedTargets(result: { description?: unknown; validTargets?: string[] }): string[] {
  try {
    const parsed = JSON.parse(String(result.description)) as { targets?: string[] };
    if (Array.isArray(parsed.targets)) return parsed.targets;
  } catch {}
  return result.validTargets ?? [];
}

function boardWithHiddenAttachment(): GameState {
  const state = buildSimState({
    p1: [simChar(GAARA_COST_4, { owner: 'player1', instanceId: 'gaara' })],
    p2: [simChar(anAttachmentId(), { owner: 'player2', instanceId: 'enemy-attachment', hidden: true })],
    missions: 2,
    chakra1: 30,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  return state;
}

describe('a face down attachment is treated as a character in every way', () => {
  it('it counts for chakra generation at the start of the round', () => {
    const state = buildSimState({
      p1: [
        simChar('KS-001-C', { owner: 'player1', instanceId: 'ally' }),
        simChar(anAttachmentId(), { owner: 'player1', instanceId: 'hidden-attachment', hidden: true }),
      ],
      missions: 2,
      edgeHolder: 'player1',
    });
    state.phase = 'start';
    state.player1.chakra = 0;

    const after = executeStartPhase(state);
    expect(
      after.player1.chakra,
      'five base chakra plus one per character, the hidden attachment included',
    ).toBe(7);
  });

  it('it is a legal target for an effect that defeats a character by cost', () => {
    initializeRegistry();
    const state = boardWithHiddenAttachment();
    const handler = getEffectHandler(GAARA_COST_4, 'DUEL' as EffectType)!;
    const source = state.activeMissions[0].player1Characters[0];

    const result = handler({
      state, sourcePlayer: 'player1', sourceCard: source,
      sourceMissionIndex: 0, triggerType: 'DUEL' as EffectType, isUpgrade: false,
    });

    expect(
      relayedTargets(result),
      'face down it has cost 0 and no card type, so it is just a hidden character',
    ).toContain('enemy-attachment');
  });
});
