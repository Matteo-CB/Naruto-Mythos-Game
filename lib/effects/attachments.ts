import type { GameState, PlayerID, CardData, AttachedCard, CharacterInPlay } from '@/lib/engine/types';
import { generateInstanceId } from '@/lib/engine/utils/id';
import { logAction } from '@/lib/engine/utils/gameLog';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import type { EffectContext } from '@/lib/effects/EffectTypes';
import { characterHasGroup } from '@/lib/effects/groupUtils';
import { isFirstCardPlayedThisRound, withFirstStrikeStatus } from '@/lib/engine/rules/firstStrike';
import { artisanVillageCount, cannotReceiveOtherAttachments } from '@/lib/effects/handlers/SS/attachmentStatics';
import { estSeimei } from './handlers/SS/seimei065';
import { actionTypeForSelectionType } from './selectionActionType';
import { bonusArmeSurTenten, TENTEN_022 } from './handlers/SS/tenten022';
import { amplifiedPowerup } from '@/lib/effects/ContinuousEffects';

export function artisanVillageReward(
  state: GameState,
  player: PlayerID,
  card: CardData,
  host: CharacterInPlay,
  missionIndex: number,
): GameState {
  const mission = state.activeMissions[missionIndex];
  const villages = artisanVillageCount(mission, player);
  if (villages === 0) return state;
  const motsCles = card.keywords ?? [];
  if (!motsCles.includes('Weapon') && !motsCles.includes('Armor')) return state;
  if (host.controlledBy !== player) return state;

  let newState = state;
  for (let i = 0; i < villages; i++) {
    const deck = newState[player].deck;
    const piochee = deck.length > 0 ? deck[0] : null;
    newState = {
      ...newState,
      [player]: {
        ...newState[player],
        deck: piochee ? deck.slice(1) : deck,
        hand: piochee ? [...newState[player].hand, piochee] : newState[player].hand,
      },
    };
    const missions = newState.activeMissions.map((m) => ({
      ...m,
      player1Characters: m.player1Characters.map((c) =>
        c.instanceId === host.instanceId ? { ...c, powerTokens: c.powerTokens + 1 } : c),
      player2Characters: m.player2Characters.map((c) =>
        c.instanceId === host.instanceId ? { ...c, powerTokens: c.powerTokens + 1 } : c),
    }));
    const hostTop = host.stack?.length > 0 ? host.stack[host.stack.length - 1] : host.card;
    newState = {
      ...newState,
      activeMissions: missions,
      log: logAction(newState.log, newState.turn, newState.phase, player, 'EFFECT_POWERUP',
        `Village of Artisans (110): 1 card drawn and POWERUP 1 on ${hostTop.name_fr}.`,
        'game.log.effect.ss110Reward',
        { card: 'VILLAGE DES ARTISANS', id: 'SS-110-UC', target: hostTop.name_fr, target_en: hostTop.name_en || hostTop.name_fr }),
    };
  }
  return newState;
}

