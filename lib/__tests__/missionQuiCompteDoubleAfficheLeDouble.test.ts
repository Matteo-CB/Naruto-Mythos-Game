import { describe, it, expect } from 'vitest';
import { missionCompteDouble, pointsAffichesDeLaMission } from '@/lib/effects/missions/ssMissions';
import { buildSimState } from '@/lib/cards/sim/buildState';
import type { ActiveMission, GameState } from '@/lib/engine/types';

const PRIORITE_HAUTE = 'SS-004-MMS';
const AUTRE = 'SS-005-MMS';

function mission(state: GameState, index: number): ActiveMission {
  return state.activeMissions[index];
}

function plateau(): GameState {
  const s = buildSimState({ missions: 2, missionIds: [PRIORITE_HAUTE, AUTRE], chakra1: 20 });
  s.phase = 'action';
  return s;
}

describe('une mission qui compte double affiche son score double', () => {
  it('la mission Priorite Haute est reconnue comme comptant double', () => {
    const s = plateau();
    expect(missionCompteDouble(mission(s, 0)), 'son texte dit de la scorer deux fois').toBe(true);
    expect(missionCompteDouble(mission(s, 1)), 'une mission normale ne compte pas double').toBe(false);
  });

  it('son total affiche est bien le double', () => {
    const s = plateau();
    const m = mission(s, 0);
    const normal = m.basePoints + m.rankBonus;
    expect(pointsAffichesDeLaMission(m), 'le joueur voit ce qu il gagnera vraiment').toBe(normal * 2);
  });

  it('une mission normale affiche son total habituel', () => {
    const s = plateau();
    const m = mission(s, 1);
    expect(pointsAffichesDeLaMission(m)).toBe(m.basePoints + m.rankBonus);
  });

  it('un bonus d equipement est double lui aussi', () => {
    const s = plateau();
    const m = mission(s, 0);
    const normal = m.basePoints + m.rankBonus;
    expect(pointsAffichesDeLaMission(m, 1), 'le point supplementaire compte deux fois').toBe((normal + 1) * 2);
  });

  it('la reconnaissance se fait sur le texte, pas sur un numero', () => {
    const fausse = {
      basePoints: 3, rankBonus: 1,
      card: { effects: [{ type: 'MAIN', description: '[⧗] Score this mission twice, if any.' }] },
    } as unknown as ActiveMission;
    expect(missionCompteDouble(fausse), 'une future mission au texte equivalent sera reconnue').toBe(true);
    expect(pointsAffichesDeLaMission(fausse)).toBe(8);
  });
});
