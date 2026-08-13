import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry, getEffectHandler } from '@/lib/effects/EffectRegistry';
import { createActionPhaseState, mockCharInPlay, mockMission } from './testHelpers';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { getCardById } from '@/lib/data/cardIndex';
import { baki050Targets } from '@/lib/effects/handlers/SS/baki050';
import type { GameState, CharacterInPlay, CharacterCard, PlayerID } from '@/lib/engine/types';

const BAKI = 'SS-050-C';
const KANKURO = 'SS-048-C';

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

function baki(instanceId = 'baki', mission = 0): CharacterInPlay {
  return mockCharInPlay(
    { instanceId, controlledBy: 'player1', originalOwner: 'player1', missionIndex: mission },
    getCardById(BAKI) as CharacterCard,
  );
}

function sable(
  instanceId: string,
  camp: PlayerID = 'player1',
  cache = false,
  mission = 0,
  groupe = 'Sand Village',
): CharacterInPlay {
  return mockCharInPlay(
    { instanceId, controlledBy: camp, originalOwner: camp, isHidden: cache, missionIndex: mission },
    { name_fr: 'ALLIE ' + instanceId, name_en: 'ALLY ' + instanceId, power: 2, group: groupe },
  );
}

function lanceScore(state: GameState, source: CharacterInPlay, mission = 0) {
  const handler = getEffectHandler(BAKI, 'SCORE');
  expect(handler).toBeDefined();
  return handler!({
    state,
    sourcePlayer: 'player1',
    sourceCard: source,
    sourceMissionIndex: mission,
    triggerType: 'SCORE',
    isUpgrade: false,
  });
}

describe('Kankuro 048, la commune sans effet', () => {
  it('porte exactement les valeurs imprimees', () => {
    const c = getCardById(KANKURO) as CharacterCard;
    expect(c.name_en).toBe('KANKURO');
    expect(c.name_fr).toBe('KANKURÔ');
    expect(c.title_en).toBe('Full of Surprises');
    expect(c.chakra).toBe(2);
    expect(c.power).toBe(3);
    expect(c.rarity).toBe('C');
    expect(c.group).toBe('Sand Village');
    expect(c.keywords).toContain('Team Baki');
    expect(c.effects ?? []).toHaveLength(0);
  });

  it('a bien son illustration', () => {
    const c = getCardById(KANKURO) as CharacterCard;
    expect(c.has_visual).toBe(true);
    expect(c.image_file).toContain('images/cards/SS/common/SS-048-C.webp');
  });
});

describe('Baki 050, Conspirateur de l Invasion', () => {
  beforeAll(async () => { await initializeRegistry(); });

  it('porte exactement les valeurs imprimees', () => {
    const c = getCardById(BAKI) as CharacterCard;
    expect(c.name_en).toBe('BAKI');
    expect(c.title_en).toBe('Conspirator in the Invasion');
    expect(c.chakra).toBe(3);
    expect(c.power).toBe(3);
    expect(c.rarity).toBe('C');
    expect(c.group).toBe('Sand Village');
    expect(c.keywords).toContain('Team Baki');
    expect(c.effects).toHaveLength(1);
    expect(c.effects[0].type).toBe('SCORE');
    expect(c.effects[0].description).toContain('[↯]');
    expect(c.has_visual).toBe(true);
  });

  it('vise les allies Village du Sable de toutes les missions', () => {
    const s = plateau();
    s.activeMissions[0].player1Characters = [baki(), sable('proche')];
    s.activeMissions[1].player1Characters = [sable('loin', 'player1', false, 1)];
    expect(baki050Targets(s, 'player1', 'baki').sort()).toEqual(['loin', 'proche']);
  });

  it('ne se vise jamais lui-meme, un personnage n est pas son propre allie', () => {
    const s = plateau();
    s.activeMissions[0].player1Characters = [baki()];
    expect(baki050Targets(s, 'player1', 'baki')).toEqual([]);
  });

  it('ignore un ennemi Village du Sable', () => {
    const s = plateau();
    s.activeMissions[0].player1Characters = [baki()];
    s.activeMissions[0].player2Characters = [sable('ennemi', 'player2')];
    expect(baki050Targets(s, 'player1', 'baki')).toEqual([]);
  });

  it('ignore un allie cache, qui n expose aucune faction', () => {
    const s = plateau();
    s.activeMissions[0].player1Characters = [baki(), sable('cache', 'player1', true)];
    expect(baki050Targets(s, 'player1', 'baki')).toEqual([]);
  });

  it('ignore un allie d une autre faction', () => {
    const s = plateau();
    s.activeMissions[0].player1Characters = [baki(), sable('feuille', 'player1', false, 0, 'Leaf Village')];
    expect(baki050Targets(s, 'player1', 'baki')).toEqual([]);
  });

  it('refuse en journal quand aucun allie ne peut etre vise', () => {
    const s = plateau();
    const b = baki();
    s.activeMissions[0].player1Characters = [b];

    const res = lanceScore(s, b);
    expect(res.requiresTargetSelection).toBeFalsy();
    expect(res.state.log[res.state.log.length - 1].messageKey).toBe('game.log.effect.noTarget');
  });

  it('demande d abord une confirmation, sans rien appliquer', () => {
    const s = plateau();
    const b = baki();
    const allie = sable('allie');
    s.activeMissions[0].player1Characters = [b, allie];

    const res = lanceScore(s, b);
    expect(res.targetSelectionType).toBe('SS050_CONFIRM_SCORE');
    expect(res.validTargets).toEqual(['baki']);
    expect(res.isOptional).toBe(true);
    const apres = res.state.activeMissions[0].player1Characters.find((c) => c.instanceId === 'allie');
    expect(apres?.powerTokens).toBe(0);
  });

  it('donne 2 jetons de Puissance a l allie choisi apres confirmation', () => {
    const s = plateau();
    const b = baki();
    s.activeMissions[0].player1Characters = [b, sable('allie')];
    s.activeMissions[1].player1Characters = [sable('autre', 'player1', false, 1)];

    const res = lanceScore(s, b);
    let etat: GameState = {
      ...res.state,
      pendingEffects: [{
        id: 'pe-baki',
        sourceCardId: BAKI,
        sourceInstanceId: 'baki',
        sourceMissionIndex: 0,
        effectType: 'SCORE',
        effectDescription: res.description as string,
        targetSelectionType: 'SS050_CONFIRM_SCORE',
        sourcePlayer: 'player1',
        requiresTargetSelection: true,
        validTargets: ['baki'],
        isOptional: true,
        isMandatory: false,
        resolved: false,
        isUpgrade: false,
      }],
    };

    etat = EffectEngine.applyTargetedEffect(etat, etat.pendingEffects[0], ['baki']);
    const choix = etat.pendingEffects.find((p) => p.targetSelectionType === 'SS050_POWERUP' && !p.resolved);
    expect(choix).toBeDefined();
    expect(choix!.validTargets.sort()).toEqual(['allie', 'autre']);

    etat = EffectEngine.applyTargetedEffect(etat, choix!, ['autre']);
    const cible = etat.activeMissions[1].player1Characters.find((c) => c.instanceId === 'autre');
    const intact = etat.activeMissions[0].player1Characters.find((c) => c.instanceId === 'allie');
    expect(cible?.powerTokens).toBe(2);
    expect(intact?.powerTokens).toBe(0);
    expect(etat.log[etat.log.length - 1].messageKey).toBe('game.log.effect.powerup');
  });
});
