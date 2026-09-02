import type { GameState, PlayerID, CharacterCard, CharacterInPlay } from '@/lib/engine/types';
import { isUpgradeNameLegal } from '@/lib/engine/rules/PlayValidation';
import { calculateEffectiveCost, hasKurenai034CostReduction } from '@/lib/engine/rules/ChakraValidation';


function topCardOf(char: CharacterInPlay): CharacterCard | undefined {
  if (char.stack?.length > 0) return char.stack[char.stack.length - 1];
  return (char as unknown as { topCard?: CharacterCard }).topCard ?? char.card;
}

function visibleSameNameElsewhere(
  chars: CharacterInPlay[],
  card: { name_fr: string },
  upgradeTargetInstanceId: string,
): boolean {
  return chars.some((c) => {
    if (c.instanceId === upgradeTargetInstanceId) return false;
    if (c.isHidden) return false;
    const haut = topCardOf(c);
    if (!haut?.name_fr) return false;
    return haut.name_fr.toUpperCase() === card.name_fr.toUpperCase();
  });
}

export function canAffordAsUpgrade(
  state: GameState,
  player: PlayerID,
  card: { name_fr: string; chakra: number; set?: string; number?: number; effects?: Array<{ type: string; description: string }> },
  costReduction: number,
  chakraDisponible?: number,
): boolean {
  const missions = state?.activeMissions;
  const chakra = chakraDisponible ?? state?.[player]?.chakra;
  if (typeof chakra !== 'number' || !Array.isArray(missions)) return false;
  const friendlySide = player === 'player1' ? 'player1Characters' : 'player2Characters';

  for (let missionIndex = 0; missionIndex < missions.length; missionIndex++) {
    const mission = missions[missionIndex];
    for (const char of mission[friendlySide] ?? []) {
      if (char.isHidden) continue;
      if (char.controlledBy !== player) continue;
      if (char.controlledBy !== char.originalOwner) continue;

      const topCard = topCardOf(char);
      if (!topCard?.name_fr) continue;
      if (card.chakra <= (topCard.chakra ?? 0)) continue;

      if (!isUpgradeNameLegal(card as CharacterCard, topCard, state, missionIndex)) continue;

      const isSameName = topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase();
      if (!isSameName && visibleSameNameElsewhere(mission[friendlySide], card, char.instanceId)) continue;

      const effective = calculateEffectiveCost(state, player, card as CharacterCard, missionIndex, false);
      let upgradeCost = Math.max(0, effective - (topCard.chakra ?? 0) - costReduction);
      if (hasKurenai034CostReduction(state, player, card as CharacterCard, missionIndex) && upgradeCost < 1) {
        upgradeCost = 1;
      }
      if (chakra >= upgradeCost) {
        return true;
      }
    }
  }

  return false;
}
