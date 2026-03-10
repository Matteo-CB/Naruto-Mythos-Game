import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import type { BoosterCard, SealedPool } from './boosterGenerator';
import { separateSealedPool } from './boosterGenerator';
import { validateDeck } from '@/lib/engine/rules/DeckValidation';
import { MIN_DECK_SIZE, MISSION_CARDS_PER_PLAYER } from '@/lib/engine/types';

/**
 * AI builds a strategic deck from its sealed pool.
 * Scores each card and picks the best 30+ characters and 3 missions.
 */

interface ScoredChar {
  card: BoosterCard;
  score: number;
}

function scoreMission(mission: BoosterCard): number {
  let score = mission.power ?? 0; // basePoints
  const effects = mission.effects ?? [];

  // Prefer missions with SCORE effects
  for (const eff of effects) {
    if (eff.type === 'SCORE') {
      score += 3;
      // Continuous SCORE effects are even better
      if (eff.description.includes('[⧗]')) score += 2;
    }
  }

  return score;
}

function scoreCharacter(card: BoosterCard, groupCounts: Map<string, number>): number {
  let score = 0;
  const cost = card.chakra ?? 0;
  const power = card.power ?? 0;

  // Power/cost ratio (higher power for lower cost is better)
  if (cost > 0) {
    score += (power / cost) * 3;
  } else {
    score += power * 2; // Free cards are decent
  }

  // Raw power matters
  score += power * 0.5;

  // Effect value scoring
  for (const eff of card.effects ?? []) {
    switch (eff.type) {
      case 'SCORE':
        score += 4; // SCORE effects are very valuable
        if (eff.description.includes('[⧗]')) score += 2; // Continuous even more
        break;
      case 'MAIN':
        score += 2;
        if (eff.description.includes('POWERUP')) score += 1.5;
        if (eff.description.includes('CHAKRA +')) score += 2;
        if (eff.description.includes('defeat') || eff.description.includes('hide')) score += 1;
        if (eff.description.includes('[⧗]')) score += 1; // Continuous main
        break;
      case 'UPGRADE':
        score += 1.5;
        break;
      case 'AMBUSH':
        score += 1.5;
        break;
    }
  }

  // Group synergy: prefer cards from groups we already have
  const group = card.group ?? '';
  if (group && groupCounts.has(group)) {
    const count = groupCounts.get(group)!;
    score += Math.min(count * 0.3, 2); // Diminishing returns
  }

  // Keyword synergies
  const keywords = card.keywords ?? [];
  if (keywords.includes('Sannin')) score += 1;
  if (keywords.includes('Summon')) score += 0.5;

  // CHAKRA +X effects are very valuable
  for (const eff of card.effects ?? []) {
    const chakraMatch = eff.description.match(/CHAKRA \+(\d+)/);
    if (chakraMatch) {
      score += parseInt(chakraMatch[1], 10) * 2;
    }
  }

  // Mana curve: slightly prefer mid-cost cards (3-4) over extremes
  if (cost >= 2 && cost <= 4) score += 0.5;
  if (cost >= 5 && cost <= 6) score += 0.3;

  return score;
}

export function buildAISealedDeck(pool: SealedPool): {
  characters: CharacterCard[];
  missions: MissionCard[];
} {
  const { characters, missions } = separateSealedPool(pool);

  // Pick best 3 missions
  const scoredMissions = missions
    .map(m => ({ card: m, score: scoreMission(m) }))
    .sort((a, b) => b.score - a.score);

  // Remove duplicate missions (same card ID) - keep highest scored
  const seenMissionIds = new Set<string>();
  const uniqueMissions: typeof scoredMissions = [];
  for (const m of scoredMissions) {
    if (!seenMissionIds.has(m.card.id)) {
      seenMissionIds.add(m.card.id);
      uniqueMissions.push(m);
    }
  }

  const selectedMissions = uniqueMissions
    .slice(0, MISSION_CARDS_PER_PLAYER)
    .map(m => m.card as unknown as MissionCard);

  // Score characters with group synergy awareness
  // First pass: count groups
  const groupCounts = new Map<string, number>();
  for (const c of characters) {
    const group = c.group ?? '';
    if (group) groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
  }

  // Score all characters
  const scoredChars: ScoredChar[] = characters
    .map(c => ({ card: c, score: scoreCharacter(c, groupCounts) }))
    .sort((a, b) => b.score - a.score);

  // Select top characters while respecting max 2 copies per version
  const versionCounts = new Map<string, number>();
  const selectedChars: CharacterCard[] = [];

  for (const sc of scoredChars) {
    if (selectedChars.length >= MIN_DECK_SIZE + 3) break; // Pick a few extra for robustness

    const baseVersion = sc.card.id.replace(/\s*A$/, '').trim();
    const count = versionCounts.get(baseVersion) ?? 0;
    if (count >= 2) continue; // Max 2 copies

    versionCounts.set(baseVersion, count + 1);
    selectedChars.push(sc.card as unknown as CharacterCard);
  }

  // Ensure we have enough characters - if less than 30, add remaining
  if (selectedChars.length < MIN_DECK_SIZE) {
    for (const sc of scoredChars) {
      if (selectedChars.length >= MIN_DECK_SIZE) break;
      const alreadyIn = selectedChars.some(c => (c as unknown as BoosterCard).sealedInstanceId === sc.card.sealedInstanceId);
      if (alreadyIn) continue;

      const baseVersion = sc.card.id.replace(/\s*A$/, '').trim();
      const count = versionCounts.get(baseVersion) ?? 0;
      if (count >= 2) continue;

      versionCounts.set(baseVersion, count + 1);
      selectedChars.push(sc.card as unknown as CharacterCard);
    }
  }

  // Validate
  const result = validateDeck(selectedChars, selectedMissions);
  if (!result.valid) {
    // Fallback: just take the first 30 characters that fit
    const fallbackChars: CharacterCard[] = [];
    const fbVersions = new Map<string, number>();
    for (const c of characters) {
      if (fallbackChars.length >= MIN_DECK_SIZE) break;
      const bv = c.id.replace(/\s*A$/, '').trim();
      const cnt = fbVersions.get(bv) ?? 0;
      if (cnt >= 2) continue;
      fbVersions.set(bv, cnt + 1);
      fallbackChars.push(c as unknown as CharacterCard);
    }
    return { characters: fallbackChars, missions: selectedMissions };
  }

  return { characters: selectedChars, missions: selectedMissions };
}
