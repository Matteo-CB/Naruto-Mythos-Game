import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterCard } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';
import { generateInstanceId } from '../../../engine/utils/id';

/**
 * Card 109/130 - SAKURA HARUNO "Ninja Medical" (R)
 * Chakra: 4, Power: 3
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Choose one of your Leaf Village characters in your discard pile
 *       and play it anywhere, paying its cost.
 *
 * UPGRADE: MAIN effect: Instead, play the card paying 2 less.
 *
 * Implementation notes:
 *   - Auto-resolve: pick highest-power Leaf Village character from discard.
 *   - Place it face-visible on the mission with fewest friendly chars.
 *   - Pay full cost (or cost-2 if upgrade).
 *   - If no Leaf Village character in discard or not enough chakra, fizzle.
 */

function sakura109MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  const playerState = { ...state[ctx.sourcePlayer] };
  const costReduction = ctx.isUpgrade ? 2 : 0;

  // Find Leaf Village characters in discard pile
  const discardPile = [...playerState.discardPile];
  const leafChars: { card: CharacterCard; index: number }[] = [];

  for (let i = 0; i < discardPile.length; i++) {
    const card = discardPile[i];
    if (card.card_type === 'character' && card.group === 'Leaf Village') {
      leafChars.push({ card: card as CharacterCard, index: i });
    }
  }

  if (leafChars.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Sakura Haruno (109): No Leaf Village character in discard pile.',
      'game.log.effect.noTarget',
      { card: 'SAKURA HARUNO', id: '109/130' },
    );
    return { state: { ...state, log } };
  }

  // Pick the best: highest power, then lowest cost
  leafChars.sort((a, b) => {
    if (b.card.power !== a.card.power) return b.card.power - a.card.power;
    return a.card.chakra - b.card.chakra;
  });

  // Try to find one we can afford
  let chosen: { card: CharacterCard; index: number } | null = null;
  for (const lc of leafChars) {
    const cost = Math.max(0, lc.card.chakra - costReduction);
    if (playerState.chakra >= cost) {
      chosen = lc;
      break;
    }
  }

  if (!chosen) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_CHAKRA',
      `Sakura Haruno (109): Cannot afford any Leaf Village character from discard pile.`,
      'game.log.effect.noChakra',
      { card: 'SAKURA HARUNO', id: '109/130' },
    );
    return { state: { ...state, log } };
  }

  const playCost = Math.max(0, chosen.card.chakra - costReduction);

  // Remove from discard pile
  discardPile.splice(chosen.index, 1);
  playerState.discardPile = discardPile;
  playerState.chakra -= playCost;
  playerState.charactersInPlay += 1;

  state = { ...state, [ctx.sourcePlayer]: playerState };

  // Place on the mission with fewest friendly characters
  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  let targetMissionIndex = ctx.sourceMissionIndex;
  let minChars = Infinity;
  for (let mi = 0; mi < state.activeMissions.length; mi++) {
    const count = state.activeMissions[mi][friendlySide].length;
    if (count < minChars) {
      minChars = count;
      targetMissionIndex = mi;
    }
  }

  const missions = [...state.activeMissions];
  const targetMission = { ...missions[targetMissionIndex] };

  const newCharacter = {
    instanceId: generateInstanceId(),
    card: chosen.card,
    isHidden: false,
    powerTokens: 0,
    stack: [chosen.card],
    controlledBy: ctx.sourcePlayer,
    originalOwner: ctx.sourcePlayer,
    missionIndex: targetMissionIndex,
  };

  targetMission[friendlySide] = [...targetMission[friendlySide], newCharacter];
  missions[targetMissionIndex] = targetMission;

  const costDesc = ctx.isUpgrade ? ` (cost reduced by 2, paid ${playCost})` : ` (paid ${playCost})`;
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_PLAY',
    `Sakura Haruno (109): Played ${chosen.card.name_fr} from discard pile to mission ${targetMissionIndex}${costDesc}.`,
    'game.log.effect.playFromDiscard',
    { card: 'SAKURA HARUNO', id: '109/130', target: chosen.card.name_fr, mission: `mission ${targetMissionIndex}`, cost: playCost },
  );

  return { state: { ...state, activeMissions: missions, log } };
}

export function registerSakura109Handlers(): void {
  registerEffect('109/130', 'MAIN', sakura109MainHandler);
}
