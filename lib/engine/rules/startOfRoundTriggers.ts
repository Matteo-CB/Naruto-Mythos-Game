import type { GameState, PlayerID, CharacterInPlay } from '../types';
import { logAction } from '../utils/gameLog';
import { generateInstanceId } from '../utils/id';
import { weightsPowerupTargets } from '../../effects/handlers/SS/attachmentStatics';
import { amplifiedPowerup } from '../../effects/ContinuousEffects';

export const SAKURA_007_ID = 'SS-007-C';
export const SAKURA_007_NAME = 'SAKURA HARUNO';
export const SAKURA_007_POWERUP = 2;

function topCardOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

function hasTeam7Keyword(char: CharacterInPlay): boolean {
  if (char.isHidden) return false;
  return (topCardOf(char).keywords ?? []).includes('Team 7');
}

function sideOf(player: PlayerID): 'player1Characters' | 'player2Characters' {
  return player === 'player1' ? 'player1Characters' : 'player2Characters';
}

export function startOfRoundPowerupChoices(
  state: GameState,
  player: PlayerID,
  sourceInstanceId: string,
): CharacterInPlay[] {
  const side = sideOf(player);
  const choix: CharacterInPlay[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[side]) {
      if (char.instanceId === sourceInstanceId) continue;
      if (!hasTeam7Keyword(char)) continue;
      choix.push(char);
    }
  }
  return choix;
}

export function startOfRoundPowerupTarget(
  state: GameState,
  player: PlayerID,
  sourceInstanceId: string,
): CharacterInPlay | null {
  const side = sideOf(player);
  let meilleur: CharacterInPlay | null = null;
  let meilleurScore = -1;

  for (const mission of state.activeMissions) {
    for (const char of mission[side]) {
      if (char.instanceId === sourceInstanceId) continue;
      if (!hasTeam7Keyword(char)) continue;
      const score = (topCardOf(char).power ?? 0) + char.powerTokens;
      if (score > meilleurScore) {
        meilleurScore = score;
        meilleur = char;
      }
    }
  }

  return meilleur;
}

function applyForPlayer(state: GameState, player: PlayerID): GameState {
  const side = sideOf(player);
  let newState = state;

  for (let missionIndex = 0; missionIndex < newState.activeMissions.length; missionIndex++) {
    const sources = newState.activeMissions[missionIndex][side].filter(
      (char) => !char.isHidden && topCardOf(char).id === SAKURA_007_ID,
    );

    for (const source of sources) {
      const choix = startOfRoundPowerupChoices(newState, player, source.instanceId);
      if (choix.length > 1) {
        const effId = generateInstanceId();
        const actId = generateInstanceId();
        newState = {
          ...newState,
          pendingEffects: [...newState.pendingEffects, {
            id: effId,
            sourceCardId: SAKURA_007_ID,
            sourceInstanceId: source.instanceId,
            sourceMissionIndex: missionIndex,
            effectType: 'MAIN',
            effectDescription: JSON.stringify({}),
            targetSelectionType: 'SS007_CHOOSE_POWERUP',
            sourcePlayer: player,
            requiresTargetSelection: true,
            validTargets: choix.map((c) => c.instanceId),
            isOptional: false,
            isMandatory: true,
            resolved: false,
            isUpgrade: false,
          }],
          pendingActions: [...newState.pendingActions, {
            id: actId,
            type: 'SELECT_TARGET',
            player,
            description: 'Sakura Haruno (007): choose a friendly Team 7 character to POWERUP 2.',
            descriptionKey: 'game.effect.desc.ss007ChoosePowerup',
            options: choix.map((c) => c.instanceId),
            minSelections: 1,
            maxSelections: 1,
            sourceEffectId: effId,
          }],
        };
        continue;
      }

      const cible = choix.length === 1 ? choix[0] : null;
      if (!cible) {
        newState = {
          ...newState,
          log: logAction(newState.log, newState.turn, 'start', player, 'EFFECT_NO_TARGET',
            'Sakura Haruno (007): no other friendly Team 7 character in play.',
            'game.log.effect.noTarget', { card: SAKURA_007_NAME, id: SAKURA_007_ID }),
        };
        continue;
      }

      const missions = newState.activeMissions.map((mission) => ({
        ...mission,
        player1Characters: mission.player1Characters.map((c) =>
          c.instanceId === cible.instanceId ? { ...c, powerTokens: c.powerTokens + SAKURA_007_POWERUP } : c),
        player2Characters: mission.player2Characters.map((c) =>
          c.instanceId === cible.instanceId ? { ...c, powerTokens: c.powerTokens + SAKURA_007_POWERUP } : c),
      }));

      const nomCible = topCardOf(cible).name_fr;
      newState = {
        ...newState,
        activeMissions: missions,
        log: logAction(newState.log, newState.turn, 'start', player, 'EFFECT_POWERUP',
          `Sakura Haruno (007): POWERUP ${SAKURA_007_POWERUP} on ${nomCible} at the start of the round.`,
          'game.log.effect.powerup',
          {
            card: SAKURA_007_NAME,
            id: SAKURA_007_ID,
            amount: String(SAKURA_007_POWERUP),
            target: nomCible,
            target_en: topCardOf(cible).name_en || nomCible,
          }),
      };
    }
  }

  return newState;
}

