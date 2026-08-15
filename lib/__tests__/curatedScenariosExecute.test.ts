import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { getScenario, hasCuratedScenario } from '@/lib/cards/sim/scenarios';
import { runScenario } from '@/lib/cards/sim/runScenario';
import { allCardData } from '@/lib/data/sets';
import type { CardData, CharacterInPlay, GameState } from '@/lib/engine/types';

registerAllSetHandlers();
void EffectEngine;

function empreinte(state: GameState): string {
  const chars: CharacterInPlay[] = state.activeMissions
    .flatMap((m) => [...m.player1Characters, ...m.player2Characters]);
  return JSON.stringify({
    personnages: chars.length,
    etats: chars
      .map((c) => `${c.instanceId}:${c.powerTokens}:${c.isHidden ? 1 : 0}:${(c.attachments ?? []).length}`)
      .sort(),
    equipementsDeMission: state.activeMissions.map((m) => (m.attachments ?? []).length),
    joueur1: [state.player1.hand.length, state.player1.deck.length, state.player1.discardPile.length,
      state.player1.chakra, state.player1.missionPoints],
    joueur2: [state.player2.hand.length, state.player2.deck.length, state.player2.discardPile.length,
      state.player2.chakra, state.player2.missionPoints],
  });
}

function aJournaliseUnEffet(state: GameState): boolean {
  return state.log.some((l) => typeof l.messageKey === 'string'
    && (l.messageKey.startsWith('game.log.attach')
      || (l.messageKey.startsWith('game.log.effect.') && l.messageKey !== 'game.log.effect.noTarget')));
}

function cartesAvecScenarioCurate(): string[] {
  return Object.values(allCardData.cards as Record<string, CardData>)
    .map((c) => c.id)
    .filter((id) => hasCuratedScenario(id));
}

describe('chaque simulation ecrite a la main est reellement executee', () => {
  it('il y en a un nombre significatif', () => {
    expect(cartesAvecScenarioCurate().length, 'les simulations ecrites a la main sont nombreuses')
      .toBeGreaterThanOrEqual(150);
  });

  it('aucune ne plante et aucune ne laisse une question en suspens', () => {
    const plantees: string[] = [];
    const bloquees: string[] = [];
    for (const id of cartesAvecScenarioCurate()) {
      let etats: GameState[];
      try {
        etats = runScenario(getScenario(id, 0)!);
      } catch {
        plantees.push(id);
        continue;
      }
      if (etats.length < 2) plantees.push(id);
      else if (etats[etats.length - 1].pendingActions.length > 0) bloquees.push(id);
    }
    expect(plantees, 'aucune simulation ne plante').toEqual([]);
    expect(bloquees, 'aucune simulation ne reste bloquee sur une question').toEqual([]);
  });

  it('chacune change vraiment la partie ou journalise un effet', () => {
    const inertes: string[] = [];
    for (const id of cartesAvecScenarioCurate()) {
      const etats = runScenario(getScenario(id, 0)!);
      const dernier = etats[etats.length - 1];
      const aChange = empreinte(etats[0]) !== empreinte(dernier);
      if (!aChange && !aJournaliseUnEffet(dernier)) inertes.push(id);
    }
    expect(inertes, 'aucune simulation ne se contente d_exister').toEqual([]);
  });
});
