import type { GameState, PlayerID, CharacterInPlay } from '../types';
import { logSystem, logAction } from '../utils/gameLog';
import { shouldRetainPowerTokens, isMovementBlockedByKurenai } from '../../effects/ContinuousEffects';
import { EffectEngine } from '../../effects/EffectEngine';
import { calculateEffectiveCost } from '../rules/ChakraValidation';
import { attachCardToCharacter, getCharacterAttachTargets } from '../../effects/attachments';
import { shuffle } from '../utils/shuffle';
import { putTopCardAsHidden } from '../../effects/handlers/SS/attachmentReinforcements';





interface EndOfRoundEffectInfo {
  instanceId: string;
  type: 'GIANT_SPIDER_103' | 'ROCK_LEE_117' | 'AKAMARU_028';
  player: PlayerID;
  missionIndex: number;
  cardId: string;
  cardName: string;
  cardImage?: string;
}

export const AKAMARU_015_ID = 'SS-015-UC';
export const AKAMARU_015_NAME = 'AKAMARU';

function topOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

function isCard(char: CharacterInPlay, set: string, number: number): boolean {
  const top = topOf(char);
  return String(top.set) === set && Number(top.number) === number;
}

export function akamaru015EndOfRound(state: GameState): GameState {
  const traites = new Set<string>(state.endPhaseAkamaru015Ids ?? []);
  let newState = state;

  for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
      for (const char of newState.activeMissions[mIdx][side]) {
        if (char.isHidden || traites.has(char.instanceId)) continue;
        if (!isCard(char, 'SS', 15)) continue;

        const controleur = char.controlledBy ?? player;
        traites.add(char.instanceId);
        newState = { ...newState, endPhaseAkamaru015Ids: [...traites] };

        if (newState[controleur].chakra < 1) {
          newState = EffectEngine.defeatCharacter(newState, char.instanceId, controleur);
          newState = {
            ...newState,
            log: logAction(newState.log, newState.turn, 'end', controleur, 'EFFECT_DEFEAT',
              'Akamaru (015): no Chakra left to pay, this character is defeated.',
              'game.log.effect.defeat',
              { card: AKAMARU_015_NAME, id: AKAMARU_015_ID, target: topOf(char).name_fr, target_en: topOf(char).name_en || topOf(char).name_fr }),
          };
          continue;
        }

        return EffectEngine.createPendingTargetSelection(
          newState, controleur, char, mIdx, 'MAIN', false,
          {
            state: newState,
            requiresTargetSelection: true,
            targetSelectionType: 'SS015_CONFIRM_PAY',
            validTargets: [char.instanceId],
            isOptional: true,
            description: JSON.stringify({}),
            descriptionKey: 'game.effect.desc.ss015PayOrDefeat',
          },
          [],
        );
      }
    }
  }

  return newState;
}


