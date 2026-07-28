import type { GameState, PlayerID, CharacterInPlay, PendingAction } from '../engine/types';
import { generateInstanceId } from '../engine/utils/id';
import { logAction } from '../engine/utils/gameLog';


export function triggerOnDefeatEffects(
  state: GameState,
  defeatedChar: CharacterInPlay,
  defeatedCharOwner: PlayerID,
  simultaneousDefeatIds?: string[],
): GameState {
  let newState = state;

  for (const mission of newState.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const controllingPlayer: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';

      for (const char of mission[side]) {
        if (char.isHidden) continue;
        if (char.instanceId === defeatedChar.instanceId) continue;
        if (simultaneousDefeatIds && simultaneousDefeatIds.includes(char.instanceId)) continue;
        const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;

        
        if ((topCard.set === 'KS' && topCard.number === 3) && controllingPlayer === defeatedCharOwner) {
          const hasEffect = (topCard.effects ?? []).some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]'),
          );
          if (hasEffect) {
            const ps = { ...newState[controllingPlayer] };
            ps.chakra += 2;
            newState = {
              ...newState,
              [controllingPlayer]: ps,
              log: logAction(
                newState.log,
                newState.turn,
                newState.phase,
                controllingPlayer,
                'EFFECT_ON_DEFEAT',
                `Tsunade (003): Gained 2 chakra (friendly character ${defeatedChar.card.name_fr} was defeated).`,
                'game.log.effect.onDefeatChakra',
                { card: 'Tsunade', id: 'KS-003-C', amount: 2, defeated: defeatedChar.card.name_fr },
              ),
            };
          }
        }

        
        if ((topCard.set === 'KS' && topCard.number === 136)) {
          const hasEffect = (topCard.effects ?? []).some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]'),
          );
          if (hasEffect) {
            const ps = { ...newState[controllingPlayer] };
            ps.chakra += 1;
            newState = {
              ...newState,
              [controllingPlayer]: ps,
              log: logAction(
                newState.log,
                newState.turn,
                newState.phase,
                controllingPlayer,
                'EFFECT_ON_DEFEAT',
                `Sasuke Uchiwa (136): Gained 1 chakra (character ${defeatedChar.card.name_fr} was defeated).`,
                'game.log.effect.onDefeatChakra',
                { card: 'Sasuke Uchiwa', id: 'KS-136-S', amount: 1, defeated: defeatedChar.card.name_fr },
              ),
            };
          }
        }
      }
    }
  }

  newState = queueGaara078Draw(newState, defeatedChar, defeatedCharOwner);

  return newState;
}


function queueGaara078Draw(
  state: GameState,
  defeatedChar: CharacterInPlay,
  defeatedCharOwner: PlayerID,
): GameState {
  if (defeatedChar.isHidden) return state;

  const beneficiary: PlayerID = defeatedCharOwner === 'player1' ? 'player2' : 'player1';
  if (state[beneficiary].chakra < 1) return state;
  if (state[beneficiary].deck.length === 0) return state;

  const side: 'player1Characters' | 'player2Characters' = beneficiary === 'player1' ? 'player1Characters' : 'player2Characters';
  let source: CharacterInPlay | null = null;
  let sourceMission = 0;
  for (let mi = 0; mi < state.activeMissions.length; mi++) {
    for (const char of state.activeMissions[mi][side]) {
      if (char.isHidden) continue;
      if (char.controlledBy !== beneficiary) continue;
      const top = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (String(top.set) === 'SS' && String(top.number) === '78') { source = char; sourceMission = mi; break; }
    }
    if (source) break;
  }
  if (!source) return state;

  const effId = generateInstanceId();
  const actId = generateInstanceId();
  return {
    ...state,
    pendingEffects: [...state.pendingEffects, {
      id: effId,
      sourceCardId: 'SS-078-UC',
      sourceInstanceId: source.instanceId,
      sourceMissionIndex: sourceMission,
      effectType: 'MAIN',
      effectDescription: '',
      targetSelectionType: 'SS078_CONFIRM_DRAW',
      sourcePlayer: beneficiary,
      requiresTargetSelection: true,
      validTargets: [source.instanceId],
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
    }],
    pendingActions: [...state.pendingActions, {
      id: actId,
      type: 'SELECT_TARGET' as PendingAction['type'],
      player: beneficiary,
      description: 'Gaara (SS-078): Pay 1 Chakra to draw 1 card?',
      descriptionKey: 'game.effect.desc.ss078ConfirmDraw',
      options: [source.instanceId],
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effId,
    }],
  };
}
