import type { GameState, PlayerID, CharacterCard } from '../types';
import { foodAttachmentDiscountCount } from '@/lib/effects/handlers/SS/staticAuras';
import { virtualSoundFourCount } from '@/lib/effects/handlers/SS/attachmentStatics';
import { reductionPremiereFrappe } from './firstStrikeDiscount';


// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTopCard(char: any): CharacterCard | undefined {
  if (char.stack?.length > 0) return char.stack[char.stack?.length - 1];
  if (char.topCard) return char.topCard;
  return char.card;
}


export function isCharacterCard(card: CharacterCard): boolean {
  const type = (card as unknown as { card_type?: string }).card_type;
  return type === undefined || type === 'character';
}

function discardPileSizeOf(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: GameState | any,
  player: PlayerID,
): number {
  const fullSide = state?.[player];
  if (fullSide && Array.isArray(fullSide.discardPile)) return fullSide.discardPile.length;
  if (state?.myPlayer === player && Array.isArray(state?.myState?.discardPile)) {
    return state.myState.discardPile.length;
  }
  const opponentSide = state?.opponentState;
  if (opponentSide?.id === player) {
    if (typeof opponentSide.discardPileSize === 'number') return opponentSide.discardPileSize;
    if (Array.isArray(opponentSide.discardPile)) return opponentSide.discardPile.length;
  }
  return 0;
}

export function hasKin043DiscardDiscount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: GameState | any,
  player: PlayerID,
  card: CharacterCard,
): boolean {
  if (String(card?.set) !== 'SS' || Number(card?.number) !== 43) return false;
  if (!isCharacterCard(card)) return false;
  return discardPileSizeOf(state, player) > 0;
}

const PER_ALLY_DISCOUNT = /costs?\s+1\s+less\s+for\s+every\s+friendly\s+(.+?)\s+character\s+in\s+this\s+mission/i;

export function perAllyDiscountKeyword(card: CharacterCard): string | null {
  if (!isCharacterCard(card)) return null;
  for (const effect of card.effects ?? []) {
    if (effect.type !== 'MAIN' || !effect.description.includes('[⧗]')) continue;
    const match = effect.description.match(PER_ALLY_DISCOUNT);
    if (match) return match[1].trim();
  }
  return null;
}

export function perAllyDiscountAmount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: GameState | any,
  player: PlayerID,
  card: CharacterCard,
  missionIndex: number,
): number {
  const keyword = perAllyDiscountKeyword(card);
  if (!keyword) return 0;

  const mission = state.activeMissions?.[missionIndex];
  if (!mission) return 0;
  const friendlyChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  if (!friendlyChars) return 0;

  const ownName = String(card.name_fr ?? '').toUpperCase();
  let count = 0;
  for (const c of friendlyChars) {
    if (c.isHidden) continue;
    const top = getTopCard(c);
    if (!top) continue;
    if (ownName && String(top.name_fr ?? '').toUpperCase() === ownName) continue;
    if ((top.keywords ?? []).includes(keyword)) count += 1;
  }
  if (keyword === 'Sound Four') count += virtualSoundFourCount(mission, player);
  return count;
}

