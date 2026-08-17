import type { ActiveMission, CardData, CharacterCard, PlayerID } from '../types';
import { characterGroupMatches, characterKeywordMatches } from './costTextScope';

const MOTIF_REMISE = /(?:cost|costs|pay|pays|paying)\s+(\d+)\s+less/i;
const MOTIF_PLANCHER = /min\.?\s*(\d+)/i;

export interface RemiseLue {
  montant: number;
  plancher: number;
}

function estContinu(description: string): boolean {
  return description.includes('[⧗]');
}

function viseLesPersonnages(description: string): boolean {
  return /character/i.test(description) || /to play/i.test(description);
}

function porteeRespectee(description: string, card: CharacterCard): boolean {
  if (!characterGroupMatches(description, card)) return false;
  if (!characterKeywordMatches(description, card)) return false;
  return true;
}

function lireRemise(description: string, card: CharacterCard): RemiseLue | null {
  if (!estContinu(description)) return null;
  if (!viseLesPersonnages(description)) return null;
  const trouve = description.match(MOTIF_REMISE);
  if (!trouve) return null;
  if (!porteeRespectee(description, card)) return null;
  const plancher = description.match(MOTIF_PLANCHER);
  return {
    montant: parseInt(trouve[1], 10),
    plancher: plancher ? parseInt(plancher[1], 10) : 0,
  };
}

function concerneLeJoueur(description: string, proprietaire: PlayerID | null, player: PlayerID): boolean {
  const reserveAuCamp = /friendly|your/i.test(description);
  if (!reserveAuCamp) return true;
  if (proprietaire === null) return true;
  return proprietaire === player;
}

function effetsDe(source: CardData | undefined): string[] {
  return (source?.effects ?? []).map((e) => e.description);
}

export function missionCostReduction(
  mission: ActiveMission | undefined,
  player: PlayerID,
  card: CharacterCard,
): RemiseLue {
  const cumul: RemiseLue = { montant: 0, plancher: 0 };
  if (!mission) return cumul;

  const sources: Array<{ descriptions: string[]; proprietaire: PlayerID | null }> = [
    { descriptions: effetsDe(mission.card as unknown as CardData), proprietaire: null },
    ...(mission.attachments ?? []).map((a) => ({
      descriptions: effetsDe(a.card),
      proprietaire: a.owner,
    })),
  ];

  for (const source of sources) {
    for (const description of source.descriptions) {
      if (!concerneLeJoueur(description, source.proprietaire, player)) continue;
      const remise = lireRemise(description, card);
      if (!remise) continue;
      cumul.montant += remise.montant;
      cumul.plancher = Math.max(cumul.plancher, remise.plancher);
    }
  }

  return cumul;
}
