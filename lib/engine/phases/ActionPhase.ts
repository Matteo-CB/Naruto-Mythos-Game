import type { GameState, GameAction, PlayerID, CharacterInPlay, CharacterCard, PendingAction, CardData } from '../types';
import { HIDDEN_PLAY_COST } from '../types';
import { deepClone } from '../utils/deepClone';
import { generateInstanceId } from '../utils/id';
import { logAction, logContinuousEffectsOnPlay } from '../utils/gameLog';
import { validatePlayCharacter, validatePlayHidden, validateRevealCharacter, validateUpgradeCharacter, checkFlexibleUpgrade } from '../rules/PlayValidation';
import { attachCardToMission, attachCardToCharacter, getCharacterAttachTargets } from '../../effects/attachments';
import { generateInstanceId as generateAttachId } from '../utils/id';
import { calculateEffectiveCost, hasKurenai034CostReduction } from '../rules/ChakraValidation';
import { EffectEngine } from '../../effects/EffectEngine';
import { applyRempartTokenRemoval } from '../../effects/ContinuousEffects';
import { revealUpgradeWouldDuplicateName } from '../../effects/revealNameUniqueness';
import { emitEngineQuestEvent } from '@/lib/quests/engineEmit';
import { avecJoueCeTour } from '../rules/discountedPlay';
import { expireFirstStrike } from '../rules/firstStrike';
import { offerKimimaro077Sacrifice } from '@/lib/effects/handlers/SS/kimimaro077Pass';


export function executeAction(state: GameState, player: PlayerID, action: GameAction): GameState {
  
  if (state.phase !== 'action') return state;

  
  const playerState = state[player];
  if (playerState.hasPassed) return state;

  
  
  const otherPlayer: PlayerID = player === 'player1' ? 'player2' : 'player1';
  const otherPassed = state[otherPlayer].hasPassed;

  if (!otherPassed && state.activePlayer !== player) return state;

  let newState = deepClone(state);

  
  
  if (action.type !== 'SELECT_TARGET' && action.type !== 'DECLINE_OPTIONAL_EFFECT' && action.type !== 'PASS') {
    if (newState.pendingActions.length > 0) {
      return state;
    }
  }

  
  
  newState = EffectEngine.resetKankuro117MoveGrant(newState);

  const beforeAction = newState;

  switch (action.type) {
    case 'PLAY_CHARACTER':
      newState = handlePlayCharacter(newState, player, action.cardIndex, action.missionIndex);
      if (newState === beforeAction) return state; // Failed - don't skip turn
      break;
    case 'PLAY_HIDDEN':
      newState = handlePlayHidden(newState, player, action.cardIndex, action.missionIndex);
      if (newState === beforeAction) return state;
      break;
    case 'REVEAL_CHARACTER':
      newState = handleRevealCharacter(newState, player, action.missionIndex, action.characterInstanceId, action.upgradeTargetInstanceId);
      if (newState === beforeAction) return state;
      break;
    case 'UPGRADE_CHARACTER':
      newState = handleUpgradeCharacter(newState, player, action.cardIndex, action.missionIndex, action.targetInstanceId);
      if (newState === beforeAction) return state;
      break;
    case 'PASS':


      if (newState.pendingEffects.length > 0 || newState.pendingActions.length > 0) {
        return state;
      }
      newState = handlePass(newState, player);
      break;
    case 'SELECT_TARGET':
    case 'DECLINE_OPTIONAL_EFFECT':
      
      break;
    default:
      return state;
  }

  if (action.type === 'PLAY_CHARACTER' || action.type === 'PLAY_HIDDEN' || action.type === 'REVEAL_CHARACTER'
    || action.type === 'UPGRADE_CHARACTER' || action.type === 'PASS') {
    newState = expireFirstStrike(newState, player);
  }

  if (newState.player1.hasPassed && newState.player2.hasPassed) {


    newState.phase = 'mission' as GameState['phase'];
    return newState;
  }

  
  
  
  if (!newState.sandboxNoAlternate && !newState.player1.hasPassed && !newState.player2.hasPassed) {
    if (action.type !== 'PASS' && newState.pendingEffects.length === 0 && newState.pendingActions.length === 0) {
      newState.activePlayer = otherPlayer;
    }
  }

  return newState;
}


