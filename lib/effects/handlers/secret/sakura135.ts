import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterCard } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';
import { generateInstanceId } from '../../../engine/utils/id';

/**
 * Card 135/130 - SAKURA HARUNO "Corps Medical du Village de la Feuille" (S)
 * Chakra: 5, Power: 4
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN: Look at the top 3 cards of your deck. Play one character anywhere
 *       and discard the other cards.
 *
 * MAIN "effect:": Instead, play the card paying 4 less.
 *   - The "effect:" modifier applies when this card is played as an upgrade.
 *   - When upgrading: the chosen card costs 4 less chakra to play.
 *
 * Implementation notes:
 *   - For automated play: pick the highest-power card from the top 3 as the
 *     "best" card. Place it face-visible on the first available mission.
 *   - Full interactive target selection will be added in the UI phase.
 *   - The played card's chakra cost must be paid from the player's pool
 *     (with the 4-reduction if upgrading).
 */

function sakura135MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  const playerState = { ...state[ctx.sourcePlayer] };
  const deck = [...playerState.deck];
  const costReduction = ctx.isUpgrade ? 4 : 0;

  if (deck.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Sakura Haruno (135): Deck is empty, no cards to look at.',
      'game.log.effect.noTarget',
      { card: 'SAKURA HARUNO', id: '135/130' },
    );
    return { state: { ...state, log } };
  }

  // Look at top 3 cards
  const topCards = deck.splice(0, Math.min(3, deck.length));

  // Find the best character card to play (highest power)
  let bestCardIndex = -1;
  let bestPower = -1;

  for (let i = 0; i < topCards.length; i++) {
    const card = topCards[i];
    if (card.card_type === 'character') {
      if (card.power > bestPower) {
        bestPower = card.power;
        bestCardIndex = i;
      }
    }
  }

  if (bestCardIndex === -1) {
    // No character cards in top 3 - discard all
    playerState.deck = deck;
    playerState.discardPile = [...playerState.discardPile, ...topCards];
    state = {
      ...state,
      [ctx.sourcePlayer]: playerState,
      log: logAction(
        state.log,
        state.turn,
        state.phase,
        ctx.sourcePlayer,
        'EFFECT_DISCARD',
        'Sakura Haruno (135): No character cards in top 3, all discarded.',
        'game.log.effect.discardCards',
        { card: 'SAKURA HARUNO', id: '135/130', count: topCards.length },
      ),
    };
    return { state };
  }

  const chosenCard = topCards[bestCardIndex] as CharacterCard;
  const discardCards = topCards.filter((_, i) => i !== bestCardIndex);

  // Calculate cost to play
  const playCost = Math.max(0, chosenCard.chakra - costReduction);

  // Check if we can afford it
  if (playerState.chakra < playCost) {
    // Cannot afford, discard all
    playerState.deck = deck;
    playerState.discardPile = [...playerState.discardPile, ...topCards];
    state = {
      ...state,
      [ctx.sourcePlayer]: playerState,
      log: logAction(
        state.log,
        state.turn,
        state.phase,
        ctx.sourcePlayer,
        'EFFECT_NO_CHAKRA',
        `Sakura Haruno (135): Cannot afford to play ${chosenCard.name_fr} (cost ${playCost}). All cards discarded.`,
        'game.log.effect.noChakra',
        { card: 'SAKURA HARUNO', id: '135/130' },
      ),
    };
    return { state };
  }

  // Pay the cost
  playerState.chakra -= playCost;
  playerState.deck = deck;
  playerState.discardPile = [...playerState.discardPile, ...discardCards];
  playerState.charactersInPlay += 1;

  state = { ...state, [ctx.sourcePlayer]: playerState };

  // Place the card on any mission ("play one character anywhere")
  // Auto-resolve: pick the mission with fewest friendly characters to spread power
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
    card: chosenCard,
    isHidden: false,
    powerTokens: 0,
    stack: [chosenCard],
    controlledBy: ctx.sourcePlayer,
    originalOwner: ctx.sourcePlayer,
    missionIndex: targetMissionIndex,
  };

  targetMission[friendlySide] = [...targetMission[friendlySide], newCharacter];
  missions[targetMissionIndex] = targetMission;

  const costDesc = ctx.isUpgrade ? ` (cost reduced by 4, paid ${playCost})` : ` (paid ${playCost})`;
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_PLAY',
    `Sakura Haruno (135): Played ${chosenCard.name_fr} from top of deck to mission ${targetMissionIndex}${costDesc}. Discarded ${discardCards.length} other card(s).`,
    'game.log.effect.playFromDeck',
    { card: 'SAKURA HARUNO', id: '135/130', target: chosenCard.name_fr, mission: `mission ${targetMissionIndex}`, cost: playCost },
  );

  return { state: { ...state, activeMissions: missions, log } };
}

export function registerSakura135Handlers(): void {
  registerEffect('135/130', 'MAIN', sakura135MainHandler);
}
