import type { GameState, PlayerID, CharacterInPlay } from '../engine/types';
import { logAction } from '../engine/utils/gameLog';
import { EffectEngine } from './EffectEngine';
import { triggerOnDefeatEffects } from './onDefeatTriggers';
import { emitEngineQuestEvent } from '@/lib/quests/engineEmit';




export function sortTargetsGemmaLast<T extends { card: { number: number; set?: string }; stack: { number: number; set?: string }[] }>(
  targets: T[],
): T[] {
  return [...targets].sort((a, b) => {
    const aTopCard = a.stack?.length > 0 ? a.stack[a.stack?.length - 1] : a.card;
    const bTopCard = b.stack?.length > 0 ? b.stack[b.stack?.length - 1] : b.card;
    const aIsGemma = (aTopCard.set === 'KS' && aTopCard.number === 49);
    const bIsGemma = (bTopCard.set === 'KS' && bTopCard.number === 49);
    if (aIsGemma && !bIsGemma) return 1;  // Gemma goes last
    if (!aIsGemma && bIsGemma) return -1;
    return 0;
  });
}


function findCharacterInPlay(
  state: GameState,
  instanceId: string,
): { char: CharacterInPlay; missionIndex: number; side: 'player1Characters' | 'player2Characters' } | null {
  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const idx = mission[side].findIndex((c) => c.instanceId === instanceId);
      if (idx !== -1) {
        return { char: mission[side][idx], missionIndex: i, side };
      }
    }
  }
  return null;
}


export function defeatCharacterInPlay(
  state: GameState,
  missionIndex: number,
  charInstanceId: string,
  side: 'player1Characters' | 'player2Characters',
  isEnemyEffect: boolean,
  sourcePlayer: PlayerID,
  simultaneousDefeatIds?: string[],
): GameState {
  const mission = state.activeMissions[missionIndex];
  const chars = mission[side];
  const charIdx = chars.findIndex((c) => c.instanceId === charInstanceId);
  if (charIdx === -1) return state;

  const targetChar = chars[charIdx];
  const targetPlayer: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';

  
  const replacement = EffectEngine.checkDefeatReplacement(
    state, targetChar, targetPlayer, missionIndex, isEnemyEffect,
  );

  if (replacement.replaced) {
    if (replacement.replacement === 'hide') {
      
      
      
      
      const hidden = EffectEngine.hideCharacter(state, charInstanceId);
      return {
        ...hidden,
        log: logAction(
          hidden.log,
          hidden.turn,
          hidden.phase,
          targetPlayer,
          'EFFECT_REPLACEMENT',
          `${targetChar.card.name_fr} was hidden instead of defeated (replacement effect).`,
          'game.log.effect.defeatReplacement',
          { card: targetChar.card.name_fr },
        ),
      };
    }

    if (replacement.replacement === 'sacrifice' && replacement.sacrificeInstanceId) {
      
      const sacrificeInfo = findCharacterInPlay(state, replacement.sacrificeInstanceId);
      if (sacrificeInfo) {
        
        let newState = removeCharacterFromPlay(
          state, sacrificeInfo.missionIndex, replacement.sacrificeInstanceId, sacrificeInfo.side,
        );
        newState = {
          ...newState,
          log: logAction(
            newState.log,
            state.turn,
            state.phase,
            targetPlayer,
            'EFFECT_SACRIFICE',
            `Gemma Shiranui sacrificed to protect ${targetChar.card.name_fr}.`,
            'game.log.effect.sacrifice',
            { target: targetChar.card.name_fr },
          ),
        };
        
        newState = triggerOnDefeatEffects(newState, sacrificeInfo.char, targetPlayer);
        return newState;
      }
    }
  }


  const sideOwnerForLog: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
  const goesToPrivateHand = targetChar.isHidden
    && sideOwnerForLog === targetChar.originalOwner
    && EffectEngine.hasTsunade004Active(state, targetChar.originalOwner);
  const publicName = goesToPrivateHand ? '???' : targetChar.card.name_fr;

  let newState = removeCharacterFromPlay(state, missionIndex, charInstanceId, side);

  emitEngineQuestEvent(state, sourcePlayer, 'character.defeated', {
    targetName: targetChar.card.name_fr,
    targetKeywords: targetChar.card.keywords ?? [],
    isHidden: targetChar.isHidden,
  });
  emitEngineQuestEvent(state, sourcePlayer, 'character.defeated.by.name', {
    name: targetChar.card.name_fr,
  });

  newState = {
    ...newState,
    log: logAction(
      newState.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_DEFEAT',
      `${publicName} was defeated.`,
      'game.log.effect.defeat',
      { card: '???', id: '', target: publicName },
    ),
  };

  
  
  newState = triggerOnDefeatEffects(newState, targetChar, targetPlayer, simultaneousDefeatIds);

  return newState;
}


export function defeatEnemyCharacter(
  state: GameState,
  missionIndex: number,
  charInstanceId: string,
  sourcePlayer: PlayerID,
  simultaneousDefeatIds?: string[],
): GameState {
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  return defeatCharacterInPlay(state, missionIndex, charInstanceId, enemySide, true, sourcePlayer, simultaneousDefeatIds);
}


export function defeatFriendlyCharacter(
  state: GameState,
  missionIndex: number,
  charInstanceId: string,
  sourcePlayer: PlayerID,
  simultaneousDefeatIds?: string[],
): GameState {
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  return defeatCharacterInPlay(state, missionIndex, charInstanceId, friendlySide, false, sourcePlayer, simultaneousDefeatIds);
}


function removeCharacterFromPlay(
  state: GameState,
  missionIndex: number,
  charInstanceId: string,
  side: 'player1Characters' | 'player2Characters',
): GameState {
  
  state = EffectEngine.restoreControlOnLeave(state, charInstanceId);
  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIndex] };
  const chars = [...mission[side]];
  const charIndex = chars.findIndex((c) => c.instanceId === charInstanceId);
  if (charIndex === -1) return state;

  const defeated = chars[charIndex];
  chars.splice(charIndex, 1);
  mission[side] = chars;
  missions[missionIndex] = mission;

  
  const owner = defeated.originalOwner;
  const ownerState = { ...state[owner] };
  const sidePlayer: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';

  const allCards = defeated.stack?.length > 0 ? [...defeated.stack] : [defeated.card];
  const attachedCards = defeated.attachments ?? [];
  if (sidePlayer === owner && allCards.length > 0 && EffectEngine.hasTsunade004Active(state, owner)) {
    const topCard = allCards[allCards.length - 1];
    const underCards = allCards.slice(0, -1);
    ownerState.hand = [...ownerState.hand, topCard];
    ownerState.discardPile = [...ownerState.discardPile, ...underCards];
  } else {
    ownerState.discardPile = [...ownerState.discardPile, ...allCards];
  }

  let result = {
    ...state,
    activeMissions: missions,
    [owner]: ownerState,
  };

  
  if (sidePlayer !== owner) {
    const controllerState = { ...result[sidePlayer] };
    controllerState.charactersInPlay = Math.max(0, controllerState.charactersInPlay - 1);
    result = { ...result, [sidePlayer]: controllerState };
  } else {
    ownerState.charactersInPlay = Math.max(0, ownerState.charactersInPlay - 1);
    result = { ...result, [owner]: ownerState };
  }

  for (const att of attachedCards) {
    const attOwnerState = { ...result[att.owner] };
    attOwnerState.discardPile = [...attOwnerState.discardPile, att.card as (typeof attOwnerState.discardPile)[number]];
    result = { ...result, [att.owner]: attOwnerState };
  }

  return result;
}
