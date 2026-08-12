import { describe, it, expect, beforeAll } from 'vitest';
import { createActionPhaseState, mockCharInPlay, mockMission } from './testHelpers';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { weakestVisibleIn } from '@/lib/effects/handlers/SS/snakeSword101';
import { soundFourInHand, enemiesUnderCost } from '@/lib/effects/handlers/SS/sakon037';
import { friendlySoundFourIn, movableUnderCost } from '@/lib/effects/handlers/SS/kidomaru035';
import { getCardById } from '@/lib/data/cardIndex';
import type { GameState, CharacterCard, CharacterInPlay } from '@/lib/engine/types';

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
  options: { camp?: 'player1' | 'player2'; puissance?: number; cout?: number; cache?: boolean; motsCles?: string[]; mission?: number } = {},
): CharacterInPlay {
  const camp = options.camp ?? 'player1';
  return mockCharInPlay(
    { instanceId, controlledBy: camp, originalOwner: camp, isHidden: options.cache, missionIndex: options.mission ?? 0 },
    { name_fr: nom, name_en: nom, power: options.puissance ?? 3, chakra: options.cout ?? 3, keywords: options.motsCles ?? [] },
  );
}

function refus(res: { state: GameState; requiresTargetSelection?: boolean }): boolean {
  const derniere = res.state.log[res.state.log.length - 1];
  return !res.requiresTargetSelection && derniere?.messageKey === 'game.log.effect.noTarget';
}

beforeAll(() => registerAllSetHandlers());

describe('Epee Serpent 101, tous les plus faibles', () => {
  it('rend TOUS les ex aequo, pas un seul', () => {
    const s = plateau(1);
    s.activeMissions[0].player1Characters = [perso('a', 'A', { puissance: 2 }), perso('b', 'B', { puissance: 5 })];
    s.activeMissions[0].player2Characters = [perso('c', 'C', { camp: 'player2', puissance: 2 })];

    const faibles = weakestVisibleIn(s, 0).map((c) => c.instanceId);
    expect(faibles).toEqual(expect.arrayContaining(['a', 'c']));
    expect(faibles).not.toContain('b');
  });

  it('frappe les deux camps, allies compris', () => {
    const s = plateau(1);
    s.activeMissions[0].player1Characters = [perso('allie', 'A', { puissance: 1 })];
    s.activeMissions[0].player2Characters = [perso('ennemi', 'E', { camp: 'player2', puissance: 4 })];
    expect(weakestVisibleIn(s, 0).map((c) => c.instanceId)).toEqual(['allie']);
  });

  it('ignore les personnages caches', () => {
    const s = plateau(1);
    s.activeMissions[0].player1Characters = [perso('visible', 'V', { puissance: 6 }), perso('cache', 'C', { puissance: 1, cache: true })];
    expect(weakestVisibleIn(s, 0).map((c) => c.instanceId)).toEqual(['visible']);
  });

  it('ne rend rien si la mission ne contient que des caches', () => {
    const s = plateau(1);
    s.activeMissions[0].player1Characters = [perso('cache', 'C', { cache: true })];
    expect(weakestVisibleIn(s, 0)).toEqual([]);
  });
});

describe('Sakon 037, le seuil depend du nombre revele', () => {
  it('ne compte que les Quatre du Son de la main', () => {
    const s = plateau(1);
    s.player1.hand = [
      getCardById('SS-032-C') as CharacterCard,
      getCardById('SS-042-UC') as CharacterCard,
      getCardById('SS-034-C') as CharacterCard,
    ];
    expect(soundFourInHand(s, 'player1')).toEqual(['0', '2']);
  });

  it('le seuil est strict et un ennemi cache vaut 0', () => {
    const s = plateau(1);
    s.activeMissions[0].player2Characters = [
      perso('cout1', 'X', { camp: 'player2', cout: 1 }),
      perso('cout2', 'Y', { camp: 'player2', cout: 2 }),
      perso('cache', 'Z', { camp: 'player2', cout: 9, cache: true }),
    ];
    const sous2 = enemiesUnderCost(s, 'player1', 2);
    expect(sous2).toEqual(expect.arrayContaining(['cout1', 'cache']));
    expect(sous2).not.toContain('cout2');
  });

  it('refuse quand la main ne contient aucun Quatre du Son', () => {
    const s = plateau(2);
    s.player1.hand = [getCardById('SS-042-UC') as CharacterCard];
    s.activeMissions[0].player2Characters = [perso('e', 'E', { camp: 'player2', cout: 0 })];
    const source = perso('src', 'SAKON');
    const res = getEffectHandler('SS-037-UC', 'UPGRADE')!({ state: s, sourcePlayer: 'player1', sourceCard: source, sourceMissionIndex: 0 } as never);
    expect(refus(res)).toBe(true);
  });

  it('refuse quand meme tout reveler ne suffirait pas', () => {
    const s = plateau(2);
    s.player1.hand = [getCardById('SS-032-C') as CharacterCard];
    s.activeMissions[0].player2Characters = [perso('costaud', 'E', { camp: 'player2', cout: 8 })];
    const source = perso('src', 'SAKON');
    const res = getEffectHandler('SS-037-UC', 'UPGRADE')!({ state: s, sourcePlayer: 'player1', sourceCard: source, sourceMissionIndex: 0 } as never);
    expect(refus(res)).toBe(true);
  });
});

describe('Kidomaru 035, une limite de cout par allie', () => {
  it('ne compte pas la source elle-meme parmi les allies', () => {
    const s = plateau(2);
    const source = perso('src', 'KIDÔMARU', { motsCles: ['Sound Four'] });
    s.activeMissions[0].player1Characters = [source];
    expect(friendlySoundFourIn(s, 'player1', 0, 'src')).toEqual([]);
  });

  it('ignore les allies caches et ceux sans le mot-cle', () => {
    const s = plateau(2);
    const source = perso('src', 'KIDÔMARU', { motsCles: ['Sound Four'] });
    s.activeMissions[0].player1Characters = [
      source,
      perso('cache', 'JIRÔBÔ', { motsCles: ['Sound Four'], cache: true }),
      perso('autre', 'DOSU', { motsCles: ['Team Dosu'] }),
      perso('bon', 'SAKON', { motsCles: ['Sound Four'], cout: 4 }),
    ];
    expect(friendlySoundFourIn(s, 'player1', 0, 'src').map((c) => c.instanceId)).toEqual(['bon']);
  });

  it('la limite de cout inclut l egalite et couvre les deux camps', () => {
    const s = plateau(2);
    s.activeMissions[0].player1Characters = [perso('allie4', 'A', { cout: 4 })];
    s.activeMissions[0].player2Characters = [perso('ennemi4', 'E', { camp: 'player2', cout: 4 }), perso('ennemi5', 'F', { camp: 'player2', cout: 5 })];

    const sous4 = movableUnderCost(s, 4);
    expect(sous4).toEqual(expect.arrayContaining(['allie4', 'ennemi4']));
    expect(sous4).not.toContain('ennemi5');
  });

  it('refuse quand aucun autre Quatre du Son allie n est dans la mission', () => {
    const s = plateau(2);
    const source = perso('src', 'KIDÔMARU', { motsCles: ['Sound Four'] });
    s.activeMissions[0].player1Characters = [source];
    const res = getEffectHandler('SS-035-UC', 'UPGRADE')!({ state: s, sourcePlayer: 'player1', sourceCard: source, sourceMissionIndex: 0 } as never);
    expect(refus(res)).toBe(true);
  });
});