function handlePlayCharacter(
  state: GameState,
  player: PlayerID,
  cardIndex: number,
  missionIndex: number,
): GameState {
  const playerState = state[player];
  if (cardIndex < 0 || cardIndex >= playerState.hand.length) return state;
  if (missionIndex < 0 || missionIndex >= state.activeMissions.length) return state;

  const card = playerState.hand[cardIndex];

  if ((card as CardData).card_type === 'attachment') {
    return handlePlayAttachment(state, player, cardIndex, missionIndex);
  }



  const missionForUpgradeCheck = state.activeMissions[missionIndex];
  const chars = player === 'player1' ? missionForUpgradeCheck.player1Characters : missionForUpgradeCheck.player2Characters;

  
  const autoUpgradeTarget = chars.find((c) => {
    if (c.isHidden || c.controlledBy !== player) return false;
    const topCard = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
    if (card.chakra <= topCard.chakra) return false;
    return topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase();
  });

  if (autoUpgradeTarget) {
    return handleUpgradeCharacter(state, player, cardIndex, missionIndex, autoUpgradeTarget.instanceId);
  }

  
  
  

  const effectiveCost = calculateEffectiveCost(state, player, card, missionIndex, false);

  const validation = validatePlayCharacter(state, player, card, missionIndex, effectiveCost);
  if (!validation.valid) return state;

  
  const ps = { ...playerState };
  ps.chakra -= effectiveCost;

  
  const hand = [...ps.hand];
  hand.splice(cardIndex, 1);
  ps.hand = hand;

  
  const charInPlay: CharacterInPlay = {
    instanceId: generateInstanceId(),
    card,
    isHidden: false,
    wasRevealedAtLeastOnce: true, // played face-visible
    powerTokens: 0,
    stack: [card],
    controlledBy: player,
    originalOwner: player,
    missionIndex,
    playedBelowPrintedCost: effectiveCost < (card.chakra ?? 0),
  };


  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIndex] };
  if (player === 'player1') {
    mission.player1Characters = [...mission.player1Characters, charInPlay];
  } else {
    mission.player2Characters = [...mission.player2Characters, charInPlay];
  }
  missions[missionIndex] = mission;


  ps.charactersInPlay = countPlayerCharsInMissions(missions, player);

  let log = logAction(
    state.log,
    state.turn,
    'action',
    player,
    'PLAY_CHARACTER',
    `${player} plays ${card.name_fr} (${card.title_fr}) on mission ${missionIndex + 1} for ${effectiveCost} chakra.`,
    'game.log.playCharacter',
    { card: card.name_fr, title: card.title_fr, card_en: card.name_en || card.name_fr, title_en: card.title_en || card.title_fr, mission: missionIndex + 1, cost: effectiveCost },
  );
  log = logContinuousEffectsOnPlay(log, state.turn, 'action', player, card);

  let newState: GameState = {
    ...state,
    [player]: ps,
    activeMissions: missions,
    log,
  };

  newState = trackLastPlayed(newState, player, charInPlay.instanceId);


  const updatedMission = newState.activeMissions[missionIndex];
  const updatedChars = player === 'player1' ? updatedMission.player1Characters : updatedMission.player2Characters;
  const playedChar = updatedChars[updatedChars.length - 1]; // Just added as last
  if (playedChar) {
    emitEngineQuestEvent(newState, player, 'character.played', {
      targetName: playedChar.card.name_fr,
      targetKeywords: playedChar.card.keywords ?? [],
      group: playedChar.card.group,
    });
    if (playedChar.card.group) {
      emitEngineQuestEvent(newState, player, 'character.played.group', {
        group: playedChar.card.group,
      });
    }
    for (const kw of playedChar.card.keywords ?? []) {
      emitEngineQuestEvent(newState, player, 'character.played.keyword', { keyword: kw });
    }
    const rarity = playedChar.card.rarity;
    if (rarity === 'RA' || rarity === 'MV' || rarity === 'SV' || rarity === 'L') {
      emitEngineQuestEvent(newState, player, 'variant.card.played', { rarity });
    }
    const stackDepth = playedChar.stack?.length ?? 1;
    if (stackDepth >= 3) {
      emitEngineQuestEvent(newState, player, 'upgrade.stack.depth', { depth: stackDepth });
    }
    const sideKey: 'player1Characters' | 'player2Characters' = player === 'player1' ? 'player1Characters' : 'player2Characters';
    const friendlyNamesOnMission = Array.from(new Set(
      updatedMission[sideKey]
        .filter((c) => !c.isHidden)
        .map((c) => (c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card).name_fr.toUpperCase()),
    ));
    if (friendlyNamesOnMission.length >= 2) {
      emitEngineQuestEvent(newState, player, 'mission.has.characters', { names: friendlyNamesOnMission });
    }
    newState = EffectEngine.resolvePlayEffects(newState, player, playedChar, missionIndex, false);
  }

  
  newState = applyRempartTokenRemoval(newState);

  return newState;
}


