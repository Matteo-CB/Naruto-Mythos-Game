import type { PendingAction } from '@/lib/engine/types';

export function actionTypeForSelectionType(tst: string): PendingAction['type'] {
  let actionType: PendingAction['type'] = 'SELECT_TARGET';
  if (tst === 'PUT_CARD_ON_DECK') {
    actionType = 'PUT_CARD_ON_DECK';
  } else if (
    tst === 'DISCARD_CARD' ||
    tst === 'KIMIMARO_CHOOSE_DISCARD' ||
    tst === 'KIMIMARO123_CHOOSE_DISCARD' ||
    tst === 'CHOJI_CHOOSE_DISCARD' ||
    tst === 'MSS03_OPPONENT_DISCARD' ||
    tst === 'SAKURA_012_DISCARD' ||
    tst === 'SASUKE_014_DISCARD_OWN' ||
    tst === 'SASUKE_014_DISCARD_OPPONENT' ||
    tst === 'ASUMA_024_DISCARD_FOR_POWERUP' ||
    tst === 'KIMIMARO056_CHOOSE_DISCARD' ||
    tst === 'NARUTO141_CHOOSE_DISCARD' ||
    tst === 'SASUKE142_CHOOSE_DISCARD' ||
    tst === 'KIN073_CHOOSE_DISCARD' ||
    tst === 'KABUTO053_CHOOSE_DISCARD' ||
    tst === 'SS114_CHOOSE_DISCARD' ||
    tst === 'SS139_DISCARD' ||
    tst === 'SS009_DISCARD_FOOD' ||
  tst === 'SS113_CHOOSE_DISCARD' ||
  tst === 'SS138_DISCARD_FOR_POWER'
  ) {
    actionType = 'DISCARD_CARD';
  } else if (
    tst === 'CHOOSE_CARD_FROM_LIST' ||
    tst === 'MSS08_CHOOSE_CARD' ||
    tst === 'JIRAIYA_CHOOSE_SUMMON' ||
    tst === 'JIRAIYA008_CHOOSE_SUMMON' ||
    tst === 'JIRAIYA105_CHOOSE_SUMMON' ||
    tst === 'JIRAIYA132_CHOOSE_SUMMON' ||
    tst === 'SAKURA109_CHOOSE_DISCARD' ||
    tst === 'SAKURA135_CHOOSE_CARD' ||
    tst === 'TAYUYA125_CHOOSE_SOUND' ||
    tst === 'PLAY_LESS_CATEGORY' ||
    tst === 'SS000_CHOOSE_HOUNDS' ||
    tst === 'SS045_PLACE_FROM_HAND' ||
    tst === 'SS037_REVEAL_SOUND_FOUR' ||
    tst === 'RECOVER_FROM_DISCARD' ||
    tst === 'HIRUZEN002_CHOOSE_CARD' ||
    tst === 'ITACHI091_CHOOSE_DISCARD' ||
    tst === 'TSUNADE104_CHOOSE_CHAKRA' ||
    tst === 'CHOOSE_TOKEN_AMOUNT_REMOVE' ||
    tst === 'CHOOSE_TOKEN_AMOUNT_STEAL' ||
    tst === 'SS_DECK_SEARCH_TAKE' ||
    tst === 'SS_DECK_SEARCH_SHOW' ||
    tst === 'SS095_TAKE_JUTSU' ||
    tst === 'SS023_TOP_OR_BOTTOM' ||
  tst === 'SS028_BOTTOM_OR_KEEP' ||
  tst === 'SS065_MOVE_ATTACHMENT' ||
  tst === 'SS022_PLAY_ATTACHMENT' ||
  tst === 'SS140_PLAY_HIDDEN' ||
  tst === 'SS073_MOVE_ATTACHMENT' ||
  tst === 'SS056_DISCARD_ATTACHMENT' ||
  tst === 'SS133_PLAY_SUMMON'
  ) {
    actionType = 'CHOOSE_CARD_FROM_LIST';
  } else if (tst === 'COPY_EFFECT_CHOSEN') {
    actionType = 'CHOOSE_EFFECT';
  }
  return actionType;
}
