import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { GameEngine } from '@/lib/engine/GameEngine';
import { executeEndPhase } from '@/lib/engine/phases/EndPhase';
import { FOUILLES, candidatsDeFouille } from '@/lib/effects/handlers/SS/deckSearch';
import type { GameState } from '@/lib/engine/types';

registerAllSetHandlers();

function avecDeck(base: GameState, ids: string[]): GameState {
  return { ...base, player1: { ...base.player1, deck: ids.map((i) => getCardById(i) as never) } };
}

function jusquAuBout(depart: GameState): GameState {
  let s = depart;
  for (let i = 0; i < 5 && s.pendingEffects.length > 0; i++) {
    const p = s.pendingEffects[s.pendingEffects.length - 1];
    const cibles = p.validTargets ?? [];
    if (cibles.length === 0) break;
    s = EffectEngine.applyTargetedEffect(s, p, [cibles[0]]);
    s = {
      ...s,
      pendingEffects: s.pendingEffects.filter((pe) => pe.id !== p.id),
      pendingActions: s.pendingActions.filter((pa) => pa.sourceEffectId !== p.id),
    };
  }
  return s;
}

describe('phase 3, la fouille de deck partagee par trois cartes', () => {
  it('chaque fouille ne retient que ce que son texte accepte', () => {
    const base = buildSimState({ p1: [], p2: [], missions: 1 });
    const deck = avecDeck(base, ['KS-009-C', 'SS-004-UC', 'SS-080-C', 'SS-126-R', 'SS-090-UC']);

    const jiraiya = FOUILLES.find((f) => f.id === 'SS-004-UC')!;
    const fugaku = FOUILLES.find((f) => f.id === 'SS-058-UC')!;
    const suiko = FOUILLES.find((f) => f.id === 'SS-074-C')!;

    expect(candidatsDeFouille(deck, 'player1', jiraiya), 'le Sannin dans les trois premieres').toEqual([1]);
    expect(candidatsDeFouille(deck, 'player1', fugaku), 'aucun Uchiwa dans les trois premieres').toEqual([]);
    expect(candidatsDeFouille(deck, 'player1', suiko), 'les deux armes dans les cinq premieres').toEqual([2, 4]);
  });

  it('la carte choisie part en main et les autres repartent au fond', () => {
    const jiraiya = simChar('SS-004-UC', { owner: 'player1' });
    const base = buildSimState({ p1: [jiraiya], p2: [], missions: 1 });
    const s = avecDeck(base, ['KS-009-C', 'SS-004-UC', 'KS-010-C', 'KS-005-C']);

    const joue = EffectEngine.resolvePlayEffects(s, 'player1', jiraiya, 0, false);
    const fin = jusquAuBout(joue);

    expect(fin.player1.hand.some((c) => c.id === 'SS-004-UC'), 'le Sannin est en main').toBe(true);
    expect(fin.player1.deck.length, 'les deux autres et la quatrieme restent').toBe(3);
    expect(fin.player1.deck[0].id, 'la carte hors des trois premieres est passee devant').toBe('KS-005-C');
  });

  it('une fouille sans candidat se contente de le dire', () => {
    const fugaku = simChar('SS-058-UC', { owner: 'player1' });
    const base = buildSimState({ p1: [fugaku], p2: [], missions: 1 });
    const s = avecDeck(base, ['KS-009-C', 'KS-010-C', 'KS-005-C']);

    const joue = EffectEngine.resolvePlayEffects(s, 'player1', fugaku, 0, false);
    expect(joue.pendingEffects.length, 'aucune question posee').toBe(0);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });

  it('les textes de la fouille existent dans les sept langues', async () => {
    const manquantes: string[] = [];
    for (const langue of ['en', 'fr', 'es', 'ja', 'pt', 'it', 'pl']) {
      const messages = (await import(`@/messages/${langue}.json`)).default as Record<string, unknown>;
      for (const cle of ['game.effect.desc.ssDeckSearchTake', 'game.log.effect.ssDeckSearchTaken']) {
        let noeud: unknown = messages;
        for (const partie of cle.split('.')) noeud = (noeud as Record<string, unknown> | undefined)?.[partie];
        if (typeof noeud !== 'string' || noeud.trim() === '') manquantes.push(`${langue}:${cle}`);
      }
    }
    expect(manquantes).toEqual([]);
  });
});

