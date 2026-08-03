import { getPlayableCharacters, getPlayableAttachments, getPlayableMissions } from '@/lib/data/cardLoader';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';

export function getBannableCards(): (CharacterCard | MissionCard)[] {
  const characters = getPlayableCharacters();
  const attachments = getPlayableAttachments() as unknown as CharacterCard[];
  const missions = getPlayableMissions();
  return [...characters, ...attachments, ...missions] as (CharacterCard | MissionCard)[];
}