export function scanEndOfRoundInteractiveEffects(state: GameState): EndOfRoundEffectInfo[] {
  const effects: EndOfRoundEffectInfo[] = [];
  const processedGS = new Set<string>(state.endPhaseGiantSpider103Ids ?? []);
  const processedRL = new Set<string>(state.endPhaseMovedIds ?? []);
  const processedAK = new Set<string>(state.endPhaseAkamaru028Ids ?? []);

  for (let mIdx = 0; mIdx < state.activeMissions.length; mIdx++) {
    const mission = state.activeMissions[mIdx];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
      for (const char of mission[side]) {
        if (char.isHidden) continue;
        const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;

        
        if ((topCard.set === 'KS' && topCard.number === 103) && !processedGS.has(char.instanceId)) {
          const hasEffect = (topCard.effects ?? []).some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]') &&
              e.description.toLowerCase().includes('hide a character'),
          );
          if (hasEffect) {
            effects.push({
              instanceId: char.instanceId, type: 'GIANT_SPIDER_103', player,
              missionIndex: mIdx, cardId: topCard.id, cardName: topCard.name_fr,
              cardImage: topCard.image_file,
            });
          }
        }

        
        if (((topCard.set === 'KS' && topCard.number === 117) || (topCard.set === 'KS' && topCard.number === 151)) && !processedRL.has(char.instanceId)) {
          const hasEffect = (topCard.effects ?? []).some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]') &&
              (e.description.includes('move this character') || e.description.includes('must move')),
          );
          if (hasEffect) {
            effects.push({
              instanceId: char.instanceId, type: 'ROCK_LEE_117', player,
              missionIndex: mIdx, cardId: topCard.id, cardName: topCard.name_fr,
              cardImage: topCard.image_file,
            });
          }
        }

        
        if ((topCard.set === 'KS' && topCard.number === 28) && !processedAK.has(char.instanceId)) {
          const hasEffect = (topCard.effects ?? []).some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]'),
          );
          if (hasEffect) {
            effects.push({
              instanceId: char.instanceId, type: 'AKAMARU_028', player,
              missionIndex: mIdx, cardId: topCard.id, cardName: topCard.name_fr,
              cardImage: topCard.image_file,
            });
          }
        }
      }
    }
  }

  return effects;
}


export function createEndOfRoundOrderChoice(state: GameState, effects: EndOfRoundEffectInfo[]): GameState {
  let newState = { ...state };
  const player = effects[0].player;
  const effectId = `end-round-order-${effects.map((e) => e.instanceId).join('-')}`;
  const actionId = `end-round-order-action-${effects.map((e) => e.instanceId).join('-')}`;

  newState.pendingEffects = [...newState.pendingEffects, {
    id: effectId,
    sourceCardId: effects[0].cardId,
    sourceInstanceId: effects[0].instanceId,
    sourceMissionIndex: effects[0].missionIndex,
    effectType: 'MAIN' as const,
    effectDescription: JSON.stringify(effects.map((e) => ({
      instanceId: e.instanceId, type: e.type, cardName: e.cardName,
      cardImage: e.cardImage, cardId: e.cardId,
    }))),
    targetSelectionType: 'END_OF_ROUND_EFFECT_ORDER',
    sourcePlayer: player,
    requiresTargetSelection: true,
    validTargets: effects.map((e) => e.instanceId),
    isOptional: false,
    isMandatory: true,
    resolved: false,
    isUpgrade: false,
  }];

  newState.pendingActions = [...newState.pendingActions, {
    id: actionId,
    type: 'SELECT_TARGET' as const,
    player,
    description: 'Choose which end-of-round effect to resolve first.',
    descriptionKey: 'game.effect.desc.endOfRoundEffectOrder',
    options: effects.map((e) => e.instanceId),
    minSelections: 1,
    maxSelections: 1,
    sourceEffectId: effectId,
  }];

  return newState;
}


export function processChosenEndOfRoundEffect(state: GameState, chosenInstanceId: string): GameState {
  let newState = { ...state };

  for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
    const mission = newState.activeMissions[mIdx];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
      for (const char of mission[side]) {
        if (char.instanceId !== chosenInstanceId) continue;
        const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;

        if ((topCard.set === 'KS' && topCard.number === 103)) {
          return handleGiantSpider103EndOfRound(newState, chosenInstanceId);
        }
        if ((topCard.set === 'KS' && topCard.number === 117) || (topCard.set === 'KS' && topCard.number === 151)) {
          newState = handleRockLee117Move(newState, chosenInstanceId);
          
          const movedIds = new Set<string>(newState.endPhaseMovedIds ?? []);
          if (!movedIds.has(chosenInstanceId)) {
            movedIds.add(chosenInstanceId);
            newState.endPhaseMovedIds = [...movedIds];
            newState.log = logAction(
              newState.log, newState.turn, 'end', player,
              'EFFECT_BLOCKED',
              `Rock Lee (${topCard.number}): Cannot move at end of round (blocked or no valid destination).`,
              'game.log.effect.rockLeeBlocked',
              { card: topCard.name_fr, id: topCard.id },
            );
          }
          return newState;
        }
        if ((topCard.set === 'KS' && topCard.number === 28)) {
          return handleAkamaru028Return(newState, chosenInstanceId);
        }
      }
    }
  }

  return newState;
}


