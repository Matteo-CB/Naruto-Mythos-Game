import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getMissionById } from '@/lib/data/cardIndex';
import { calculateCharacterPower } from '@/lib/engine/phases/PowerCalculation';
import type { CharacterInPlay, GameState, MissionCard, PlayerID } from '@/lib/engine/types';

beforeAll(() => { initializeRegistry(); });

const ROI = 'SS-007-MMS';
const ROI_SECONDE_IMPRESSION = 'SS-007_2-MMS';
const SASUKE = 'KS-013-C';
const SHINO = 'KS-032-C';
const AUTRE_MISSION = 'KS-001-MMS';

interface Pose { carte: string; id: string; jetons?: number; cache?: boolean }

function plateau(p1: Pose[], p2: Pose[], missionId = ROI): GameState {
  const vers = (p: Pose, owner: PlayerID) =>
    simChar(p.carte, { owner, instanceId: p.id, powerTokens: p.jetons ?? 0, hidden: p.cache });
  const s = buildSimState({
    p1: p1.map((p) => vers(p, 'player1')),
    p2: p2.map((p) => vers(p, 'player2')),
    missions: 1,
  });
  s.activeMissions[0].card = getMissionById(missionId) as MissionCard;
  s.phase = 'mission';
  return s;
}

function personnage(s: GameState, id: string): { char: CharacterInPlay; cote: PlayerID } {
  for (const cote of ['player1', 'player2'] as const) {
    const trouve = s.activeMissions[0][`${cote}Characters`].find((c) => c.instanceId === id);
    if (trouve) return { char: trouve, cote };
  }
  throw new Error(`personnage absent: ${id}`);
}

function puissance(s: GameState, id: string): number {
  const { char, cote } = personnage(s, id);
  return calculateCharacterPower(s, char, cote);
}

function bonus(s: GameState, id: string): number {
  const sans = plateau([], []);
  void sans;
  const { char, cote } = personnage(s, id);
  const avec = calculateCharacterPower(s, char, cote);
  const hors = plateau(
    s.activeMissions[0].player1Characters.map((c) => ({
      carte: c.stack[c.stack.length - 1].id, id: c.instanceId, jetons: c.powerTokens, cache: c.isHidden,
    })),
    s.activeMissions[0].player2Characters.map((c) => ({
      carte: c.stack[c.stack.length - 1].id, id: c.instanceId, jetons: c.powerTokens, cache: c.isHidden,
    })),
    AUTRE_MISSION,
  );
  const t = personnage(hors, id);
  return avec - calculateCharacterPower(hors, t.char, t.cote);
}

describe('le bonus va au plus fort de la mission, les deux camps confondus', () => {
  it('un allie seul devant le prend', () => {
    const s = plateau([{ carte: SASUKE, id: 'ami', jetons: 2 }], [{ carte: SASUKE, id: 'ennemi' }]);
    expect(bonus(s, 'ami'), 'imprime 4 et 2 jetons contre 4').toBe(3);
    expect(bonus(s, 'ennemi')).toBe(0);
  });

  it('un ennemi seul devant le prend aussi', () => {
    const s = plateau([{ carte: SASUKE, id: 'ami' }], [{ carte: SASUKE, id: 'ennemi', jetons: 2 }]);
    expect(bonus(s, 'ennemi'), 'le plus fort de la mission, pas le plus fort de son camp').toBe(3);
    expect(bonus(s, 'ami')).toBe(0);
  });

  it('une egalite entre les deux camps ne donne rien a personne', () => {
    const s = plateau([{ carte: SASUKE, id: 'ami' }], [{ carte: SASUKE, id: 'ennemi' }]);
    expect(bonus(s, 'ami')).toBe(0);
    expect(bonus(s, 'ennemi')).toBe(0);
  });

  it('une egalite dans le meme camp ne donne rien non plus', () => {
    const s = plateau(
      [{ carte: SASUKE, id: 'amiA', jetons: 3 }, { carte: SHINO, id: 'amiB', jetons: 4 }],
      [{ carte: SASUKE, id: 'ennemi' }],
    );
    expect(puissance(s, 'amiA'), 'imprime 4, 3 jetons, moins 1 par allie').toBe(6);
    expect(puissance(s, 'amiB'), 'imprime 3, 4 jetons, seul devant donc plus 3').toBe(10);
    expect(puissance(s, 'ennemi'), 'imprime 4, seul de son camp').toBe(4);
    const egalite = plateau(
      [{ carte: SASUKE, id: 'amiA', jetons: 4 }, { carte: SHINO, id: 'amiB', jetons: 4 }],
      [{ carte: SASUKE, id: 'ennemi' }],
    );
    expect(bonus(egalite, 'amiA'), 'les deux sont a 7').toBe(0);
    expect(bonus(egalite, 'amiB')).toBe(0);
  });

  it('la seconde impression de la mission se comporte pareil', () => {
    const s = plateau([{ carte: SASUKE, id: 'ami', jetons: 2 }], [{ carte: SASUKE, id: 'ennemi' }],
      ROI_SECONDE_IMPRESSION);
    expect(bonus(s, 'ami')).toBe(3);
  });

  it('sans la mission, aucun bonus nulle part', () => {
    const s = plateau([{ carte: SASUKE, id: 'ami', jetons: 2 }], [{ carte: SASUKE, id: 'ennemi' }],
      AUTRE_MISSION);
    expect(puissance(s, 'ami'), 'imprime 4 et 2 jetons, rien de plus').toBe(6);
  });
});

