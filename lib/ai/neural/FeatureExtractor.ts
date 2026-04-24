

import type { GameState, PlayerID, ActiveMission, CharacterInPlay } from '../../engine/types';
import { calculateCharacterPower } from '../../engine/phases/PowerCalculation';

export const FEATURE_DIM = 200;

export class FeatureExtractor {
  
  static extract(state: GameState, aiPlayer: PlayerID): Float32Array {
    const f = new Float32Array(FEATURE_DIM); // initialized to 0
    let idx = 0;

    const opponent: PlayerID = aiPlayer === 'player1' ? 'player2' : 'player1';
    const myState = state[aiPlayer];
    const oppState = state[opponent];

    
    f[idx++] = state.turn / 4;                          // 0: turn normalized
    f[idx++] = state.turn === 1 ? 1 : 0;               // 1: turn 1
    f[idx++] = state.turn === 2 ? 1 : 0;               // 2: turn 2
    f[idx++] = state.turn === 3 ? 1 : 0;               // 3: turn 3
    f[idx++] = state.turn === 4 ? 1 : 0;               // 4: turn 4
    f[idx++] = state.phase === 'action' ? 1 : 0;       // 5: action phase
    f[idx++] = state.activePlayer === aiPlayer ? 1 : 0; // 6: AI is active
    f[idx++] = state.edgeHolder === aiPlayer ? 1 : 0;  // 7: AI has edge

    
    f[idx++] = Math.min((myState.chakra ?? 0) / 20, 1);
    f[idx++] = Math.min((myState.missionPoints ?? 0) / 20, 1);
    f[idx++] = Math.min(myState.deck.length / 30, 1);
    f[idx++] = Math.min(myState.hand.length / 10, 1);
    f[idx++] = Math.min(myState.discardPile.length / 30, 1);
    f[idx++] = myState.hasPassed ? 1 : 0;
    f[idx++] = Math.min((myState.charactersInPlay ?? 0) / 12, 1);

    
    f[idx++] = Math.min((oppState.chakra ?? 0) / 20, 1);
    f[idx++] = Math.min((oppState.missionPoints ?? 0) / 20, 1);
    f[idx++] = Math.min(oppState.deck.length / 30, 1);
    
    const oppHandSize = oppState.hand.length;
    f[idx++] = Math.min(oppHandSize / 10, 1);
    f[idx++] = Math.min(oppState.discardPile.length / 30, 1);
    f[idx++] = oppState.hasPassed ? 1 : 0;
    f[idx++] = Math.min((oppState.charactersInPlay ?? 0) / 12, 1);

    
    for (let m = 0; m < 4; m++) {
      const mission: ActiveMission | undefined = state.activeMissions[m];
      if (!mission) {
        
        idx += 16;
        continue;
      }

      const myChars = aiPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
      const oppChars = aiPlayer === 'player1' ? mission.player2Characters : mission.player1Characters;

      
      f[idx++] = mission.rank === 'D' ? 1 : 0;
      f[idx++] = mission.rank === 'C' ? 1 : 0;
      f[idx++] = mission.rank === 'B' ? 1 : 0;
      f[idx++] = mission.rank === 'A' ? 1 : 0;

      
      f[idx++] = Math.min((mission.basePoints ?? 0) / 5, 1);
      f[idx++] = (mission.rankBonus ?? 0) / 4;

      
      const myPower = FeatureExtractor.totalPower(state, myChars, aiPlayer);
      const myHidden = myChars.filter(c => c.isHidden).length;
      f[idx++] = Math.min(myChars.length / 5, 1);
      f[idx++] = Math.min(myHidden / 5, 1);
      f[idx++] = Math.min(myPower / 20, 1);
      f[idx++] = Math.min(myChars.reduce((s, c) => s + c.powerTokens, 0) / 10, 1);
      f[idx++] = myChars.some(c => c.card.effects?.some(e => e.type === 'SCORE')) ? 1 : 0;

      
      const oppPower = FeatureExtractor.totalPower(state, oppChars, opponent);
      const oppHidden = oppChars.filter(c => c.isHidden).length;
      f[idx++] = Math.min(oppChars.length / 5, 1);
      f[idx++] = Math.min(oppHidden / 5, 1);
      f[idx++] = Math.min(oppPower / 20, 1);
      f[idx++] = Math.min(oppChars.reduce((s, c) => s + c.powerTokens, 0) / 10, 1);
      f[idx++] = oppChars.some(c => !c.isHidden && c.card.effects?.some(e => e.type === 'SCORE')) ? 1 : 0;

    }

    
    const MAX_HAND_SLOTS = 7;
    for (let h = 0; h < MAX_HAND_SLOTS; h++) {
      const card = myState.hand[h];
      if (!card) {
        idx += 13;
        continue;
      }
      f[idx++] = 1;                                             // present
      f[idx++] = Math.min((card.chakra ?? 0) / 10, 1);         // chakra cost
      f[idx++] = Math.min((card.power ?? 0) / 10, 1);          // power
      f[idx++] = card.effects?.some(e => e.type === 'MAIN') ? 1 : 0;
      f[idx++] = card.effects?.some(e => e.type === 'AMBUSH') ? 1 : 0;
      f[idx++] = card.effects?.some(e => e.type === 'SCORE') ? 1 : 0;
      f[idx++] = card.effects?.some(e => e.type === 'UPGRADE') ? 1 : 0;
      f[idx++] = card.effects?.some(e => /CHAKRA\s*\+/i.test(e.description)) ? 1 : 0;
      f[idx++] = card.effects?.some(e => /POWERUP/i.test(e.description)) ? 1 : 0;
      
      const g = (card.group ?? '').toLowerCase();
      f[idx++] = g.includes('leaf') ? 1 : 0;
      f[idx++] = g.includes('sand') ? 1 : 0;
      f[idx++] = g.includes('sound') || g.includes('son') ? 1 : 0;
      f[idx++] = g.includes('akatsuki') ? 1 : 0;
    }

    
    const myTotalPower = state.activeMissions.reduce((sum, m) => {
      const chars = aiPlayer === 'player1' ? m.player1Characters : m.player2Characters;
      return sum + FeatureExtractor.totalPower(state, chars, aiPlayer);
    }, 0);
    const oppTotalPower = state.activeMissions.reduce((sum, m) => {
      const chars = aiPlayer === 'player1' ? m.player2Characters : m.player1Characters;
      return sum + FeatureExtractor.totalPower(state, chars, opponent);
    }, 0);

    f[idx++] = Math.min(myTotalPower / 40, 1);
    f[idx++] = Math.min(oppTotalPower / 40, 1);
    
    f[idx++] = (myTotalPower - oppTotalPower + 40) / 80; // [0,1] centered at 0.5

    
    const pointDiff = (myState.missionPoints ?? 0) - (oppState.missionPoints ?? 0);
    f[idx++] = (pointDiff + 20) / 40; // centered

    
    f[idx++] = ((myState.chakra ?? 0) - (oppState.chakra ?? 0) + 20) / 40;

    
    const myHiddenTotal = state.activeMissions.reduce((s, m) => {
      const chars = aiPlayer === 'player1' ? m.player1Characters : m.player2Characters;
      return s + chars.filter(c => c.isHidden).length;
    }, 0);
    const oppHiddenTotal = state.activeMissions.reduce((s, m) => {
      const chars = aiPlayer === 'player1' ? m.player2Characters : m.player1Characters;
      return s + chars.filter(c => c.isHidden).length;
    }, 0);
    f[idx++] = Math.min(myHiddenTotal / 8, 1);
    f[idx++] = Math.min(oppHiddenTotal / 8, 1);

    
    let myMissionsWinning = 0;
    let oppMissionsWinning = 0;
    for (const mission of state.activeMissions) {
      const myPow = FeatureExtractor.totalPower(state,
        aiPlayer === 'player1' ? mission.player1Characters : mission.player2Characters, aiPlayer);
      const opPow = FeatureExtractor.totalPower(state,
        aiPlayer === 'player1' ? mission.player2Characters : mission.player1Characters, opponent);
      if (myPow > opPow && myPow > 0) myMissionsWinning++;
      else if (opPow > myPow && opPow > 0) oppMissionsWinning++;
    }
    f[idx++] = myMissionsWinning / 4;
    f[idx++] = oppMissionsWinning / 4;

    
    f[idx++] = (4 - state.turn) / 4;

    
    f[idx++] = myState.hand.some(c => c.effects?.some(e => e.type === 'AMBUSH')) ? 1 : 0;
    
    f[idx++] = myState.hand.some(c => c.effects?.some(e => e.type === 'SCORE')) ? 1 : 0;
    
    f[idx++] = myState.hand.some(c => (c.chakra ?? 0) <= myState.chakra) ? 1 : 0;

    
    for (let i = 0; i < f.length; i++) {
      const value = f[i];
      if (!Number.isFinite(value)) {
        f[i] = 0;
      } else if (value < 0) {
        f[i] = 0;
      } else if (value > 1) {
        f[i] = 1;
      }
    }

    

    return f;
  }

  private static totalPower(
    state: GameState,
    chars: CharacterInPlay[],
    player: PlayerID,
  ): number {
    return chars.reduce((sum, c) => {
      try {
        return sum + calculateCharacterPower(state, c, player);
      } catch {
        return sum + (c.isHidden ? 0 : (c.card.power ?? 0) + c.powerTokens);
      }
    }, 0);
  }

  
  static flipPerspective(features: Float32Array): Float32Array {
    
    
    
    return features; // placeholder - augmentation done at data generation time
  }
}
