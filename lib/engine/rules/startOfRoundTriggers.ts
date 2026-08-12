import type { GameState, PlayerID, CharacterInPlay } from '../types';
import { logAction } from '../utils/gameLog';

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
      const cible = startOfRoundPowerupTarget(newState, player, source.instanceId);
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

export function applyStartOfRoundTriggers(state: GameState): GameState {
  const premier: PlayerID = state.edgeHolder === 'player2' ? 'player2' : 'player1';
  const second: PlayerID = premier === 'player1' ? 'player2' : 'player1';

  let newState = applyForPlayer(state, premier);
  newState = applyForPlayer(newState, second);
  return newState;
}