describe('c est la puissance affichee qui departage, pas la puissance de base', () => {
  it('une aura qui abaisse un personnage brise l egalite de base', () => {
    const s = plateau([{ carte: SASUKE, id: 'sasuke' }, { carte: SHINO, id: 'shino', jetons: 1 }], []);
    expect(
      puissance(s, 'sasuke'),
      'imprime 4 moins 1 par autre allie visible: le plateau affiche 3',
    ).toBe(3);
    expect(
      bonus(s, 'shino'),
      'les deux ont 4 en puissance de base, mais le plateau affiche 3 et 4: '
      + 'le 4 est seul le plus fort et prend le bonus',
    ).toBe(3);
    expect(bonus(s, 'sasuke')).toBe(0);
  });

  it('une aura qui cree une egalite affichee annule le bonus', () => {
    const s = plateau([{ carte: SASUKE, id: 'sasuke', jetons: 1 }, { carte: SHINO, id: 'shino', jetons: 1 }], []);
    expect(
      bonus(s, 'sasuke'),
      'base 5 contre 4, mais le plateau affiche 4 et 4: personne ne prend le bonus',
    ).toBe(0);
    expect(bonus(s, 'shino')).toBe(0);
  });

  it('le bonus lui meme n entre jamais dans la comparaison', () => {
    const s = plateau([{ carte: SHINO, id: 'ami', jetons: 1 }], [{ carte: SHINO, id: 'ennemi' }]);
    expect(puissance(s, 'ami'), '3 imprimes, 1 jeton, plus 3').toBe(7);
    expect(
      puissance(s, 'ennemi'),
      'sinon le premier gagnant deviendrait le plus fort a chaque tour de calcul',
    ).toBe(3);
  });
});

describe('les personnages face cachee comptent comme les autres', () => {
  it('un ennemi cache et seul devant prend le bonus', () => {
    const s = plateau([{ carte: SHINO, id: 'ami' }], [{ carte: SASUKE, id: 'cache', jetons: 9, cache: true }]);
    expect(puissance(s, 'cache'), '0 imprime pour une carte cachee, 9 jetons, plus 3').toBe(12);
    expect(bonus(s, 'ami'), 'il n est pas le plus fort de la mission').toBe(0);
  });

  it('un cache plus fort empeche un visible plus faible de le prendre', () => {
    const s = plateau([{ carte: SHINO, id: 'ami' }], [{ carte: SASUKE, id: 'cache', jetons: 9, cache: true }]);
    expect(puissance(s, 'ami'), '3 imprimes, rien de plus').toBe(3);
  });

  it('un cache a la meme puissance qu un visible annule le bonus des deux', () => {
    const s = plateau([{ carte: SHINO, id: 'ami' }], [{ carte: SASUKE, id: 'cache', jetons: 3, cache: true }]);
    expect(puissance(s, 'ami'), '3 contre 3').toBe(3);
    expect(puissance(s, 'cache')).toBe(3);
  });

  it('deux caches a egalite au sommet annulent le bonus', () => {
    const s = plateau(
      [{ carte: SHINO, id: 'cacheA', jetons: 5, cache: true }],
      [{ carte: SASUKE, id: 'cacheB', jetons: 5, cache: true }],
    );
    expect(bonus(s, 'cacheA')).toBe(0);
    expect(bonus(s, 'cacheB')).toBe(0);
  });
});

describe('le bonus ne s applique qu au moment de l evaluation des missions', () => {
  it('rien pendant la phase d action', () => {
    const s = plateau([{ carte: SASUKE, id: 'ami', jetons: 2 }], [{ carte: SASUKE, id: 'ennemi' }]);
    s.phase = 'action';
    expect(
      puissance(s, 'ami'),
      'la carte dit "avant de determiner la Puissance lors de la phase d evaluation"',
    ).toBe(6);
  });
});
