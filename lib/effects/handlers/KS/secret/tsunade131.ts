import type { EffectContext, EffectResult } from "@/lib/effects/EffectTypes";
import { registerEffect } from "@/lib/effects/EffectRegistry";
import type { CharacterInPlay } from "@/lib/engine/types";
import { logAction } from "@/lib/engine/utils/gameLog";

function tsunade131MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;

  const friendlySide: "player1Characters" | "player2Characters" =
    sourcePlayer === "player1" ? "player1Characters" : "player2Characters";

  // Pre-validate: check if there are any non-hidden friendly Leaf Village characters
  let hasLeafTarget = false;
  for (const mission of state.activeMissions) {
    for (const char of mission[friendlySide]) {
      if (char.isHidden) continue;
      if (char.instanceId === sourceCard.instanceId) continue;
      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      if (topCard.group === "Leaf Village") {
        hasLeafTarget = true;
        break;
      }
    }
    if (hasLeafTarget) break;
  }

  if (!hasLeafTarget) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      "EFFECT_NO_TARGET",
      "Tsunade (131): No friendly Leaf Village characters in play to power up.",
      "game.log.effect.noTarget",
      { card: "TSUNADE", id: "KS-131-S" },
    );
    return { state: { ...state, log } };
  }

  // CONFIRM popup before executing
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'TSUNADE131_CONFIRM_MAIN',
    validTargets: [sourceCard.instanceId],
    description: 'Tsunade (131): POWERUP 1 all friendly Leaf Village characters.',
    descriptionKey: 'game.effect.desc.tsunade131ConfirmMain',
    isOptional: true,
  };
}

export function registerTsunade131Handlers(): void {
  registerEffect("KS-131-S", "MAIN", tsunade131MainHandler);
}
