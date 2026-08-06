import type { GameState, PlayerID, CharacterInPlay, PendingAction, ActiveMission } from '../engine/types';
import { honorableDuelBonus, kingOfTheHillBonus, missionCarries, teamTrainingBonus, playedNameIsUniqueInMission, SS_MISSION_ADVERSE_TERRAIN, SS_MISSION_NEW_FORCES } from './missions/ssMissions';
import { generateInstanceId } from '../engine/utils/id';
import { logAction } from '../engine/utils/gameLog';
import { isSummonPlay, jiraiyaGoldSources, JIRAIYA_GOLD_ID, JIRAIYA_GOLD_NAME } from './handlers/SS/goldCards';








export function calculateContinuousChakraBonus(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  char: CharacterInPlay,
): number {
  if (char.isHidden) return 0;

  const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
  let bonus = 0;

  const mission = state.activeMissions[missionIndex];
  if (!mission) return 0;

  const friendlyChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const enemyChars = player === 'player1' ? mission.player2Characters : mission.player1Characters;

  for (const effect of topCard.effects ?? []) {
    if (effect.type !== 'MAIN') continue;
    if (!effect.description.includes('[⧗]')) continue;

    
    if (topCard.id === 'KS-025-C' || (topCard.set === 'KS' && topCard.number === 25)) {
      const allMissionChars = [...friendlyChars, ...enemyChars];
      const hasAkamaru = allMissionChars.some(
        (c) => {
          if (c.isHidden) return false;
          const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
          return cTop.name_fr.toUpperCase() === 'AKAMARU';
        },
      );
      if (hasAkamaru) bonus += 1;
    }

    
    if (topCard.id === 'KS-044-C' || (topCard.set === 'KS' && topCard.number === 44)) {
      const hasOtherLeaf = friendlyChars.some(
        (c) => {
          if (c.instanceId === char.instanceId || c.isHidden) return false;
          const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
          return cTop.group === 'Leaf Village';
        },
      );
      if (hasOtherLeaf) bonus += 1;
    }

    
    if (topCard.id === 'KS-064-C' || (topCard.set === 'KS' && topCard.number === 64)) {
      const soundFourMissions = countMissionsWithKeyword(state, player, 'Sound Four', char.instanceId);
      bonus += soundFourMissions;
    }

    
    if (topCard.id === 'KS-077-C' || (topCard.set === 'KS' && topCard.number === 77)) {
      const hasNonHiddenEnemy = enemyChars.some((c) => !c.isHidden);
      if (hasNonHiddenEnemy) bonus += 1;
    }

    
    if (topCard.id === 'KS-005-C' || (topCard.set === 'KS' && topCard.number === 5)) {
      if (effect.description.toLowerCase().includes('chakra') && effect.description.includes('+')) {
        bonus += 1;
      }
    }


    if (topCard.id === 'KS-012-UC' || (topCard.set === 'KS' && topCard.number === 12)) {
      if (effect.description.toLowerCase().includes('chakra') && effect.description.includes('+')) {
        bonus += 1;
      }
    }


    if (topCard.id === 'SS-016-C' || (topCard.set === 'SS' && topCard.number === 16)) {
      const hasNarutoOrTeam8 = friendlyChars.some((c) => {
        if (c.instanceId === char.instanceId || c.isHidden) return false;
        if (c.controlledBy !== player) return false;
        const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
        if ((cTop.keywords ?? []).includes('Team 8')) return true;
        return `${cTop.name_fr ?? ''} ${cTop.name_en ?? ''}`.toUpperCase().includes('NARUTO UZUMAKI');
      });
      if (hasNarutoOrTeam8) bonus += 1;
    }
  }

  return bonus;
}


function adverseTerrainChakraBonus(
  state: GameState,
  mission: ActiveMission,
  missionIndex: number,
  player: PlayerID,
): number {
  if (!missionCarries(mission, SS_MISSION_ADVERSE_TERRAIN)) return 0;
  const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';
  const own = missionPowerFor(state, missionIndex, player);
  const other = missionPowerFor(state, missionIndex, opponent);
  return own < other ? 2 : 0;
}

