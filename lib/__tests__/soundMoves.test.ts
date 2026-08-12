import { describe, it, expect, beforeAll } from 'vitest';
import { createActionPhaseState, mockCharInPlay, mockMission } from './testHelpers';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import type { GameState, CharacterInPlay } from '@/lib/engine/types';

const KIDOMARU = 'SS-034-C';
const DOSU = 'SS-125-R';

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

function allie(instanceId: string, nom: string, missionIndex = 0, cache = false): CharacterInPlay {
  return mockCharInPlay(
    { instanceId, controlledBy: 'player1', originalOwner: 'player1', isHidden: cache, missionIndex },
    { name_fr: nom, name_en: nom, power: 3 },
  );
}

function joue(id: string, type: 'FIRST_STRIKE' | 'UPGRADE', s: GameState, source: CharacterInPlay, mi: number) {
  const handler = getEffectHandler(id, type)!;
  return handler({ state: s, sourcePlayer: 'player1', sourceCard: source, sourceMissionIndex: mi } as never);
}

function cibles(res: { description?: unknown }): string[] {
  if (typeof res.description !== 'string') return [];
  try {
    return (JSON.parse(res.description) as { targets?: string[] }).targets ?? [];
  } catch {
    return [];
  }
}

function refus(res: { state: GameState; requiresTargetSelection?: boolean }): boolean {
  const derniere = res.state.log[res.state.log.length - 1];
  return !res.requiresTargetSelection && derniere?.messageKey === 'game.log.effect.noTarget';
}

beforeAll(() => registerAllSetHandlers());

describe('Kidomaru 034, premiere frappe, deplace un personnage allie', () => {
  it('propose tous les allies, caches compris, de toutes les missions', () => {
    const s = plateau(2);
    const source = allie('src', 'KIDÔMARU');
    s.activeMissions[0].player1Characters = [source, allie('a', 'SAKON')];
    s.activeMissions[1].player1Characters = [allie('b', 'TAYUYA', 1), allie('c', 'JIRÔBÔ', 1, true)];

    const res = joue(KIDOMARU, 'FIRST_STRIKE', s, source, 0);
    expect(res.requiresTargetSelection).toBe(true);
    expect(cibles(res)).toEqual(expect.arrayContaining(['a', 'b', 'c', 'src']));
  });

  it('ignore les personnages ennemis', () => {
    const s = plateau(2);
    const source = allie('src', 'KIDÔMARU');
    s.activeMissions[0].player1Characters = [source];
    s.activeMissions[0].player2Characters = [
      mockCharInPlay({ instanceId: 'e', controlledBy: 'player2', originalOwner: 'player2' }, { name_fr: 'ENNEMI', power: 3 }),
    ];

    const res = joue(KIDOMARU, 'FIRST_STRIKE', s, source, 0);
    expect(cibles(res)).not.toContain('e');
  });

  it('ecarte un allie dont le seul deplacement creerait un doublon de nom', () => {
    const s = plateau(2);
    const source = allie('src', 'KIDÔMARU');
    s.activeMissions[0].player1Characters = [source, allie('bloque', 'SAKON')];
    s.activeMissions[1].player1Characters = [allie('deja', 'SAKON', 1)];

    const res = joue(KIDOMARU, 'FIRST_STRIKE', s, source, 0);
    expect(cibles(res)).not.toContain('bloque');
  });

  it('refuse et journalise quand une seule mission est en jeu', () => {
    const s = plateau(1);
    const source = allie('src', 'KIDÔMARU');
    s.activeMissions[0].player1Characters = [source, allie('a', 'SAKON')];

    const res = joue(KIDOMARU, 'FIRST_STRIKE', s, source, 0);
    expect(refus(res)).toBe(true);
  });

  it('reste optionnel et ne mute pas l etat', () => {
    const s = plateau(2);
    const source = allie('src', 'KIDÔMARU');
    s.activeMissions[0].player1Characters = [source];
    const avant = JSON.stringify(s.activeMissions);

    const res = joue(KIDOMARU, 'FIRST_STRIKE', s, source, 0);
    expect(res.isOptional).toBe(true);
    expect(JSON.stringify(s.activeMissions)).toBe(avant);
  });
});

describe('Dosu 125, evolution, deplace un personnage allie CACHE', () => {
  it('ne propose que des personnages caches', () => {
    const s = plateau(2);
    const source = allie('src', 'DOSU KINUTA');
    s.activeMissions[0].player1Characters = [source, allie('visible', 'SAKON'), allie('cache', 'TAYUYA', 0, true)];

    const res = joue(DOSU, 'UPGRADE', s, source, 0);
    expect(res.requiresTargetSelection).toBe(true);
    expect(cibles(res)).toContain('cache');
    expect(cibles(res)).not.toContain('visible');
  });

  it('refuse quand aucun allie cache n est deplacable', () => {
    const s = plateau(2);
    const source = allie('src', 'DOSU KINUTA');
    s.activeMissions[0].player1Characters = [source, allie('visible', 'SAKON')];

    const res = joue(DOSU, 'UPGRADE', s, source, 0);
    expect(refus(res)).toBe(true);
  });

  it('ignore un personnage cache ennemi', () => {
    const s = plateau(2);
    const source = allie('src', 'DOSU KINUTA');
    s.activeMissions[0].player1Characters = [source];
    s.activeMissions[0].player2Characters = [
      mockCharInPlay({ instanceId: 'ec', controlledBy: 'player2', originalOwner: 'player2', isHidden: true }, { name_fr: 'ENNEMI', power: 3 }),
    ];

    const res = joue(DOSU, 'UPGRADE', s, source, 0);
    expect(refus(res)).toBe(true);
  });
});
