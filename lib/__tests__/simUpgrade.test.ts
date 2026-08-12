import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getAllCards } from '@/lib/data/cardLoader';
import { getScenario } from '@/lib/cards/sim/scenarios';
import { runScenario } from '@/lib/cards/sim/runScenario';
import { hasUpgradeEffect, upgradeEffectIndex } from '@/lib/cards/sim/upgradeSim';
import type { GameState, CharacterCard } from '@/lib/engine/types';
import { awaitsEffectImplementation } from '@/lib/cards/sim/pendingImplementation';

const ANNOUNCE = new Set(['EFFECT_NO_TARGET', 'EFFECT_CONTINUOUS', 'EFFECT_SCORE_ANNOUNCE']);

function playedAsUpgrade(states: GameState[]): boolean {
  const last = states[states.length - 1];
  const first = states[0];
  return last.log.slice(first.log.length).some((l) => {
    const a = l.action ?? '';
    return a === 'UPGRADE_CHARACTER' || a === 'REVEAL_UPGRADE';
  });
}

function upgradeEffectExecuted(states: GameState[]): boolean {
  const first = states[0];
  const last = states[states.length - 1];
  if (last.log.slice(first.log.length).some((l) => {
    const a = l.action ?? '';
    return a.startsWith('EFFECT') && !ANNOUNCE.has(a);
  })) return true;
  const summ = (s: GameState) => s.activeMissions.map((m) =>
    [...m.player1Characters, ...m.player2Characters].map((c) => `${c.instanceId}:${c.missionIndex}:${c.isHidden}:${c.powerTokens}`).join(',')).join('|');
  if (summ(first) !== summ(last)) return true;
  return last.player1.deck.length !== first.player1.deck.length ||
    last.player2.deck.length !== first.player2.deck.length ||
    last.player2.chakra !== first.player2.chakra ||
    last.player1.missionPoints !== first.player1.missionPoints ||
    last.player2.hand.length !== first.player2.hand.length ||
    last.player1.discardPile.length !== first.player1.discardPile.length;
}

describe('UPGRADE effects: every one is played as an upgrade and executes', () => {
  beforeAll(() => { initializeRegistry(); });

  it('every card with an UPGRADE effect plays as an upgrade (small base card present) and executes', () => {
    const broken: string[] = [];
    const seen = new Set<string>();
    for (const card of getAllCards()) {
      if (awaitsEffectImplementation(card.id)) continue;
      if (card.card_type !== 'character' || !hasUpgradeEffect(card as CharacterCard)) continue;
      const key = `${card.set}-${card.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const idx = upgradeEffectIndex(card as CharacterCard);
      const scenario = getScenario(card.id, idx);
      if (!scenario) { broken.push(`${card.id}:noscenario`); continue; }
      let states: GameState[];
      try { states = runScenario(scenario); } catch { broken.push(`${card.id}:threw`); continue; }
      if (states[states.length - 1].pendingActions.length > 0) { broken.push(`${card.id}:dangling`); continue; }
      if (!playedAsUpgrade(states)) { broken.push(`${card.id}:not-as-upgrade`); continue; }
      if (!upgradeEffectExecuted(states)) { broken.push(`${card.id}:no-exec`); continue; }
    }
    expect(broken).toEqual([]);
  }, 180000);
});