export function processRemainingEndOfRoundEffects(state: GameState): GameState {
  let newState = { ...state };

  const remaining = scanEndOfRoundInteractiveEffects(newState);

  
  const byPlayer = new Map<PlayerID, EndOfRoundEffectInfo[]>();
  for (const e of remaining) {
    if (!byPlayer.has(e.player)) byPlayer.set(e.player, []);
    byPlayer.get(e.player)!.push(e);
  }

  for (const [, playerEffects] of byPlayer) {
    if (playerEffects.length >= 2) {
      return createEndOfRoundOrderChoice(newState, playerEffects);
    }
  }

  
  newState = handleGiantSpider103EndOfRound(newState);
  if (newState.pendingActions.length > 0) return newState;

  newState = handleRockLee117Move(newState);
  if (newState.pendingActions.length > 0) return newState;

  newState = handleAkamaru028Return(newState);
  return newState;
}


export function finalizeEndPhase(state: GameState): GameState {
  let newState = resetChakraPools(state);

  if (!newState.endPhaseTokensRemoved) {
    newState = removeAllPowerTokens(newState);
    newState.endPhaseTokensRemoved = true;
  }

  
  newState = handleEndOfRoundAutoTriggers(newState);

  return newState;
}


export function resetChakraPools(state: GameState): GameState {
  if (state.endPhaseChakraReset) return state;
  return {
    ...state,
    endPhaseChakraReset: true,
    player1: { ...state.player1, chakra: 0 },
    player2: { ...state.player2, chakra: 0 },
    log: logSystem(
      state.log,
      state.turn,
      'end',
      'RESET_CHAKRA',
      'Both players\' chakra pools reset to 0.',
      'game.log.resetChakra',
    ),
  };
}

export const ENMA_132_ID = 'SS-132-R';
export const ENMA_132_NAME = 'ENMA';
export const ADAMANTINE_NYOI_ID = 'SS-098-UC';
export const ENMA_132_REDUCTION = 2;

export function enma132EndOfRound(state: GameState): GameState {
  const traites = new Set<string>(state.endPhaseEnma132Ids ?? []);
  let newState = state;

  for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
      for (const char of newState.activeMissions[mIdx][side]) {
        if (char.isHidden || traites.has(char.instanceId)) continue;
        if (!isCard(char, 'SS', 132)) continue;

        const controleur = char.controlledBy ?? player;
        traites.add(char.instanceId);
        newState = { ...newState, endPhaseEnma132Ids: [...traites] };

        const deck = newState[controleur].deck;
        const idx = deck.findIndex((c) => c.id === ADAMANTINE_NYOI_ID);
        if (idx === -1) {
          newState = {
            ...newState,
            log: logAction(newState.log, newState.turn, 'end', controleur, 'EFFECT_NO_TARGET',
              'Enma (132): Adamantine Nyoi is not in the deck.',
              'game.log.effect.noTarget', { card: ENMA_132_NAME, id: ENMA_132_ID }),
          };
          continue;
        }

        const carte = deck[idx];
        const cout = Math.max(0, calculateEffectiveCost(newState, controleur, carte as never, mIdx, false) - ENMA_132_REDUCTION);
        const cibles = getCharacterAttachTargets(newState, controleur, mIdx, carte as never);

        if (newState[controleur].chakra < cout || cibles.length === 0) {
          newState = {
            ...newState,
            log: logAction(newState.log, newState.turn, 'end', controleur, 'EFFECT_NO_TARGET',
              cibles.length === 0
                ? 'Enma (132): no friendly character can carry Adamantine Nyoi.'
                : 'Enma (132): not enough Chakra to play Adamantine Nyoi, even reduced by 2.',
              'game.log.effect.noTarget', { card: ENMA_132_NAME, id: ENMA_132_ID }),
          };
          continue;
        }

        const nouveauDeck = [...deck];
        nouveauDeck.splice(idx, 1);
        newState = {
          ...newState,
          [controleur]: {
            ...newState[controleur],
            deck: shuffle(nouveauDeck),
            chakra: newState[controleur].chakra - cout,
          },
          log: logAction(newState.log, newState.turn, 'end', controleur, 'PLAY_ATTACHMENT',
            `Enma (132): Adamantine Nyoi found in the deck and played for ${cout} chakra.`,
            'game.log.effect.enma132Search', { card: ENMA_132_NAME, id: ENMA_132_ID, cost: cout }),
        };

        if (cibles.length === 1) {
          newState = attachCardToCharacter(newState, controleur, carte as never, cibles[0].instanceId);
          continue;
        }

        return EffectEngine.createPendingTargetSelection(
          newState, controleur, char, mIdx, 'MAIN', false,
          {
            state: newState,
            requiresTargetSelection: true,
            targetSelectionType: 'ATTACH_CHOOSE_TARGET',
            validTargets: cibles.map((c) => c.instanceId),
            isOptional: false,
            isMandatory: true,
            description: JSON.stringify({ card: carte }),
            descriptionKey: 'game.effect.desc.attachChooseTarget',
          },
          [],
        );
      }
    }
  }

  return newState;
}

