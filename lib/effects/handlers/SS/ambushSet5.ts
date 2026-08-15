import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CardData, CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { calculateCharacterPower } from '@/lib/engine/phases/PowerCalculation';

export const SHINO_017 = 'SS-017-C';
export const SHIGURE_068 = 'SS-068-UC';
export const KISAME_055 = 'SS-055-UC';
export const ASUMA_013 = 'SS-013-UC';

export const SHINO_017_THRESHOLD = 4;
export const SHINO_017_GAIN = 2;
export const ASUMA_013_POWERUP = 5;
export const KISAME_055_STEAL = 1;
export const INDEPENDENT = 'Independent';

function topOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

function refus(state: GameState, player: PlayerID, texte: string, nom: string, id: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', texte,
        'game.log.effect.noTarget', { card: nom, id }),
    },
  };
}

function confirmationSeule(
  state: GameState,
  sourceInstanceId: string,
  type: string,
  descriptionKey: string,
): EffectResult {
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: type,
    validTargets: [sourceInstanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey,
  };
}

export function personnagesIndependantsDans(state: GameState, missionIndex: number): number {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return 0;
  let total = 0;
  for (const side of ['player1Characters', 'player2Characters'] as const) {
    for (const c of mission[side]) {
      if (c.isHidden) continue;
      if ((topOf(c) as unknown as CardData).group === INDEPENDENT) total += 1;
    }
  }
  return total;
}

export function ennemisLesPlusForts(state: GameState, player: PlayerID): CharacterInPlay[] {
  const adversaire: PlayerID = player === 'player1' ? 'player2' : 'player1';
  const side = adversaire === 'player1' ? 'player1Characters' : 'player2Characters';
  let meilleure = -Infinity;
  const trouves: CharacterInPlay[] = [];
  for (const mission of state.activeMissions) {
    for (const c of mission[side]) {
      if (c.isHidden) continue;
      const puissance = calculateCharacterPower(state, c, adversaire);
      if (puissance > meilleure) {
        meilleure = puissance;
        trouves.length = 0;
      }
      if (puissance === meilleure) trouves.push(c);
    }
  }
  return trouves;
}

export function leplusFortEstDans(state: GameState, player: PlayerID, missionIndex: number): boolean {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return false;
  const adversaire: PlayerID = player === 'player1' ? 'player2' : 'player1';
  const side = adversaire === 'player1' ? 'player1Characters' : 'player2Characters';
  const ids = new Set(mission[side].map((c) => c.instanceId));
  return ennemisLesPlusForts(state, player).some((c) => ids.has(c.instanceId));
}

export function chakraVolable(state: GameState, player: PlayerID): number {
  const adversaire: PlayerID = player === 'player1' ? 'player2' : 'player1';
  return Math.min(KISAME_055_STEAL, state[adversaire].chakra);
}

function shino017(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const adversaire: PlayerID = sourcePlayer === 'player1' ? 'player2' : 'player1';
  if (state[adversaire].hand.length === 0) {
    return refus(state, sourcePlayer, 'Shino Aburame (017): the opponent hand is empty.', 'SHINO ABURAME', SHINO_017);
  }
  return confirmationSeule(state, sourceCard.instanceId, 'SS017_CONFIRM_AMBUSH', 'game.effect.desc.ss017RevealRandom');
}

function shigure068(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  if (personnagesIndependantsDans(state, sourceMissionIndex) === 0) {
    return refus(state, sourcePlayer, 'Shigure (068): no Independent character in this mission.', 'SHIGURE', SHIGURE_068);
  }
  return confirmationSeule(state, sourceCard.instanceId, 'SS068_CONFIRM_AMBUSH', 'game.effect.desc.ss068PowerupIndependent');
}

function kisame055(type: string) {
  return (ctx: EffectContext): EffectResult => {
    const { state, sourcePlayer, sourceCard } = ctx;
    if (chakraVolable(state, sourcePlayer) === 0) {
      return refus(state, sourcePlayer, 'Kisame Hoshigaki (055): the opponent has no Chakra left.', 'KISAME HOSHIGAKI', KISAME_055);
    }
    return confirmationSeule(state, sourceCard.instanceId, type, 'game.effect.desc.ss055StealChakra');
  };
}

function asuma013(type: string, exigeLAmbush = false) {
  return (ctx: EffectContext): EffectResult => {
    const { state, sourcePlayer, sourceCard, sourceMissionIndex, wasRevealed } = ctx;
    if (exigeLAmbush && !wasRevealed) return { state };
    if (!leplusFortEstDans(state, sourcePlayer, sourceMissionIndex)) {
      return refus(state, sourcePlayer,
        'Asuma Sarutobi (013): the strongest enemy character is not in this mission.', 'ASUMA SARUTOBI', ASUMA_013);
    }
    return confirmationSeule(state, sourceCard.instanceId, type, 'game.effect.desc.ss013PowerupStrongest');
  };
}

export function registerAmbushSet5Handlers(): void {
  registerEffect(SHINO_017, 'AMBUSH', shino017);
  registerEffect(SHIGURE_068, 'AMBUSH', shigure068);
  registerEffect(KISAME_055, 'AMBUSH', kisame055('SS055_CONFIRM_AMBUSH'));
  registerEffect(KISAME_055, 'UPGRADE', kisame055('SS055_CONFIRM_UPGRADE'));
  registerEffect(ASUMA_013, 'AMBUSH', asuma013('SS013_CONFIRM_AMBUSH'));
  registerEffect(ASUMA_013, 'UPGRADE', asuma013('SS013_CONFIRM_UPGRADE', true));
}
