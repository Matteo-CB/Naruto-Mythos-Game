import type { GameState, CharacterInPlay } from '@/lib/engine/types';

function topCardOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

const DUEL_NAME_TERMINATOR = /[,:]|\[[^\]]*\]|\b(?:MAIN|AMBUSH|UPGRADE|SCORE|DUEL|FIRST\s+STRIKE)\s+effect\b/i;

export function parseDuelCharacterName(description: string): string | null {
  const cleaned = description.replace(/^\s*\[[^\]]*\]\s*/, '').trim();
  const m = cleaned.match(/^DUEL\s+(.+)$/i);
  if (!m) return null;
  const reste = m[1];
  const coupe = reste.match(DUEL_NAME_TERMINATOR);
  const name = (coupe && coupe.index !== undefined ? reste.slice(0, coupe.index) : reste).trim();
  return name.length > 0 ? name : null;
}

function nameMatches(char: CharacterInPlay, wanted: string): boolean {
  if (char.isHidden) return false;
  const top = topCardOf(char);
  const w = wanted.toUpperCase();
  const fr = (top.name_fr ?? '').toUpperCase();
  const en = (top.name_en ?? '').toUpperCase();
  return fr.includes(w) || en.includes(w);
}

export function isDuelCharacterPresent(
  state: GameState,
  missionIndex: number,
  characterName: string,
): boolean {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return false;
  for (const c of [...mission.player1Characters, ...mission.player2Characters]) {
    if (nameMatches(c, characterName)) return true;
  }
  return false;
}

export function duelPartnersIn(
  state: GameState,
  missionIndex: number,
  characterName: string,
): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  return [...mission.player1Characters, ...mission.player2Characters].filter((c) => nameMatches(c, characterName));
}

export function isDuelConditionMet(
  state: GameState,
  missionIndex: number,
  duelDescription: string,
): boolean {
  const name = parseDuelCharacterName(duelDescription);
  if (!name) return false;
  return isDuelCharacterPresent(state, missionIndex, name);
}

export function hasResolvableInstantDuel(
  state: GameState,
  missionIndex: number,
  effects: ReadonlyArray<{ type: string; description: string }> | undefined,
): boolean {
  if (!effects) return false;
  return effects.some(
    (e) => e.type === 'DUEL' && !e.description.includes('[⧗]') && isDuelConditionMet(state, missionIndex, e.description),
  );
}
