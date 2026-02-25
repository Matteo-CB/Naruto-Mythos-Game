import type { EffectContext, EffectResult } from '../../EffectTypes';
import type { CharacterInPlay } from '../../../engine/types';
import { registerEffect } from '../../EffectRegistry';
import { generateInstanceId } from '../../../engine/utils/id';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 053/130 - KABUTO YAKUSHI (UC)
 * Chakra: 4 | Power: 4
 * Group: Sound Village | Keywords: Jutsu
 *
 * UPGRADE: Draw a card.
 *   (French: "Piochez une carte.")
 *
 * MAIN: Play a character from your discard pile anywhere paying 3 less.
 *   (French: "Jouez un personnage depuis votre defausse n'importe ou en payant son cout moins 3.")
 *   - The player browses their entire discard pile and picks a character they can afford.
 *   - If only one affordable character, auto-select it.
 *   - Then choose which mission to play it on (respecting same-name restriction).
 */

function handleKabuto053Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = { ...state[sourcePlayer] };

  if (playerState.deck.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kabuto Yakushi (053) UPGRADE: Deck is empty, cannot draw.',
          'game.log.effect.noTarget',
          { card: 'KABUTO YAKUSHI', id: 'KS-053-UC' },
        ),
      },
    };
  }

  // Draw 1 card
  const deck = [...playerState.deck];
  const drawnCard = deck.shift()!;
  playerState.deck = deck;
  playerState.hand = [...playerState.hand, drawnCard];

  return {
    state: {
      ...state,
      [sourcePlayer]: playerState,
      log: logAction(
        state.log, state.turn, state.phase, sourcePlayer,
        'EFFECT_DRAW',
        'Kabuto Yakushi (053) UPGRADE: Drew 1 card.',
        'game.log.effect.draw',
        { card: 'KABUTO YAKUSHI', id: 'KS-053-UC', count: '1' },
      ),
    },
  };
}

function handleKabuto053Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;
  const playerState = state[sourcePlayer];

  if (playerState.discardPile.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kabuto Yakushi (053): Discard pile is empty. Nothing to play.',
          'game.log.effect.noTarget',
          { card: 'KABUTO YAKUSHI', id: 'KS-053-UC' },
        ),
      },
    };
  }

  // Find all character cards in discard pile that the player can afford (cost - 3)
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  const affordableIndices: string[] = [];
  for (let i = 0; i < playerState.discardPile.length; i++) {
    const card = playerState.discardPile[i];
    if (card.card_type === 'character') {
      const reducedCost = Math.max(0, (card.chakra ?? 0) - 3);
      if (playerState.chakra >= reducedCost) {
        // Also check: is there at least one valid mission for this card?
        let hasValidMission = false;
        for (let mi = 0; mi < state.activeMissions.length; mi++) {
          const mission = state.activeMissions[mi];
          const hasSameName = mission[friendlySide].some((c) => {
            const tc = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
            return tc.name_fr === card.name_fr;
          });
          if (!hasSameName) {
            hasValidMission = true;
            break;
          }
        }
        if (hasValidMission) {
          affordableIndices.push(String(i));
        }
      }
    }
  }

  if (affordableIndices.length === 0) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kabuto Yakushi (053): No affordable character in discard pile to play.',
          'game.log.effect.noTarget',
          { card: 'KABUTO YAKUSHI', id: 'KS-053-UC' },
        ),
      },
    };
  }

  // If only one affordable character, auto-select it and go to mission selection
  if (affordableIndices.length === 1) {
    const discardIdx = parseInt(affordableIndices[0], 10);
    const card = playerState.discardPile[discardIdx];
    const reducedCost = Math.max(0, (card.chakra ?? 0) - 3);

    const validMissions: string[] = [];
    for (let mi = 0; mi < state.activeMissions.length; mi++) {
      const mission = state.activeMissions[mi];
      const hasSameName = mission[friendlySide].some((c) => {
        const tc = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return tc.name_fr === card.name_fr;
      });
      if (!hasSameName) validMissions.push(String(mi));
    }

    if (validMissions.length === 1) {
      // Auto-play: single card, single mission — resolve directly
      const missionIdx = parseInt(validMissions[0], 10);
      const newState = playFromDiscardByIndex(state, sourcePlayer, discardIdx, missionIdx, reducedCost);
      return { state: newState };
    }

    // Single card, multiple missions
    return {
      state,
      requiresTargetSelection: true,
      targetSelectionType: 'KABUTO053_CHOOSE_MISSION',
      validTargets: validMissions,
      description: JSON.stringify({
        discardIndex: discardIdx,
        reducedCost,
        text: `Kabuto Yakushi (053): Choose a mission to play ${card.name_fr} on (cost ${reducedCost}).`,
      }),
      descriptionKey: 'game.effect.desc.kabuto053ChooseMission',
      descriptionParams: { cardName: card.name_fr, cost: String(reducedCost) },
    };
  }

  // Multiple affordable characters: let the player browse and choose
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'KABUTO053_CHOOSE_FROM_DISCARD',
    validTargets: affordableIndices,
    description: 'Kabuto Yakushi (053): Choose a character from your discard pile to play (paying 3 less).',
    descriptionKey: 'game.effect.desc.kabuto053ChooseFromDiscard',
  };
}

/**
 * Play a character from the discard pile by index onto a mission.
 * Exported for use by EffectEngine in target resolution.
 */
export function playFromDiscardByIndex(
  state: import('../../EffectTypes').EffectContext['state'],
  sourcePlayer: import('../../../engine/types').PlayerID,
  discardIndex: number,
  missionIdx: number,
  cost: number,
): import('../../EffectTypes').EffectContext['state'] {
  const newState = { ...state };
  const ps = { ...newState[sourcePlayer] };
  const newDiscardPile = [...ps.discardPile];
  const card = newDiscardPile.splice(discardIndex, 1)[0];
  if (!card) return state;

  ps.chakra -= cost;
  ps.discardPile = newDiscardPile;

  const charInPlay: CharacterInPlay = {
    instanceId: generateInstanceId(),
    card,
    isHidden: false,
    powerTokens: 0,
    stack: [card],
    controlledBy: sourcePlayer,
    originalOwner: sourcePlayer,
    missionIndex: missionIdx,
  };

  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIdx] };
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  mission[friendlySide] = [...mission[friendlySide], charInPlay];
  missions[missionIdx] = mission;

  // Update character count
  let charCount = 0;
  for (const m of missions) {
    charCount += (sourcePlayer === 'player1' ? m.player1Characters : m.player2Characters).length;
  }
  ps.charactersInPlay = charCount;

  newState[sourcePlayer] = ps;
  newState.activeMissions = missions;

  newState.log = logAction(
    state.log, state.turn, state.phase, sourcePlayer,
    'EFFECT',
    `Kabuto Yakushi (053): Played ${card.name_fr} from discard pile on mission ${missionIdx + 1} for ${cost} chakra (3 less).`,
    'game.log.effect.playFromDiscard',
    { card: 'KABUTO YAKUSHI', id: 'KS-053-UC', target: card.name_fr, mission: String(missionIdx + 1), cost: String(cost) },
  );

  return newState;
}

export function registerKabuto053Handlers(): void {
  registerEffect('KS-053-UC', 'UPGRADE', handleKabuto053Upgrade);
  registerEffect('KS-053-UC', 'MAIN', handleKabuto053Main);
}
