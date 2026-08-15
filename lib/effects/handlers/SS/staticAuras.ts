import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { characterHasGroup } from '@/lib/effects/groupUtils';
import { isDuelConditionMet } from '@/lib/effects/duelUtils';

export function topCardOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

function hasKeyword(char: CharacterInPlay, keyword: string): boolean {
  return (topCardOf(char).keywords ?? []).includes(keyword);
}

function nameOf(char: CharacterInPlay): string {
  const top = topCardOf(char);
  return `${top.name_fr ?? ''} ${top.name_en ?? ''}`.toUpperCase();
}

function attachmentsOf(char: CharacterInPlay) {
  return char.attachments ?? [];
}

function hasAttachmentNamed(char: CharacterInPlay, name: string): boolean {
  const wanted = name.toUpperCase();
  return attachmentsOf(char).some((a) => `${a.card.name_fr ?? ''} ${a.card.name_en ?? ''}`.toUpperCase().includes(wanted));
}

function attachmentCostByKeyword(char: CharacterInPlay, keyword: string): number {
  let total = 0;
  for (const a of attachmentsOf(char)) {
    if ((a.card.keywords ?? []).includes(keyword)) total += a.card.chakra ?? 0;
  }
  return total;
}

export function ss2StaticPowerModifier(
  state: GameState,
  char: CharacterInPlay,
  player: PlayerID,
  missionIndex: number,
): number {
  if (char.isHidden) return 0;
  const mission = state.activeMissions[missionIndex];
  if (!mission) return 0;
  const top = topCardOf(char);
  if (String(top.set) !== 'SS') return 0;

  const friendly = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const others = friendly.filter((c) => c.instanceId !== char.instanceId);
  const numero = Number(top.number);
  let modifier = 0;

  if (numero === 1) {
    const tousFeuille = friendly.every((c) => !c.isHidden && characterHasGroup(c, 'Leaf Village'));
    if (tousFeuille) {
      modifier += others.filter((c) => !c.isHidden && characterHasGroup(c, 'Leaf Village')).length;
    }
  }

  if (numero === 27) {
    modifier += 2 * state.activeMissions.length;
  }

  if (numero === 62) {
    modifier += others.filter((c) => !c.isHidden && hasKeyword(c, 'Academy Student')).length;
  }

  if (numero === 69 || numero === 70) {
    const frere = others.some((c) => !c.isHidden && hasKeyword(c, 'Demon Brother'));
    if (frere) modifier += 2;
  }

  if (numero === 26) {
    if (hasAttachmentNamed(char, 'SENBON')) modifier += 2;
  }

  if (numero === 66) {
    modifier += attachmentCostByKeyword(char, 'Weapon');
  }

  if (numero === 54) {
    const duel = (top.effects ?? []).find((e) => e.type === 'DUEL' && e.description.includes('[⧗]'));
    if (duel && isDuelConditionMet(state, missionIndex, duel.description)) modifier -= 3;
  }

  return modifier;
}

export function ss2StaticChakraBonus(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  char: CharacterInPlay,
): number {
  if (char.isHidden) return 0;
  const mission = state.activeMissions[missionIndex];
  if (!mission) return 0;
  const top = topCardOf(char);
  if (String(top.set) !== 'SS') return 0;

  const friendly = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const others = friendly.filter((c) => c.instanceId !== char.instanceId);
  const numero = Number(top.number);

  if (numero === 10 && others.some((c) => !c.isHidden && hasKeyword(c, 'Team 10'))) return 1;
  if (numero === 24 && others.some((c) => !c.isHidden && nameOf(c).includes('NARUTO UZUMAKI'))) return 1;
  if (numero === 61 && !friendly.some((c) => c.isHidden)) return 1;
  return 0;
}

export function foodAttachmentDiscountCount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: GameState | any,
  player: PlayerID,
): number {
  let count = 0;
  const sideKey = player === 'player1' ? 'player1Characters' : 'player2Characters';
  for (const mission of state.activeMissions ?? []) {
    for (const char of mission?.[sideKey] ?? []) {
      if (char.isHidden) continue;
      const top = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (String(top?.set) !== 'SS' || Number(top?.number) !== 67) continue;
      count += 1;
    }
  }
  return count;
}
