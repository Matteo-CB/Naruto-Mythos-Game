import type { CharacterCard, MissionCard } from '@/lib/engine/types';
import type { BoosterCard, SealedPool } from './boosterGenerator';
import { separateSealedPool } from './boosterGenerator';
import { MIN_DECK_SIZE, MISSION_CARDS_PER_PLAYER } from '@/lib/engine/types';



interface ScoredChar {
  card: BoosterCard;
  score: number;
}

function scoreMission(mission: BoosterCard): number {
  let score = mission.power ?? 0; // basePoints
  const effects = mission.effects ?? [];

  
  for (const eff of effects) {
    if (eff.type === 'SCORE') {
      score += 3;
      
      if (eff.description.includes('[⧗]')) score += 2;
    }
  }

  return score;
}

function scoreCharacter(card: BoosterCard, groupCounts: Map<string, number>): number {
  let score = 0;
  const cost = card.chakra ?? 0;
  const power = card.power ?? 0;

  
  if (cost > 0) {
    score += (power / cost) * 3;
  } else {
    score += power * 2; // Free cards are decent
  }

  
  score += power * 0.5;

  
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

  
  const group = card.group ?? '';
  if (group && groupCounts.has(group)) {
    const count = groupCounts.get(group)!;
    score += Math.min(count * 0.3, 2); // Diminishing returns
  }

  
  const keywords = card.keywords ?? [];
  if (keywords.includes('Sannin')) score += 1;
  if (keywords.includes('Summon')) score += 0.5;

  
  for (const eff of card.effects ?? []) {
    const chakraMatch = eff.description.match(/CHAKRA \+(\d+)/);
    if (chakraMatch) {
      score += parseInt(chakraMatch[1], 10) * 2;
    }
  }

  
  if (cost >= 2 && cost <= 4) score += 0.5;
  if (cost >= 5 && cost <= 6) score += 0.3;

  return score;
}

export function buildAISealedDeck(pool: SealedPool): {
  characters: CharacterCard[];
  missions: MissionCard[];
} {
  const { characters, missions } = separateSealedPool(pool);

  
  const scoredMissions = missions
    .map(m => ({ card: m, score: scoreMission(m) }))
    .sort((a, b) => b.score - a.score);

  
  const seenMissionIds = new Set<string>();
  const uniqueMissions: typeof scoredMissions = [];
  for (const m of scoredMissions) {
    if (!seenMissionIds.has(m.card.id)) {
      seenMissionIds.add(m.card.id);
      uniqueMissions.push(m);
    }
  }

  const selectedMissionCards: BoosterCard[] = uniqueMissions
    .slice(0, MISSION_CARDS_PER_PLAYER)
    .map(m => m.card);

  if (selectedMissionCards.length < MISSION_CARDS_PER_PLAYER) {
    const usedInstanceIds = new Set(selectedMissionCards.map(m => m.sealedInstanceId));
    for (const m of scoredMissions) {
      if (selectedMissionCards.length >= MISSION_CARDS_PER_PLAYER) break;
      if (usedInstanceIds.has(m.card.sealedInstanceId)) continue;
      usedInstanceIds.add(m.card.sealedInstanceId);
      selectedMissionCards.push(m.card);
    }
  }

  const selectedMissions = selectedMissionCards as unknown as MissionCard[];

  
  
  const groupCounts = new Map<string, number>();
  for (const c of characters) {
    const group = c.group ?? '';
    if (group) groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
  }

  
  const scoredChars: ScoredChar[] = characters
    .map(c => ({ card: c, score: scoreCharacter(c, groupCounts) }))
    .sort((a, b) => b.score - a.score);

  
  const selectedChars: CharacterCard[] = [];
  for (const sc of scoredChars) {
    if (selectedChars.length >= MIN_DECK_SIZE + 3) break;
    selectedChars.push(sc.card as unknown as CharacterCard);
  }

  return { characters: selectedChars, missions: selectedMissions };
}