export function calculateEffectiveCost(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: GameState | any,
  player: PlayerID,
  card: CharacterCard,
  missionIndex: number,
  isReveal: boolean,
): number {
  let cost = card.chakra;

  const premiereFrappe = reductionPremiereFrappe(state, player, card);
  if (premiereFrappe > 0) cost = Math.max(0, cost - premiereFrappe);

  if (hasKin043DiscardDiscount(state, player, card)) {
    cost = Math.max(0, cost - 1);
  }

  if (missionIndex < 0 || missionIndex >= (state.activeMissions?.length ?? 0)) {
    return cost;
  }

  const mission = state.activeMissions[missionIndex];
  if (!mission) return cost;
  const friendlyChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  if (!friendlyChars) return cost;

  const parAllie = perAllyDiscountAmount(state, player, card, missionIndex);
  if (parAllie > 0) cost = Math.max(0, cost - parAllie);

  
  const allCharsInMission = [...(friendlyChars || []), ...(player === 'player1' ? mission.player2Characters : mission.player1Characters) || []];
  for (const charInMission of allCharsInMission) {
    if (charInMission.isHidden) continue;

    const topCard = getTopCard(charInMission);
    if (!topCard) continue;

    for (const effect of topCard.effects ?? []) {
      if (effect.type !== 'MAIN' || !effect.description.includes('[⧗]')) continue;

      
      if ((topCard.set === 'KS' && topCard.number === 34) && effect.description.includes('Team 8') && effect.description.includes('less')) {
        if ((card.keywords ?? []).includes('Team 8') && card.id !== topCard.id && isCharacterCard(card)) {
          cost = Math.max(1, cost - 1);
        }
      }

      
      
      if ((card.set === 'KS' && card.number === 96) && topCard.name_fr?.toUpperCase().includes('NARUTO UZUMAKI')) {
        
        cost = Math.max(0, cost - 1);
      }
    }
  }

  if (!isCharacterCard(card) && ((card as unknown as { keywords?: string[] }).keywords ?? []).includes('Food')) {
    const sanshos = foodAttachmentDiscountCount(state, player);
    if (sanshos > 0) cost = Math.max(0, cost - sanshos);
  }

  if (card.group === 'Sand Village' && isCharacterCard(card)) {
    const friendlySideKey = player === 'player1' ? 'player1Characters' : 'player2Characters';
    let rasaCount = 0;
    for (const m of state.activeMissions ?? []) {
      for (const c of (m?.[friendlySideKey] ?? [])) {
        if (c.isHidden) continue;
        const cTop = getTopCard(c);
        if (!cTop) continue;
        if (String(cTop.set) !== 'SS' || String(cTop.number) !== '51') continue;
        rasaCount++;
      }
    }
    if (rasaCount > 0) cost = Math.max(0, cost - rasaCount);
  }

  for (const effect of card.effects ?? []) {
    if (effect.type !== 'MAIN' || !effect.description.includes('[⧗]')) continue;


    if ((card.set === 'KS' && card.number === 96) && effect.description.includes('Naruto Uzumaki') && effect.description.includes('1 less')) {
      const hasNaruto = friendlyChars.some(
        (c: any) => {
          if (c.isHidden) return false;
          const cTop = getTopCard(c);
          return cTop?.name_fr?.toUpperCase().includes('NARUTO UZUMAKI');
        },
      );
      if (hasNaruto) {
        cost = Math.max(0, cost - 1);
      }
    }

    
    if (String(card.set) === 'SS' && Number(card.number) === 86 && effect.description.includes('hidden paying 1 less')) {
      if (isReveal) cost = Math.max(0, cost - 1);
    }

    if ((card.set === 'KS' && card.number === 75) && effect.description.includes('hidden paying 2 less')) {
      
      if (isReveal) {
        cost = Math.max(0, cost - 2);
      }
    }

    
    
    if ((card.set === 'KS' && card.number === 90) && effect.description.includes('Sasuke Uchiha') && effect.description.includes('3 less')) {
      if (isReveal) {
        
        
        const enemySide = player === 'player1' ? mission.player2Characters : mission.player1Characters;
        const checkableChars = [
          ...(friendlyChars || []).filter((c: any) => !c.isHidden),
          ...(enemySide || []).filter((c: any) => !c.isHidden),
        ];
        const hasSasuke = checkableChars.some(
          (c: any) => {
            const cTop = getTopCard(c);
            return cTop?.name_fr?.toUpperCase().includes('SASUKE');
          },
        );
        if (hasSasuke) {
          cost = Math.max(0, cost - 3);
        }
      }
    }
  }

  
  const enemyChars = player === 'player1' ? mission.player2Characters : mission.player1Characters;
  if (!enemyChars) return Math.max(0, cost);
  for (const enemy of enemyChars) {
    if (enemy.isHidden) continue;

    const enemyTopCard = getTopCard(enemy);
    if (!enemyTopCard) continue;

    for (const effect of enemyTopCard.effects ?? []) {
      if (effect.type !== 'MAIN' || !effect.description.includes('[⧗]')) continue;

      
      
      if ((enemyTopCard.set === 'KS' && enemyTopCard.number === 125) && effect.description.includes('additional 1 Chakra') && isCharacterCard(card)) {
        cost += 1;
      }


      if (enemyTopCard.set === 'SS' && enemyTopCard.number === 120 && isReveal && effect.description.includes('1 more Chakra') && isCharacterCard(card)) {
        cost += 1;
      }
    }
  }

  
  if (isReveal && (card.set === 'KS' && card.number === 33)) {
    const hasEnemyJutsu = enemyChars?.some((c: any) => {
      if (c.isHidden) return false;
      const cTop = getTopCard(c);
      return cTop?.keywords?.includes('Jutsu');
    });
    if (hasEnemyJutsu) {
      cost = Math.max(0, cost - 4);
    }
  }

  
  if (state.playCostIncrease) {
    cost += state.playCostIncrease[player] ?? 0;
  }

  
  

  return Math.max(0, cost);
}


export function hasKurenai034CostReduction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: GameState | any,
  player: PlayerID,
  card: CharacterCard,
  missionIndex: number,
): boolean {
  if (missionIndex < 0 || missionIndex >= (state.activeMissions?.length ?? 0)) return false;
  const mission = state.activeMissions[missionIndex];
  if (!mission) return false;

  const friendlyChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const enemyChars = player === 'player1' ? mission.player2Characters : mission.player1Characters;
  const allCharsInMission = [...(friendlyChars || []), ...(enemyChars || [])];

  for (const charInMission of allCharsInMission) {
    if (charInMission.isHidden) continue;
    const topCard = getTopCard(charInMission);
    if (!topCard) continue;
    for (const effect of topCard.effects ?? []) {
      if (effect.type !== 'MAIN' || !effect.description.includes('[⧗]')) continue;
      if ((topCard.set === 'KS' && topCard.number === 34) && effect.description.includes('Team 8') && effect.description.includes('less')) {
        if ((card.keywords ?? []).includes('Team 8') && card.id !== topCard.id) {
          return true;
        }
      }
    }
  }
  return false;
}
