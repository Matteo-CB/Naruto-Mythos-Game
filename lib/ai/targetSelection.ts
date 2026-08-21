

import type { GameState, PlayerID, CharacterInPlay, ActiveMission, PendingEffect } from '../engine/types';
import { getCardTier, hasUpgradeTarget } from './evaluation/CardTiers';
import { pointsGagnesEnRemportant } from '@/lib/effects/missions/ssMissions';

export type AIDifficulty = 'easy' | 'medium' | 'hard' | 'impossible';

interface PendingActionInfo {
  description: string;
  sourceEffectId?: string;
  descriptionKey?: string;
}






function findPendingEffect(state: GameState, pendingAction: PendingActionInfo): PendingEffect | undefined {
  if (!pendingAction.sourceEffectId) return undefined;
  return state.pendingEffects?.find((e) => e.id === pendingAction.sourceEffectId);
}


function bestDeclaredNumber(state: GameState, aiPlayer: PlayerID): number {
  const deck = state[aiPlayer].deck;
  if (deck.length === 0) return 0;

  let best = 0;
  let bestValue = 0;
  for (let declared = 1; declared <= 10; declared++) {
    const hits = deck.filter((card) => (card.chakra ?? 0) >= declared).length;
    const value = declared * (hits / deck.length);
    if (value > bestValue) {
      bestValue = value;
      best = declared;
    }
  }
  return best;
}

function selectForcedHideTarget(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  const enemies = options.filter((id) => {
    const found = findCharacterInState(state, id);
    return !!found && found.side !== aiPlayer;
  });
  if (enemies.length > 0) return selectDefeatTarget(enemies, state, aiPlayer, difficulty);

  let weakest = options[0];
  let weakestPower = Infinity;
  for (const id of options) {
    const found = findCharacterInState(state, id);
    if (!found) continue;
    const top = found.char.stack?.length > 0 ? found.char.stack[found.char.stack.length - 1] : found.char.card;
    const power = (top.power ?? 0) + found.char.powerTokens;
    if (power < weakestPower) {
      weakestPower = power;
      weakest = id;
    }
  }
  return weakest;
}

