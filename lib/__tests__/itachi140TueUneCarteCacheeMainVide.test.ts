import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById, getAllCards } from '@/lib/data/cardIndex';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { CardData, CharacterCard, GameState } from '@/lib/engine/types';

beforeAll(() => { initializeRegistry(); });

const ITACHI_SECRET = 'KS-140-S';
const ITACHI_NUMEROTE = 'KS-140-SV';
const ITACHI_SOCLE = 'KS-090-C';
const PETIT = 'KS-005-C';

function plateau(opts: { mainAdverse: number; cacheAdverse?: boolean; visibleAdverse?: boolean }): GameState {
  const p2 = [];
  if (opts.cacheAdverse) p2.push(simChar(PETIT, { owner: 'player2', instanceId: 'cache', hidden: true }));
  if (opts.visibleAdverse) p2.push(simChar(PETIT, { owner: 'player2', instanceId: 'visible' }));

  const s = buildSimState({
    p1: [simChar(ITACHI_SOCLE, { owner: 'player1', instanceId: 'socle' })],
    p2, missions: 1, chakra1: 60,
  });
  s.phase = 'action';
  s.activePlayer = 'player1';
  s.player1.chakra = 60;
  s.player1.hand = [getCardById(ITACHI_SECRET) as CharacterCard];
  s.player2.hand = Array.from({ length: opts.mainAdverse },
    () => getCardById(PETIT) as unknown as CardData) as never;
  return s;
}

function ameliorer(s: GameState): GameState {
  return GameEngine.applyAction(s, 'player1', {
    type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'socle',
  } as never);
}

function repondreTout(etat: GameState, garde = 8): GameState {
  let s = etat;
  for (let i = 0; i < garde && s.pendingActions.length > 0; i += 1) {
    const pa = s.pendingActions[0];
    const options = (pa.options ?? []) as string[];
    const suivant = GameEngine.applyAction(s, pa.player, {
      type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [options[0]],
    } as never);
    if (suivant === s) break;
    s = suivant;
  }
  return s;
}

function enJeu(s: GameState, id: string): boolean {
  return s.activeMissions.some((m) => [...m.player1Characters, ...m.player2Characters]
    .some((c) => c.instanceId === id));
}

describe('la carte enonce un cout, pas une main pleine', () => {
  it('le texte fixe X au nombre de cartes defaussees', () => {
    const carte = getCardById(ITACHI_SECRET) as unknown as CardData;
    const up = (carte.effects ?? []).find((e) => e.type === 'UPGRADE');
    expect(up?.description, 'la formulation exacte compte').toContain('cost X or less');
  });

  it('la version numerotee dit la meme chose et se comporte pareil', () => {
    const numerotee = getCardById(ITACHI_NUMEROTE) as unknown as CardData;
    const base = getCardById(ITACHI_SECRET) as unknown as CardData;
    expect(
      (numerotee.effects ?? []).map((e) => e.description),
      'les deux impressions portent le meme texte',
    ).toEqual((base.effects ?? []).map((e) => e.description));
  });
});

describe('main adverse vide: X vaut 0, une carte cachee coute 0 donc elle peut mourir', () => {
  it('le personnage cache adverse est bien vaincu', () => {
    const apres = repondreTout(ameliorer(plateau({ mainAdverse: 0, cacheAdverse: true })));
    expect(
      enJeu(apres, 'cache'),
      'une carte face cachee vaut 0 en cout: 0 est bien inferieur ou egal a 0',
    ).toBe(false);
    expect(apres.player2.discardPile.length, 'elle part a la defausse').toBeGreaterThan(0);
  });

  it('un personnage visible qui coute plus que 0 est epargne', () => {
    const apres = repondreTout(ameliorer(plateau({ mainAdverse: 0, visibleAdverse: true })));
    expect(enJeu(apres, 'visible'), 'son cout imprime depasse X').toBe(true);
  });

  it('avec un cache et un visible, seul le cache est proposé', () => {
    const ouvert = ameliorer(plateau({ mainAdverse: 0, cacheAdverse: true, visibleAdverse: true }));
    const apres = repondreTout(ouvert);
    expect(enJeu(apres, 'cache'), 'le cache tombe').toBe(false);
    expect(enJeu(apres, 'visible'), 'le visible reste').toBe(true);
  });

  it('sans aucune cible au bon cout, le refus est ecrit dans le journal', () => {
    const apres = repondreTout(ameliorer(plateau({ mainAdverse: 0, visibleAdverse: true })));
    expect(
      apres.log.some((l) => l.messageKey === 'game.log.effect.noTarget'),
      'un effet qui ne fait rien en silence est indiscernable d un bug',
    ).toBe(true);
  });
});

describe('les autres cas continuent de marcher', () => {
  it('une main adverse pleine defausse et permet de viser plus cher', () => {
    const apres = repondreTout(ameliorer(plateau({ mainAdverse: 3, visibleAdverse: true })));
    expect(enJeu(apres, 'visible'), 'cout 2 ou moins pour un X de 3').toBe(false);
  });

  it('pose sans amelioration, une main vide ne fait rien du tout', () => {
    const depart = plateau({ mainAdverse: 0, cacheAdverse: true });
    depart.activeMissions[0].player1Characters = [];
    depart.player1.hand = [getCardById(ITACHI_SECRET) as CharacterCard];
    const joue = GameEngine.applyAction(depart, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0,
    } as never);
    const apres = repondreTout(joue);
    expect(
      enJeu(apres, 'cache'),
      'la defaite est portee par l effet UPGRADE: pose a plat sur une mission vide, elle n a pas lieu',
    ).toBe(true);
  });
});

describe('la famille "cout X ou moins" est verifiee carte par carte', () => {
  const VERIFIEES = new Set([ITACHI_SECRET, ITACHI_NUMEROTE]);

  function cartesAvecSeuilCalcule(): string[] {
    const trouvees: string[] = [];
    for (const carte of getAllCards() as unknown as CardData[]) {
      for (const effet of carte.effects ?? []) {
        const texte = effet.description ?? '';
        if (/\bX or less\b/i.test(texte) && /\bX is\b/i.test(texte)) {
          trouvees.push(carte.id);
          break;
        }
      }
    }
    return trouvees;
  }

  it('aucune carte de cette famille n echappe a un scenario a X egal zero', () => {
    const nouvelles = cartesAvecSeuilCalcule().filter((id) => !VERIFIEES.has(id));
    expect(
      nouvelles,
      'ces cartes visent "cout X ou moins" avec un X calcule. Quand le compte tombe a zero, '
      + 'le seuil vaut toujours: une carte face cachee coute 0 et reste une cible legale. '
      + 'Ecrivez le scenario a zero puis ajoutez la carte a VERIFIEES',
    ).toEqual([]);
  });

  it('la garde voit bien la carte deja traitee', () => {
    expect(cartesAvecSeuilCalcule(), 'sinon elle ne verifie rien').toContain(ITACHI_SECRET);
  });
});