function resolveAttachmentTrigger(
  state: GameState,
  player: PlayerID,
  card: CardData,
  host: CharacterInPlay | null,
  missionIndex: number,
  type: 'AMBUSH',
  revealed: boolean,
): GameState {
  if (!revealed) return state;
  if (!(card.effects ?? []).some((e) => e.type === type)) return state;
  const handler = getEffectHandler(card.id, type);
  if (!handler) return state;

  const source = host ?? ({ instanceId: '', card } as unknown as CharacterInPlay);
  let newState = state;
  try {
    const result = handler({
      state: newState,
      sourcePlayer: player,
      sourceCard: source,
      sourceMissionIndex: missionIndex,
      triggerType: type,
      isUpgrade: false,
      wasRevealed: true,
    } as EffectContext);
    newState = result.state;

    if (result.requiresTargetSelection && result.targetSelectionType && result.validTargets && result.validTargets.length > 0) {
      const effId = generateInstanceId();
      const actId = generateInstanceId();
      newState = {
        ...newState,
        pendingEffects: [...newState.pendingEffects, {
          id: effId,
          sourceCardId: card.id,
          sourceInstanceId: source.instanceId,
          sourceMissionIndex: missionIndex,
          effectType: type,
          effectDescription: result.description ?? '',
          targetSelectionType: result.targetSelectionType,
          sourcePlayer: player,
          requiresTargetSelection: true,
          validTargets: result.validTargets,
          isOptional: result.isOptional ?? true,
          isMandatory: result.isMandatory ?? false,
          resolved: false,
          isUpgrade: false,
          wasRevealed: true,
          rootOptional: result.isOptional ?? true,
        }],
        pendingActions: [...newState.pendingActions, {
          id: actId,
          type: 'SELECT_TARGET',
          player,
          description: result.description ?? '',
          descriptionKey: result.descriptionKey,
          descriptionParams: result.descriptionParams,
          options: result.validTargets,
          minSelections: result.minSelections ?? 1,
          maxSelections: result.maxSelections ?? 1,
          sourceEffectId: effId,
        }],
      };
    }
  } catch (err) {
    console.error(`[attachments] ${type} handler error for ${card.id}:`, err);
  }
  return newState;
}

function resolveAttachmentFirstStrike(
  state: GameState,
  player: PlayerID,
  card: CardData,
  host: CharacterInPlay | null,
  missionIndex: number,
  premiereFrappeArmee?: boolean,
): GameState {
  const hasFirstStrike = (card.effects ?? []).some((e) => e.type === 'FIRST_STRIKE');
  if (!hasFirstStrike) return state;
  const armee = premiereFrappeArmee ?? isFirstCardPlayedThisRound(state, player);
  if (!armee) return state;
  const handler = getEffectHandler(card.id, 'FIRST_STRIKE');
  if (!handler) return state;

  let newState = withFirstStrikeStatus(state, player, 'used');
  const source = host ?? ({ instanceId: '', card } as unknown as CharacterInPlay);

  try {
    const result = handler({
      state: newState,
      sourcePlayer: player,
      sourceCard: source,
      sourceMissionIndex: missionIndex,
      triggerType: 'FIRST_STRIKE',
      isUpgrade: false,
      wasFirstCard: true,
    } as EffectContext);
    newState = result.state;

    if (result.requiresTargetSelection && result.targetSelectionType && result.validTargets && result.validTargets.length > 0) {
      const effId = generateInstanceId();
      const actId = generateInstanceId();
      newState = {
        ...newState,
        pendingEffects: [...newState.pendingEffects, {
          id: effId,
          sourceCardId: card.id,
          sourceInstanceId: source.instanceId,
          sourceMissionIndex: missionIndex,
          effectType: 'FIRST_STRIKE',
          effectDescription: result.description ?? '',
          targetSelectionType: result.targetSelectionType,
          sourcePlayer: player,
          requiresTargetSelection: true,
          validTargets: result.validTargets,
          isOptional: result.isOptional ?? true,
          isMandatory: result.isMandatory ?? false,
          resolved: false,
          isUpgrade: false,
          wasFirstCard: true,
          rootOptional: result.isOptional ?? true,
        }],
        pendingActions: [...newState.pendingActions, {
          id: actId,
          type: 'SELECT_TARGET',
          player,
          description: result.description ?? '',
          descriptionKey: result.descriptionKey,
          descriptionParams: result.descriptionParams,
          options: result.validTargets,
          minSelections: result.minSelections ?? 1,
          maxSelections: result.maxSelections ?? 1,
          sourceEffectId: effId,
        }],
      };
    }
  } catch (err) {
    console.error(`[attachments] FIRST_STRIKE handler error for ${card.id}:`, err);
  }

  return newState;
}

export function ignoreLesConditionsDePose(char: CharacterInPlay | null | undefined): boolean {
  return estSeimei(char);
}

