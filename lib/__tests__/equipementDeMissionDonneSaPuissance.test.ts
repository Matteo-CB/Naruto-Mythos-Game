import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { attachCardToMission } from '@/lib/effects/attachments';
import { puissanceDesEquipementsDeMission } from '@/lib/effects/missions/ssMissions';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData, GameState } from '@/lib/engine/types';

void EffectEngine;

const LABORATOIRE = 'SS-105-UC';
const VILLAGE = 'SS-110-UC';
const PERSO = 'KS-011-C';

function plateau(): GameState {
  const s = buildSimState({
    p1: [simChar(PERSO, { owner: 'player1', instanceId: 'allie' })],
    p2: [simChar(PERSO, { owner: 'player2', instanceId: 'ennemi' })],
    missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  s.phase = 'action';
  return s;
}

function bonusVu(state: GameState, camp: 'player1' | 'player2'): number {
  const vue = GameEngine.getVisibleState(state, camp);
  const mission = vue.activeMissions[0];
  return camp === 'player1' ? (mission.player1PowerBonus ?? 0) : (mission.player2PowerBonus ?? 0);
}

describe('un equipement de mission apporte sa puissance a son camp', () => {
  it('sans equipement, aucun bonus', () => {
    expect(puissanceDesEquipementsDeMission(plateau().activeMissions[0], 'player1')).toBe(0);
  });

  it('le laboratoire vaut 2 puissance pour celui qui le pose', () => {
    const avec = attachCardToMission(plateau(), 'player1', getCardById(LABORATOIRE) as CardData, 0);
    expect(puissanceDesEquipementsDeMission(avec.activeMissions[0], 'player1'), 'deux puissance').toBe(2);
    expect(puissanceDesEquipementsDeMission(avec.activeMissions[0], 'player2'), 'rien pour l adversaire').toBe(0);
  });

  it('la puissance apparait bien dans le total montre au joueur', () => {
    const avec = attachCardToMission(plateau(), 'player1', getCardById(VILLAGE) as CardData, 0);
    expect(bonusVu(avec, 'player1'), 'le client recoit le bonus').toBe(1);
    expect(bonusVu(avec, 'player2'), 'et pas l adversaire').toBe(0);
  });

  it('deux equipements du meme camp s additionnent', () => {
    let s = attachCardToMission(plateau(), 'player1', getCardById(LABORATOIRE) as CardData, 0);
    s = attachCardToMission(s, 'player2', getCardById(VILLAGE) as CardData, 0);
    expect(puissanceDesEquipementsDeMission(s.activeMissions[0], 'player1')).toBe(2);
    expect(puissanceDesEquipementsDeMission(s.activeMissions[0], 'player2')).toBe(1);
  });
});