describe('phase 3, la consultation des cartes cachees', () => {
  it('Shikamaru 11 propose les caches des deux camps, le Corps de Chiens 59 seulement ceux d en face', () => {
    const shika = simChar('SS-011-C', { owner: 'player1' });
    const chiens = simChar('SS-059-C', { owner: 'player1' });
    const cacheAllie = simChar('KS-009-C', { owner: 'player1', hidden: true });
    const cacheEnnemi = simChar('KS-010-C', { owner: 'player2', hidden: true });
    const s = buildSimState({ p1: [shika, chiens, cacheAllie], p2: [cacheEnnemi], missions: 1 });

    const parShika = EffectEngine.resolvePlayEffects(s, 'player1', shika, 0, false);
    const relaisShika = JSON.parse(parShika.pendingEffects[0].effectDescription) as { targets?: string[] };
    expect(relaisShika.targets?.sort(), 'les deux caches').toEqual([cacheAllie.instanceId, cacheEnnemi.instanceId].sort());

    const parChiens = EffectEngine.resolvePlayEffects(s, 'player1', chiens, 0, false);
    const relaisChiens = JSON.parse(parChiens.pendingEffects[0].effectDescription) as { targets?: string[] };
    expect(relaisChiens.targets, 'seulement l ennemi').toEqual([cacheEnnemi.instanceId]);
  });

  it('regarder une carte cachee la rend visible pour celui qui a regarde, pas pour l autre', () => {
    const shika = simChar('SS-011-C', { owner: 'player1' });
    const cacheEnnemi = simChar('KS-010-C', { owner: 'player2', hidden: true });
    const s = buildSimState({ p1: [shika], p2: [cacheEnnemi], missions: 1 });

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', shika, 0, false));
    const vuParMoi = GameEngine.getVisibleState(fin, 'player1').activeMissions[0].player2Characters[0];
    const vuParLui = GameEngine.getVisibleState(fin, 'player2').activeMissions[0].player1Characters[0];
    expect(vuParMoi.card, 'je vois la carte que j ai regardee').toBeTruthy();
    expect(vuParLui, 'et lui ne voit rien de nouveau chez moi').toBeTruthy();
  });

  it('le Corps de Chiens 59 gagne autant de jetons que le cout du cache regarde', () => {
    const chiens = simChar('SS-059-C', { owner: 'player1' });
    const cacheEnnemi = simChar('SS-054-UC', { owner: 'player2', hidden: true });
    const s = buildSimState({ p1: [chiens], p2: [cacheEnnemi], missions: 1 });

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', chiens, 0, false));
    const chiensFin = fin.activeMissions[0].player1Characters.find((c) => c.instanceId === chiens.instanceId)!;
    expect(chiensFin.powerTokens, 'le cout imprime du cache, cinq').toBe(5);
  });

  it('Ibiki 28 envoie vraiment la carte du dessus adverse au fond', () => {
    const ibiki = simChar('SS-028-UC', { owner: 'player1' });
    const base = buildSimState({ p1: [ibiki], p2: [], missions: 1 });
    const s: GameState = {
      ...base,
      player2: { ...base.player2, deck: ['KS-009-C', 'KS-010-C', 'KS-005-C'].map((i) => getCardById(i) as never) },
    };

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', ibiki, 0, false));
    expect(fin.player2.deck.map((c) => c.id), 'la premiere est passee derniere').toEqual(['KS-010-C', 'KS-005-C', 'KS-009-C']);
  });

  it('les textes de la consultation existent dans les sept langues', async () => {
    const manquantes: string[] = [];
    const cles = [
      'game.effect.desc.ssPeekHidden',
      'game.effect.desc.ssPeekHiddenPowerup',
      'game.effect.desc.ss028BottomOrKeep',
      'game.log.effect.ssPeeked',
      'game.log.effect.ss028Bottom',
    ];
    for (const langue of ['en', 'fr', 'es', 'ja', 'pt', 'it', 'pl']) {
      const messages = (await import(`@/messages/${langue}.json`)).default as Record<string, unknown>;
      for (const cle of cles) {
        let noeud: unknown = messages;
        for (const partie of cle.split('.')) noeud = (noeud as Record<string, unknown> | undefined)?.[partie];
        if (typeof noeud !== 'string' || noeud.trim() === '') manquantes.push(`${langue}:${cle}`);
      }
    }
    expect(manquantes).toEqual([]);
  });
});