export const REINFORCEMENTS_109_ID = 'SS-109-UC';
export const REINFORCEMENTS_109_NAME = 'RENFORTS PLANIFIES';

export function plannedReinforcementsEndOfRound(state: GameState): GameState {
  let newState = state;
  for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
    const mission = newState.activeMissions[mIdx];
    for (const att of mission.attachments ?? []) {
      if (att.card.id !== REINFORCEMENTS_109_ID) continue;
      newState = putTopCardAsHidden(newState, att.owner, mIdx, REINFORCEMENTS_109_NAME, REINFORCEMENTS_109_ID);
    }
  }
  return newState;
}

export function executeEndPhase(state: GameState): GameState {
  let newState = { ...state };

  newState = akamaru015EndOfRound(newState);
  if (newState.pendingActions.length > 0) return newState;

  newState = enma132EndOfRound(newState);
  if (newState.pendingActions.length > 0) return newState;

  newState = plannedReinforcementsEndOfRound(newState);

  newState = resetChakraPools(newState);


  const interactiveEffects = scanEndOfRoundInteractiveEffects(newState);

  
  const byPlayer = new Map<PlayerID, EndOfRoundEffectInfo[]>();
  for (const e of interactiveEffects) {
    if (!byPlayer.has(e.player)) byPlayer.set(e.player, []);
    byPlayer.get(e.player)!.push(e);
  }

  for (const [, playerEffects] of byPlayer) {
    if (playerEffects.length >= 2) {
      
      return createEndOfRoundOrderChoice(newState, playerEffects);
    }
  }

  
  
  newState = handleGiantSpider103EndOfRound(newState);
  if (newState.pendingActions.length > 0) return newState;

  
  newState = removeAllPowerTokens(newState);
  newState.endPhaseTokensRemoved = true;

  
  newState = handleEndOfRoundAutoTriggers(newState);

  
  newState = handleRockLee117Move(newState);
  if (newState.pendingActions.length > 0) return newState;

  newState = handleAkamaru028Return(newState);
  return newState;
}