export function calculateMissionChakraBonus(state: GameState, player: PlayerID): number {
  let bonus = 0;

  for (let missionIndex = 0; missionIndex < state.activeMissions.length; missionIndex++) {
    bonus += adverseTerrainChakraBonus(state, state.activeMissions[missionIndex], missionIndex, player);
  }

  for (const mission of state.activeMissions) {
    for (const effect of mission.card.effects ?? []) {
      if (!effect.description.includes('[⧗]')) continue;

      
      if (effect.type === 'MAIN'
          && effect.description.includes('CHAKRA +1')
          && effect.description.includes('both players')) {
        bonus += 1;
      }
    }
  }

  return bonus;
}


function countMissionsWithKeyword(state: GameState, player: PlayerID, keyword: string, excludeInstanceId?: string): number {
  let count = 0;
  for (const mission of state.activeMissions) {
    const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    const hasKeyword = chars.some(
      (c) => {
        if (excludeInstanceId && c.instanceId === excludeInstanceId) return false;
        if (c.isHidden) return false; // Hidden chars are anonymous - can't identify keyword
        const top = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
        return (top.keywords ?? []).includes(keyword) && c.controlledBy === player;
      },
    );
    if (hasKeyword) count++;
  }
  return count;
}






export function attachedPowerOf(char: CharacterInPlay): number {
  if (char.isHidden || !char.attachments || char.attachments.length === 0) return 0;
  const hostTop = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  const doublesFood = hostTop.id?.startsWith('SS-128')
    && (hostTop.effects ?? []).some((e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('Food'));
  let total = 0;
  for (const att of char.attachments) {
    let p = att.card.power ?? 0;
    if (p !== 0 && doublesFood && (att.card.keywords ?? []).includes('Food')) p *= 2;
    total += p;
  }
  return total;
}

export function calculateContinuousPowerModifier(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  char: CharacterInPlay,
): number {

  const attachmentPower = attachedPowerOf(char);

  if (!char.isHidden) {
    const mission_zc = state.activeMissions[missionIndex];
    if (mission_zc) {
      const enemyChars_zc = player === 'player1' ? mission_zc.player2Characters : mission_zc.player1Characters;
      const friendlyChars_zc = player === 'player1' ? mission_zc.player1Characters : mission_zc.player2Characters;
      for (const enemy_zc of enemyChars_zc) {
        if (enemy_zc.isHidden) continue;
        const enemyTop_zc = enemy_zc.stack?.length > 0 ? enemy_zc.stack[enemy_zc.stack.length - 1] : enemy_zc.card;
        if (enemyTop_zc.number !== 67) continue;
        const hasRempart_zc = (enemyTop_zc.effects ?? []).some(
          (e) => e.type === 'MAIN' && e.description.includes('[⧗]'),
        );
        if (!hasRempart_zc) continue;
        let targetId_zc = enemy_zc.rempartLockedTargetId;
        if (!targetId_zc || !friendlyChars_zc.some((f) => f.instanceId === targetId_zc && !f.isHidden)) {
          let maxPower_zc = -1;
          for (const f of friendlyChars_zc) {
            if (f.isHidden) continue;
            const fTop = f.stack?.length > 0 ? f.stack[f.stack.length - 1] : f.card;
            const basePower = (fTop.power ?? 0) + f.powerTokens + attachedPowerOf(f);
            if (basePower > maxPower_zc) { maxPower_zc = basePower; targetId_zc = f.instanceId; }
          }
        }
        if (targetId_zc === char.instanceId) {
          const selfTop_zc = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
          return -((selfTop_zc.power ?? 0) + char.powerTokens);
        }
      }
    }
  }

  if (char.isHidden) {
    const mission = state.activeMissions[missionIndex];
    if (!mission) return 0;
    const friendlyChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    let hiddenBonus = 0;
    for (const friendly of friendlyChars) {
      if (friendly.isHidden || friendly.instanceId === char.instanceId) continue;
      const fTop = friendly.stack?.length > 0 ? friendly.stack[friendly.stack?.length - 1] : friendly.card;
      
      if ((fTop.set === 'KS' && fTop.number === 35)) {
        const hasEffect = (fTop.effects ?? []).some(
          (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('+2 Power'),
        );
        if (hasEffect) hiddenBonus += 2;
      }

      
      if ((fTop.set === 'KS' && fTop.number === 145)) {
        const hasEffect = (fTop.effects ?? []).some(
          (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('+1 Power'),
        );
        if (hasEffect && state.edgeHolder === player) hiddenBonus += 1;
      }
    }

    
    const enemyCharsHidden = player === 'player1' ? mission.player2Characters : mission.player1Characters;
    const ownerOfEnemyChars = player === 'player1' ? 'player2' : 'player1';
    for (const enemy of enemyCharsHidden) {
      if (enemy.isHidden) continue;
      const eTop = enemy.stack?.length > 0 ? enemy.stack[enemy.stack?.length - 1] : enemy.card;
      for (const effect of eTop.effects ?? []) {
        if (!effect.description.includes('[⧗]')) continue;

        if (((eTop.set === 'KS' && eTop.number === 128) && (effect.type === 'UPGRADE' || effect.type === 'MAIN')) || (eTop.set === 'KS' && eTop.number === 152)) {
          hiddenBonus -= 1;
        }


        if ((eTop.set === 'KS' && eTop.number === 146) && effect.type === 'MAIN' && effect.description.includes('-1 Power')) {
          if (state.edgeHolder === ownerOfEnemyChars) hiddenBonus -= 1;
        }
      }
    }

    return hiddenBonus;
  }

  const mission = state.activeMissions[missionIndex];
  if (!mission) return 0;

  const friendlyChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  let modifier = 0;

  const enemyChars = player === 'player1' ? mission.player2Characters : mission.player1Characters;

  
  const allMissionChars = [...friendlyChars, ...enemyChars];
  for (const otherChar of allMissionChars) {
    if (otherChar.isHidden) continue;
    if (otherChar.instanceId === char.instanceId) continue; // Skip self for "other" effects

    const topCard = otherChar.stack?.length > 0 ? otherChar.stack[otherChar.stack?.length - 1] : otherChar.card;

    for (const effect of topCard.effects ?? []) {
      if (effect.type !== 'MAIN' || !effect.description.includes('[⧗]')) continue;

      
      if ((topCard.set === 'KS' && topCard.number === 15) && effect.description.includes('Other Team 7')) {
        const charTop = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
        if ((charTop.keywords ?? []).includes('Team 7')) {
          modifier += 1;
        }
      }

      
      if ((topCard.set === 'KS' && topCard.number === 42) && effect.description.includes('Other Team Guy')) {
        const charTop = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
        if ((charTop.keywords ?? []).includes('Team Guy')) {
          modifier += 1;
        }
      }
    }
  }

  
  for (const enemy of enemyChars) {
    if (enemy.isHidden) continue;
    const enemyTopCard = enemy.stack?.length > 0 ? enemy.stack[enemy.stack?.length - 1] : enemy.card;

    for (const effect of enemyTopCard.effects ?? []) {
      if (!effect.description.includes('[⧗]')) continue;

      
      if (((enemyTopCard.set === 'KS' && enemyTopCard.number === 128) && (effect.type === 'UPGRADE' || effect.type === 'MAIN')) || (enemyTopCard.set === 'KS' && enemyTopCard.number === 152)) {
        modifier -= 1;
      }

      
      
    }
  }

  
  
  
  


  const selfTopCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
  for (const effect of selfTopCard.effects ?? []) {
    if (effect.type !== 'MAIN' || !effect.description.includes('[⧗]')) continue;

    
    if ((selfTopCard.set === 'KS' && selfTopCard.number === 13) && effect.description.includes('-1 Power for every other')) {
      const otherNonHidden = friendlyChars.filter(
        (c) => c.instanceId !== char.instanceId && !c.isHidden,
      );
      modifier -= otherNonHidden.length;
    }


    if ((selfTopCard.set === 'KS' && selfTopCard.number === 79) && effect.description.includes('Edge')) {
      if (state.edgeHolder === player) {
        modifier += 2;
      }
    }


    if ((selfTopCard.set === 'KS' && selfTopCard.number === 147) && effect.description.includes('Edge') && effect.description.includes('+3 Power')) {
      if (state.edgeHolder === player) {
        modifier += 3;
      }
    }

    
    if ((selfTopCard.set === 'KS' && selfTopCard.number === 84) && effect.description.includes('Gaara')) {
      const hasGaara = friendlyChars.some(
        (c) => {
          if (c.instanceId === char.instanceId || c.isHidden) return false;
          const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
          return cTop.name_fr.toUpperCase() === 'GAARA';
        },
      );
      if (hasGaara) modifier += 2;
    }

    
    if ((selfTopCard.set === 'KS' && selfTopCard.number === 101) && (effect.description.includes('Tsunade') || effect.description.includes('Shizune'))) {
      const hasTsunadeOrShizune = friendlyChars.some(
        (c) => {
          if (c.instanceId === char.instanceId || c.isHidden) return false;
          const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
          return cTop.name_fr.toUpperCase() === 'TSUNADE' || cTop.name_fr.toUpperCase() === 'SHIZUNE';
        },
      );
      if (hasTsunadeOrShizune) modifier += 1;
    }


    if (selfTopCard.set === 'SS' && selfTopCard.number === 121 && effect.description.includes('friendly Naruto Uzumaki')) {
      let narutoCount = 0;
      for (const m of state.activeMissions) {
        const side = player === 'player1' ? m.player1Characters : m.player2Characters;
        for (const c of side) {
          if (c.instanceId === char.instanceId || c.isHidden) continue;
          const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
          const nm = `${cTop.name_fr ?? ''} ${cTop.name_en ?? ''}`.toUpperCase();
          if (nm.includes('NARUTO UZUMAKI')) narutoCount += 1;
        }
      }
      modifier += narutoCount;
    }


    if (selfTopCard.set === 'SS' && selfTopCard.number === 126 && effect.description.includes('Sound Village')) {
      let soundCount = 0;
      for (const c of [...friendlyChars, ...enemyChars]) {
        if (c.isHidden) continue;
        const cTop = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
        if ((cTop.group ?? '') === 'Sound Village') soundCount += 1;
      }
      modifier += soundCount;
    }
  }

  
  
  
  
  modifier += honorableDuelBonus(mission, player, char);
  modifier += kingOfTheHillBonus(state, mission, char, attachedPowerOf);

  for (const mEffect of mission.card.effects ?? []) {
    if (mEffect.type !== 'MAIN' || !mEffect.description.includes('[⧗]')) continue;

    
    
    if (mEffect.description.includes('All non-hidden characters') && mEffect.description.includes('+1 Power')) {
      modifier += 1;
    }

    if (mEffect.description.includes('4 Power or more') && mEffect.description.includes('+1 Power')) {
      const selfTop = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      const corePower = (selfTop.power ?? 0) + char.powerTokens + attachmentPower;
      if (corePower >= 4) {
        modifier += 1;
      }
    }
  }

  return modifier + attachmentPower;
}






export function isRempartZeroed(
  state: GameState,
  missionIndex: number,
  char: CharacterInPlay,
  player: PlayerID,
): boolean {
  if (char.isHidden) return false;
  const mission = state.activeMissions[missionIndex];
  if (!mission) return false;

  const friendlyChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const enemyChars = player === 'player1' ? mission.player2Characters : mission.player1Characters;

  for (const enemy of enemyChars) {
    if (enemy.isHidden) continue;
    const enemyTopCard = enemy.stack?.length > 0 ? enemy.stack[enemy.stack?.length - 1] : enemy.card;
    if ((enemyTopCard.set === 'KS' && enemyTopCard.number === 67)) {
      const hasRempartEffect = (enemyTopCard.effects ?? []).some(
        (e) => e.type === 'MAIN' && e.description.includes('[⧗]'),
      );
      if (hasRempartEffect) {
        
        let targetId = enemy.rempartLockedTargetId;
        if (!targetId || !friendlyChars.some(f => f.instanceId === targetId && !f.isHidden)) {
          
          let maxPower = -1;
          for (const f of friendlyChars) {
            if (f.isHidden) continue;
            const fTop = f.stack?.length > 0 ? f.stack[f.stack?.length - 1] : f.card;
            const basePower = (fTop.power ?? 0) + f.powerTokens;
            if (basePower > maxPower) { maxPower = basePower; targetId = f.instanceId; }
          }
        }
        if (targetId === char.instanceId) {
          return true;
        }
      }
    }
  }
  return false;
}






export function shouldRetainPowerTokens(char: CharacterInPlay): boolean {
  
  if (char.isHidden) return false;

  const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;

  
  if ((topCard.set === 'KS' && (topCard.number === 39 || topCard.number === 43)) || (topCard.set === 'SS' && topCard.number === 115)) {
    const hasRetention = (topCard.effects ?? []).some(
      (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('lose Power tokens'),
    );
    if (hasRetention) {
      return true;
    }
  }

  return false;
}






export function isProtectedFromEnemyHide(
  state: GameState,
  targetChar: CharacterInPlay,
  owner: PlayerID,
): boolean {
  const mission = state.activeMissions[targetChar.missionIndex];
  if (!mission) return false;

  const friendlySide: 'player1Characters' | 'player2Characters' =
    owner === 'player1' ? 'player1Characters' : 'player2Characters';

  for (const char of mission[friendlySide]) {
    if (char.isHidden) continue;
    if (char.instanceId === targetChar.instanceId) continue; // A character is not friendly to itself
    const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;

    
    if ((topCard.set === 'KS' && topCard.number === 115)) {
      const hasProtection = (topCard.effects ?? []).some(
        (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('cannot be hidden by enemy effects'),
      );
      if (hasProtection) return true;
    }
  }

  return false;
}






export function isImmuneToEnemyHideOrDefeat(char: CharacterInPlay): boolean {
  if (char.isHidden) return false;
  const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
  return (topCard.effects ?? []).some(
    (e) =>
      e.type === 'MAIN' &&
      e.description.includes('[⧗]') &&
      e.description.includes("Can't be hidden or defeated by enemy effects"),
  );
}


export function canBeHiddenByEnemy(
  state: GameState,
  char: CharacterInPlay,
  charOwner: PlayerID,
): boolean {
  if (char.isHidden) return false;
  if (isImmuneToEnemyHideOrDefeat(char)) return false;
  if (isProtectedFromEnemyHide(state, char, charOwner)) return false;
  return true;
}


export function isHiddenRevealBlocked(
  state: GameState,
  missionIndex: number,
  revealingPlayer: PlayerID,
): boolean {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return false;
  const opponent = revealingPlayer === 'player1' ? 'player2' : 'player1';
  const opponentChars = opponent === 'player1' ? mission.player1Characters : mission.player2Characters;
  for (const oc of opponentChars) {
    if (oc.isHidden) continue;
    const top = oc.stack?.length > 0 ? oc.stack[oc.stack.length - 1] : oc.card;
    const hasLock = (top.effects ?? []).some(
      (e) =>
        e.type === 'MAIN' &&
        typeof e.description === 'string' &&
        e.description.includes('[⧗]') &&
        e.description.toLowerCase().includes('cannot play characters while hidden'),
    );
    if (hasLock) return true;
  }
  return false;
}

export function isMovementBlockedByKurenai(
  state: GameState,
  sourceMissionIndex: number,
  movedCharOwner: PlayerID,
): boolean {
  const sourceMission = state.activeMissions[sourceMissionIndex];
  if (!sourceMission) return false;
  const allChars = [...sourceMission.player1Characters, ...sourceMission.player2Characters];
  for (const ch of allChars) {
    if (ch.isHidden) continue;
    const chTop = ch.stack?.length > 0 ? ch.stack[ch.stack?.length - 1] : ch.card;
    if ((chTop.set === 'KS' && chTop.number === 35) || (chTop.set === 'SS' && chTop.number === 147)) {
      const hasRestriction = (chTop.effects ?? []).some(
        (e) => e.type === 'MAIN' && e.description.includes('[⧗]') &&
          (e.description.includes('cannot move') || e.description.includes("can't be moved")),
      );
      if (hasRestriction) {
        const kurenaiOwner = sourceMission.player1Characters.some(c => c.instanceId === ch.instanceId)
          ? 'player1' : 'player2';
        if (movedCharOwner !== kurenaiOwner) return true;
      }
    }
  }
  return false;
}






function applyNewForcesPowerup(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  playedInstanceId?: string,
): GameState {
  if (!playedInstanceId) return state;
  const mission = state.activeMissions[missionIndex];
  if (!missionCarries(mission, SS_MISSION_NEW_FORCES)) return state;
  if (!playedNameIsUniqueInMission(mission, playedInstanceId)) return state;

  const side: 'player1Characters' | 'player2Characters' =
    mission.player1Characters.some((c) => c.instanceId === playedInstanceId)
      ? 'player1Characters'
      : 'player2Characters';

  const played = mission[side].find((c) => c.instanceId === playedInstanceId);
  if (!played) return state;
  const top = played.stack?.length > 0 ? played.stack[played.stack.length - 1] : played.card;

  const missions = state.activeMissions.map((m, idx) => {
    if (idx !== missionIndex) return m;
    return {
      ...m,
      [side]: m[side].map((c: CharacterInPlay) =>
        c.instanceId === playedInstanceId ? { ...c, powerTokens: c.powerTokens + 2 } : c,
      ),
    };
  });

  return {
    ...state,
    activeMissions: missions,
    log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_CONTINUOUS',
      `New Forces (SS-001): POWERUP 2 on ${top.name_fr}, a name no other character holds here.`,
      'game.log.effect.ssMss01Powerup',
      { card: 'Renforts', id: 'SS-001-MMS', target: top.name_fr }),
  };
}

function applyJiraiyaGoldSummonChakra(
  state: GameState,
  playingPlayer: PlayerID,
  playedInstanceId?: string,
): GameState {
  if (!playedInstanceId) return state;
  if (!isSummonPlay(state, playingPlayer, playedInstanceId)) return state;

  const sources = jiraiyaGoldSources(state, playingPlayer);
  if (sources.length === 0) return state;

  const owner = { ...state[playingPlayer] };
  owner.chakra += sources.length;
  return {
    ...state,
    [playingPlayer]: owner,
    log: logAction(state.log, state.turn, state.phase, playingPlayer, 'EFFECT_CONTINUOUS',
      `Jiraiya (SS-002): gained ${sources.length} Chakra for playing a Summon character.`,
      'game.log.effect.ss002SummonChakra',
      { card: JIRAIYA_GOLD_NAME, id: JIRAIYA_GOLD_ID, amount: sources.length }),
  };
}

export function triggerOnPlayReactions(state: GameState, playingPlayer: PlayerID, missionIndex: number, _isReveal?: boolean, playedInstanceId?: string): GameState {
  
  

  let newState = { ...state };
  newState = triggerCrow089Relocation(newState, playingPlayer, playedInstanceId);
  newState = applyNewForcesPowerup(newState, playingPlayer, missionIndex, playedInstanceId);
  newState = applyJiraiyaGoldSummonChakra(newState, playingPlayer, playedInstanceId);
  const opponent: PlayerID = playingPlayer === 'player1' ? 'player2' : 'player1';
  const mission = newState.activeMissions[missionIndex];
  const opponentChars = opponent === 'player1' ? mission.player1Characters : mission.player2Characters;

  for (const char of opponentChars) {
    if (char.isHidden) continue;
    const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
    const topCardNumber = typeof topCard.number === 'string' ? parseInt(topCard.number, 10) : topCard.number;

    for (const effect of topCard.effects ?? []) {
      if (effect.type !== 'MAIN' || !effect.description.includes('[⧗]')) continue;


      if (topCardNumber === 37 && effect.description.includes('POWERUP 1')) {
        const missions = [...newState.activeMissions];
        const updatedMission = { ...missions[missionIndex] };
        const side = opponent === 'player1' ? 'player1Characters' : 'player2Characters';
        updatedMission[side] = updatedMission[side].map((c: CharacterInPlay) =>
          c.instanceId === char.instanceId ? { ...c, powerTokens: c.powerTokens + 1 } : c,
        );
        missions[missionIndex] = updatedMission;
        newState.activeMissions = missions;
        newState.log = logAction(
          newState.log, newState.turn, 'action', opponent,
          'EFFECT_CONTINUOUS',
          `Neji Hyuga (037): POWERUP 1 - enemy played a non-hidden character in this mission.`,
          'game.log.effect.neji037',
          { card: 'NEJI HYUGA', id: 'KS-037-UC' },
        );
      }

      
      if (topCardNumber === 31 && effect.description.includes('1 Chakra')) {
        const ps = { ...newState[opponent] };
        ps.chakra += 1;
        newState = { ...newState, [opponent]: ps };
        newState.log = logAction(
          newState.log, newState.turn, 'action', opponent,
          'EFFECT_CONTINUOUS',
          `Hinata Hyuga (031): Gained 1 Chakra - enemy played a non-hidden character in this mission.`,
          'game.log.effect.hinata031',
          { card: 'HINATA HYUGA', id: 'KS-031-UC' },
        );
      }
    }
  }

  
  
  
  
  if (playedInstanceId) {
    const km056Side = playingPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
    const justPlayed = mission[km056Side].find((c: CharacterInPlay) => c.instanceId === playedInstanceId);
    if (justPlayed && !justPlayed.isHidden) {
      const jpTop = justPlayed.stack?.length > 0 ? justPlayed.stack[justPlayed.stack.length - 1] : justPlayed.card;
      if ((jpTop.set === 'KS' && jpTop.number === 128) || (jpTop.set === 'KS' && jpTop.number === 152) || (jpTop.set === 'KS' && jpTop.number === 127)) {
        for (const enemyChar of opponentChars) {
          if (enemyChar.isHidden) continue;
          const eTop = enemyChar.stack?.length > 0 ? enemyChar.stack[enemyChar.stack.length - 1] : enemyChar.card;
          if (eTop.number !== 56) continue;
          const hasProtection = (eTop.effects ?? []).some(
            (e: { type: string; description: string }) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.toLowerCase().includes('chakra'),
          );
          if (!hasProtection) continue;
          if (newState[playingPlayer].chakra >= 1) {
            const ps = { ...newState[playingPlayer] };
            ps.chakra -= 1;
            newState = { ...newState, [playingPlayer]: ps };
            newState.log = logAction(
              newState.log, newState.turn, 'action', opponent,
              'EFFECT_CONTINUOUS',
              `Kimimaro (056): ${playingPlayer} pays 1 Chakra for continuous effect on Kimimaro.`,
              'game.log.effect.kimimaro056Protection',
              { card: 'KIMIMARO', id: 'KS-056-UC' },
            );
          }
          break;
        }
      }
    }
  }

  return newState;
}


export function applyRempartTokenRemoval(state: GameState): GameState {
  let newState = state;
  let changed = false;

  for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
    const m = newState.activeMissions[mIdx];
    for (const sideKey of ['player1Characters', 'player2Characters'] as const) {
      const sideChars = m[sideKey];
      let sideChanged = false;
      const nextChars = sideChars.map((c) => {
        const top = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        if ((top.set === 'KS' && top.number === 67) && c.rempartLockedTargetId !== undefined) {
          sideChanged = true;
          return { ...c, rempartLockedTargetId: undefined };
        }
        return c;
      });
      if (sideChanged) {
        if (!changed) {
          newState = { ...newState, activeMissions: [...newState.activeMissions] };
          changed = true;
        }
        const updatedMission = { ...newState.activeMissions[mIdx], [sideKey]: nextChars };
        newState.activeMissions[mIdx] = updatedMission;
      }
    }
  }

  const missions = newState.activeMissions;

  for (let mIdx = 0; mIdx < missions.length; mIdx++) {
    for (const playerSide of ['player1', 'player2'] as const) {
      const friendlySide = playerSide === 'player1' ? 'player1Characters' : 'player2Characters';
      const enemySide = playerSide === 'player1' ? 'player2Characters' : 'player1Characters';
      const enemyPlayer = playerSide === 'player1' ? 'player2' : 'player1';

      
      const rempartChar = missions[mIdx][friendlySide].find((c) => {
        if (c.isHidden) return false;
        const top = c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
        return (top.set === 'KS' && top.number === 67) && (top.effects ?? []).some(
          (e) => e.type === 'MAIN' && e.description.includes('[⧗]'),
        );
      });
      if (!rempartChar) continue;

      const enemyChars = missions[mIdx][enemySide];

      
      let targetId = rempartChar.rempartLockedTargetId;
      if (!targetId || !enemyChars.some(c => c.instanceId === targetId && !c.isHidden)) {
        
        let maxPower = -1;
        targetId = undefined;
        for (const ec of enemyChars) {
          if (ec.isHidden) continue;
          const top = ec.stack?.length > 0 ? ec.stack[ec.stack?.length - 1] : ec.card;
          const power = (top.power ?? 0) + ec.powerTokens;
          if (power > maxPower) { maxPower = power; targetId = ec.instanceId; }
        }

        
        if (targetId && targetId !== rempartChar.rempartLockedTargetId) {
          if (!changed) {
            newState = { ...newState, activeMissions: [...newState.activeMissions] };
            changed = true;
          }
          const m = { ...newState.activeMissions[mIdx] };
          m[friendlySide] = m[friendlySide].map(c =>
            c.instanceId === rempartChar.instanceId ? { ...c, rempartLockedTargetId: targetId } : c
          );
          newState.activeMissions[mIdx] = m;
        }
      }

      if (!targetId) continue;
      const targetIdx = enemyChars.findIndex(c => c.instanceId === targetId);
      if (targetIdx === -1) continue;

      if (enemyChars[targetIdx].powerTokens > 0) {
        if (!changed) {
          newState = { ...newState, activeMissions: [...newState.activeMissions] };
          changed = true;
        }
        const mission = { ...newState.activeMissions[mIdx] };
        const chars = [...mission[enemySide]];
        const removedTokens = chars[targetIdx].powerTokens;
        chars[targetIdx] = { ...chars[targetIdx], powerTokens: 0 };
        mission[enemySide] = chars;
        newState.activeMissions[mIdx] = mission;

        newState = {
          ...newState,
          log: logAction(
            newState.log, newState.turn, newState.phase, playerSide as PlayerID,
            'EFFECT_CONTINUOUS',
            `Rashomon (067): Permanently removed ${removedTokens} Power token(s) from ${chars[targetIdx].card.name_fr}.`,
            'game.log.effect.rempartTokenRemoval',
            { card: 'RASHOMON', id: 'KS-067-UC', target: chars[targetIdx].card.name_fr, amount: removedTokens },
          ),
        };
      }
    }
  }

  return newState;
}


function triggerCrow089Relocation(state: GameState, playingPlayer: PlayerID, playedInstanceId?: string): GameState {
  if (!playedInstanceId) return state;
  const side: 'player1Characters' | 'player2Characters' = playingPlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  let played: CharacterInPlay | null = null;
  for (const m of state.activeMissions) {
    const found = m[side].find((c) => c.instanceId === playedInstanceId);
    if (found) { played = found; break; }
  }
  if (!played || played.isHidden) return state;
  const playedTop = played.stack?.length > 0 ? played.stack[played.stack.length - 1] : played.card;
  if (!(playedTop.name_en ?? '').toUpperCase().startsWith('KANKURO')) return state;

  let host: CharacterInPlay | null = null;
  let hostMission = 0;
  for (let mi = 0; mi < state.activeMissions.length; mi++) {
    for (const c of state.activeMissions[mi][side]) {
      if ((c.attachments ?? []).some((a) => a.card.id === 'SS-089-UC')) { host = c; hostMission = mi; break; }
    }
    if (host) break;
  }
  if (!host) return state;

  const targets: string[] = [];
  for (const m of state.activeMissions) {
    for (const c of m[side]) {
      if (c.isHidden) continue;
      if (c.instanceId === host.instanceId) continue;
      if ((c.card as { card_type?: string }).card_type === 'attachment') continue;
      if ((c.attachments?.length ?? 0) > 0) continue;
      targets.push(c.instanceId);
    }
  }
  if (targets.length === 0) return state;

  const effId = generateInstanceId();
  const actId = generateInstanceId();
  return {
    ...state,
    pendingEffects: [...state.pendingEffects, {
      id: effId,
      sourceCardId: 'SS-089-UC',
      sourceInstanceId: host.instanceId,
      sourceMissionIndex: hostMission,
      effectType: 'MAIN',
      effectDescription: '',
      targetSelectionType: 'SS089_CONFIRM_MAIN',
      sourcePlayer: playingPlayer,
      requiresTargetSelection: true,
      validTargets: [host.instanceId],
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
    }],
    pendingActions: [...state.pendingActions, {
      id: actId,
      type: 'SELECT_TARGET' as PendingAction['type'],
      player: playingPlayer,
      description: 'Crow (SS-089): Move this attachment to a friendly character?',
      descriptionKey: 'game.effect.desc.ss089ConfirmMain',
      options: [host.instanceId],
      minSelections: 1,
      maxSelections: 1,
      sourceEffectId: effId,
    }],
  };
}

export function missionPowerFor(state: GameState, missionIndex: number, player: PlayerID): number {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return 0;
  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  let total = 0;
  for (const char of chars) {
    const top = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    const base = char.isHidden ? 0 : (top?.power ?? 0);
    total += base + char.powerTokens + calculateContinuousPowerModifier(state, player, missionIndex, char);
  }
  return total + teamTrainingBonus(mission, player);
}