function resolveAttachmentMain(
  state: GameState,
  player: PlayerID,
  card: CardData,
  host: CharacterInPlay | null,
  missionIndex: number,
): GameState {
  const hasInstantMain = (card.effects ?? []).some((e) => e.type === 'MAIN' && !e.description.includes('[⧗]'));
  if (!hasInstantMain) return state;
  const handler = getEffectHandler(card.id, 'MAIN');
  if (!handler) return state;

  let newState = state;
  try {
    const result = handler({
      state: newState,
      sourcePlayer: player,
      sourceCard: host ?? ({ instanceId: '', card } as unknown as CharacterInPlay),
      sourceMissionIndex: missionIndex,
      triggerType: 'MAIN',
      isUpgrade: false,
    } as EffectContext);
    newState = result.state;

    if (result.requiresTargetSelection && result.targetSelectionType && result.validTargets && result.validTargets.length > 0) {
      const effId = generateInstanceId();
      const actId = generateInstanceId();
      newState = {
        ...newState,
        pendingEffects: [...newState.pendingEffects, {
          id: effId,
          sourceCardId: card.id,
          sourceInstanceId: host?.instanceId ?? '',
          sourceMissionIndex: missionIndex,
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
          type: actionTypeForSelectionType(result.targetSelectionType),
          player,
          description: result.description ?? '',
          descriptionKey: result.descriptionKey,
          descriptionParams: result.descriptionParams,
          options: result.validTargets,
          minSelections: result.minSelections ?? 1,
          maxSelections: result.maxSelections ?? 1,
          sourceEffectId: effId,
        }],
      };
    }
  } catch (err) {
    console.error(`[attachments] MAIN handler error for ${card.id}:`, err);
  }
  return newState;
}

export function isAttachmentCard(card: Pick<CardData, 'card_type'> | null | undefined): boolean {
  return card?.card_type === 'attachment';
}

export interface AttachSpec {
  side: 'friendly' | 'enemy' | 'any';
  hidden: 'hidden' | 'nonHidden' | 'any';
  requires: string[];
  excludes: string[];
  toMission: boolean;
}

const SPEC_VIDE: AttachSpec = { side: 'friendly', hidden: 'any', requires: [], excludes: [], toMission: false };

export function parseAttachSpec(card?: CardData | null): AttachSpec {
  const texte = attachTexts(card)[0] ?? '';
  if (!texte) return { ...SPEC_VIDE, toMission: (card?.attach_to ?? 'character') === 'mission' };
  if (/attach to a mission/i.test(texte)) return { ...SPEC_VIDE, toMission: true };

  const corps = texte.match(/attach to an?\s+(.+?)\s+character/i)?.[1] ?? '';
  const spec: AttachSpec = { side: 'any', hidden: 'any', requires: [], excludes: [], toMission: false };

  let reste = corps.trim();

  if (/\benemy\b/i.test(reste)) spec.side = 'enemy';
  else if (/\bfriendly\b/i.test(reste)) spec.side = 'friendly';
  reste = reste.replace(/\b(friendly|enemy)\b/gi, ' ');

  if (/\bnon-hidden\b/i.test(reste)) spec.hidden = 'nonHidden';
  else if (/\bhidden\b/i.test(reste)) spec.hidden = 'hidden';
  reste = reste.replace(/\bnon-hidden\b/gi, ' ').replace(/\bhidden\b/gi, ' ');

  for (const brut of reste.split(/,| or /i)) {
    const token = brut.trim().replace(/\s+/g, ' ');
    if (!token) continue;
    const negatif = token.match(/^non-(.+)$/i);
    if (negatif) { spec.excludes.push(negatif[1].trim()); continue; }
    spec.requires.push(token);
  }

  return spec;
}

function hostMatchesToken(char: CharacterInPlay, token: string): boolean {
  if (characterHasGroup(char, token)) return true;
  const top = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  if ((top.keywords ?? []).includes(token)) return true;
  const wanted = token.toUpperCase();
  return `${top.name_fr ?? ''} ${top.name_en ?? ''}`.toUpperCase().includes(wanted);
}

