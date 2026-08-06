import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { calculateMissionChakraBonus } from '@/lib/effects/ContinuousEffects';
import { getCharacterById } from '@/lib/data/cardIndex';
import type { GameState } from '@/lib/engine/types';

const STRONG = 'KS-136-S';
const WEAK = 'KS-005-C';
const SUMMON = 'KS-094-C';

function terrainBoard(missionId = 'SS-005-MMS'): GameState {
  return buildSimState({ missionIds: [missionId, 'KS-006-MMS'] });
}

function bonusFor(state: GameState, player: 'player1' | 'player2'): number {
  return calculateMissionChakraBonus(state, player);
}

function nextRound(state: GameState): GameState {
  const ready: GameState = { ...state, phase: 'end', turn: 2 };
  return GameEngine.transitionToEndPhase(ready);
}

function chakraOf(state: GameState, player: 'player1' | 'player2'): number {
  return state[player].chakra;
}

describe('Adverse Terrain gives 2 chakra to whoever is losing the mission', () => {
  it('the weaker side gets it, the stronger side gets nothing', () => {
    const state = terrainBoard();
    state.activeMissions[0].player1Characters.push(simChar(STRONG, { owner: 'player1', instanceId: 'p1-strong' }));
    state.activeMissions[0].player2Characters.push(simChar(WEAK, { owner: 'player2', instanceId: 'p2-weak' }));

    expect(bonusFor(state, 'player2'), 'the player who cannot score gets chakra').toBe(2);
    expect(bonusFor(state, 'player1'), 'the leader gets nothing').toBe(0);
  });

  it('on a tie nobody gets it', () => {
    const state = terrainBoard();
    state.activeMissions[0].player1Characters.push(simChar(WEAK, { owner: 'player1', instanceId: 'p1' }));
    state.activeMissions[0].player2Characters.push(simChar(WEAK, { owner: 'player2', instanceId: 'p2' }));

    expect(bonusFor(state, 'player1')).toBe(0);
    expect(bonusFor(state, 'player2')).toBe(0);
  });

  it('an empty mission gives nothing to anyone', () => {
    const state = terrainBoard();
    expect(bonusFor(state, 'player1')).toBe(0);
    expect(bonusFor(state, 'player2')).toBe(0);
  });

  it('a lone player on the mission is not losing it', () => {
    const state = terrainBoard();
    state.activeMissions[0].player1Characters.push(simChar(WEAK, { owner: 'player1', instanceId: 'p1' }));

    expect(bonusFor(state, 'player1'), 'nobody is ahead of them').toBe(0);
    expect(bonusFor(state, 'player2'), 'facing an empty side, they are behind').toBe(2);
  });

  it('another mission never decides this one', () => {
    const state = terrainBoard();
    state.activeMissions[0].player1Characters.push(simChar(WEAK, { owner: 'player1', instanceId: 'p1-here' }));
    state.activeMissions[1].player2Characters.push(simChar(STRONG, { owner: 'player2', instanceId: 'p2-elsewhere' }));

    expect(bonusFor(state, 'player1'), 'the giant stands on the other mission').toBe(0);
    expect(bonusFor(state, 'player2')).toBe(2);
  });

  it('a face-down character counts as zero, so hiding everything means losing', () => {
    const state = terrainBoard();
    state.activeMissions[0].player1Characters.push(simChar(STRONG, { owner: 'player1', instanceId: 'p1-hidden', hidden: true }));
    state.activeMissions[0].player2Characters.push(simChar(WEAK, { owner: 'player2', instanceId: 'p2-visible' }));

    expect(bonusFor(state, 'player1'), 'a hidden giant shows no power').toBe(2);
    expect(bonusFor(state, 'player2')).toBe(0);
  });

  it('both artworks of the mission behave the same', () => {
    const state = terrainBoard('SS-005_2-MMS');
    state.activeMissions[0].player1Characters.push(simChar(STRONG, { owner: 'player1', instanceId: 'p1' }));
    state.activeMissions[0].player2Characters.push(simChar(WEAK, { owner: 'player2', instanceId: 'p2' }));

    expect(bonusFor(state, 'player2')).toBe(2);
  });
});

describe('the designer case: win the mission, then collect the chakra anyway', () => {
  it('power tokens are gone when the chakra is handed out, so the token winner can end up behind', () => {
    const state = terrainBoard();
    state.activeMissions[0].player1Characters.push(
      simChar(WEAK, { owner: 'player1', instanceId: 'p1-token-hero', powerTokens: 9 }),
    );
    state.activeMissions[0].player2Characters.push(
      simChar(STRONG, { owner: 'player2', instanceId: 'p2-printed' }),
    );

    expect(bonusFor(state, 'player1'), 'while the tokens are on, player1 leads').toBe(0);

    const after = nextRound(state);
    expect(after.turn, 'we are in the next round').toBe(3);
    expect(
      after.activeMissions[0].player1Characters.find((c) => c.instanceId === 'p1-token-hero')?.powerTokens,
      'the end of round wiped the tokens',
    ).toBe(0);
    expect(bonusFor(after, 'player1'), 'without its tokens that side is now behind').toBe(2);
  });

  it('a bounced summon leaves its side behind, so the chakra follows', () => {
    const state = terrainBoard();
    state.player1.hand = [];
    state.activeMissions[0].player1Characters.push(
      simChar(SUMMON, { owner: 'player1', instanceId: 'p1-summon' }),
    );
    state.activeMissions[0].player2Characters.push(
      simChar(WEAK, { owner: 'player2', instanceId: 'p2-weak' }),
    );

    expect(bonusFor(state, 'player1'), 'the summon is still on the board').toBe(0);

    const after = nextRound(state);
    expect(
      after.activeMissions[0].player1Characters.some((c) => c.instanceId === 'p1-summon'),
      'the summon went back to hand at the end of the round',
    ).toBe(false);
    expect(bonusFor(after, 'player1'), 'the side that lost its summon is behind now').toBe(2);
  });

  it('the chakra actually lands in the pool at the start of the round', () => {
    const state = terrainBoard();
    state.activeMissions[0].player1Characters.push(simChar(STRONG, { owner: 'player1', instanceId: 'p1-strong' }));
    state.activeMissions[0].player2Characters.push(simChar(WEAK, { owner: 'player2', instanceId: 'p2-weak' }));

    const plain = terrainBoard('KS-001-MMS');
    plain.activeMissions[0].player1Characters.push(simChar(STRONG, { owner: 'player1', instanceId: 'p1-strong' }));
    plain.activeMissions[0].player2Characters.push(simChar(WEAK, { owner: 'player2', instanceId: 'p2-weak' }));

    const withTerrain = nextRound(state);
    const without = nextRound(plain);

    expect(
      chakraOf(withTerrain, 'player2') - chakraOf(without, 'player2'),
      'the losing side really receives two more chakra',
    ).toBe(2);
    expect(
      chakraOf(withTerrain, 'player1') - chakraOf(without, 'player1'),
      'the leading side receives nothing extra',
    ).toBe(0);
  });
});