export const MIGHT_GUY_116_ID = 'SS-116-R';
export const MIGHT_GUY_116_NAME = 'MIGHT GUY';
export const MIGHT_GUY_116_POWERUP = 2;

function isMightGuy116(char: CharacterInPlay): boolean {
  const top = topCardOf(char);
  return String(top.set) === 'SS' && Number(top.number) === 116;
}

function mightGuy116Targets(state: GameState, player: PlayerID): CharacterInPlay[] {
  const side = sideOf(player);
  const cibles: CharacterInPlay[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[side]) {
      if (char.isHidden) continue;
      if (!(topCardOf(char).keywords ?? []).includes('Team Guy')) continue;
      if ((char.attachments ?? []).length === 0) continue;
      cibles.push(char);
    }
  }
  return cibles;
}

function applyMightGuy116(state: GameState, player: PlayerID): GameState {
  const side = sideOf(player);
  let newState = state;

  for (const mission of newState.activeMissions) {
    for (const source of mission[side]) {
      if (source.isHidden || !isMightGuy116(source)) continue;

      const cibles = mightGuy116Targets(newState, player);
      if (cibles.length === 0) {
        newState = {
          ...newState,
          log: logAction(newState.log, newState.turn, 'start', player, 'EFFECT_NO_TARGET',
            'Might Guy (116): no friendly Team Guy character with an attachment in play.',
            'game.log.effect.noTarget', { card: MIGHT_GUY_116_NAME, id: MIGHT_GUY_116_ID }),
        };
        continue;
      }

      const cibleIds = new Set(cibles.map((c) => c.instanceId));
      const missions = newState.activeMissions.map((m) => ({
        ...m,
        player1Characters: m.player1Characters.map((c) =>
          cibleIds.has(c.instanceId) ? { ...c, powerTokens: c.powerTokens + MIGHT_GUY_116_POWERUP } : c),
        player2Characters: m.player2Characters.map((c) =>
          cibleIds.has(c.instanceId) ? { ...c, powerTokens: c.powerTokens + MIGHT_GUY_116_POWERUP } : c),
      }));

      newState = { ...newState, activeMissions: missions };
      for (const cible of cibles) {
        const nomCible = topCardOf(cible).name_fr;
        newState = {
          ...newState,
          log: logAction(newState.log, newState.turn, 'start', player, 'EFFECT_POWERUP',
            `Might Guy (116): POWERUP ${MIGHT_GUY_116_POWERUP} on ${nomCible} at the start of the round.`,
            'game.log.effect.powerup',
            {
              card: MIGHT_GUY_116_NAME,
              id: MIGHT_GUY_116_ID,
              amount: String(MIGHT_GUY_116_POWERUP),
              target: nomCible,
              target_en: topCardOf(cible).name_en || nomCible,
            }),
        };
      }
    }
  }

  return newState;
}

export const WEIGHTS_087_ID = 'SS-087-UC';
export const WEIGHTS_087_NAME = 'POIDS';
export const WEIGHTS_087_POWERUP = 5;

function applyWeights087(state: GameState, player: PlayerID): GameState {
  let newState = state;
  const cibles = weightsPowerupTargets(newState, player);
  if (cibles.length === 0) return newState;

  const cibleIds = new Set(cibles.map((c) => c.instanceId));
  const missions = newState.activeMissions.map((m) => ({
    ...m,
    player1Characters: m.player1Characters.map((c) =>
      cibleIds.has(c.instanceId) ? { ...c, powerTokens: c.powerTokens + amplifiedPowerup(newState, c.instanceId, WEIGHTS_087_POWERUP) } : c),
    player2Characters: m.player2Characters.map((c) =>
      cibleIds.has(c.instanceId) ? { ...c, powerTokens: c.powerTokens + amplifiedPowerup(newState, c.instanceId, WEIGHTS_087_POWERUP) } : c),
  }));
  newState = { ...newState, activeMissions: missions };

  for (const cible of cibles) {
    const nom = topCardOf(cible).name_fr;
    newState = {
      ...newState,
      log: logAction(newState.log, newState.turn, 'start', player, 'EFFECT_POWERUP',
        `Weights (087): POWERUP ${WEIGHTS_087_POWERUP} on ${nom} at the start of the round.`,
        'game.log.effect.powerup',
        {
          card: WEIGHTS_087_NAME,
          id: WEIGHTS_087_ID,
          amount: String(WEIGHTS_087_POWERUP),
          target: nom,
          target_en: topCardOf(cible).name_en || nom,
        }),
    };
  }
  return newState;
}

export function applyStartOfRoundTriggers(state: GameState): GameState {
  const premier: PlayerID = state.edgeHolder === 'player2' ? 'player2' : 'player1';
  const second: PlayerID = premier === 'player1' ? 'player2' : 'player1';

  let newState = applyForPlayer(state, premier);
  newState = applyMightGuy116(newState, premier);
  newState = applyWeights087(newState, premier);
  newState = applyForPlayer(newState, second);
  newState = applyMightGuy116(newState, second);
  newState = applyWeights087(newState, second);
  return newState;
}
