import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CardData, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

export const KIMIMARO_031_ID = 'SS-031-CHIBIV';
export const KIMIMARO_031_NAME = 'KIMIMARO';

export type SoundFourName = 'JIROBO' | 'TAYUYA' | 'KIDOMARU' | 'SAKON';

export const SOUND_FOUR_ORDER: SoundFourName[] = ['JIROBO', 'TAYUYA', 'KIDOMARU', 'SAKON'];

export function soundFourNameOf(card: CardData | undefined): SoundFourName | null {
  if (!card) return null;
  const label = `${card.name_fr ?? ''} ${card.name_en ?? ''}`.toUpperCase();
  for (const name of SOUND_FOUR_ORDER) {
    if (label.includes(name)) return name;
  }
  return null;
}

export interface DiscardChoice {
  handIndex: number;
  name: SoundFourName;
}

export function discardableSoundFour(
  state: GameState,
  player: PlayerID,
  alreadyUsed: ReadonlyArray<SoundFourName>,
): DiscardChoice[] {
  const used = new Set(alreadyUsed);
  const seen = new Set<SoundFourName>();
  const choices: DiscardChoice[] = [];

  state[player].hand.forEach((card, handIndex) => {
    const name = soundFourNameOf(card);
    if (!name || used.has(name) || seen.has(name)) return;
    seen.add(name);
    choices.push({ handIndex, name });
  });

  return choices;
}

export function friendlyCharactersToMove(
  state: GameState,
  player: PlayerID,
  sourceInstanceId?: string,
): string[] {
  if (state.activeMissions.length < 2) return [];
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  const ids: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[side]) {
      if (sourceInstanceId && char.instanceId === sourceInstanceId) continue;
      ids.push(char.instanceId);
    }
  }
  return ids;
}

function kimimaro031Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const choices = discardableSoundFour(state, sourcePlayer, []);

  if (choices.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Kimimaro (SS-031): no Jirobo, Tayuya, Kidomaru or Sakon in hand to discard.',
          'game.log.effect.noTarget', { card: KIMIMARO_031_NAME, id: KIMIMARO_031_ID }),
      },
    };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS031_CONFIRM_MAIN',
    validTargets: [ctx.sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({ used: [] }),
    descriptionKey: 'game.effect.desc.ss031ConfirmMain',
  };
}

export function registerKimimaro031Handlers(): void {
  registerEffect(KIMIMARO_031_ID, 'MAIN', kimimaro031Main);
}