function handlePlayHidden(
  state: GameState,
  player: PlayerID,
  cardIndex: number,
  missionIndex: number,
): GameState {
  const playerState = state[player];
  if (cardIndex < 0 || cardIndex >= playerState.hand.length) return state;
  if (missionIndex < 0 || missionIndex >= state.activeMissions.length) return state;

  const card = playerState.hand[cardIndex];

  const validation = validatePlayHidden(state, player, card, missionIndex);
  if (!validation.valid) return state;

  
  const ps = { ...playerState };
  ps.chakra -= HIDDEN_PLAY_COST;

  
  const hand = [...ps.hand];
  hand.splice(cardIndex, 1);
  ps.hand = hand;

  
  const charInPlay: CharacterInPlay = {
    instanceId: generateInstanceId(),
    card,
    isHidden: true,
    wasRevealedAtLeastOnce: false, // never revealed yet
    powerTokens: 0,
    stack: [card],
    controlledBy: player,
    originalOwner: player,
    missionIndex,
  };

  
  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIndex] };
  if (player === 'player1') {
    mission.player1Characters = [...mission.player1Characters, charInPlay];
  } else {
    mission.player2Characters = [...mission.player2Characters, charInPlay];
  }
  missions[missionIndex] = mission;

  ps.charactersInPlay = countPlayerCharsInMissions(missions, player);

  const log = logAction(
    state.log,
    state.turn,
    'action',
    player,
    'PLAY_HIDDEN',
    `${player} plays a hidden character on mission ${missionIndex + 1}.`,
    'game.log.playHidden',
    { mission: missionIndex + 1, instanceId: charInPlay.instanceId },
  );

  let newState: GameState = {
    ...state,
    [player]: ps,
    activeMissions: missions,
    log,
  };

  
  newState = trackLastPlayed(newState, player, charInPlay.instanceId);

  return newState;
}



