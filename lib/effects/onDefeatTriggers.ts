import type { GameState, PlayerID, CharacterInPlay, PendingAction } from '../engine/types';
import { generateInstanceId } from '../engine/utils/id';
import { logAction } from '../engine/utils/gameLog';
import { isDuelConditionMet } from './duelUtils';


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


        if (topCard.set === 'SS' && topCard.number === 115 && controllingPlayer !== defeatedCharOwner) {
          const rockLeeDuel = (topCard.effects ?? []).find(
            (e) => e.type === 'DUEL' && e.description.includes('[⧗]'),
          );
          if (rockLeeDuel && isDuelConditionMet(newState, char.missionIndex, rockLeeDuel.description)) {
            const missions = newState.activeMissions.map((m, idx) => {
              if (idx !== char.missionIndex) return m;
              return {
                ...m,
                [side]: m[side].map((c: CharacterInPlay) =>
                  c.instanceId === char.instanceId ? { ...c, powerTokens: c.powerTokens + 2 } : c,
                ),
              };
            });
            newState = {
              ...newState,
              activeMissions: missions,
              log: logAction(
                newState.log,
                newState.turn,
                newState.phase,
                controllingPlayer,
                'EFFECT_ON_DEFEAT',
                `Rock Lee (SS-115): POWERUP 2 after defeating ${defeatedChar.card.name_fr}.`,
                'game.log.effect.ss115PowerupOnDefeat',
                { card: 'ROCK LEE', id: 'SS-115-SHINOBIV', amount: 2, defeated: defeatedChar.card.name_fr },
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
  const sources: { char: CharacterInPlay; missionIndex: number }[] = [];
  for (let mi = 0; mi < state.activeMissions.length; mi++) {
    for (const char of state.activeMissions[mi][side]) {
      if (char.isHidden) continue;
      if (char.controlledBy !== beneficiary) continue;
      const top = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (String(top.set) === 'SS' && String(top.number) === '78') sources.push({ char, missionIndex: mi });
    }
  }
  if (sources.length === 0) return state;

  const newEffects = [];
  const newActions = [];
  for (const { char: source, missionIndex: sourceMission } of sources) {
    const effId = generateInstanceId();
    const actId = generateInstanceId();
    newEffects.push({
      id: effId,
      sourceCardId: 'SS-078-UC',
      sourceInstanceId: source.instanceId,
      sourceMissionIndex: sourceMission,
      effectType: 'MAIN' as const,
      effectDescription: '',
      targetSelectionType: 'SS078_CONFIRM_DRAW',
      sourcePlayer: beneficiary,
      requiresTargetSelection: true,
      validTargets: [source.instanceId],
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
    });
    newActions.push({
      id: actId,
      type: 'SELECT_TARGET' as PendingAction['type'],
      player: beneficiary,
      description: 'Gaara (SS-078): Pay 1 Chakra to draw 1 card?',
      descriptionKey: 'game.effect.desc.ss078ConfirmDraw',
      options: [source.instanceId],
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effId,
    });
  }

  return {
    ...state,
    pendingEffects: [...state.pendingEffects, ...newEffects],
    pendingActions: [...state.pendingActions, ...newActions],
  };
}

