import type { GameState, PlayerID, CardData, AttachedCard, CharacterInPlay } from '@/lib/engine/types';
import { generateInstanceId } from '@/lib/engine/utils/id';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import type { EffectContext } from '@/lib/effects/EffectTypes';

export function isAttachmentCard(card: Pick<CardData, 'card_type'> | null | undefined): boolean {
  return card?.card_type === 'attachment';
}

export function getCharacterAttachTargets(state: GameState, player: PlayerID, missionIndex: number): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  return mission[side].filter(
    (c) => !c.isHidden && c.controlledBy === player && (c.card as CardData).card_type !== 'attachment',
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
    } catch { /* attachment effect error must not corrupt the play */ }
  }
  return newState;
}