function handlePlayAttachment(
  state: GameState,
  player: PlayerID,
  cardIndex: number,
  missionIndex: number,
): GameState {
  const playerState = state[player];
  const card = playerState.hand[cardIndex];
  const effectiveCost = calculateEffectiveCost(state, player, card, missionIndex, false);
  if (playerState.chakra < effectiveCost) return state;

  const attachTo = card.attach_to ?? 'character';
  let targets: CharacterInPlay[] = [];
  if (attachTo === 'character') {
    targets = getCharacterAttachTargets(state, player, missionIndex, card);
    if (targets.length === 0) return state;
  }

  const ps = { ...playerState };
  ps.chakra -= effectiveCost;
  const hand = [...ps.hand];
  hand.splice(cardIndex, 1);
  ps.hand = hand;

  let newState: GameState = { ...state, [player]: ps };
  newState = {
    ...newState,
    log: logAction(
      newState.log, newState.turn, 'action', player,
      'PLAY_ATTACHMENT',
      `${player} plays attachment ${card.name_fr} for ${effectiveCost} chakra.`,
      'game.log.playAttachment',
      { card: card.name_fr, card_en: card.name_en || card.name_fr, mission: missionIndex + 1, cost: effectiveCost },
    ),
  };

  if (attachTo === 'mission') {
    newState = attachCardToMission(newState, player, card, missionIndex, false);
  } else if (targets.length === 1) {
    newState = attachCardToCharacter(newState, player, card, targets[0].instanceId, false);
  } else {
    const effId = generateAttachId();
    const actId = generateAttachId();
    newState = { ...newState, pendingEffects: [...newState.pendingEffects], pendingActions: [...newState.pendingActions] };
    newState.pendingEffects.push({
      id: effId,
      sourceCardId: card.id,
      sourceInstanceId: '',
      sourceMissionIndex: missionIndex,
      effectType: 'ATTACH',
      effectDescription: JSON.stringify({ card }),
      targetSelectionType: 'ATTACH_CHOOSE_TARGET',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets: targets.map((c) => c.instanceId),
      isOptional: false,
      isMandatory: true,
      resolved: false,
      isUpgrade: false,
    });
    newState.pendingActions.push({
      id: actId,
      type: 'SELECT_TARGET',
      player,
      description: `Choose a friendly character to attach ${card.name_fr} to.`,
      descriptionKey: 'game.effect.desc.attachChooseTarget',
      descriptionParams: { card: card.name_fr },
      options: targets.map((c) => c.instanceId),
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effId,
    });
  }

  return applyRempartTokenRemoval(newState);
}

function handleRevealAttachment(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  hiddenChar: CharacterInPlay,
  card: CardData,
): GameState {
  const attachTo = card.attach_to ?? 'character';
  let targets: CharacterInPlay[] = [];
  if (attachTo === 'character') {
    targets = getCharacterAttachTargets(state, player, missionIndex, card).filter((c) => c.instanceId !== hiddenChar.instanceId);
    if (targets.length === 0) return state;
  }

  const revealCost = calculateEffectiveCost(state, player, card as never, missionIndex, true);
  const ps = { ...state[player] };
  if (ps.chakra < revealCost) return state;
  ps.chakra -= revealCost;

  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIndex] };
  const sideKey: 'player1Characters' | 'player2Characters' = player === 'player1' ? 'player1Characters' : 'player2Characters';
  mission[sideKey] = mission[sideKey].filter((c) => c.instanceId !== hiddenChar.instanceId);
  missions[missionIndex] = mission;
  ps.charactersInPlay = countPlayerCharsInMissions(missions, player);

  let newState: GameState = { ...state, [player]: ps, activeMissions: missions };
  newState = {
    ...newState,
    log: logAction(
      newState.log, newState.turn, 'action', player,
      'PLAY_ATTACHMENT',
      `${player} reveals attachment ${card.name_fr} for ${revealCost} chakra.`,
      'game.log.playAttachment',
      { card: card.name_fr, card_en: card.name_en || card.name_fr, mission: missionIndex + 1, cost: revealCost },
    ),
  };

  const provenance = hiddenChar.originalOwner !== player
    ? { owner: hiddenChar.originalOwner, controllerInstanceId: hiddenChar.controllerInstanceId }
    : undefined;

  if (attachTo === 'mission') {
    newState = attachCardToMission(newState, player, card, missionIndex, true, provenance);
  } else if (targets.length === 1) {
    newState = attachCardToCharacter(newState, player, card, targets[0].instanceId, true, undefined, provenance);
  } else {
    const effId = generateAttachId();
    const actId = generateAttachId();
    newState = { ...newState, pendingEffects: [...newState.pendingEffects], pendingActions: [...newState.pendingActions] };
    newState.pendingEffects.push({
      id: effId,
      sourceCardId: card.id,
      sourceInstanceId: '',
      sourceMissionIndex: missionIndex,
      effectType: 'ATTACH',
      effectDescription: JSON.stringify({ card, provenance }),
      targetSelectionType: 'ATTACH_CHOOSE_TARGET',
      sourcePlayer: player,
      requiresTargetSelection: true,
      validTargets: targets.map((c) => c.instanceId),
      isOptional: false,
      isMandatory: true,
      resolved: false,
      isUpgrade: false,
    });
    newState.pendingActions.push({
      id: actId,
      type: 'SELECT_TARGET',
      player,
      description: `Choose a friendly character to attach ${card.name_fr} to.`,
      descriptionKey: 'game.effect.desc.attachChooseTarget',
      descriptionParams: { card: card.name_fr },
      options: targets.map((c) => c.instanceId),
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effId,
    });
  }

  return applyRempartTokenRemoval(newState);
}

