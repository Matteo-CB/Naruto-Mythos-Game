import type { AttachedCard, CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';

export const FLASH_BOMB = 83;
export const POISON_NEEDLES = 84;
export const WEIGHTS = 87;
export const MAKE_OUT_BOOK = 88;
export const ADAMANTINE_NYOI = 98;
export const NINJA_INFO_CARDS = 100;
export const FOOD_PILLS = 102;
export const CHANGE_OF_RANK = 103;
export const RAMEN_ICHIRAKU = 104;
export const DEMON_ISLAND_LAB = 105;
export const HOKAGE_ROCKS = 106;
export const FOREST_OF_DEATH = 107;
export const PLANNED_REINFORCEMENTS = 109;
export const VILLAGE_OF_ARTISANS = 110;

function isSs(card: { set?: string; number?: string | number } | undefined, numero: number): boolean {
  return !!card && String(card.set) === 'SS' && Number(card.number) === numero;
}

function topOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

export function attachmentsOn(char: CharacterInPlay): AttachedCard[] {
  return char.attachments ?? [];
}

export function hostCarries(char: CharacterInPlay, numero: number): boolean {
  return attachmentsOn(char).some((a) => isSs(a.card, numero));
}

export function missionCarriesAttachment(
  mission: { attachments?: AttachedCard[] } | undefined,
  numero: number,
  owner?: PlayerID,
): AttachedCard[] {
  return (mission?.attachments ?? []).filter(
    (a) => isSs(a.card, numero) && (owner === undefined || a.owner === owner),
  );
}

export function textIsBlanked(char: CharacterInPlay): boolean {
  return hostCarries(char, FLASH_BOMB);
}

export function cannotReceivePowerTokens(char: CharacterInPlay): boolean {
  return hostCarries(char, POISON_NEEDLES);
}

export function cannotReceiveOtherAttachments(char: CharacterInPlay): boolean {
  return hostCarries(char, MAKE_OUT_BOOK);
}

export function attachmentPowerBonus(
  state: GameState,
  host: CharacterInPlay,
  hostOwner: PlayerID,
  missionIndex: number,
  attachment: AttachedCard,
): number {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return 0;
  const adversaire: PlayerID = hostOwner === 'player1' ? 'player2' : 'player1';

  if (isSs(attachment.card, ADAMANTINE_NYOI)) {
    const side = attachment.owner === 'player1' ? 'player1Characters' : 'player2Characters';
    return mission[side].filter(
      (c) => !c.isHidden && (topOf(c).group ?? '') === 'Leaf Village',
    ).length;
  }

  if (isSs(attachment.card, NINJA_INFO_CARDS)) {
    const ennemiSide = adversaire === 'player1' ? 'player1Characters' : 'player2Characters';
    return mission[ennemiSide].filter((c) => c.isHidden).length;
  }

  return 0;
}

export function missionAttachmentPowerModifier(
  state: GameState,
  char: CharacterInPlay,
  player: PlayerID,
  missionIndex: number,
): number {
  const mission = state.activeMissions[missionIndex];
  if (!mission || char.isHidden) return 0;
  const top = topOf(char);
  let modifier = 0;

  for (const ramen of missionCarriesAttachment(mission, RAMEN_ICHIRAKU, player)) {
    void ramen;
    if ((top.chakra ?? 0) <= 2) modifier += 1;
    if (attachmentsOn(char).some((a) => (a.card.keywords ?? []).includes('Food'))) modifier += 1;
  }

  for (const rocher of missionCarriesAttachment(mission, HOKAGE_ROCKS, player)) {
    void rocher;
    if ((top.power ?? 0) >= 5) modifier += 2;
  }

  return modifier;
}

export function missionPointBonus(mission: { attachments?: AttachedCard[] } | undefined): number {
  return missionCarriesAttachment(mission, CHANGE_OF_RANK).length;
}

export function virtualSoundFourCount(
  mission: { attachments?: AttachedCard[] } | undefined,
  player: PlayerID,
): number {
  return missionCarriesAttachment(mission, DEMON_ISLAND_LAB, player).length;
}

export function forestOfDeathActive(
  mission: { attachments?: AttachedCard[] } | undefined,
  player: PlayerID,
): boolean {
  return missionCarriesAttachment(mission, FOREST_OF_DEATH, player).length > 0;
}

export function artisanVillageCount(
  mission: { attachments?: AttachedCard[] } | undefined,
  player: PlayerID,
): number {
  return missionCarriesAttachment(mission, VILLAGE_OF_ARTISANS, player).length;
}

export function hostChakraBonus(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  return attachmentsOn(char).filter((a) => isSs(a.card, FOOD_PILLS)).length;
}

export function weightsPowerupTargets(state: GameState, player: PlayerID): CharacterInPlay[] {
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  const cibles: CharacterInPlay[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[side]) {
      if (char.isHidden) continue;
      if (attachmentsOn(char).some((a) => isSs(a.card, WEIGHTS))) cibles.push(char);
    }
  }
  return cibles;
}

export function ninjaInfoCardsWatching(
  mission: { player1Characters?: CharacterInPlay[]; player2Characters?: CharacterInPlay[] } | undefined,
  viewer: PlayerID,
): boolean {
  const side = viewer === 'player1' ? 'player1Characters' : 'player2Characters';
  for (const char of mission?.[side] ?? []) {
    if (char.isHidden) continue;
    if (attachmentsOn(char).some((a) => a.owner === viewer && isSs(a.card, NINJA_INFO_CARDS))) return true;
  }
  return false;
}

export function virtualSoundFourStats(
  mission: { attachments?: AttachedCard[] } | undefined,
  player: PlayerID,
): { compte: number; cout: number; puissance: number } {
  const labos = missionCarriesAttachment(mission, DEMON_ISLAND_LAB, player);
  let cout = 0;
  let puissance = 0;
  for (const labo of labos) {
    cout += labo.card.chakra ?? 0;
    puissance += labo.card.power ?? 0;
  }
  return { compte: labos.length, cout, puissance };
}