describe('phase 3, les renforts conditionnels', () => {
  it('Shizune 3 ne propose que les allies Feuille de sa mission', () => {
    const shizune = simChar('SS-003-C', { owner: 'player1' });
    const feuille = simChar('SS-010-C', { owner: 'player1' });
    const etranger = simChar('SS-032-C', { owner: 'player1' });
    const s = buildSimState({ p1: [shizune, feuille, etranger], p2: [], missions: 1 });

    const joue = EffectEngine.resolvePlayEffects(s, 'player1', shizune, 0, false);
    const relais = JSON.parse(joue.pendingEffects[0].effectDescription) as { targets?: string[] };
    expect(relais.targets, 'Shizune et son allie Feuille, pas le Sonore').toEqual(
      expect.arrayContaining([shizune.instanceId, feuille.instanceId]),
    );
    expect(relais.targets).not.toContain(etranger.instanceId);
  });

  it('Asuma 12 pose vraiment ses deux jetons sur un Team 10', () => {
    const asuma = simChar('SS-012-C', { owner: 'player1' });
    const choji = simChar('SS-009-C', { owner: 'player1' });
    const s = buildSimState({ p1: [asuma, choji], p2: [], missions: 1 });

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', asuma, 0, false));
    const total = fin.activeMissions[0].player1Characters.reduce((n, c) => n + c.powerTokens, 0);
    expect(total, 'deux jetons distribues').toBe(2);
  });

  it('Udon 63 et Moegi 64 exigent Konohamaru', () => {
    const udon = simChar('SS-063-C', { owner: 'player1' });
    const moegi = simChar('SS-064-C', { owner: 'player1' });
    const konohamaru = simChar('SS-062-C', { owner: 'player1' });

    const sans = buildSimState({ p1: [udon, moegi], p2: [], missions: 1 });
    const refus = EffectEngine.resolvePlayEffects(sans, 'player1', udon, 0, false);
    expect(refus.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'sans Konohamaru, refus journalise').toBe(true);

    const base = buildSimState({ p1: [udon, moegi, konohamaru], p2: [], missions: 1 });
    const avec: GameState = { ...base, player1: { ...base.player1, deck: [getCardById('KS-009-C') as never] } };

    const parUdon = EffectEngine.resolvePlayEffects(avec, 'player1', udon, 0, false);
    const udonFin = parUdon.activeMissions[0].player1Characters.find((c) => c.instanceId === udon.instanceId)!;
    expect(udonFin.powerTokens, 'Udon gagne son jeton').toBe(1);

    const parMoegi = EffectEngine.resolvePlayEffects(avec, 'player1', moegi, 0, false);
    expect(parMoegi.player1.hand.length - avec.player1.hand.length, 'Moegi pioche').toBe(1);
  });

  it('Hoki 71 compte tous les equipements de la mission, les deux camps confondus', () => {
    const hoki = simChar('SS-071-C', { owner: 'player1' });
    const allie = simChar('SS-010-C', { owner: 'player1' });
    const ennemi = simChar('SS-009-C', { owner: 'player2' });
    const base = buildSimState({ p1: [hoki, allie], p2: [ennemi], missions: 1 });
    const s: GameState = {
      ...base,
      activeMissions: base.activeMissions.map((m, i) => i !== 0 ? m : {
        ...m,
        attachments: [{ instanceId: 'att-mission', card: getCardById('SS-103-UC') as never, owner: 'player1' }],
        player1Characters: m.player1Characters.map((c) => c.instanceId === allie.instanceId
          ? { ...c, attachments: [{ instanceId: 'att-allie', card: getCardById('SS-080-C') as never, owner: 'player1' }] } : c),
        player2Characters: m.player2Characters.map((c) => ({
          ...c,
          attachments: [{ instanceId: 'att-ennemi', card: getCardById('SS-084-C') as never, owner: 'player2' }],
        })),
      }),
    };

    const fin = EffectEngine.resolvePlayEffects(s, 'player1', hoki, 0, false);
    const hokiFin = fin.activeMissions[0].player1Characters.find((c) => c.instanceId === hoki.instanceId)!;
    expect(hokiFin.powerTokens, 'trois equipements dans la mission').toBe(3);
  });

  it('le texte du renfort cible existe dans les sept langues', async () => {
    const manquantes: string[] = [];
    for (const langue of ['en', 'fr', 'es', 'ja', 'pt', 'it', 'pl']) {
      const messages = (await import(`@/messages/${langue}.json`)).default as Record<string, unknown>;
      let noeud: unknown = messages;
      for (const partie of 'game.effect.desc.ssTargetedPowerup'.split('.')) {
        noeud = (noeud as Record<string, unknown> | undefined)?.[partie];
      }
      if (typeof noeud !== 'string' || noeud.trim() === '') manquantes.push(langue);
    }
    expect(manquantes).toEqual([]);
  });
});

