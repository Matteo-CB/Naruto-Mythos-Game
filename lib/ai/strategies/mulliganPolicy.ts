import type { GameState, GameAction, PlayerID } from '../../engine/types';

export function decideMulliganStrong(
  state: GameState,
  player: PlayerID,
  validActions: GameAction[],
): GameAction {
  const hand = state[player].hand;
  if (hand.length === 0) return validActions[0];

  let score = 0;

  const costs = hand.map((c) => c.chakra ?? 0);
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const avgCost = costs.reduce((s, c) => s + c, 0) / hand.length;
  const avgPower = hand.reduce((s, c) => s + (c.power ?? 0), 0) / hand.length;

  if (minCost <= 4) score += 4;
  if (maxCost >= 5) score += 2;
  if (avgCost >= 3 && avgCost <= 6) score += 3;
  score += avgPower * 1.5;

  for (const card of hand) {
    if (card.effects?.some((e) => e.type === 'AMBUSH')) score += 2.5;
    if (card.effects?.some((e) => e.type === 'SCORE')) score += 2;
    if (card.effects?.some((e) => /CHAKRA\s*\+/i.test(e.description))) score += 2.5;
    if (card.effects?.some((e) => /POWERUP/i.test(e.description))) score += 1.5;
  }

  const groupCounts = new Map<string, number>();
  for (const c of hand) {
    if (!c.group) continue;
    groupCounts.set(c.group, (groupCounts.get(c.group) ?? 0) + 1);
  }
  for (const count of groupCounts.values()) {
    if (count >= 4) score += 6;
    else if (count >= 3) score += 4;
    else if (count >= 2) score += 2;
  }

  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      if (hand[i].name_fr === hand[j].name_fr) score += 3;
    }
  }

  if (minCost > 5) score -= 6;
  if (costs.filter((c) => c >= 7).length >= 3) score -= 4;

  const keep = validActions.find((a) => a.type === 'MULLIGAN' && !a.doMulligan);
  const mulligan = validActions.find((a) => a.type === 'MULLIGAN' && a.doMulligan);

  if (score >= 14 && keep) return keep;
  return mulligan ?? validActions[0];
}
