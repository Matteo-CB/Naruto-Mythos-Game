import { getCardById } from '@/lib/data/cardIndex';

export interface DeckData {
  cardIds: string[];
  missionIds: string[];
}

export interface TournamentRules {
  bannedCardIds: string[];
  allowedGroups: string[];
  bannedGroups: string[];
  allowedKeywords: string[];
  bannedKeywords: string[];
  allowedRarities: string[];
  bannedRarities: string[];
  maxPerRarity: unknown;
  maxCopiesPerCard: number | null;
  minDeckSize: number | null;
  maxDeckSize: number | null;
  maxChakraCost: number | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}


export function validateDeckForTournament(deck: DeckData, tournament: TournamentRules): ValidationResult {
  const errors: string[] = [];

  const minSize = tournament.minDeckSize ?? 30;
  const maxSize = tournament.maxDeckSize ?? 999;

  if (deck.cardIds.length < minSize) {
    errors.push(`Deck must have at least ${minSize} cards (has ${deck.cardIds.length})`);
  }
  if (deck.cardIds.length > maxSize) {
    errors.push(`Deck must have at most ${maxSize} cards (has ${deck.cardIds.length})`);
  }
  if (deck.missionIds.length !== 3) {
    errors.push(`Deck must have exactly 3 mission cards (has ${deck.missionIds.length})`);
  }

  if (tournament.bannedCardIds.length > 0) {
    for (const cardId of deck.cardIds) {
      if (tournament.bannedCardIds.includes(cardId)) {
        errors.push(`Card ${cardId} is banned in this tournament`);
      }
    }
    for (const missionId of deck.missionIds) {
      if (tournament.bannedCardIds.includes(missionId)) {
        errors.push(`Mission ${missionId} is banned in this tournament`);
      }
    }
  }

  try {
    const copyCounts: Record<string, number> = {};
    const rarityCounts: Record<string, number> = {};
    const maxCopies = tournament.maxCopiesPerCard ?? 2;

    for (const cardId of deck.cardIds) {
      const card = getCardById(cardId);
      if (!card) continue;

      copyCounts[cardId] = (copyCounts[cardId] ?? 0) + 1;
      if (copyCounts[cardId] > maxCopies) {
        errors.push(`Too many copies of ${card.name_fr} (${cardId}): max ${maxCopies}`);
      }

      const rarity = card.rarity;
      rarityCounts[rarity] = (rarityCounts[rarity] ?? 0) + 1;

      if (tournament.allowedRarities.length > 0 && !tournament.allowedRarities.includes(rarity)) {
        errors.push(`Rarity ${rarity} is not allowed (card: ${card.name_fr})`);
      }
      if (tournament.bannedRarities.includes(rarity)) {
        errors.push(`Rarity ${rarity} is banned (card: ${card.name_fr})`);
      }

      const group = card.group ?? '';
      if (tournament.allowedGroups.length > 0 && group && !tournament.allowedGroups.includes(group)) {
        errors.push(`Group "${group}" is not allowed (card: ${card.name_fr})`);
      }
      if (tournament.bannedGroups.includes(group)) {
        errors.push(`Group "${group}" is banned (card: ${card.name_fr})`);
      }

      const keywords: string[] = card.keywords ?? [];
      if (tournament.allowedKeywords.length > 0) {
        const hasAllowed = keywords.some((kw: string) => tournament.allowedKeywords.includes(kw));
        if (!hasAllowed && keywords.length > 0) {
          errors.push(`Card ${card.name_fr} has no allowed keyword`);
        }
      }
      for (const kw of keywords) {
        if (tournament.bannedKeywords.includes(kw)) {
          errors.push(`Keyword "${kw}" is banned (card: ${card.name_fr})`);
        }
      }

      if (tournament.maxChakraCost != null && (card.chakra ?? 0) > tournament.maxChakraCost) {
        errors.push(`Card ${card.name_fr} costs ${card.chakra} chakra (max: ${tournament.maxChakraCost})`);
      }
    }

    if (tournament.maxPerRarity) {
      const limits = tournament.maxPerRarity as Record<string, number>;
      for (const [rarity, max] of Object.entries(limits)) {
        if ((rarityCounts[rarity] ?? 0) > max) {
          errors.push(`Too many ${rarity} cards: ${rarityCounts[rarity]} (max: ${max})`);
        }
      }
    }
  } catch {
    /* card data unavailable */
  }

  const uniqueErrors = [...new Set(errors)];

  return { valid: uniqueErrors.length === 0, errors: uniqueErrors };
}


export function emptyTournamentRules(): TournamentRules {
  return {
    bannedCardIds: [],
    allowedGroups: [],
    bannedGroups: [],
    allowedKeywords: [],
    bannedKeywords: [],
    allowedRarities: [],
    bannedRarities: [],
    maxPerRarity: null,
    maxCopiesPerCard: null,
    minDeckSize: null,
    maxDeckSize: null,
    maxChakraCost: null,
  };
}
