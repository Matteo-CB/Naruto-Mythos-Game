import type { CharacterInPlay, CardData } from '@/lib/engine/types';

function topOf(char: CharacterInPlay): CardData {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

function grantedGroupsFrom(card: CardData): string[] {
  const out: string[] = [];
  for (const effect of card.effects ?? []) {
    const text = effect.description ?? '';
    if (!text.includes('also considered')) continue;
    const match = text.match(/also considered an?\s+(.+?)\s+character/i);
    if (match) out.push(match[1].trim());
  }
  return out;
}

export function effectiveGroupsOf(char: CharacterInPlay): string[] {
  if (char.isHidden) return [];
  const groups: string[] = [];
  const printed = topOf(char).group;
  if (printed) groups.push(printed);
  for (const att of char.attachments ?? []) {
    for (const granted of grantedGroupsFrom(att.card)) {
      if (!groups.includes(granted)) groups.push(granted);
    }
  }
  return groups;
}

export function characterHasGroup(char: CharacterInPlay, group: string): boolean {
  if (!group) return false;
  const wanted = group.toLowerCase();
  return effectiveGroupsOf(char).some((g) => g.toLowerCase() === wanted);
}