function removeAllPowerTokens(state: GameState): GameState {
  const missions = state.activeMissions.map((mission) => {
    const processChars = (chars: CharacterInPlay[]): CharacterInPlay[] => {
      return chars.map((char) => {
        
        if (shouldRetainPowerTokens(char)) {
          return char; // Keep tokens
        }

        if (char.powerTokens > 0) {
          return { ...char, powerTokens: 0 };
        }
        return char;
      });
    };

    return {
      ...mission,
      player1Characters: processChars(mission.player1Characters),
      player2Characters: processChars(mission.player2Characters),
    };
  });

  return {
    ...state,
    activeMissions: missions,
    log: logSystem(state.log, state.turn, 'end', 'REMOVE_TOKENS',
      'All Power tokens removed (exceptions applied).',
      'game.log.removeTokens',
    ),
  };
}


function handleEndOfRoundTriggers(state: GameState): GameState {
  let newState = handleEndOfRoundAutoTriggers(state);

  
  newState = handleRockLee117Move(newState);

  return newState;
}


function handleEndOfRoundAutoTriggers(state: GameState): GameState {
  let newState = { ...state };
  const charsToReturn: { instanceId: string; player: PlayerID; reason: string; cardName: string; isAkamaru: boolean }[] = [];
  const returnQueued = new Set<string>();

  for (const mission of newState.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
      const chars = mission[side];

      for (const char of chars) {
        if (char.isHidden) continue;
        if (returnQueued.has(char.instanceId)) continue;

        const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
        const isSummon = (topCard.keywords ?? []).includes('Summon');

        
        if (isSummon) {
          const isGiantSpider103 = (topCard.effects ?? []).some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]') &&
              e.description.toLowerCase().includes('hide a character'),
          );
          if (!isGiantSpider103) {
            console.log(`[EndPhase] Summon return queued: ${topCard.name_fr} (${topCard.id}) instanceId=${char.instanceId} hidden=${char.isHidden} controlledBy=${char.controlledBy}`);
            charsToReturn.push({
              instanceId: char.instanceId,
              player: char.controlledBy,
              reason: `${topCard.name_fr} (Summon) returns to hand at end of round.`,
              cardName: topCard.name_fr,
              isAkamaru: false,
            });
            returnQueued.add(char.instanceId);
          }
          continue;
        }

        
        const hasAkamaruReturn = (topCard.effects ?? []).some(
          (e) => e.type === 'MAIN' &&
            e.description.includes('[⧗]') &&
            e.description.includes('Kiba Inuzuka') &&
            e.description.toLowerCase().includes('end of the round') &&
            e.description.toLowerCase().includes('return'),
        );
        if (hasAkamaruReturn) {
          const allMissionChars = [...mission.player1Characters, ...mission.player2Characters];
          const hasKiba = allMissionChars.some(
            (c) => {
              if (c.instanceId === char.instanceId || c.isHidden) return false;
              const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
              return cTop.name_fr.toUpperCase().includes('KIBA');
            },
          );
          if (!hasKiba) {
            charsToReturn.push({
              instanceId: char.instanceId,
              player: char.controlledBy,
              reason: 'Akamaru returns to hand (no Kiba in mission).',
              cardName: topCard.name_fr,
              isAkamaru: true,
            });
            returnQueued.add(char.instanceId);
          }
        }
      }
    }
  }

  
  for (const toReturn of charsToReturn) {
    newState = returnCharacterToHand(newState, toReturn.instanceId, toReturn.player);
    newState.log = logAction(
      newState.log,
      state.turn,
      'end',
      toReturn.player,
      'END_RETURN',
      toReturn.reason,
      toReturn.isAkamaru ? 'game.log.effect.akamaru' : 'game.log.effect.endReturn',
      toReturn.isAkamaru ? undefined : { card: toReturn.cardName },
    );
  }

  
  newState = handleKimimaro123SelfDefeat(newState);

  return newState;
}


