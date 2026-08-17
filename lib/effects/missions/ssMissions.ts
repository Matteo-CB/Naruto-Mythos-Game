import type { GameState, PlayerID, CharacterInPlay, ActiveMission } from '@/lib/engine/types';

export const SS_MISSION_NEW_FORCES = 1;
export const SS_MISSION_RECONNAISSANCE = 2;
export const SS_MISSION_HONORABLE_DUEL = 3;
export const SS_MISSION_HIGH_PRIORITY = 4;
export const SS_MISSION_ADVERSE_TERRAIN = 5;
export const SS_MISSION_LOW_PROFILE = 6;
export const SS_MISSION_KING_OF_THE_HILL = 7;
export const SS_MISSION_TEAM_TRAINING = 8;

export function missionCarries(mission: ActiveMission | undefined, missionNumber: number): boolean {
  if (!mission) return false;
  const card = mission.card;
  if (!card || card.set !== 'SS' || card.card_type !== 'mission') return false;
  const number = typeof card.number === 'string' ? parseInt(card.number, 10) : card.number;
  return number === missionNumber;
}

export function missionCardCarries(card: { set?: string; number?: string | number; card_type?: string } | undefined, missionNumber: number): boolean {
  if (!card || card.set !== 'SS' || card.card_type !== 'mission') return false;
  const number = typeof card.number === 'string' ? parseInt(card.number, 10) : card.number;
  return number === missionNumber;
}

export function visibleName(char: CharacterInPlay): string | null {
  if (char.isHidden) return null;
  const top = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return top?.name_fr?.toUpperCase() ?? null;
}

export function countVisibleFriendly(mission: ActiveMission, player: PlayerID): number {
  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  return chars.filter((c) => !c.isHidden).length;
}

export function honorableDuelBonus(mission: ActiveMission, player: PlayerID, char: CharacterInPlay): number {
  if (!missionCarries(mission, SS_MISSION_HONORABLE_DUEL)) return 0;
  if (char.isHidden) return 0;
  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const visible = chars.filter((c) => !c.isHidden);
  if (visible.length !== 1) return 0;
  return visible[0].instanceId === char.instanceId ? 4 : 0;
}

function coreOf(char: CharacterInPlay, attachmentPower: number): number {
  const top = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  if (char.isHidden) return char.powerTokens;
  return (top?.power ?? 0) + char.powerTokens + attachmentPower;
}

export function kingOfTheHillBonus(
  state: GameState,
  mission: ActiveMission,
  char: CharacterInPlay,
  attachmentPowerOf: (c: CharacterInPlay) => number,
): number {
  if (state.phase !== 'mission') return 0;
  if (!missionCarries(mission, SS_MISSION_KING_OF_THE_HILL)) return 0;
  if (char.isHidden) return 0;

  const contenders = [...mission.player1Characters, ...mission.player2Characters].filter((c) => !c.isHidden);
  if (contenders.length === 0) return 0;

  let best = -Infinity;
  let bestCount = 0;
  let bestId: string | null = null;
  for (const c of contenders) {
    const value = coreOf(c, attachmentPowerOf(c));
    if (value > best) {
      best = value;
      bestCount = 1;
      bestId = c.instanceId;
    } else if (value === best) {
      bestCount += 1;
    }
  }

  if (bestCount !== 1 || bestId !== char.instanceId) return 0;
  return 3;
}

export function teamTrainingBonus(mission: ActiveMission, player: PlayerID): number {
  if (!missionCarries(mission, SS_MISSION_TEAM_TRAINING)) return 0;
  return countVisibleFriendly(mission, player) === 3 ? 5 : 0;
}

export function playedNameIsUniqueInMission(mission: ActiveMission, playedInstanceId: string): boolean {
  const all = [...mission.player1Characters, ...mission.player2Characters];
  const played = all.find((c) => c.instanceId === playedInstanceId);
  if (!played) return false;
  const playedName = visibleName(played);
  if (!playedName) return false;

  for (const other of all) {
    if (other.instanceId === playedInstanceId) {
      if (nameCoveredByThisPlay(other) === playedName) return false;
      continue;
    }
    if (visibleName(other) === playedName) return false;
  }
  return true;
}

function nameCoveredByThisPlay(played: CharacterInPlay): string | null {
  if (played.isHidden) return null;
  const stack = played.stack ?? [];
  if (stack.length < 2) return null;
  return stack[stack.length - 2]?.name_fr?.toUpperCase() ?? null;
}

export function puissanceDesEquipementsDeMission(mission: ActiveMission, player: PlayerID): number {
  let total = 0;
  for (const equipement of mission.attachments ?? []) {
    if (equipement.owner !== player) continue;
    total += equipement.card.power ?? 0;
  }
  return total;
}

export function missionSidePowerBonus(mission: ActiveMission, player: PlayerID): number {
  return teamTrainingBonus(mission, player) + puissanceDesEquipementsDeMission(mission, player);
}