export function aiSelectTarget(
  options: string[],
  pendingAction: PendingActionInfo,
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  
  if (options.length === 0) return '';

  if (options.length === 1 && options[0] === 'declare') {
    return String(bestDeclaredNumber(state, aiPlayer));
  }

  if (options.length === 1) return options[0];

  
  if (options.includes('confirm')) return 'confirm';

  
  
  
  
  const pendingEffect = findPendingEffect(state, pendingAction);
  const tst = pendingEffect?.targetSelectionType ?? '';

  
  if (tst.includes('_CONFIRM_') || tst.endsWith('_CONFIRM')) {
    return options[0];
  }

  
  if (tst === 'CHOOSE_TOKEN_AMOUNT_REMOVE' || tst === 'CHOOSE_TOKEN_AMOUNT_STEAL' || tst === 'SS090_CHOOSE_AMOUNT' ||
      pendingAction.descriptionKey === 'game.effect.desc.chooseTokenAmountRemove' ||
      pendingAction.descriptionKey === 'game.effect.desc.chooseTokenAmountSteal') {
    return options.reduce((max, opt) => parseInt(opt, 10) > parseInt(max, 10) ? opt : max, options[0]);
  }

  
  if (tst === 'SS001_CHOOSE_COUNT') {
    return options.reduce((max, opt) => (parseInt(opt, 10) > parseInt(max, 10) ? opt : max), options[0]);
  }

  
  if (tst === 'SS053_FS_HIDE') {
    return selectForcedHideTarget(options, state, aiPlayer, difficulty);
  }

  
  if (tst === 'ORDERED_DEFEAT') {
    return selectOrderedDefeat(options, state, aiPlayer, difficulty, pendingEffect!);
  }

  
  if (tst === 'REORDER_DISCARD') {
    return selectReorderDiscard(options, state, aiPlayer, difficulty, pendingEffect!);
  }

  
  if (tst === 'SAKURA135_CHOOSE_CARD') {
    return selectSakura135Card(options, state, aiPlayer, difficulty, pendingEffect!);
  }

  
  if (tst === 'SAKURA135_CHOOSE_MISSION') {
    return selectMissionDestination(options, state, aiPlayer, difficulty);
  }

  
  if (tst === 'KABUTO053_CHOOSE_MISSION') {
    return selectMissionDestination(options, state, aiPlayer, difficulty);
  }

  
  if (tst === 'KABUTO053_CHOOSE_DISCARD') {
    return selectDiscardTarget(options, state, aiPlayer, difficulty);
  }

  
  if (tst === 'EFFECT_PLAY_UPGRADE_OR_FRESH') {
    return selectUpgradeOrFresh(options, state, aiPlayer, difficulty, pendingEffect!);
  }

  
  if (tst === 'ITACHI128_MOVE_FRIENDLY') {
    return selectFriendlyToMove(options, state, aiPlayer, difficulty);
  }

  
  if (tst === 'ITACHI128_MOVE_DESTINATION') {
    return selectMissionDestination(options, state, aiPlayer, difficulty);
  }

  
  if (tst === 'CHOJI_018_MOVE_SELF') {
    return selectMissionDestination(options, state, aiPlayer, difficulty);
  }

  
  if (tst === 'TSUNADE104_CHOOSE_CHAKRA') {
    return selectTsunade104Chakra(options, state, aiPlayer, difficulty, pendingEffect!);
  }

  
  if (tst === 'NARUTO133_CHOOSE_TARGET1' || tst === 'NARUTO133_CHOOSE_TARGET2') {
    return selectDefeatTarget(options, state, aiPlayer, difficulty);
  }

  
  if (tst === 'CHOOSE_SCORE_ORDER' || tst === 'END_OF_ROUND_EFFECT_ORDER') {
    return options[0];
  }

  
  if (tst === 'GAARA120_CHOOSE_DEFEAT') {
    return selectDefeatTarget(options, state, aiPlayer, difficulty);
  }

  
  if (difficulty === 'easy') {
    return randomPick(options);
  }

  
  
  
  const desc = pendingAction.description.toLowerCase();

  
  if (desc.includes('powerup') || desc.includes('power up') || desc.includes('power token')) {
    return selectPowerupTarget(options, state, aiPlayer, difficulty);
  }

  
  if (desc.includes('choose one of your characters to defeat') || desc.includes('choisissez un de vos personnages')) {
    return selectSacrificeTarget(options, state, aiPlayer, difficulty);
  }

  
  if (desc.includes('score effect') || desc.includes('effet score')) {
    return options[0];
  }

  
  if (desc.includes('defeat') || desc.includes('destroy') || desc.includes('eliminate')) {
    return selectDefeatTarget(options, state, aiPlayer, difficulty);
  }

  
  if (desc.includes('hide') || desc.includes('cacher') || desc.includes('face down')) {
    return selectDefeatTarget(options, state, aiPlayer, difficulty);
  }

  
  if (desc.includes('move') || desc.includes('déplace')) {
    return selectMoveTarget(options, state, aiPlayer, difficulty);
  }

  
  if (desc.includes('steal') || desc.includes('take control') || desc.includes('control')) {
    return selectDefeatTarget(options, state, aiPlayer, difficulty);
  }

  
  if (desc.includes('return') || desc.includes('hand') || desc.includes('retour')) {
    return selectDefeatTarget(options, state, aiPlayer, difficulty);
  }

  
  if (desc.includes('discard') || desc.includes('défausse')) {
    return selectDiscardTarget(options, state, aiPlayer, difficulty);
  }

  
  if (desc.includes('choose') || desc.includes('select') || desc.includes('choisir')) {
    
    return selectByMissionValue(options, state, aiPlayer) ?? options[0];
  }

  
  if (difficulty === 'medium') {
    return randomPick(options);
  }

  
  return selectByMissionValue(options, state, aiPlayer) ?? options[0];
}





interface FoundCharacter {
  char: CharacterInPlay;
  missionIndex: number;
  side: PlayerID;
}

function findCharacterInState(state: GameState, instanceId: string): FoundCharacter | null {
  for (let mIdx = 0; mIdx < state.activeMissions.length; mIdx++) {
    const mission = state.activeMissions[mIdx];
    for (const char of mission.player1Characters) {
      if (char.instanceId === instanceId) {
        return { char, missionIndex: mIdx, side: 'player1' };
      }
    }
    for (const char of mission.player2Characters) {
      if (char.instanceId === instanceId) {
        return { char, missionIndex: mIdx, side: 'player2' };
      }
    }
  }
  return null;
}


function getCharEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
  return (topCard.power ?? 0) + char.powerTokens;
}


function getCharCost(char: CharacterInPlay): number {
  const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
  return topCard.chakra ?? 0;
}


function getCharTier(char: CharacterInPlay): number {
  const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
  return getCardTier(topCard);
}


function hasScoreEffect(char: CharacterInPlay): boolean {
  if (char.isHidden) return false;
  const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
  return topCard.effects?.some(e => e.type === 'SCORE') ?? false;
}





function getMissionValue(state: GameState, missionIndex: number): number {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return 0;
  return pointsGagnesEnRemportant(mission);
}


function getMissionPowerGap(state: GameState, missionIndex: number, aiPlayer: PlayerID): number {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return 0;

  const aiChars = aiPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
  const oppChars = aiPlayer === 'player1' ? mission.player2Characters : mission.player1Characters;

  const aiPower = aiChars.reduce((sum, c) => sum + getCharEffectivePower(c), 0);
  const oppPower = oppChars.reduce((sum, c) => sum + getCharEffectivePower(c), 0);

  return aiPower - oppPower;
}






function selectPowerupTarget(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  let bestOption = options[0];
  let bestScore = -Infinity;
  const turn = state.turn ?? 1;

  for (const opt of options) {
    const found = findCharacterInState(state, opt);
    if (!found) continue;

    const missionValue = getMissionValue(state, found.missionIndex);
    const powerGap = getMissionPowerGap(state, found.missionIndex, aiPlayer);
    const charPower = getCharEffectivePower(found.char);

    let score: number;
    if (difficulty === 'medium') {
      score = missionValue * 10 + charPower;
    } else {
      
      if (powerGap < 0 && powerGap > -5) {
        
        score = missionValue * 4 + Math.max(0, 10 - Math.abs(powerGap)) * 3;
      } else if (powerGap >= 0 && powerGap <= 3) {
        
        score = missionValue * 2.5 + charPower;
      } else if (powerGap > 3) {
        
        score = missionValue * 0.5 + charPower * 0.3;
      } else {
        
        score = missionValue * 0.8;
      }

      
      if (turn === 4) score *= 1.5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestOption = opt;
    }
  }

  return bestOption;
}






function selectDefeatTarget(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  let bestOption = options[0];
  let bestScore = -Infinity;

  for (const opt of options) {
    const found = findCharacterInState(state, opt);
    if (!found) continue;

    const charPower = getCharEffectivePower(found.char);
    const charCost = getCharCost(found.char);
    const missionValue = getMissionValue(state, found.missionIndex);
    const powerGap = getMissionPowerGap(state, found.missionIndex, aiPlayer);

    let score: number;
    if (difficulty === 'medium') {
      score = charPower * 10 + charCost;
    } else {
      
      score = charPower * missionValue * 0.5 + charCost * 0.5;

      
      if (powerGap < 0 && powerGap + charPower >= 0) {
        score += missionValue * 5;
      }

      
      if (hasScoreEffect(found.char)) {
        score += missionValue * 2;
      }

      
      const tier = getCharTier(found.char);
      score += tier * 1.5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestOption = opt;
    }
  }

  return bestOption;
}






function selectSacrificeTarget(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  let bestOption = options[0];
  let bestScore = Infinity; // lower is "better" (weakest to sacrifice)

  for (const opt of options) {
    const found = findCharacterInState(state, opt);
    if (!found) continue;

    const charPower = getCharEffectivePower(found.char);
    const charCost = getCharCost(found.char);
    const missionValue = getMissionValue(state, found.missionIndex);

    let score: number;
    if (difficulty === 'medium') {
      
      score = charPower * 10 + charCost;
    } else {
      
      
      const powerGap = getMissionPowerGap(state, found.missionIndex, aiPlayer);
      score = charPower * 3 + missionValue + charCost;
      
      if (powerGap > charPower) {
        score -= 5; // Safe to lose this character
      }
    }

    if (score < bestScore) {
      bestScore = score;
      bestOption = opt;
    }
  }

  return bestOption;
}






function selectMoveTarget(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  
  const areMissions = options.every((o) => /^\d+$/.test(o) && parseInt(o) < 10);

  if (areMissions) {
    return selectMissionDestination(options, state, aiPlayer, difficulty);
  }

  
  return selectDefeatTarget(options, state, aiPlayer, difficulty);
}