function handleKimimaro123SelfDefeat(state: GameState): GameState {
  let newState = { ...state };

  for (let mi = 0; mi < newState.activeMissions.length; mi++) {
    const mission = newState.activeMissions[mi];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
      const chars = mission[side];

      for (const char of chars) {
        if (char.isHidden) continue;
        const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
        if (topCard.number !== 123) continue;

        
        

        
        const controller = char.controlledBy ?? player;
        if (newState[controller].hand.length > 0) continue;

        
        const owner = char.originalOwner ?? controller;
        const missions = [...newState.activeMissions];
        const m = { ...missions[mi] };
        m[side] = m[side].filter((c) => c.instanceId !== char.instanceId);
        missions[mi] = m;
        newState.activeMissions = missions;

        const ownerPs = { ...newState[owner] };
        ownerPs.discardPile = [...ownerPs.discardPile, ...char.stack];
        
        let count = 0;
        for (const mm of missions) {
          count += (owner === 'player1' ? mm.player1Characters : mm.player2Characters).length;
        }
        ownerPs.charactersInPlay = count;
        newState[owner] = ownerPs;

        newState.log = logAction(
          newState.log, state.turn, 'end', controller,
          'END_SELF_DEFEAT',
          `Kimimaro (123): Defeated at end of round (no cards in hand).`,
          'game.log.effect.kimimaro123SelfDefeat',
          { card: 'KIMIMARO', id: `KS-123-R` },
        );
      }
    }
  }

  return newState;
}


export function handleRockLee117Move(
  state: GameState,
  targetInstanceId?: string,
): GameState {
  let newState = { ...state };
  const alreadyMoved = new Set<string>(newState.endPhaseMovedIds ?? []);

  for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
    const mission = newState.activeMissions[mIdx];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
      const chars = mission[side];

      for (const char of chars) {
        if (targetInstanceId && char.instanceId !== targetInstanceId) continue;
        if (alreadyMoved.has(char.instanceId)) continue;
        if (char.isHidden) continue;
        const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
        
        if (topCard.number !== 117 && topCard.number !== 151) continue;

        const hasMove = (topCard.effects ?? []).some(
          (e) => e.type === 'MAIN' && e.description.includes('[⧗]') &&
            (e.description.includes('move this character') || e.description.includes('must move')),
        );
        if (!hasMove) continue;

        
        if (isMovementBlockedByKurenai(newState, mIdx, player)) continue;

        
        const validDests: number[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          if (i === mIdx) continue;
          const destMission = newState.activeMissions[i];
          const destChars = player === 'player1' ? destMission.player1Characters : destMission.player2Characters;
          const hasSameName = destChars.some(
            (c) => !c.isHidden && (c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card)
              .name_fr.toUpperCase() === topCard.name_fr.toUpperCase(),
          );
          if (!hasSameName) {
            validDests.push(i);
          }
        }

        if (validDests.length === 0) continue; // No valid destination - "if able" clause

        if (validDests.length === 1) {
          
          const destIdx = validDests[0];
          const missions = [...newState.activeMissions];
          const srcMission = { ...missions[mIdx] };
          const destMission = { ...missions[destIdx] };

          srcMission[side] = srcMission[side].filter((c: CharacterInPlay) => c.instanceId !== char.instanceId);
          const movedChar = { ...char, missionIndex: destIdx };
          destMission[side] = [...destMission[side], movedChar];

          missions[mIdx] = srcMission;
          missions[destIdx] = destMission;
          newState.activeMissions = missions;

          newState.log = logAction(
            newState.log, state.turn, 'end', player,
            'EFFECT_MOVE',
            `Rock Lee (${topCard.number}): Moves to mission ${destIdx + 1} at end of round.`,
            'game.log.effect.endMove',
            { card: 'ROCK LEE', id: topCard.id },
          );
          alreadyMoved.add(char.instanceId);
          newState.endPhaseMovedIds = [...alreadyMoved];
          break; // Break inner loop to avoid mutation issues, outer loop continues
        }

        
        alreadyMoved.add(char.instanceId);
        newState.endPhaseMovedIds = [...alreadyMoved];
        const effectId = `rl117-endmove-${char.instanceId}`;
        const actionId = `rl117-endmove-action-${char.instanceId}`;
        newState.pendingEffects = [...newState.pendingEffects, {
          id: effectId,
          sourceCardId: topCard.id,
          sourceInstanceId: char.instanceId,
          sourceMissionIndex: mIdx,
          effectType: 'MAIN' as const,
          effectDescription: `Rock Lee (${topCard.number}): Must move to another mission.`,
          targetSelectionType: 'ROCK_LEE_END_MOVE',
          sourcePlayer: player,
          requiresTargetSelection: true,
          validTargets: validDests.map(String),
          isOptional: false,
          isMandatory: true,
          resolved: false,
          isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: actionId,
          type: 'SELECT_TARGET',
          player,
          description: `Rock Lee (${topCard.number}): Choose a mission to move to at end of round.`,
          descriptionKey: 'game.effect.desc.rockLeeEndMove',
          options: validDests.map(String),
          minSelections: 1,
          maxSelections: 1,
          sourceEffectId: effectId,
        }];
        
        return newState;
      }
    }
  }

  return newState;
}