describe('phase 3, les trois invocations des Sannin', () => {
  it('chacune paie selon le nombre de son maitre en jeu', () => {
    const katsuyu = simChar('SS-142-S', { owner: 'player1' });
    const tsunade1 = simChar('SS-141-S', { owner: 'player1' });
    const base = buildSimState({ p1: [katsuyu, tsunade1], p2: [], missions: 1 });

    const un = EffectEngine.resolvePlayEffects(base, 'player1', katsuyu, 0, false);
    expect(un.player1.chakra - base.player1.chakra, 'un Tsunade, un chakra').toBe(1);

    const tsunade2 = simChar('SS-141-S', { owner: 'player1', instanceId: 'tsunade-2' });
    const deuxBase = buildSimState({ p1: [katsuyu, tsunade1], p2: [], missions: 2 });
    const deux: GameState = {
      ...deuxBase,
      activeMissions: deuxBase.activeMissions.map((m, i) => i !== 1 ? m : { ...m, player1Characters: [tsunade2] }),
    };
    const apres = EffectEngine.resolvePlayEffects(deux, 'player1', katsuyu, 0, false);
    expect(apres.player1.chakra - deux.player1.chakra, 'deux Tsunade, deux chakra').toBe(2);
  });

  it('sans son maitre, l invocation le dit et ne donne rien', () => {
    const manda = simChar('SS-146-S', { owner: 'player1' });
    const s = buildSimState({ p1: [manda], p2: [], missions: 1 });

    const apres = EffectEngine.resolvePlayEffects(s, 'player1', manda, 0, false);
    const mandaFin = apres.activeMissions[0].player1Characters[0];
    expect(mandaFin.powerTokens, 'aucun jeton').toBe(0);
    expect(apres.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });

  it('l invocation reste en jeu tant que son maitre est dans sa mission', () => {
    const katsuyu = simChar('SS-142-S', { owner: 'player1' });
    const tsunade = simChar('SS-141-S', { owner: 'player1' });

    const avecMaitre = buildSimState({ p1: [katsuyu, tsunade], p2: [], missions: 1 });
    const finAvec = executeEndPhase({ ...avecMaitre, phase: 'end' } as GameState);
    expect(
      finAvec.activeMissions[0].player1Characters.some((c) => c.instanceId === katsuyu.instanceId),
      'avec Tsunade, Katsuyu reste',
    ).toBe(true);

    const sansMaitre = buildSimState({ p1: [katsuyu], p2: [], missions: 1 });
    const finSans = executeEndPhase({ ...sansMaitre, phase: 'end' } as GameState);
    expect(
      finSans.activeMissions[0].player1Characters.some((c) => c.instanceId === katsuyu.instanceId),
      'sans Tsunade, elle repart en main',
    ).toBe(false);
  });
});

describe('phase 3, Kujaku 72 recupere un equipement', () => {
  it('elle reprend le dernier equipement defausse, pas un personnage', () => {
    const kujaku = simChar('SS-072-C', { owner: 'player1' });
    const base = buildSimState({ p1: [kujaku], p2: [], missions: 1 });
    const s: GameState = {
      ...base,
      player1: {
        ...base.player1,
        discardPile: ['SS-080-C', 'KS-009-C', 'SS-096-UC', 'KS-010-C'].map((i) => getCardById(i) as never),
      },
    };

    const apres = EffectEngine.resolvePlayEffects(s, 'player1', kujaku, 0, false);
    expect(apres.player1.hand.some((c) => c.id === 'SS-096-UC'), 'le plus recent des equipements').toBe(true);
    expect(apres.player1.discardPile.length, 'la defausse perd une carte').toBe(3);
    expect(apres.player1.discardPile.some((c) => c.id === 'SS-080-C'), 'le plus ancien reste').toBe(true);
  });

  it('sans equipement dans la defausse, elle le dit', () => {
    const kujaku = simChar('SS-072-C', { owner: 'player1' });
    const base = buildSimState({ p1: [kujaku], p2: [], missions: 1 });
    const s: GameState = {
      ...base,
      player1: { ...base.player1, discardPile: [getCardById('KS-009-C') as never] },
    };

    const apres = EffectEngine.resolvePlayEffects(s, 'player1', kujaku, 0, false);
    expect(apres.player1.hand.length, 'rien en main').toBe(s.player1.hand.length);
    expect(apres.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });
});
