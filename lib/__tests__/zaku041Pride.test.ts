import { describe, it, expect } from 'vitest';
import { createActionPhaseState, mockCharInPlay, mockMission } from './testHelpers';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { getCardById } from '@/lib/data/cardIndex';
import type { GameState, CharacterCard, CharacterInPlay } from '@/lib/engine/types';

const ZAKU = 'SS-041-UC';

function plateau(missions = 2): GameState {
  const s = createActionPhaseState();
  s.activeMissions = Array.from({ length: missions }, (_, i) => ({
    card: mockMission({ basePoints: 3 + i }),
    rank: 'D' as const,
    basePoints: 3 + i,
    rankBonus: 1,
    player1Characters: [] as CharacterInPlay[],
    player2Characters: [] as CharacterInPlay[],
    wonBy: null,
  }));
  return s;
}

function zaku(instanceId = 'zaku', cache = false, mission = 0): CharacterInPlay {
  return mockCharInPlay(
    { instanceId, controlledBy: 'player1', originalOwner: 'player1', isHidden: cache, missionIndex: mission },
    { id: ZAKU, name_fr: 'ZAKU ABUMI', name_en: 'ZAKU ABUMI', chakra: 2, power: 3, keywords: ['Team Dosu'] },
  );
}

function coequipier(instanceId: string, camp: 'player1' | 'player2' = 'player1', cache = false, mission = 0): CharacterInPlay {
  return mockCharInPlay(
    { instanceId, controlledBy: camp, originalOwner: camp, isHidden: cache, missionIndex: mission },
    { name_fr: 'DOSU KINUTA', name_en: 'DOSU KINUTA', power: 3, keywords: ['Team Dosu'] },
  );
}

describe('Zaku Abumi 041, la fierte du Village du Son', () => {
  it('porte les valeurs imprimees', () => {
    const c = getCardById(ZAKU) as CharacterCard;
    expect(c.chakra).toBe(2);
    expect(c.power).toBe(3);
    expect(c.rarity).toBe('UC');
    expect(c.keywords).toContain('Team Dosu');
  });

  it('vaut sa puissance imprimee quand il est seul', () => {
    const s = plateau();
    const z = zaku();
    s.activeMissions[0].player1Characters = [z];
    expect(getEffectivePower(s, z, 'player1')).toBe(3);
  });

  it('gagne 1 quand un Equipe Dosu allie est dans SA mission', () => {
    const s = plateau();
    const z = zaku();
    s.activeMissions[0].player1Characters = [z, coequipier('ami')];
    expect(getEffectivePower(s, z, 'player1')).toBe(4);
  });

  it('ne se compte pas lui-meme', () => {
    const s = plateau();
    const z = zaku();
    s.activeMissions[0].player1Characters = [z];
    expect(getEffectivePower(s, z, 'player1')).toBe(3);
  });

  it('ignore un Equipe Dosu d une autre mission', () => {
    const s = plateau();
    const z = zaku();
    s.activeMissions[0].player1Characters = [z];
    s.activeMissions[1].player1Characters = [coequipier('loin', 'player1', false, 1)];
    expect(getEffectivePower(s, z, 'player1')).toBe(3);
  });

  it('ignore un Equipe Dosu ennemi', () => {
    const s = plateau();
    const z = zaku();
    s.activeMissions[0].player1Characters = [z];
    s.activeMissions[0].player2Characters = [coequipier('ennemi', 'player2')];
    expect(getEffectivePower(s, z, 'player1')).toBe(3);
  });

  it('ignore un Equipe Dosu allie cache, qui n expose aucun mot-cle', () => {
    const s = plateau();
    const z = zaku();
    s.activeMissions[0].player1Characters = [z, coequipier('cache', 'player1', true)];
    expect(getEffectivePower(s, z, 'player1')).toBe(3);
  });

  it('vaut 0 quand il est lui-meme cache, aura comprise', () => {
    const s = plateau();
    const z = zaku('zaku', true);
    s.activeMissions[0].player1Characters = [z, coequipier('ami')];
    expect(getEffectivePower(s, z, 'player1')).toBe(0);
  });

  it('cumule avec ses jetons de puissance', () => {
    const s = plateau();
    const z = { ...zaku(), powerTokens: 2 };
    s.activeMissions[0].player1Characters = [z, coequipier('ami')];
    expect(getEffectivePower(s, z, 'player1')).toBe(6);
  });
});
