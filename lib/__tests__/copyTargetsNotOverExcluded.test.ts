import { describe, it, expect } from 'vitest';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { isCharacterCopyable, isCopyableEffectType } from '@/lib/effects/handlers/KS/shared/copyExclusions';
import { getCardById } from '@/lib/data/cardIndex';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { CharacterCard, GameState } from '@/lib/engine/types';

function boardWithEnemy(copierId: string, enemyId: string): GameState {
  const p1 = [simChar(copierId, { owner: 'player1', instanceId: 'copier' })];
  const p2 = [simChar(enemyId, { owner: 'player2', instanceId: 'prey' })];
  const st = buildSimState({ hand1: [], p1, p2, missions: 2, chakra1: 20, edgeHolder: 'player1' });
  st.phase = 'action';
  return st;
}

function copierSeesTarget(copierId: string, enemyId: string, trigger: 'MAIN' | 'AMBUSH' = 'MAIN'): boolean {
  const handler = getEffectHandler(copierId, trigger);
  if (!handler) throw new Error(`no ${trigger} handler for ${copierId}`);
  const state = boardWithEnemy(copierId, enemyId);
  const source = state.activeMissions[0].player1Characters[0];
  const result = handler({
    state, sourcePlayer: 'player1', sourceCard: source,
    sourceMissionIndex: 0, triggerType: trigger, isUpgrade: false, wasRevealed: true,
  });
  return result.requiresTargetSelection === true;
}

function hasCopyableInstant(cardId: string): boolean {
  const card = getCardById(cardId) as CharacterCard | undefined;
  if (!card) return false;
  return (card.effects ?? []).some((e) => {
    if (!isCopyableEffectType(e.type)) return false;
    if (e.type === 'AMBUSH') return false;
    if (e.description.includes('[⧗]')) return false;
    if (/(?:^|\s)(?:MAIN|AMBUSH|UPGRADE|SCORE)\s+effect\b/.test(e.description)) return false;
    return true;
  });
}

describe('copy effects are not blocked by an over-broad exclusion list', () => {
  it('Kakashi 016 can copy the promo Kakashi 148 (reported bug)', () => {
    const promo = getCardById('KS-148-M') as CharacterCard;
    expect(promo, 'KS-148-M must exist').toBeTruthy();
    expect(promo.chakra).toBe(4);
    expect(isCharacterCopyable(promo), 'KS-148-M must be copyable').toBe(true);
    expect(hasCopyableInstant('KS-148-M'), 'its MAIN is a plain instant').toBe(true);
    expect(copierSeesTarget('KS-016-UC', 'KS-148-M')).toBe(true);
  });

  it('Kakashi 137 is copyable too: none of its effects are copy effects', () => {
    const c = getCardById('KS-137-S') as CharacterCard;
    if (!c) return;
    expect(isCharacterCopyable(c)).toBe(true);
  });

  it('the copier itself and the explicitly-uncopiable Shino stay excluded', () => {
    const sharingan = getCardById('KS-016-UC') as CharacterCard;
    const shino = getCardById('KS-115-R') as CharacterCard;
    expect(isCharacterCopyable(sharingan), 'Kakashi 016 must not copy itself').toBe(false);
    expect(isCharacterCopyable(shino), 'Shino 115 is uncopiable by designer ruling').toBe(false);
  });

  it('the exclusion list is scoped to its own set', () => {
    const foreign = { set: 'SS', number: 16, effects: [] } as unknown as CharacterCard;
    expect(isCharacterCopyable(foreign), 'a same-numbered card from another set must not be excluded').toBe(true);
  });

  it('every card the list still excludes really carries a copy mechanic or a ruling', () => {
    const stillExcluded = ['KS-016-UC', 'KS-106-R', 'KS-115-R'];
    for (const id of stillExcluded) {
      const c = getCardById(id) as CharacterCard | undefined;
      if (!c) continue;
      const isCopier = (c.effects ?? []).some((e) => /copy/i.test(e.description));
      const isShino = Number(c.number) === 115;
      expect(isCopier || isShino, `${id} must justify its exclusion`).toBe(true);
    }
  });
});