function handleRevealCharacter(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  characterInstanceId: string,
  upgradeTargetInstanceId?: string,
): GameState {
  if (missionIndex < 0 || missionIndex >= state.activeMissions.length) return state;

  const validation = validateRevealCharacter(state, player, missionIndex, characterInstanceId, upgradeTargetInstanceId);
  if (!validation.valid) return state;

  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIndex] };
  const chars = player === 'player1' ? [...mission.player1Characters] : [...mission.player2Characters];

  const charIdx = chars.findIndex((c) => c.instanceId === characterInstanceId);
  if (charIdx === -1) return state;

  const char = { ...chars[charIdx] };
  if (!char.isHidden) return state;
  if (char.controlledBy !== player) return state;

  const charTopCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;

  if ((charTopCard as CardData).card_type === 'attachment') {
    return handleRevealAttachment(state, player, missionIndex, char, charTopCard);
  }

  
  
  
  
  let upgradeTarget: CharacterInPlay | undefined;
  if (upgradeTargetInstanceId) {

    const candidate = chars.find((c) => c.instanceId === upgradeTargetInstanceId);
    if (candidate && !candidate.isHidden && candidate.controlledBy === candidate.originalOwner) {
      const cTop = candidate.stack?.length > 0 ? candidate.stack[candidate.stack?.length - 1] : candidate.card;
      if (charTopCard.chakra > cTop.chakra) {
        const isSameName = cTop.name_fr.toUpperCase() === charTopCard.name_fr.toUpperCase();
        if (isSameName || checkFlexibleUpgrade(charTopCard, cTop, state, missionIndex)) {
          upgradeTarget = candidate;
        }
      }
    }
    if (upgradeTarget && revealUpgradeWouldDuplicateName(state, player, missionIndex, char, upgradeTarget)) {
      return state;
    }
  } else {

    upgradeTarget = chars.find((c) => {
      if (c.instanceId === characterInstanceId) return false;
      if (c.isHidden) return false;
      if (c.controlledBy !== c.originalOwner) return false;
      const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
      if (charTopCard.chakra <= cTop.chakra) return false;
      return cTop.name_fr.toUpperCase() === charTopCard.name_fr.toUpperCase();
    });
  }

  
  const fullCost = calculateEffectiveCost(state, player, charTopCard, missionIndex, true, char);
  char.playedBelowPrintedCost = fullCost < (charTopCard.chakra ?? 0);
  let costToPay = fullCost;

  if (upgradeTarget) {
    const existingTopCard = upgradeTarget.stack?.length > 0
      ? upgradeTarget.stack[upgradeTarget.stack?.length - 1]
      : upgradeTarget.card;
    costToPay = Math.max(0, fullCost - existingTopCard.chakra);
    if (hasKurenai034CostReduction(state, player, charTopCard, missionIndex) && costToPay < 1) {
      costToPay = 1;
    }
  }


  const ps = { ...state[player] };
  if (ps.chakra < costToPay) return state;
  ps.chakra -= costToPay;

  if (upgradeTarget) {

    const upgradeTargetIdx = chars.findIndex((c) => c.instanceId === upgradeTarget.instanceId);
    const upgraded = { ...upgradeTarget };
    upgraded.stack = [...upgraded.stack, ...char.stack];
    upgraded.card = charTopCard;
    upgraded.powerTokens += char.powerTokens; // Transfer power tokens
    const carriedAttachments = [...(upgraded.attachments ?? [])];
    for (const carried of char.attachments ?? []) {
      if (carriedAttachments.some((a) => a.owner === carried.owner)) continue;
      carriedAttachments.push(carried);
    }
    upgraded.attachments = carriedAttachments;
    upgraded.isHidden = false;
    upgraded.wasRevealedAtLeastOnce = true;

    if (upgraded.controllerInstanceId && upgraded.controlledBy === player) {
      upgraded.controllerInstanceId = undefined;
    }

    const updatedChars = chars.filter((c) => c.instanceId !== characterInstanceId);
    const mergedIdx = updatedChars.findIndex((c) => c.instanceId === upgradeTarget.instanceId);
    if (mergedIdx !== -1) updatedChars[mergedIdx] = upgraded;

    if (player === 'player1') {
      mission.player1Characters = updatedChars;
    } else {
      mission.player2Characters = updatedChars;
    }
    missions[missionIndex] = mission;
    ps.charactersInPlay = countPlayerCharsInMissions(missions, player);

    const log = logAction(
      state.log, state.turn, 'action', player,
      'REVEAL_UPGRADE',
      `${player} reveals ${charTopCard.name_fr} (${charTopCard.title_fr}) to upgrade existing ${upgradeTarget.card.name_fr} on mission ${missionIndex + 1} for ${costToPay} chakra.`,
      'game.log.revealUpgrade',
      { card: charTopCard.name_fr, title: charTopCard.title_fr, card_en: charTopCard.name_en || charTopCard.name_fr, title_en: charTopCard.title_en || charTopCard.title_fr, mission: missionIndex + 1, cost: costToPay },
    );

    let newState: GameState = {
      ...state,
      [player]: ps,
      activeMissions: missions,
      log,
    };

    
    newState = trackLastPlayed(newState, player, upgradeTarget.instanceId);


    const updatedMission = newState.activeMissions[missionIndex];
    const updatedMissionChars = player === 'player1' ? updatedMission.player1Characters : updatedMission.player2Characters;
    const upgradedChar = updatedMissionChars.find((c) => c.instanceId === upgradeTarget.instanceId);
    if (upgradedChar) {

      newState = EffectEngine.resolveRevealUpgradeEffects(newState, player, upgradedChar, missionIndex, true);
    }
    return newState;
  }



  char.isHidden = false;
  char.wasRevealedAtLeastOnce = true;
  chars[charIdx] = char;

  if (player === 'player1') {
    mission.player1Characters = chars;
  } else {
    mission.player2Characters = chars;
  }
  missions[missionIndex] = mission;

  const log = logAction(
    state.log,
    state.turn,
    'action',
    player,
    'REVEAL_CHARACTER',
    `${player} reveals ${char.card.name_fr} (${char.card.title_fr}) on mission ${missionIndex + 1} for ${costToPay} chakra.`,
    'game.log.revealCharacter',
    { card: char.card.name_fr, title: char.card.title_fr, card_en: char.card.name_en || char.card.name_fr, title_en: char.card.title_en || char.card.title_fr, mission: missionIndex + 1, cost: costToPay },
  );

  let newState: GameState = {
    ...state,
    [player]: ps,
    activeMissions: missions,
    log,
  };

  newState = trackLastPlayed(newState, player, characterInstanceId);


  const revealedMission = newState.activeMissions[missionIndex];
  const revealedChars = player === 'player1' ? revealedMission.player1Characters : revealedMission.player2Characters;
  const revealedChar = revealedChars.find((c) => c.instanceId === characterInstanceId);
  if (revealedChar) {
    emitEngineQuestEvent(newState, player, 'character.revealed', {
      targetName: revealedChar.card.name_fr,
      targetKeywords: revealedChar.card.keywords ?? [],
    });
    const topRevealed = revealedChar.stack?.length > 0 ? revealedChar.stack[revealedChar.stack.length - 1] : revealedChar.card;
    const hasAmbush = (topRevealed.effects ?? []).some((e) =>
      e.type === 'AMBUSH' && !e.description.includes('[⧗]'),
    );
    if (hasAmbush) {
      emitEngineQuestEvent(newState, player, 'ambush.activated.via_reveal', {
        targetName: topRevealed.name_fr,
      });
    }
    newState = EffectEngine.resolveRevealEffects(newState, player, revealedChar, missionIndex, true);
  }

  
  newState = applyRempartTokenRemoval(newState);

  return newState;
}