export function hostMatchesAttachSpec(char: CharacterInPlay, spec: AttachSpec): boolean {
  if (spec.hidden === 'hidden' && !char.isHidden) return false;
  if (spec.hidden === 'nonHidden' && char.isHidden) return false;
  if (char.isHidden) return spec.requires.length === 0 && spec.excludes.length === 0;
  if (spec.requires.length > 0 && !spec.requires.some((t) => hostMatchesToken(char, t))) return false;
  if (spec.excludes.some((t) => hostMatchesToken(char, t))) return false;
  return true;
}

export function attachesToEnemy(card?: CardData | null): boolean {
  return (card?.effects ?? []).some(
    (e) => e.type === 'ATTACH' && /attach to an enemy/i.test(e.description ?? ''),
  );
}

function attachTexts(card?: CardData | null): string[] {
  return (card?.effects ?? [])
    .filter((e) => e.type === 'ATTACH')
    .map((e) => e.description ?? '');
}

export function requiresNonHiddenHost(card?: CardData | null): boolean {
  return attachTexts(card).some((text) => /non-hidden/i.test(text));
}

export function requiresHiddenHost(card?: CardData | null): boolean {
  return attachTexts(card).some((text) => /hidden/i.test(text) && !/non-hidden/i.test(text));
}

export function getCharacterAttachTargets(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  attachmentCard?: CardData | null,
): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  const spec = parseAttachSpec(attachmentCard);
  if (spec.toMission) return [];

  const adversaire: PlayerID = player === 'player1' ? 'player2' : 'player1';
  const camps: PlayerID[] = spec.side === 'friendly'
    ? [player]
    : spec.side === 'enemy' ? [adversaire] : [player, adversaire];

  const cibles: CharacterInPlay[] = [];
  for (const proprietaire of camps) {
    const side = proprietaire === 'player1' ? 'player1Characters' : 'player2Characters';
    for (const c of mission[side]) {
      if (c.controlledBy !== proprietaire) continue;
      if ((c.card as CardData).card_type === 'attachment') continue;
      if (!ignoreLesConditionsDePose(c)) {
        if (!hostMatchesAttachSpec(c, spec)) continue;
        if (cannotReceiveOtherAttachments(c)) continue;
      }
      cibles.push(c);
    }
  }
  return cibles;
}

export function discardAttachments(state: GameState, attachments: AttachedCard[]): GameState {
  if (attachments.length === 0) return state;
  let next = state;
  for (const att of attachments) {
    const owner = att.owner;
    next = {
      ...next,
      [owner]: { ...next[owner], discardPile: [...next[owner].discardPile, att.card] },
      log: logAction(
        next.log, next.turn, next.phase, owner,
        'DISCARD_ATTACHMENT',
        `${att.card.name_fr} was discarded because its attach condition no longer holds.`,
        'game.log.attachmentDiscarded',
        { card: att.card.name_fr, card_en: att.card.name_en ?? att.card.name_fr, id: att.card.id },
      ),
    };
  }
  return next;
}

export function campDeLEquipement(att: AttachedCard): PlayerID {
  return att.controlledBy ?? att.owner;
}

export interface ProvenanceEquipement {
  owner: PlayerID;
  controllerInstanceId?: string;
}

function marquerProvenance(att: AttachedCard, player: PlayerID, provenance?: ProvenanceEquipement): AttachedCard {
  if (!provenance || provenance.owner === player) return att;
  return {
    ...att,
    owner: provenance.owner,
    controlledBy: player,
    controllerInstanceId: provenance.controllerInstanceId,
  };
}

export function discardAttachmentsOnLeave(state: GameState, character: CharacterInPlay | null | undefined): GameState {
  const attachments = character?.attachments ?? [];
  if (attachments.length === 0) return state;
  let next = state;
  for (const att of attachments) {
    const owner = att.owner;
    next = {
      ...next,
      [owner]: { ...next[owner], discardPile: [...next[owner].discardPile, att.card] },
      log: logAction(
        next.log, next.turn, next.phase, owner,
        'DISCARD_ATTACHMENT',
        `${att.card.name_fr} goes to the discard pile: the character carrying it left play.`,
        'game.log.attachmentHostLeft',
        { card: att.card.name_fr, card_en: att.card.name_en ?? att.card.name_fr, id: att.card.id },
      ),
    };
  }
  return next;
}

