import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { playLessSelectionResult } from '../shared/playLess';
import { sideKey, topOf } from './sandMove';

export const TAYUYA_040_ID = 'SS-040-UC';
export const TAYUYA_040_NAME = 'TAYUYA';

export function tayuya040Missions(
  state: GameState,
  player: PlayerID,
  sourceMissionIndex: number,
  sourceInstanceId: string,
): number[] {
  const side = sideKey(player);
  const retenues = new Set<number>();
  if (state.activeMissions[sourceMissionIndex]) retenues.add(sourceMissionIndex);

  state.activeMissions.forEach((mission, i) => {
    for (const char of mission[side]) {
      if (char.isHidden) continue;
      if (char.instanceId === sourceInstanceId) continue;
      const nom = String(topOf(char).name_fr ?? '').toUpperCase();
      if (nom === 'TAYUYA') retenues.add(i);
    }
  });

  return [...retenues].sort((a, b) => a - b);
}

export function tayuya040Reductions(
  state: GameState,
  player: PlayerID,
  missions: number[],
): Record<number, number> {
  const side = sideKey(player);
  const table: Record<number, number> = {};
  for (const i of missions) {
    const mission = state.activeMissions[i];
    if (!mission) continue;
    let compte = 0;
    for (const char of mission[side]) {
      if (char.isHidden) continue;
      if ((topOf(char).keywords ?? []).includes('Sound Four')) compte += 1;
    }
    table[i] = compte;
  }
  return table;
}

function refuse(state: GameState, player: PlayerID, texte: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', texte,
        'game.log.effect.noTarget', { card: TAYUYA_040_NAME, id: TAYUYA_040_ID }),
    },
  };
}

function tayuya040Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;

  const missions = tayuya040Missions(state, sourcePlayer, sourceMissionIndex, sourceCard.instanceId);
  const reductions = tayuya040Reductions(state, sourcePlayer, missions);
  const meilleure = Math.max(0, ...Object.values(reductions));

  const resultat = playLessSelectionResult(state, sourcePlayer, {
    category: { kind: 'keyword', value: 'Summon' },
    costReduction: meilleure,
    sourceName: TAYUYA_040_NAME,
    sourceId: TAYUYA_040_ID,
    textFallback: 'Tayuya (040): play Summon characters, paying less in every mission holding a friendly Tayuya.',
    descriptionKey: 'game.effect.desc.ss040PlaySummons',
    repeatable: true,
  });

  if (!resultat) {
    return refuse(state, sourcePlayer, 'Tayuya (040) UPGRADE: no Summon character can be played.');
  }

  const charge = JSON.parse(resultat.description as string);
  charge.reductionByMission = reductions;
  charge.allowedMissions = missions;

  return { ...resultat, description: JSON.stringify(charge) };
}

export function registerTayuya040Handlers(): void {
  registerEffect(TAYUYA_040_ID, 'UPGRADE', tayuya040Upgrade);
}