function handleUpgradeCharacter(
  state: GameState,
  player: PlayerID,
  cardIndex: number,
  missionIndex: number,
  targetInstanceId: string,
): GameState {
  const playerState = state[player];
  if (cardIndex < 0 || cardIndex >= playerState.hand.length) return state;
  if (missionIndex < 0 || missionIndex >= state.activeMissions.length) return state;

  const newCard = playerState.hand[cardIndex];

  const validation = validateUpgradeCharacter(state, player, newCard, missionIndex, targetInstanceId);
  if (!validation.valid) return state;

  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIndex] };
  const chars = player === 'player1' ? [...mission.player1Characters] : [...mission.player2Characters];

  const charIdx = chars.findIndex((c) => c.instanceId === targetInstanceId);
  if (charIdx === -1) return state;

  const existingChar = { ...chars[charIdx] };
  const existingTopCard = existingChar.stack?.length > 0
    ? existingChar.stack[existingChar.stack?.length - 1]
    : existingChar.card;

  
  
  
  
  const isHiddenUpgrade = existingChar.isHidden;
  const effectiveNewCost = calculateEffectiveCost(state, player, newCard, missionIndex, false);
  let costDiff = isHiddenUpgrade ? effectiveNewCost : Math.max(0, effectiveNewCost - existingTopCard.chakra);
  if (!isHiddenUpgrade && hasKurenai034CostReduction(state, player, newCard, missionIndex) && costDiff < 1) {
    costDiff = 1;
  }

  
  const ps = { ...playerState };
  if (ps.chakra < costDiff) return state;
  ps.chakra -= costDiff;

  
  if (isHiddenUpgrade) {
    existingChar.isHidden = false;
    existingChar.wasRevealedAtLeastOnce = true;
  }

  
  const hand = [...ps.hand];
  hand.splice(cardIndex, 1);
  ps.hand = hand;

  
  existingChar.card = newCard;
  existingChar.stack = [...existingChar.stack, newCard];
  existingChar.playedBelowPrintedCost = effectiveNewCost < (newCard.chakra ?? 0);
  
  

  
  
  if (existingChar.controllerInstanceId && existingChar.controlledBy === player) {
    existingChar.controllerInstanceId = undefined;
  }

  chars[charIdx] = existingChar;

  if (player === 'player1') {
    mission.player1Characters = chars;
  } else {
    mission.player2Characters = chars;
  }
  missions[missionIndex] = mission;

  const log = logAction(
    state.log,
    state.turn,
    'action',
    player,
    'UPGRADE_CHARACTER',
    `${player} upgrades ${existingTopCard.name_fr} to ${newCard.name_fr} (${newCard.title_fr}) on mission ${missionIndex + 1} for ${costDiff} chakra.`,
    'game.log.upgradeCharacter',
    { oldCard: existingTopCard.name_fr, card: newCard.name_fr, title: newCard.title_fr, oldCard_en: existingTopCard.name_en || existingTopCard.name_fr, card_en: newCard.name_en || newCard.name_fr, title_en: newCard.title_en || newCard.title_fr, mission: missionIndex + 1, cost: costDiff },
  );

  let newState: GameState = {
    ...state,
    [player]: ps,
    activeMissions: missions,
    log,
  };

  
  

  
  newState = trackLastPlayed(newState, player, targetInstanceId);


  const upgradedMission = newState.activeMissions[missionIndex];
  const upgradedChars = player === 'player1' ? upgradedMission.player1Characters : upgradedMission.player2Characters;
  const upgradedChar = upgradedChars.find((c) => c.instanceId === targetInstanceId);
  if (upgradedChar) {
    newState = EffectEngine.resolvePlayEffects(newState, player, upgradedChar, missionIndex, true);
  }

  
  newState = applyRempartTokenRemoval(newState);

  return newState;
}