function attachConditionHolds(host: CharacterInPlay, attachment: CardData): boolean {
  return hostMatchesAttachSpec(host, parseAttachSpec(attachment));
}

function collectAttachmentsInPlay(state: GameState): Map<string, AttachedCard> {
  const found = new Map<string, AttachedCard>();
  for (const mission of state.activeMissions) {
    for (const att of mission.attachments ?? []) found.set(att.instanceId, att);
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const char of mission[side]) {
        for (const att of char.attachments ?? []) found.set(att.instanceId, att);
      }
    }
  }
  return found;
}

function countFiledCopies(state: GameState, owner: PlayerID, cardId: string): number {
  const ps = state[owner];
  let total = 0;
  for (const zone of [ps.discardPile, ps.hand, ps.deck] as ReadonlyArray<ReadonlyArray<{ id: string }>>) {
    for (const c of zone) if (c.id === cardId) total += 1;
  }
  return total;
}

export function rescueOrphanedAttachments(before: GameState, after: GameState): GameState {
  const wasInPlay = collectAttachmentsInPlay(before);
  if (wasInPlay.size === 0) return after;
  const stillInPlay = collectAttachmentsInPlay(after);

  const orphans = new Map<string, AttachedCard[]>();
  for (const [instanceId, att] of wasInPlay) {
    if (stillInPlay.has(instanceId)) continue;
    const key = `${att.owner}|${att.card.id}`;
    orphans.set(key, [...(orphans.get(key) ?? []), att]);
  }
  if (orphans.size === 0) return after;

  let next = after;
  for (const lost of orphans.values()) {
    const owner = lost[0].owner;
    const cardId = lost[0].card.id;
    const filedByTheRemoval = countFiledCopies(after, owner, cardId) - countFiledCopies(before, owner, cardId);
    const missing = lost.length - Math.max(0, filedByTheRemoval);
    if (missing <= 0) continue;
    next = discardAttachmentsOnLeave(next, { attachments: lost.slice(0, missing) } as unknown as CharacterInPlay);
  }
  return next;
}

export function enforceAttachmentConditions(state: GameState): GameState {
  const dropped: AttachedCard[] = [];
  const missions = state.activeMissions.map((mission) => {
    let missionChanged = false;
    const next = { ...mission };
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      let sideChanged = false;
      const chars = mission[side].map((char) => {
        const held = char.attachments ?? [];
        if (held.length === 0) return char;
        if (ignoreLesConditionsDePose(char)) return char;

        const conformes = held.filter((att) => attachConditionHolds(char, att.card));
        const derniersParProprietaire = new Map<PlayerID, AttachedCard>();
        for (const att of conformes) derniersParProprietaire.set(campDeLEquipement(att), att);
        const kept = conformes.filter((att) => derniersParProprietaire.get(att.owner) === att);

        if (kept.length === held.length) return char;
        for (const att of held) if (!kept.includes(att)) dropped.push(att);
        sideChanged = true;
        return { ...char, attachments: kept };
      });
      if (sideChanged) { next[side] = chars; missionChanged = true; }
    }
    return missionChanged ? next : mission;
  });

  const missionsFinales = missions.map((mission) => {
    const surMission = mission.attachments ?? [];
    if (surMission.length === 0) return mission;
    const derniers = new Map<PlayerID, AttachedCard>();
    for (const att of surMission) derniers.set(campDeLEquipement(att), att);
    const gardes = surMission.filter((att) => derniers.get(att.owner) === att);
    if (gardes.length === surMission.length) return mission;
    for (const att of surMission) if (!gardes.includes(att)) dropped.push(att);
    return { ...mission, attachments: gardes };
  });

  if (dropped.length === 0) return state;
  return discardAttachments({ ...state, activeMissions: missionsFinales }, dropped);
}

