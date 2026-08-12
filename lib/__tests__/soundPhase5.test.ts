import { describe, it, expect, beforeAll } from 'vitest';
import { createActionPhaseState, mockCharInPlay, mockMission } from './testHelpers';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { enemiesMovedByOpponent } from '@/lib/effects/handlers/SS/soundMoves';
import { tayuya040Missions, tayuya040Reductions } from '@/lib/effects/handlers/SS/tayuya040';
import type { GameState, CharacterInPlay } from '@/lib/engine/types';

function plateau(missions: number): GameState {
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

function perso(
  instanceId: string,
  nom: string,
  options: { camp?: 'player1' | 'player2'; cache?: boolean; motsCles?: string[]; mission?: number } = {},
): CharacterInPlay {
  const camp = options.camp ?? 'player1';
  return mockCharInPlay(
    { instanceId, controlledBy: camp, originalOwner: camp, isHidden: options.cache, missionIndex: options.mission ?? 0 },
    { name_fr: nom, name_en: nom, power: 3, chakra: 3, keywords: options.motsCles ?? [] },
  );
}

function refus(res: { state: GameState; requiresTargetSelection?: boolean }): boolean {
  const derniere = res.state.log[res.state.log.length - 1];
  return !res.requiresTargetSelection && derniere?.messageKey === 'game.log.effect.noTarget';
}

beforeAll(() => registerAllSetHandlers());

describe('Dosu 125, duel, vaincre un ennemi deplace par l adversaire', () => {
  it('ne retient que les personnages deplaces par L ADVERSAIRE', () => {
    const s = plateau(2);
    s.activeMissions[0].player2Characters = [perso('ennemi', 'E', { camp: 'player2' })];
    s.activeMissions[0].player1Characters = [perso('allie', 'A')];
    s.turnMovedIds = [
      { instanceId: 'ennemi', mover: 'player2' },
      { instanceId: 'allie', mover: 'player1' },
    ];

    expect(enemiesMovedByOpponent(s, 'player1')).toEqual(['ennemi']);
  });

  it('ignore un ennemi que J AI moi-meme deplace', () => {
    const s = plateau(2);
    s.activeMissions[0].player2Characters = [perso('ennemi', 'E', { camp: 'player2' })];
    s.turnMovedIds = [{ instanceId: 'ennemi', mover: 'player1' }];

    expect(enemiesMovedByOpponent(s, 'player1')).toEqual([]);
  });

  it('refuse et journalise quand rien n a bouge', () => {
    const s = plateau(2);
    s.activeMissions[0].player2Characters = [perso('ennemi', 'E', { camp: 'player2' })];
    s.turnMovedIds = [];
    const source = perso('src', 'DOSU KINUTA');

    const res = getEffectHandler('SS-125-R', 'DUEL')!({ state: s, sourcePlayer: 'player1', sourceCard: source, sourceMissionIndex: 0 } as never);
    expect(refus(res)).toBe(true);
  });

  it('la memoire est remise a zero a chaque manche', () => {
    const s = plateau(2);
    expect(s.turnMovedIds ?? []).toEqual([]);
  });
});

describe('Tayuya 040, une reduction propre a chaque mission', () => {
  it('retient sa mission et chaque mission abritant une Tayuya alliee', () => {
    const s = plateau(3);
    const source = perso('src', 'TAYUYA', { motsCles: ['Sound Four'] });
    s.activeMissions[0].player1Characters = [source];
    s.activeMissions[2].player1Characters = [perso('autre', 'TAYUYA', { mission: 2 })];

    expect(tayuya040Missions(s, 'player1', 0, 'src')).toEqual([0, 2]);
  });

  it('ignore une Tayuya ennemie et une Tayuya cachee', () => {
    const s = plateau(3);
    const source = perso('src', 'TAYUYA');
    s.activeMissions[0].player1Characters = [source];
    s.activeMissions[1].player2Characters = [perso('ennemie', 'TAYUYA', { camp: 'player2', mission: 1 })];
    s.activeMissions[2].player1Characters = [perso('cachee', 'TAYUYA', { cache: true, mission: 2 })];

    expect(tayuya040Missions(s, 'player1', 0, 'src')).toEqual([0]);
  });

  it('compte les Quatre du Son mission par mission', () => {
    const s = plateau(3);
    const source = perso('src', 'TAYUYA', { motsCles: ['Sound Four'] });
    s.activeMissions[0].player1Characters = [source, perso('a', 'SAKON', { motsCles: ['Sound Four'] })];
    s.activeMissions[2].player1Characters = [
      perso('t2', 'TAYUYA', { mission: 2 }),
      perso('b', 'JIRÔBÔ', { motsCles: ['Sound Four'], mission: 2 }),
      perso('c', 'KIDÔMARU', { motsCles: ['Sound Four'], mission: 2 }),
    ];

    const table = tayuya040Reductions(s, 'player1', [0, 2]);
    expect(table[0]).toBe(2);
    expect(table[2]).toBe(2);
  });

  it('un Quatre du Son cache ne reduit rien', () => {
    const s = plateau(2);
    s.activeMissions[0].player1Characters = [
      perso('visible', 'SAKON', { motsCles: ['Sound Four'] }),
      perso('cache', 'JIRÔBÔ', { motsCles: ['Sound Four'], cache: true }),
    ];
    expect(tayuya040Reductions(s, 'player1', [0])[0]).toBe(1);
  });

  it('refuse quand aucune Invocation n est jouable', () => {
    const s = plateau(2);
    s.player1.hand = [];
    const source = perso('src', 'TAYUYA');
    s.activeMissions[0].player1Characters = [source];

    const res = getEffectHandler('SS-040-UC', 'UPGRADE')!({ state: s, sourcePlayer: 'player1', sourceCard: source, sourceMissionIndex: 0 } as never);
    expect(refus(res)).toBe(true);
  });
});
