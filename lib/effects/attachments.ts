import type { GameState, PlayerID, CardData, AttachedCard, CharacterInPlay } from '@/lib/engine/types';
import { generateInstanceId } from '@/lib/engine/utils/id';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import type { EffectContext } from '@/lib/effects/EffectTypes';
import { characterHasGroup } from '@/lib/effects/groupUtils';

export function isAttachmentCard(card: Pick<CardData, 'card_type'> | null | undefined): boolean {
  return card?.card_type === 'attachment';
}

function requiredAttachGroup(card?: CardData | null): string | null {
  for (const effect of card?.effects ?? []) {
    if (effect.type !== 'ATTACH') continue;
    const m = (effect.description ?? '').match(/Attach to a friendly\s+(.+?)\s+character/i);
    if (m) {
      const g = m[1].trim();
      if (g.toLowerCase() !== 'non-hidden') return g;
    }
  }
  return null;
}

export function getCharacterAttachTargets(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  attachmentCard?: CardData | null,
): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  const needGroup = requiredAttachGroup(attachmentCard);
  return mission[side].filter(
    (c) => !c.isHidden && c.controlledBy === player && (c.card as CardData).card_type !== 'attachment'
      && (!needGroup || characterHasGroup(c, needGroup)),
  );
}

export function attachCardToMission(state: GameState, player: PlayerID, card: CardData, missionIndex: number): GameState {
  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIndex] };
  const att: AttachedCard = { instanceId: generateInstanceId(), card, owner: player };
  mission.attachments = [...(mission.attachments ?? []), att];
  missions[missionIndex] = mission;
  let newState: GameState = { ...state, activeMissions: missions };
  newState = {
    ...newState,
    log: logAction(
      newState.log, newState.turn, newState.phase, player,
      'ATTACH_CARD',
      `Attached ${card.name_fr} to mission ${missionIndex + 1}.`,
      'game.log.attachToMission',
      { card: card.name_fr, card_en: card.name_en ?? card.name_fr, id: card.id, mission: missionIndex + 1 },
    ),
  };
  if ((card.effects ?? []).some((e) => e.type === 'SCORE')) {
    newState = {
      ...newState,
      log: logAction(
        newState.log, newState.turn, newState.phase, player,
        'EFFECT_CONTINUOUS',
        `${card.name_fr}: SCORE effect active on this mission.`,
        'game.log.effect.continuous',
        { card: card.name_fr, id: card.id },
      ),
    };
  }
  return newState;
}

export function attachCardToCharacter(state: GameState, player: PlayerID, card: CardData, hostInstanceId: string): GameState {
  let hostMissionIndex = -1;
  let hostSide: 'player1Characters' | 'player2Characters' | null = null;
  let hostIdx = -1;
  for (let i = 0; i < state.activeMissions.length; i++) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const idx = state.activeMissions[i][side].findIndex((c) => c.instanceId === hostInstanceId);
      if (idx !== -1) { hostMissionIndex = i; hostSide = side; hostIdx = idx; break; }
    }
    if (hostSide) break;
  }
  if (!hostSide || hostMissionIndex === -1) return state;

  const missions = [...state.activeMissions];
  const mission = { ...missions[hostMissionIndex] };
  const chars = [...mission[hostSide]];
  const host = { ...chars[hostIdx] };
  const att: AttachedCard = { instanceId: generateInstanceId(), card, owner: player };
  host.attachments = [...(host.attachments ?? []), att];
  chars[hostIdx] = host;
  mission[hostSide] = chars;
  missions[hostMissionIndex] = mission;

  const hostTop = host.stack?.length > 0 ? host.stack[host.stack.length - 1] : host.card;
  let newState: GameState = {
    ...state,
    activeMissions: missions,
    log: logAction(
      state.log, state.turn, state.phase, player,
      'ATTACH_CARD',
      `Attached ${card.name_fr} to ${hostTop.name_fr}.`,
      'game.log.attachToCharacter',
      { card: card.name_fr, card_en: card.name_en ?? card.name_fr, id: card.id, target: hostTop.name_fr },
    ),
  };

  const handler = getEffectHandler(card.id, 'MAIN');
  const hasInstantMain = (card.effects ?? []).some((e) => e.type === 'MAIN' && !e.description.includes('[⧗]'));
  if (handler && hasInstantMain) {
    try {
      const ctx: EffectContext = {
        state: newState,
        sourcePlayer: player,
        sourceCard: host,
        sourceMissionIndex: hostMissionIndex,
        triggerType: 'MAIN',
        isUpgrade: false,
      };
      const result = handler(ctx);
      newState = result.state;

      if (result.requiresTargetSelection && result.targetSelectionType && result.validTargets && result.validTargets.length > 0) {
        const effId = generateInstanceId();
        const actId = generateInstanceId();
        newState = {
          ...newState,
          pendingEffects: [...newState.pendingEffects, {
            id: effId,
            sourceCardId: card.id,
            sourceInstanceId: host.instanceId,
            sourceMissionIndex: hostMissionIndex,
            effectType: 'MAIN',
            effectDescription: result.description ?? '',
            targetSelectionType: result.targetSelectionType,
            sourcePlayer: player,
            requiresTargetSelection: true,
            validTargets: result.validTargets,
            isOptional: result.isOptional ?? false,
            isMandatory: !(result.isOptional ?? false),
            resolved: false,
            isUpgrade: false,
          }],
          pendingActions: [...newState.pendingActions, {
            id: actId,
            type: 'SELECT_TARGET',
            player,
            description: result.description ?? '',
            descriptionKey: result.descriptionKey,
            descriptionParams: result.descriptionParams,
            options: result.validTargets,
            minSelections: 1,
            maxSelections: 1,
            sourceEffectId: effId,
          }],
        };
      }
    } catch (err) {
      console.error(`[attachments] MAIN handler error for ${card.id}:`, err);
    }
  }
  return newState;
}
