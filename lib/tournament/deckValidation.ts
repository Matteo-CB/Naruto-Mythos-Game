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

export interface ValidationErrorEntry {
  key: string;
  params?: Record<string, string | number>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  errorKeys: ValidationErrorEntry[];
}


export function validateDeckForTournament(deck: DeckData, tournament: TournamentRules): ValidationResult {
  const errors: string[] = [];
  const errorKeys: ValidationErrorEntry[] = [];
  const push = (msg: string, key: string, params?: Record<string, string | number>) => {
    errors.push(msg);
    errorKeys.push({ key, params });
  };

  const minSize = tournament.minDeckSize ?? 30;
  const maxSize = tournament.maxDeckSize ?? 999;

  if (deck.cardIds.length < minSize) {
    push(
      `Deck must have at least ${minSize} cards (has ${deck.cardIds.length})`,
      'tournament.deckError.tooFewCards',
      { min: minSize, count: deck.cardIds.length },
    );
  }
  if (deck.cardIds.length > maxSize) {
    push(
      `Deck must have at most ${maxSize} cards (has ${deck.cardIds.length})`,
      'tournament.deckError.tooManyCards',
      { max: maxSize, count: deck.cardIds.length },
    );
  }
  if (deck.missionIds.length !== 3) {
    push(
      `Deck must have exactly 3 mission cards (has ${deck.missionIds.length})`,
      'tournament.deckError.wrongMissionCount',
      { count: deck.missionIds.length },
    );
  }

  if (tournament.bannedCardIds.length > 0) {
    for (const cardId of deck.cardIds) {
      if (tournament.bannedCardIds.includes(cardId)) {
        push(
          `Card ${cardId} is banned in this tournament`,
          'tournament.deckError.cardBanned',
          { cardId },
        );
      }
    }
    for (const missionId of deck.missionIds) {
      if (tournament.bannedCardIds.includes(missionId)) {
        push(
          `Mission ${missionId} is banned in this tournament`,
          'tournament.deckError.missionBanned',
          { missionId },
        );
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

      const versionKey = card.number ? `n:${card.number}` : `id:${cardId}`;
      copyCounts[versionKey] = (copyCounts[versionKey] ?? 0) + 1;
      if (copyCounts[versionKey] > maxCopies) {
        push(
          `Too many copies of ${card.name_fr} (number ${card.number || cardId}): max ${maxCopies}`,
          'tournament.deckError.tooManyCopies',
          { name: card.name_fr, number: String(card.number || cardId), max: maxCopies },
        );
      }

      const rarity = card.rarity;
      rarityCounts[rarity] = (rarityCounts[rarity] ?? 0) + 1;

      if (tournament.allowedRarities.length > 0 && !tournament.allowedRarities.includes(rarity)) {
        push(
          `Rarity ${rarity} is not allowed (card: ${card.name_fr})`,
          'tournament.deckError.rarityNotAllowed',
          { rarity, name: card.name_fr },
        );
      }
      if (tournament.bannedRarities.includes(rarity)) {
        push(
          `Rarity ${rarity} is banned (card: ${card.name_fr})`,
          'tournament.deckError.rarityBanned',
          { rarity, name: card.name_fr },
        );
      }

      const group = card.group ?? '';
      if (tournament.allowedGroups.length > 0 && group && !tournament.allowedGroups.includes(group)) {
        push(
          `Group "${group}" is not allowed (card: ${card.name_fr})`,
          'tournament.deckError.groupNotAllowed',
          { group, name: card.name_fr },
        );
      }
      if (tournament.bannedGroups.includes(group)) {
        push(
          `Group "${group}" is banned (card: ${card.name_fr})`,
          'tournament.deckError.groupBanned',
          { group, name: card.name_fr },
        );
      }

      const keywords: string[] = card.keywords ?? [];
      if (tournament.allowedKeywords.length > 0) {
        const hasAllowed = keywords.some((kw: string) => tournament.allowedKeywords.includes(kw));
        if (!hasAllowed && keywords.length > 0) {
          push(
            `Card ${card.name_fr} has no allowed keyword`,
            'tournament.deckError.noAllowedKeyword',
            { name: card.name_fr },
          );
        }
      }
      for (const kw of keywords) {
        if (tournament.bannedKeywords.includes(kw)) {
          push(
            `Keyword "${kw}" is banned (card: ${card.name_fr})`,
            'tournament.deckError.keywordBanned',
            { keyword: kw, name: card.name_fr },
          );
        }
      }

      if (tournament.maxChakraCost != null && (card.chakra ?? 0) > tournament.maxChakraCost) {
        push(
          `Card ${card.name_fr} costs ${card.chakra} chakra (max: ${tournament.maxChakraCost})`,
          'tournament.deckError.tooMuchChakra',
          { name: card.name_fr, chakra: card.chakra ?? 0, max: tournament.maxChakraCost },
        );
      }
    }

    if (tournament.maxPerRarity) {
      const limits = tournament.maxPerRarity as Record<string, number>;
      for (const [rarity, max] of Object.entries(limits)) {
        if ((rarityCounts[rarity] ?? 0) > max) {
          push(
            `Too many ${rarity} cards: ${rarityCounts[rarity]} (max: ${max})`,
            'tournament.deckError.tooManyOfRarity',
            { rarity, count: rarityCounts[rarity] ?? 0, max },
          );
        }
      }
    }
  } catch {
    /* card data unavailable */
  }

  // Deduplicate while preserving the first occurrence's errorKey entry
  const seen = new Set<string>();
  const uniqueErrors: string[] = [];
  const uniqueKeys: ValidationErrorEntry[] = [];
  for (let i = 0; i < errors.length; i++) {
    if (seen.has(errors[i])) continue;
    seen.add(errors[i]);
    uniqueErrors.push(errors[i]);
    uniqueKeys.push(errorKeys[i]);
  }

  return { valid: uniqueErrors.length === 0, errors: uniqueErrors, errorKeys: uniqueKeys };
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
