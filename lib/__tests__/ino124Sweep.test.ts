import { describe, it, expect, beforeAll } from 'vitest';
import { createActionPhaseState, mockCharInPlay, mockMission } from './testHelpers';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import type { GameState, CharacterInPlay } from '@/lib/engine/types';

const INO = 'SS-124-SHINOBIV';

const inoEffects = [
  { type: 'DUEL' as const, description: "[↯] DUEL Sakura Haruno: Take control of an enemy character of Power lower than the Sakura Haruno's Power." },
  { type: 'UPGRADE' as const, description: '[↯] Move a controlled character from this mission.' },
];

function board(missions: number): GameState {
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

function ino(instanceId: string): CharacterInPlay {
  return mockCharInPlay(
    { instanceId, controlledBy: 'player1', originalOwner: 'player1' },
    { id: INO, set: 'SS', number: 124, name_fr: 'INO YAMANAKA', name_en: 'INO YAMANAKA', chakra: 6, power: 2, effects: inoEffects },
  );
}

function sakura(instanceId: string, power: number, camp: 'player1' | 'player2' = 'player1'): CharacterInPlay {
  return mockCharInPlay(
    { instanceId, controlledBy: camp, originalOwner: camp },
    { name_fr: 'SAKURA HARUNO', name_en: 'SAKURA HARUNO', power },
  );
}

function ennemi(instanceId: string, power: number, nom = 'ENNEMI', cache = false): CharacterInPlay {
  return mockCharInPlay(
    { instanceId, controlledBy: 'player2', originalOwner: 'player2', isHidden: cache },
    { name_fr: nom, name_en: nom, power },
  );
}

function joueDuel(s: GameState, source: CharacterInPlay, missionIndex: number) {
  const handler = getEffectHandler(INO, 'DUEL')!;
  return handler({ state: s, sourcePlayer: 'player1', sourceCard: source, sourceMissionIndex: missionIndex } as never);
}

function joueUpgrade(s: GameState, source: CharacterInPlay, missionIndex: number) {
  const handler = getEffectHandler(INO, 'UPGRADE')!;
  return handler({ state: s, sourcePlayer: 'player1', sourceCard: source, sourceMissionIndex: missionIndex } as never);
}

function refus(res: { state: GameState; requiresTargetSelection?: boolean }): boolean {
  const derniere = res.state.log[res.state.log.length - 1];
  return !res.requiresTargetSelection && derniere?.messageKey === 'game.log.effect.noTarget';
}

function ciblesReelles(res: { description?: unknown }): string[] {
  if (typeof res.description !== 'string') return [];
  try {
    return (JSON.parse(res.description) as { targets?: string[] }).targets ?? [];
  } catch {
    return [];
  }
}

beforeAll(() => registerAllSetHandlers());

describe('Ino 124, balayage complet du DUEL', () => {
  it('ne propose rien et journalise le refus quand aucun Sakura Haruno n est dans la mission', () => {
    const s = board(2);
    const source = ino('ino');
    s.activeMissions[0].player1Characters = [source];
    s.activeMissions[0].player2Characters = [ennemi('e1', 1)];
    s.activeMissions[1].player1Characters = [sakura('sk', 9)];

    const res = joueDuel(s, source, 0);
    expect(res.requiresTargetSelection).toBeFalsy();
    expect(refus(res)).toBe(true);
  });

  it('cible les ennemis de TOUTES les missions, pas seulement celle de la source', () => {
    const s = board(3);
    const source = ino('ino');
    s.activeMissions[0].player1Characters = [source, sakura('sk', 5)];
    s.activeMissions[1].player2Characters = [ennemi('lointain', 2)];
    s.activeMissions[2].player2Characters = [ennemi('tres-loin', 1)];

    const res = joueDuel(s, source, 0);
    expect(res.requiresTargetSelection).toBe(true);
    expect(ciblesReelles(res)).toContain('lointain');
    expect(ciblesReelles(res)).toContain('tres-loin');
  });

  it('exclut un ennemi de puissance egale, la comparaison est stricte', () => {
    const s = board(2);
    const source = ino('ino');
    s.activeMissions[0].player1Characters = [source, sakura('sk', 4)];
    s.activeMissions[0].player2Characters = [ennemi('egal', 4), ennemi('inferieur', 3)];

    const res = joueDuel(s, source, 0);
    expect(ciblesReelles(res)).not.toContain('egal');
    expect(ciblesReelles(res)).toContain('inferieur');
  });

  it('accepte un ennemi cache, qui vaut 0 de puissance meme si sa carte est forte', () => {
    const s = board(2);
    const source = ino('ino');
    s.activeMissions[0].player1Characters = [source, sakura('sk', 1)];
    s.activeMissions[0].player2Characters = [ennemi('cache', 9, 'MONSTRE', true)];

    const res = joueDuel(s, source, 0);
    expect(res.requiresTargetSelection).toBe(true);
    expect(ciblesReelles(res)).toContain('cache');
  });

  it('garde un ennemi homonyme d un allie comme cible legale', () => {
    const s = board(2);
    const source = ino('ino');
    s.activeMissions[0].player1Characters = [
      source,
      sakura('sk', 6),
      mockCharInPlay({ instanceId: 'allie', controlledBy: 'player1', originalOwner: 'player1' }, { name_fr: 'CHOJI', name_en: 'CHOJI', power: 1 }),
    ];
    s.activeMissions[0].player2Characters = [ennemi('homonyme', 2, 'CHOJI')];

    const res = joueDuel(s, source, 0);
    expect(ciblesReelles(res)).toContain('homonyme');
  });

  it('journalise un refus quand aucun ennemi ne passe sous le seuil', () => {
    const s = board(2);
    const source = ino('ino');
    s.activeMissions[0].player1Characters = [source, sakura('sk', 2)];
    s.activeMissions[0].player2Characters = [ennemi('costaud', 8)];

    const res = joueDuel(s, source, 0);
    expect(refus(res)).toBe(true);
  });

  it('prend le Sakura le plus fort comme reference quand plusieurs sont presents', () => {
    const s = board(2);
    const source = ino('ino');
    s.activeMissions[0].player1Characters = [source, sakura('faible', 2)];
    s.activeMissions[0].player2Characters = [sakura('fort', 7, 'player2'), ennemi('milieu', 5)];

    const res = joueDuel(s, source, 0);
    expect(ciblesReelles(res)).toContain('milieu');
  });

  it('reste optionnel, le joueur peut renoncer', () => {
    const s = board(2);
    const source = ino('ino');
    s.activeMissions[0].player1Characters = [source, sakura('sk', 5)];
    s.activeMissions[0].player2Characters = [ennemi('e1', 1)];

    const res = joueDuel(s, source, 0);
    expect(res.isOptional).toBe(true);
  });

  it('ne mute pas l etat quand il demande une selection', () => {
    const s = board(2);
    const source = ino('ino');
    s.activeMissions[0].player1Characters = [source, sakura('sk', 5)];
    s.activeMissions[0].player2Characters = [ennemi('e1', 1)];
    const avant = JSON.stringify(s.activeMissions);

    joueDuel(s, source, 0);
    expect(JSON.stringify(s.activeMissions)).toBe(avant);
  });
});

describe('Ino 124, balayage complet de l UPGRADE', () => {
  function controle(instanceId: string, nom = 'VOLE'): CharacterInPlay {
    return mockCharInPlay(
      { instanceId, controlledBy: 'player1', originalOwner: 'player2' },
      { name_fr: nom, name_en: nom, power: 3 },
    );
  }

  it('refuse quand aucun personnage controle n est dans la mission', () => {
    const s = board(2);
    const source = ino('ino');
    s.activeMissions[0].player1Characters = [source];
    s.activeMissions[1].player1Characters = [controle('ailleurs')];

    const res = joueUpgrade(s, source, 0);
    expect(refus(res)).toBe(true);
  });

  it('propose le personnage controle present dans la mission', () => {
    const s = board(2);
    const source = ino('ino');
    s.activeMissions[0].player1Characters = [source, controle('vole')];

    const res = joueUpgrade(s, source, 0);
    expect(res.requiresTargetSelection).toBe(true);
    expect(ciblesReelles(res)).toContain('vole');
  });

  it('ignore un personnage allie que je possede vraiment', () => {
    const s = board(2);
    const source = ino('ino');
    const possede = mockCharInPlay({ instanceId: 'amien', controlledBy: 'player1', originalOwner: 'player1' }, { name_fr: 'AMI', power: 3 });
    s.activeMissions[0].player1Characters = [source, possede];

    const res = joueUpgrade(s, source, 0);
    expect(refus(res)).toBe(true);
  });

  it('refuse quand une seule mission est en jeu, il n y a nulle part ou aller', () => {
    const s = board(1);
    const source = ino('ino');
    s.activeMissions[0].player1Characters = [source, controle('vole')];

    const res = joueUpgrade(s, source, 0);
    expect(refus(res)).toBe(true);
  });

  it('refuse quand la seule destination creerait un doublon de nom de mon cote', () => {
    const s = board(2);
    const source = ino('ino');
    s.activeMissions[0].player1Characters = [source, controle('vole', 'KIBA')];
    s.activeMissions[1].player1Characters = [
      mockCharInPlay({ instanceId: 'deja', controlledBy: 'player1', originalOwner: 'player1' }, { name_fr: 'KIBA', name_en: 'KIBA', power: 2 }),
    ];

    const res = joueUpgrade(s, source, 0);
    expect(refus(res)).toBe(true);
  });

  it('propose plusieurs personnages controles quand il y en a plusieurs', () => {
    const s = board(2);
    const source = ino('ino');
    s.activeMissions[0].player1Characters = [source, controle('un', 'PREMIER'), controle('deux', 'SECOND')];

    const res = joueUpgrade(s, source, 0);
    expect(ciblesReelles(res)).toEqual(expect.arrayContaining(['un', 'deux']));
  });

  it('reste optionnel et ne mute pas l etat', () => {
    const s = board(2);
    const source = ino('ino');
    s.activeMissions[0].player1Characters = [source, controle('vole')];
    const avant = JSON.stringify(s.activeMissions);

    const res = joueUpgrade(s, source, 0);
    expect(res.isOptional).toBe(true);
    expect(JSON.stringify(s.activeMissions)).toBe(avant);
  });
});