function handlePass(state: GameState, player: PlayerID): GameState {
  const ps = { ...state[player] };
  ps.hasPassed = true;

  let edgeHolder = state.edgeHolder;
  let firstPasser = state.firstPasser;

  const edgeLockedElsewhere = state.edgeLockedFor != null && state.edgeLockedFor !== player;
  if (firstPasser === null) {
    firstPasser = player;
    if (!edgeLockedElsewhere) {
      edgeHolder = player;
    }
  }

  const takesEdge = firstPasser === player && state.firstPasser === null && !edgeLockedElsewhere;
  const log = logAction(
    state.log,
    state.turn,
    'action',
    player,
    'PASS',
    `${player} passes.${takesEdge ? ` ${player} takes the Edge token.` : ''}`,
    takesEdge ? 'game.log.passEdge' : 'game.log.pass',
  );

  
  const otherPlayer: PlayerID = player === 'player1' ? 'player2' : 'player1';
  const activePlayer = state[otherPlayer].hasPassed ? state.activePlayer : otherPlayer;

  const apresPassage: GameState = {
    ...state,
    [player]: ps,
    edgeHolder,
    firstPasser,
    activePlayer,
    log,
  };

  return offerKimimaro077Sacrifice(apresPassage, player);
}


export function getValidActionsForPlayer(state: GameState, player: PlayerID): GameAction[] {
  const actions: GameAction[] = [];
  const ps = state[player];

  if (ps.hasPassed) return [];

  
  const otherPlayer: PlayerID = player === 'player1' ? 'player2' : 'player1';
  const otherPassed = state[otherPlayer].hasPassed;
  if (!otherPassed && state.activePlayer !== player) return [];

  actions.push({ type: 'PASS' });


  for (let cardIdx = 0; cardIdx < ps.hand.length; cardIdx++) {
    const card = ps.hand[cardIdx];

    for (let mIdx = 0; mIdx < state.activeMissions.length; mIdx++) {
      
      const effectiveCost = calculateEffectiveCost(state, player, card, mIdx, false);
      const playValidation = validatePlayCharacter(state, player, card, mIdx, effectiveCost);
      if (playValidation.valid) {
        actions.push({
          type: 'PLAY_CHARACTER',
          cardIndex: cardIdx,
          missionIndex: mIdx,
          hidden: false,
        });
      }

      
      const hiddenValidation = validatePlayHidden(state, player, card, mIdx);
      if (hiddenValidation.valid) {
        actions.push({
          type: 'PLAY_HIDDEN',
          cardIndex: cardIdx,
          missionIndex: mIdx,
        });
      }

      
      const chars = player === 'player1'
        ? state.activeMissions[mIdx].player1Characters
        : state.activeMissions[mIdx].player2Characters;

      for (const existingChar of chars) {
        if (existingChar.isHidden) continue;
        const upgradeValidation = validateUpgradeCharacter(state, player, card, mIdx, existingChar.instanceId);
        if (upgradeValidation.valid) {
          actions.push({
            type: 'UPGRADE_CHARACTER',
            cardIndex: cardIdx,
            missionIndex: mIdx,
            targetInstanceId: existingChar.instanceId,
          });
        }
      }
    }
  }

  
  for (let mIdx = 0; mIdx < state.activeMissions.length; mIdx++) {
    const chars = player === 'player1'
      ? state.activeMissions[mIdx].player1Characters
      : state.activeMissions[mIdx].player2Characters;

    for (const char of chars) {
      if (char.isHidden && char.controlledBy === player) {
        const revealValidation = validateRevealCharacter(state, player, mIdx, char.instanceId);
        if (revealValidation.valid) {
          actions.push({
            type: 'REVEAL_CHARACTER',
            missionIndex: mIdx,
            characterInstanceId: char.instanceId,
          });
        }
      }
    }
  }

  return actions;
}

function countPlayerCharsInMissions(missions: GameState['activeMissions'], player: PlayerID): number {
  let count = 0;
  for (const mission of missions) {
    const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    count += chars.length;
  }
  return count;
}


function trackLastPlayed(state: GameState, _player: PlayerID, instanceId: string): GameState {
  return { ...state, turnPlayedIds: avecJoueCeTour(state.turnPlayedIds, instanceId) };
}


