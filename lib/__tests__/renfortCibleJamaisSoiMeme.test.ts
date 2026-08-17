import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { attachCardToCharacter } from '@/lib/effects/attachments';
import { getEffectHandler, initializeRegistry } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData, GameState } from '@/lib/engine/types';

void EffectEngine;

const ASUMA = 'SS-012-C';
const SHIZUNE = 'SS-003-C';
const TEAM10 = 'KS-021-C';
const BANDEAU_KONOHA = 'SS-091-C';
const ETRANGER = 'SS-051-UC';

function cibles(state: GameState, id: string, instanceId: string): string[] {
  initializeRegistry();
  const handler = getEffectHandler(id, 'MAIN')!;
  const source = state.activeMissions[0].player1Characters.find((c) => c.instanceId === instanceId)!;
  const r = handler({ state, sourcePlayer: 'player1', sourceCard: source, sourceMissionIndex: 0, isUpgrade: false } as never);
  try { return JSON.parse((r.description as string) ?? '{}').targets ?? r.validTargets ?? []; }
  catch { return r.validTargets ?? []; }
}

describe('un personnage n est jamais son propre allie', () => {
  it('ASUMA 012 seul Team 10 de sa mission ne peut pas se renforcer lui-meme', () => {
    const s = buildSimState({
      p1: [simChar(ASUMA, { owner: 'player1', instanceId: 'asuma' })],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    s.phase = 'action';
    const handler = getEffectHandler(ASUMA, 'MAIN')!;
    initializeRegistry();
    const r = handler({ state: s, sourcePlayer: 'player1', sourceCard: s.activeMissions[0].player1Characters[0], sourceMissionIndex: 0, isUpgrade: false } as never);
    expect(r.requiresTargetSelection, 'aucune cible, donc aucune question').toBeFalsy();
    expect(r.state.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'refus journalise').toBe(true);
  });

  it('avec un vrai allie Team 10, seul l allie est proposé', () => {
    const s = buildSimState({
      p1: [
        simChar(ASUMA, { owner: 'player1', instanceId: 'asuma' }),
        simChar(TEAM10, { owner: 'player1', instanceId: 'allie' }),
      ],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    s.phase = 'action';
    expect(cibles(s, ASUMA, 'asuma'), 'lui-meme est exclu').not.toContain('asuma');
  });

  it('SHIZUNE 003 reconnait un allie rendu Konoha par un bandeau', () => {
    let s = buildSimState({
      p1: [
        simChar(SHIZUNE, { owner: 'player1', instanceId: 'shizune' }),
        simChar(ETRANGER, { owner: 'player1', instanceId: 'etranger' }),
      ],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    s.phase = 'action';
    expect(cibles(s, SHIZUNE, 'shizune'), 'sans bandeau, aucun allie Konoha').not.toContain('etranger');
    s = attachCardToCharacter(s, 'player1', getCardById(BANDEAU_KONOHA) as CardData, 'etranger');
    expect(cibles(s, SHIZUNE, 'shizune'), 'avec le bandeau, il devient une cible').toContain('etranger');
  });
});
