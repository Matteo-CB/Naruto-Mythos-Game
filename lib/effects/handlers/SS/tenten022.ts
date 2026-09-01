import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import { textIsBlanked } from './attachmentStatics';
import type { CardData, CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { confirmFirst } from './confirmFirst';

export const TENTEN_022 = 'SS-022-UC';
export const TENTEN_022_VARIANTS = [TENTEN_022];
export const TENTEN_022_REDUCTION = 2;
export const TENTEN_022_WEAPON_BONUS = 3;
export const WEAPON_KEYWORD = 'Weapon';

function topOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

export function estTenten022(char: CharacterInPlay | null | undefined): boolean {
  if (!char) return false;
  const top = topOf(char) as unknown as CardData;
  if (top.id === TENTEN_022) return true;
  return String(top.set) === 'SS' && Number(top.number) === 22;
}

export function bonusArmeSurTenten(
  host: CharacterInPlay | null | undefined,
  card: CardData | null | undefined,
): number {
  if (!estTenten022(host) || !card) return 0;
  if (host!.isHidden || textIsBlanked(host!)) return 0;
  return (card.keywords ?? []).includes(WEAPON_KEYWORD) ? TENTEN_022_WEAPON_BONUS : 0;
}

export function coutReduitDEquipement(card: CardData, reduction: number): number {
  return Math.max(0, (card.chakra ?? 0) - reduction);
}

export function equipementsJouablesDepuisLaMain(
  state: GameState,
  player: PlayerID,
  reduction: number,
): number[] {
  const main = state[player].hand as unknown as CardData[];
  const indices: number[] = [];
  for (let i = 0; i < main.length; i++) {
    const carte = main[i];
    if (carte?.card_type !== 'attachment') continue;
    if (state[player].chakra < coutReduitDEquipement(carte, reduction)) continue;
    indices.push(i);
  }
  return indices;
}

function tenten022Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const indices = equipementsJouablesDepuisLaMain(state, sourcePlayer, TENTEN_022_REDUCTION);
  if (indices.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Tenten (022) UPGRADE: no affordable attachment in hand.',
          'game.log.effect.noTarget', { card: 'TENTEN', id: TENTEN_022 }),
      },
    };
  }

  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS022_PLAY_ATTACHMENT',
    validTargets: indices.map((i) => String(i)),
    isOptional: true,
    description: JSON.stringify({ missionIndex: sourceMissionIndex, reduction: TENTEN_022_REDUCTION }),
    descriptionKey: 'game.effect.desc.ss022PlayAttachment',
  }, sourceCard.instanceId, 'SS022_CONFIRM_UPGRADE');
}

export function registerTenten022Handlers(): void {
  for (const id of TENTEN_022_VARIANTS) {
    registerEffect(id, 'UPGRADE', tenten022Upgrade);
  }
}