export function handleAkamaru028Return(state: GameState, targetInstanceId?: string): GameState {
  let newState = { ...state };
  const alreadyProcessed = new Set<string>(newState.endPhaseAkamaru028Ids ?? []);

  for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
    const mission = newState.activeMissions[mIdx];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
      const chars = mission[side];

      for (const char of chars) {
        if (targetInstanceId && char.instanceId !== targetInstanceId) continue;
        if (alreadyProcessed.has(char.instanceId)) continue;
        if (char.isHidden) continue;
        const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
        if (topCard.number !== 28) continue;

        
        const hasReturnEffect = (topCard.effects ?? []).some(
          (e) => e.type === 'MAIN' && e.description.includes('[⧗]'),
        );
        if (!hasReturnEffect) continue;

        alreadyProcessed.add(char.instanceId);
        newState.endPhaseAkamaru028Ids = [...alreadyProcessed];

        const effectId = `akamaru028-return-${char.instanceId}`;
        const actionId = `akamaru028-return-action-${char.instanceId}`;
        newState.pendingEffects = [...newState.pendingEffects, {
          id: effectId,
          sourceCardId: topCard.id,
          sourceInstanceId: char.instanceId,
          sourceMissionIndex: mIdx,
          effectType: 'MAIN' as const,
          effectDescription: `Akamaru (028): You may return this character to your hand.`,
          targetSelectionType: 'AKAMARU028_RETURN_TO_HAND',
          sourcePlayer: player,
          requiresTargetSelection: true,
          validTargets: [char.instanceId],
          isOptional: true,
          isMandatory: false,
          resolved: false,
          isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: actionId,
          type: 'SELECT_TARGET',
          player,
          description: `Akamaru (028): Return this character to your hand?`,
          descriptionKey: 'game.effect.desc.akamaru028ReturnToHand',
          options: [char.instanceId],
          minSelections: 1,
          maxSelections: 1,
          sourceEffectId: effectId,
        }];
        
        return newState;
      }
    }
  }

  return newState;
}