function selectMissionDestination(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  let bestOption = options[0];
  let bestScore = -Infinity;

  for (const opt of options) {
    const mIdx = parseInt(opt);
    const missionValue = getMissionValue(state, mIdx);
    const powerGap = getMissionPowerGap(state, mIdx, aiPlayer);

    let score: number;
    if (difficulty === 'medium') {
      score = missionValue;
    } else {
      
      if (powerGap < 0 && powerGap > -5) {
        
        score = missionValue * 3;
      } else if (powerGap >= 0 && powerGap <= 2) {
        
        score = missionValue * 2;
      } else if (powerGap > 2) {
        
        score = missionValue * 0.5;
      } else {
        
        score = missionValue * 1.2;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestOption = opt;
    }
  }

  return bestOption;
}






function selectDiscardTarget(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  const hand = state[aiPlayer].hand;
  const chakra = state[aiPlayer].chakra;

  let worstOption = options[0];
  let worstScore = Infinity;

  for (const opt of options) {
    const idx = parseInt(opt);
    if (!isNaN(idx) && idx >= 0 && idx < hand.length) {
      const card = hand[idx];

      let cardValue: number;
      if (difficulty === 'medium') {
        cardValue = (card.power ?? 0) + (card.chakra ?? 0);
      } else {
        
        const tier = getCardTier(card);
        const cost = card.chakra ?? 0;
        cardValue = tier * 3;
        
        if (cost > chakra + 5) cardValue *= 0.5;
        
        if (hasUpgradeTarget(state, aiPlayer, card)) cardValue += 5;
      }

      if (cardValue < worstScore) {
        worstScore = cardValue;
        worstOption = opt;
      }
    }
  }

  return worstOption;
}






function selectOrderedDefeat(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
  pendingEffect: PendingEffect,
): string {
  
  if (difficulty === 'easy') {
    const shuffled = [...options].sort(() => Math.random() - 0.5);
    return JSON.stringify(shuffled);
  }

  let parsed: {
    constraintMode?: string;
    isUpgrade?: boolean;
    useDefeat?: boolean;
    group1?: string[];
    group2?: string[];
    sourceMissionIndex?: number;
  } = {};
  try { parsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

  const constraintMode = parsed.constraintMode;

  if (constraintMode === 'one-per-mission') {
    
    return selectOrderedDefeatOnePerMission(options, state, aiPlayer, difficulty);
  }

  if (constraintMode === 'all-in-mission') {
    
    return selectOrderedDefeatAllInMission(options, state, aiPlayer, difficulty);
  }

  if (constraintMode === 'naruto133') {
    
    return selectOrderedDefeatNaruto133(options, state, aiPlayer, difficulty, parsed);
  }

  
  const scored = options.map((id) => {
    const found = findCharacterInState(state, id);
    if (!found) return { id, score: 0 };
    const power = getCharEffectivePower(found.char);
    const mValue = getMissionValue(state, found.missionIndex);
    return { id, score: power * mValue + getCharTier(found.char) };
  });
  scored.sort((a, b) => b.score - a.score);
  return JSON.stringify(scored.map((s) => s.id));
}


function selectOrderedDefeatOnePerMission(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  
  const byMission = new Map<number, { id: string; score: number }[]>();
  for (const id of options) {
    const found = findCharacterInState(state, id);
    if (!found) continue;
    const mIdx = found.missionIndex;
    if (!byMission.has(mIdx)) byMission.set(mIdx, []);
    const power = getCharEffectivePower(found.char);
    const mValue = getMissionValue(state, mIdx);
    const powerGap = getMissionPowerGap(state, mIdx, aiPlayer);
    let score: number;
    if (difficulty === 'medium') {
      score = power * 10 + mValue;
    } else {
      
      score = power * mValue * 0.5 + getCharTier(found.char) * 1.5;
      if (powerGap < 0 && powerGap + power >= 0) score += mValue * 5;
      if (hasScoreEffect(found.char)) score += mValue * 2;
    }
    byMission.get(mIdx)!.push({ id, score });
  }

  
  const missionEntries = [...byMission.entries()]
    .sort((a, b) => getMissionValue(state, b[0]) - getMissionValue(state, a[0]));

  const ordered: string[] = [];
  for (const [, targets] of missionEntries) {
    targets.sort((a, b) => b.score - a.score);
    ordered.push(targets[0].id);
  }

  return JSON.stringify(ordered);
}


function selectOrderedDefeatAllInMission(
  options: string[],
  _state: GameState,
  _aiPlayer: PlayerID,
  _difficulty: AIDifficulty,
): string {
  
  return JSON.stringify(options);
}


function selectOrderedDefeatNaruto133(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
  parsed: { group1?: string[]; group2?: string[]; sourceMissionIndex?: number },
): string {
  const group1 = parsed.group1 ?? [];
  const group2 = parsed.group2 ?? [];
  const ordered: string[] = [];

  
  const scoreTarget = (id: string): number => {
    const found = findCharacterInState(state, id);
    if (!found) return 0;
    const power = getCharEffectivePower(found.char);
    const mValue = getMissionValue(state, found.missionIndex);
    if (difficulty === 'medium') return power * 10 + mValue;
    const powerGap = getMissionPowerGap(state, found.missionIndex, aiPlayer);
    let s = power * mValue * 0.5 + getCharTier(found.char) * 1.5;
    if (powerGap < 0 && powerGap + power >= 0) s += mValue * 5;
    if (hasScoreEffect(found.char)) s += mValue * 2;
    return s;
  };

  
  if (group1.length > 0) {
    const available1 = group1.filter((id) => options.includes(id));
    if (available1.length > 0) {
      const best1 = available1.reduce((best, id) =>
        scoreTarget(id) > scoreTarget(best) ? id : best, available1[0]);
      ordered.push(best1);
    }
  }

  
  if (group2.length > 0) {
    const available2 = group2.filter((id) => options.includes(id) && !ordered.includes(id));
    if (available2.length > 0) {
      const best2 = available2.reduce((best, id) =>
        scoreTarget(id) > scoreTarget(best) ? id : best, available2[0]);
      ordered.push(best2);
    }
  }

  
  if (ordered.length === 0) {
    const remaining = options.filter((id) => !ordered.includes(id));
    if (remaining.length > 0) ordered.push(remaining[0]);
  }

  return JSON.stringify(ordered);
}






function selectReorderDiscard(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
  pendingEffect: PendingEffect,
): string {
  
  if (difficulty === 'easy') {
    const shuffled = [...options].sort(() => Math.random() - 0.5);
    return JSON.stringify(shuffled);
  }

  
  let parsedReorder: { discardOwner?: string } = {};
  try { parsedReorder = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }
  const discardOwner = (parsedReorder.discardOwner as PlayerID) ?? (aiPlayer === 'player1' ? 'player2' : 'player1');

  
  const discardPile = state[discardOwner]?.discardPile ?? [];

  
  
  const scored = options.map((id) => {
    
    const cleanId = id.replace(/__dup\d+$/, '');
    const card = discardPile.find((c) => c.id === cleanId || c.cardId === cleanId);
    let value: number;
    if (card) {
      if (difficulty === 'medium') {
        value = (card.power ?? 0) * 10 + (card.chakra ?? 0);
      } else {
        value = getCardTier(card) * 3 + (card.power ?? 0) * 2 + (card.chakra ?? 0);
      }
    } else {
      value = 0;
    }
    return { id, value };
  });

  
  
  
  scored.sort((a, b) => b.value - a.value); // most valuable first (bottom) -> least valuable last (top)

  return JSON.stringify(scored.map((s) => s.id));
}






function selectSakura135Card(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
  pendingEffect: PendingEffect,
): string {
  
  if (difficulty === 'easy') return randomPick(options);

  let parsed: { topCards?: Array<{ index: number; name: string; chakra: number; power: number; isCharacter: boolean; cardId: string }> } = {};
  try { parsed = JSON.parse(pendingEffect.effectDescription); } catch { /* ignore */ }

  if (!parsed.topCards || parsed.topCards.length === 0) return options[0];

  let bestOption = options[0];
  let bestScore = -Infinity;

  for (const opt of options) {
    const idx = parseInt(opt, 10);
    const cardInfo = parsed.topCards.find((c) => c.index === idx);
    if (!cardInfo) continue;

    let score: number;
    if (difficulty === 'medium') {
      score = cardInfo.power * 10 + cardInfo.chakra;
    } else {
      
      score = cardInfo.power * 5 + cardInfo.chakra * 2;
      
      try {
        const tier = getCardTier({ id: cardInfo.cardId, power: cardInfo.power, chakra: cardInfo.chakra } as any);
        score += tier * 3;
      } catch { /* ignore */ }
    }

    if (score > bestScore) {
      bestScore = score;
      bestOption = opt;
    }
  }

  return bestOption;
}






function selectUpgradeOrFresh(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
  pendingEffect: PendingEffect,
): string {
  
  if (difficulty === 'easy') return randomPick(options);

  const hasFresh = options.includes('FRESH');
  const upgradeTargets = options.filter((o) => o !== 'FRESH');

  
  if (upgradeTargets.length === 0) return 'FRESH';

  
  if (!hasFresh) {
    
    return selectByMissionValue(upgradeTargets, state, aiPlayer) ?? upgradeTargets[0];
  }

  
  if (difficulty === 'medium') {
    
    return selectByMissionValue(upgradeTargets, state, aiPlayer) ?? upgradeTargets[0];
  }

  
  
  
  let bestUpgrade: string | null = null;
  let bestUpgradeScore = -Infinity;

  for (const id of upgradeTargets) {
    const found = findCharacterInState(state, id);
    if (!found) continue;
    const mValue = getMissionValue(state, found.missionIndex);
    const powerGap = getMissionPowerGap(state, found.missionIndex, aiPlayer);
    let score = mValue * 3;
    if (powerGap < 0 && powerGap > -5) score += 10; // contested, upgrade helps
    if (score > bestUpgradeScore) {
      bestUpgradeScore = score;
      bestUpgrade = id;
    }
  }

  
  return bestUpgrade ?? 'FRESH';
}






function selectFriendlyToMove(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
): string {
  
  if (difficulty === 'easy') return randomPick(options);

  let bestOption = options[0];
  let bestScore = -Infinity;

  for (const id of options) {
    const found = findCharacterInState(state, id);
    if (!found) continue;

    const powerGap = getMissionPowerGap(state, found.missionIndex, aiPlayer);
    const charPower = getCharEffectivePower(found.char);
    const mValue = getMissionValue(state, found.missionIndex);

    let score: number;
    if (difficulty === 'medium') {
      
      score = powerGap - charPower > 0 ? 10 + charPower : charPower - mValue;
    } else {
      
      const remainingGap = powerGap - charPower;
      if (remainingGap > 0) {
        
        
        score = 20 + (remainingGap * 2) - charPower;
      } else if (remainingGap === 0) {
        
        score = 5 - mValue;
      } else {
        
        score = -mValue * 2;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestOption = id;
    }
  }

  return bestOption;
}






function selectTsunade104Chakra(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
  difficulty: AIDifficulty,
  pendingEffect: PendingEffect,
): string {
  
  if (difficulty === 'easy') return randomPick(options);

  const maxOption = options.reduce((max, opt) =>
    parseInt(opt, 10) > parseInt(max, 10) ? opt : max, options[0]);
  const maxAmount = parseInt(maxOption, 10);

  if (difficulty === 'medium') {
    
    const halfAmount = Math.ceil(maxAmount / 2);
    return String(halfAmount);
  }

  
  const missionIndex = pendingEffect.sourceMissionIndex;
  const powerGap = getMissionPowerGap(state, missionIndex, aiPlayer);
  const missionValue = getMissionValue(state, missionIndex);

  if (powerGap >= 3) {
    
    return '0';
  }

  if (powerGap < -5) {
    
    if (missionValue >= 6 && maxAmount >= Math.abs(powerGap)) {
      
      const needed = Math.abs(powerGap) + 1;
      return String(Math.min(needed, maxAmount));
    }
    return '0';
  }

  
  if (powerGap < 0) {
    
    const needed = Math.abs(powerGap) + 1;
    return String(Math.min(needed, maxAmount));
  }

  
  const buffer = Math.min(2, maxAmount);
  return String(buffer);
}






function selectByMissionValue(
  options: string[],
  state: GameState,
  aiPlayer: PlayerID,
): string | null {
  let bestOption: string | null = null;
  let bestScore = -Infinity;

  for (const opt of options) {
    const found = findCharacterInState(state, opt);
    if (!found) continue;

    const missionValue = getMissionValue(state, found.missionIndex);
    if (missionValue > bestScore) {
      bestScore = missionValue;
      bestOption = opt;
    }
  }

  return bestOption;
}





function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
