import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { buildPlayLessTargets, playLessBlockedRevealResult, type PlayLessCategory } from '@/lib/effects/handlers/shared/playLess';
import { ss078Duel } from './sandVillage';
import {
  GAARA_GOLD_ID,
  JIRAIYA_GOLD_ID,
  JIRAIYA_GOLD_NAME,
  JIRAIYA_GOLD_REDUCTION,
  SUMMON_KEYWORD,
  TSUNADE_GOLD_ID,
  TSUNADE_GOLD_NAME,
  JIRAIYA_SANNIN_PRINTINGS,
  TSUNADE_SANNIN_PRINTINGS,
  friendlyCharacterIds,
  friendlySummonIds,
  tsunadeGoldShuffleableCount,
} from './goldCards';

function noTarget(state: GameState, player: PlayerID, message: string, card: string, id: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', message,
        'game.log.effect.noTarget', { card, id }),
    },
  };
}

function tsunade001Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  if (tsunadeGoldShuffleableCount(state, sourcePlayer) === 0) {
    return noTarget({ ...state, ss001CardsShuffled: 0 }, sourcePlayer,
      'Tsunade (SS-001): the discard pile is empty.', TSUNADE_GOLD_NAME, TSUNADE_GOLD_ID);
  }

  return {
    state: { ...state, ss001CardsShuffled: 0 },
    requiresTargetSelection: true,
    targetSelectionType: 'SS001_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss001ConfirmMain',
  };
}

function tsunade001Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const shuffled = state.ss001CardsShuffled ?? 0;

  if (shuffled <= 0) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT',
          'Tsunade (SS-001) UPGRADE: no card was shuffled back, no extra POWERUP.',
          'game.log.effect.ss001NoBonus', { card: TSUNADE_GOLD_NAME, id: TSUNADE_GOLD_ID }),
      },
    };
  }

  const allies = friendlyCharacterIds(state, sourcePlayer);
  if (allies.length === 0) {
    return noTarget(state, sourcePlayer,
      'Tsunade (SS-001) UPGRADE: no friendly character in play.', TSUNADE_GOLD_NAME, TSUNADE_GOLD_ID);
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS001_CHOOSE_ALLY',
    validTargets: allies,
    isOptional: false,
    isMandatory: true,
    description: JSON.stringify({ amount: shuffled }),
    descriptionKey: 'game.effect.desc.ss001ChooseAlly',
    descriptionParams: { amount: shuffled },
    minSelections: 1,
    maxSelections: 1,
    selectingPlayer: sourcePlayer,
  };
}

const JIRAIYA_GOLD_CATEGORY: PlayLessCategory = { kind: 'keyword', value: SUMMON_KEYWORD };

function jiraiya002Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const playable = buildPlayLessTargets(state, sourcePlayer,
    JIRAIYA_GOLD_CATEGORY, JIRAIYA_GOLD_REDUCTION).targets;
  const summonsInPlay = friendlySummonIds(state, sourcePlayer);

  if (playable.length === 0 && summonsInPlay.length === 0) {
    const blocked = playLessBlockedRevealResult(
      state, sourcePlayer, JIRAIYA_GOLD_CATEGORY, 'Jiraiya (SS-002) UPGRADE',
    );
    if (blocked) return blocked;
    return noTarget(state, sourcePlayer,
      'Jiraiya (SS-002) UPGRADE: no Summon to play and none in play.', JIRAIYA_GOLD_NAME, JIRAIYA_GOLD_ID);
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS002_CONFIRM_UPGRADE',
    validTargets: [sourceCard.instanceId],
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss002ConfirmUpgrade',
  };
}

export function registerLegendaryGoldHandlers(): void {
  for (const id of TSUNADE_SANNIN_PRINTINGS) {
    registerEffect(id, 'MAIN', tsunade001Main);
    registerEffect(id, 'UPGRADE', tsunade001Upgrade);
  }
  for (const id of JIRAIYA_SANNIN_PRINTINGS) {
    registerEffect(id, 'UPGRADE', jiraiya002Upgrade);
  }
  registerEffect(GAARA_GOLD_ID, 'DUEL', ss078Duel);
}