export function handleGiantSpider103EndOfRound(state: GameState, targetInstanceId?: string): GameState {
  let newState = { ...state };
  const alreadyProcessed = new Set<string>(newState.endPhaseGiantSpider103Ids ?? []);

  for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
    const mission = newState.activeMissions[mIdx];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
      const chars = mission[side];

      for (const char of chars) {
        if (targetInstanceId && char.instanceId !== targetInstanceId) continue;
        if (alreadyProcessed.has(char.instanceId)) continue;
        if (char.isHidden) continue;
        const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
        if (topCard.number !== 103) continue;

        
        const powerThreshold = (topCard.power ?? 4) + char.powerTokens;

        
        const validTargets: string[] = [];
        for (let mi = 0; mi < newState.activeMissions.length; mi++) {
          const m = newState.activeMissions[mi];
          for (const s of ['player1Characters', 'player2Characters'] as const) {
            for (const c of m[s]) {
              if (c.isHidden) continue;
              const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
              if (((cTop.power ?? 0) + c.powerTokens) <= powerThreshold) {
                validTargets.push(c.instanceId);
              }
            }
          }
        }

        alreadyProcessed.add(char.instanceId);
        newState.endPhaseGiantSpider103Ids = [...alreadyProcessed];

        
        if (validTargets.length === 0) {
          
          newState = returnCharacterToHand(newState, char.instanceId, player);
          newState.log = logAction(
            newState.log, newState.turn, 'end', player,
            'END_RETURN_TO_HAND',
            'Giant Spider (103): Returns to hand at end of round.',
            'game.log.effect.giantSpider103Return',
            { card: 'ARAIGNEE GEANTE', id: 'KS-103-UC' },
          );
          
          return handleGiantSpider103EndOfRound(newState);
        }

        const effectId = `giantSpider103-hide-${char.instanceId}`;
        const actionId = `giantSpider103-hide-action-${char.instanceId}`;
        newState.pendingEffects = [...newState.pendingEffects, {
          id: effectId,
          sourceCardId: topCard.id,
          sourceInstanceId: char.instanceId,
          sourceMissionIndex: mIdx,
          effectType: 'MAIN' as const,
          effectDescription: JSON.stringify({ giantSpiderInstanceId: char.instanceId }),
          targetSelectionType: 'GIANT_SPIDER103_CHOOSE_HIDE_TARGET',
          sourcePlayer: player,
          requiresTargetSelection: true,
          validTargets,
          isOptional: false,
          isMandatory: true,
          resolved: false,
          isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: actionId,
          type: 'SELECT_TARGET' as const,
          player,
          description: `Giant Spider (103): Hide a character with Power ≤ ${powerThreshold}. Then, Giant Spider returns to your hand.`,
          descriptionKey: 'game.effect.desc.giantSpider103EndHide',
          options: validTargets,
          minSelections: 1,
          maxSelections: 1,
          sourceEffectId: effectId,
        }];
        
        return newState;
      }
    }
  }

  return newState;
}


export function returnCharacterToHand(state: GameState, instanceId: string, player: PlayerID): GameState {
  
  const preState = EffectEngine.restoreControlOnLeave(state, instanceId);
  const newState = { ...preState };
  const missions = [...newState.activeMissions];

  for (let i = 0; i < missions.length; i++) {
    const mission = { ...missions[i] };

    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const chars = [...mission[side]];
      const idx = chars.findIndex((c) => c.instanceId === instanceId);
      if (idx !== -1) {
        const char = chars[idx];
        const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
        console.log(`[returnCharacterToHand] Returning ${topCard.name_fr} (${topCard.id}) instanceId=${instanceId} hidden=${char.isHidden} mission=${i} side=${side}`);
        chars.splice(idx, 1);
        mission[side] = chars;
        missions[i] = mission;

        const owner = char.originalOwner;
        const ps = { ...newState[owner] };
        const stackCards = char.stack?.length > 0 ? char.stack : [char.card];
        const topToHand = stackCards[stackCards.length - 1];
        const underToDiscard = stackCards.length > 1 ? stackCards.slice(0, -1) : [];
        ps.hand = [...ps.hand, topToHand];
        if (underToDiscard.length > 0) {
          ps.discardPile = [...ps.discardPile, ...underToDiscard];
        }
        ps.charactersInPlay = Math.max(0, ps.charactersInPlay - 1);
        newState[owner] = ps;

        for (const att of char.attachments ?? []) {
          const attOwnerState = { ...newState[att.owner] };
          attOwnerState.discardPile = [...attOwnerState.discardPile, att.card as (typeof attOwnerState.discardPile)[number]];
          newState[att.owner] = attOwnerState;
        }

        newState.activeMissions = missions;
        return newState;
      }
    }
  }

  newState.activeMissions = missions;
  return newState;
}