export function missionAlreadyHasPlayerAttachment(state: GameState, player: PlayerID, missionIndex: number): boolean {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return false;
  return (mission.attachments ?? []).some((a) => campDeLEquipement(a) === player);
}

export function attachCardToMission(state: GameState, player: PlayerID, card: CardData, missionIndex: number, revealed = false, provenance?: ProvenanceEquipement): GameState {
  const previous = (state.activeMissions[missionIndex]?.attachments ?? []).filter((a) => campDeLEquipement(a) === player);
  const base = discardAttachments(state, previous);
  const missions = [...base.activeMissions];
  const mission = { ...missions[missionIndex] };
  let att: AttachedCard = { instanceId: generateInstanceId(), card, owner: player };
  att = marquerProvenance(att, player, provenance);
  mission.attachments = [...(mission.attachments ?? []).filter((a) => campDeLEquipement(a) !== player), att];
  missions[missionIndex] = mission;
  let newState: GameState = { ...base, activeMissions: missions };
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
  newState = resolveAttachmentMain(newState, player, card, null, missionIndex);
  newState = resolveAttachmentTrigger(newState, player, card, null, missionIndex, 'AMBUSH', revealed);
  return resolveAttachmentFirstStrike(newState, player, card, null, missionIndex);
}

export function attachCardToCharacter(state: GameState, player: PlayerID, card: CardData, hostInstanceId: string, revealed = false, powerOverride?: number, provenance?: ProvenanceEquipement, premiereFrappeArmee?: boolean): GameState {
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
  const held = host.attachments ?? [];
  const replaced = ignoreLesConditionsDePose(host) ? [] : held.filter((a) => campDeLEquipement(a) === player);
  let att: AttachedCard = { instanceId: generateInstanceId(), card, owner: player };
  if (powerOverride !== undefined) att.powerOverride = powerOverride;
  att = marquerProvenance(att, player, provenance);
  host.attachments = ignoreLesConditionsDePose(host)
    ? [...held, att]
    : [...held.filter((a) => campDeLEquipement(a) !== player), att];
  chars[hostIdx] = host;
  mission[hostSide] = chars;
  missions[hostMissionIndex] = mission;

  const bonusArme = bonusArmeSurTenten(host, card);
  if (bonusArme > 0) {
    host.powerTokens = host.powerTokens + amplifiedPowerup({ ...state, activeMissions: missions }, host.instanceId, bonusArme);
    chars[hostIdx] = host;
    mission[hostSide] = chars;
    missions[hostMissionIndex] = mission;
  }

  const hostTop = host.stack?.length > 0 ? host.stack[host.stack.length - 1] : host.card;
  const afterReplacement = discardAttachments(state, replaced);
  let newState: GameState = {
    ...afterReplacement,
    activeMissions: missions,
    log: logAction(
      afterReplacement.log, state.turn, state.phase, player,
      'ATTACH_CARD',
      `Attached ${card.name_fr} to ${hostTop.name_fr}.`,
      'game.log.attachToCharacter',
      { card: card.name_fr, card_en: card.name_en ?? card.name_fr, id: card.id, target: hostTop.name_fr },
    ),
  };

  if (bonusArme > 0) {
    newState.log = logAction(newState.log, state.turn, state.phase, player,
      'EFFECT_POWERUP', `Tenten (022): POWERUP ${bonusArme} from the Weapon attachment.`,
      'game.log.effect.ss022WeaponBonus',
      { card: 'TENTEN', id: TENTEN_022, amount: String(bonusArme) });
  }

  newState = resolveAttachmentMain(newState, player, card, host, hostMissionIndex);

  newState = artisanVillageReward(newState, player, card, host, hostMissionIndex);
  newState = resolveAttachmentTrigger(newState, player, card, host, hostMissionIndex, 'AMBUSH', revealed);
  return resolveAttachmentFirstStrike(newState, player, card, host, hostMissionIndex, premiereFrappeArmee);
}
