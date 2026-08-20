import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { attachCardToCharacter, enforceAttachmentConditions, parseAttachSpec, hostMatchesAttachSpec, rescueOrphanedAttachments } from '@/lib/effects/attachments';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { getAllCards } from '@/lib/data/cardLoader';
import type { CardData, CharacterCard, CharacterInPlay, GameState, PendingEffect } from '@/lib/engine/types';

const EPEE_SERPENT = 'SS-101-UC';
const KUNAI = 'SS-080-C';
const UKON = 'KS-063-UC';
const SAKON_SON = 'KS-061-C';
const SAKURA_FEUILLE = 'KS-011-C';

function equipementsDe(state: GameState, instanceId: string) {
  for (const m of state.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const c = m[side].find((x) => x.instanceId === instanceId);
      if (c) return c.attachments ?? [];
    }
  }
  return [];
}

function pileDe(carteDuDessous: string): GameState {
  let s = buildSimState({
    p1: [simChar(carteDuDessous, { owner: 'player1', instanceId: 'hote' })],
    p2: [simChar('KS-106-R', { owner: 'player2', instanceId: 'kakashi' })],
    missions: 2, chakra1: 30, chakra2: 30, edgeHolder: 'player1',
  });
  s.phase = 'action';
  const hote = s.activeMissions[0].player1Characters[0];
  const dessus = getCardById(UKON) as CharacterCard;
  hote.stack = [...hote.stack, dessus];
  hote.card = dessus;
  s = attachCardToCharacter(s, 'player1', getCardById(EPEE_SERPENT) as CardData, 'hote');
  return s;
}

function defausseLeDessus(state: GameState): GameState {
  const pending = { sourcePlayer: 'player2', isUpgrade: false } as unknown as PendingEffect;
  return EffectEngine.devolveUpgradedCharacter(state, pending, 'hote');
}

describe('KAKASHI 106 retire la carte du dessus, l equipement suit la condition', () => {
  it('la carte du dessous reste du Village du Son: l EPEE SERPENT reste en place', () => {
    const avant = pileDe(SAKON_SON);
    expect(equipementsDe(avant, 'hote'), 'temoin: l epee est bien posee').toHaveLength(1);

    const apres = enforceAttachmentConditions(defausseLeDessus(avant));
    expect(
      equipementsDe(apres, 'hote').map((a) => a.card.id),
      'la condition Village du Son tient encore sous la carte defaussee',
    ).toEqual([EPEE_SERPENT]);
    expect(apres.player1.discardPile.some((c) => c.id === EPEE_SERPENT)).toBe(false);
  });

  it('la carte du dessous est du Village de la Feuille: l EPEE SERPENT part a la defausse de son proprietaire', () => {
    const avant = pileDe(SAKURA_FEUILLE);
    const apres = enforceAttachmentConditions(defausseLeDessus(avant));

    expect(equipementsDe(apres, 'hote'), 'la condition Village du Son a disparu avec la carte du dessus').toHaveLength(0);
    expect(
      apres.player1.discardPile.some((c) => c.id === EPEE_SERPENT),
      'l equipement rejoint la defausse de son proprietaire, jamais celle de l adversaire',
    ).toBe(true);
    expect(apres.player2.discardPile.some((c) => c.id === EPEE_SERPENT)).toBe(false);
  });

  it('un equipement sans condition de faction survit au meme retrait', () => {
    let avant = buildSimState({
      p1: [simChar(SAKURA_FEUILLE, { owner: 'player1', instanceId: 'hote' })],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    avant.phase = 'action';
    const hote = avant.activeMissions[0].player1Characters[0];
    const dessus = getCardById(UKON) as CharacterCard;
    hote.stack = [...hote.stack, dessus];
    hote.card = dessus;
    avant = attachCardToCharacter(avant, 'player1', getCardById(KUNAI) as CardData, 'hote');

    const apres = enforceAttachmentConditions(defausseLeDessus(avant));
    expect(equipementsDe(apres, 'hote').map((a) => a.card.id)).toEqual([KUNAI]);
  });
});

describe('la regle vaut apres n importe quelle action, pas seulement apres ce retrait', () => {
  it('un simple passage de tour suffit a faire tomber un equipement dont la condition ne tient plus', () => {
    let s = buildSimState({
      p1: [simChar(SAKON_SON, { owner: 'player1', instanceId: 'hote' })],
      p2: [simChar(SAKURA_FEUILLE, { owner: 'player2', instanceId: 'temoin' })],
      missions: 2, chakra1: 30, chakra2: 30, edgeHolder: 'player1',
    });
    s.phase = 'action';
    s = attachCardToCharacter(s, 'player1', getCardById(EPEE_SERPENT) as CardData, 'hote');
    expect(equipementsDe(s, 'hote')).toHaveLength(1);

    const hote = s.activeMissions[0].player1Characters[0];
    const remplacant = getCardById(SAKURA_FEUILLE) as CharacterCard;
    hote.stack = [...hote.stack, remplacant];
    hote.card = remplacant;

    const apres = GameEngine.applyAction(s, 'player1', { type: 'PASS' } as never);
    expect(
      equipementsDe(apres, 'hote'),
      'le filet central tourne a chaque action, aucun equipement ne survit a la perte de sa condition',
    ).toHaveLength(0);
    expect(apres.player1.discardPile.some((c) => c.id === EPEE_SERPENT)).toBe(true);
  });

  it('cacher le porteur retire l equipement qui exige un porteur visible', () => {
    let s = buildSimState({
      p1: [simChar(SAKON_SON, { owner: 'player1', instanceId: 'hote' })],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    s.phase = 'action';
    s = attachCardToCharacter(s, 'player1', getCardById(KUNAI) as CardData, 'hote');
    s.activeMissions[0].player1Characters[0].isHidden = true;

    const apres = enforceAttachmentConditions(s);
    expect(equipementsDe(apres, 'hote'), 'le KUNAI exige un porteur non cache').toHaveLength(0);
    expect(apres.player1.discardPile.some((c) => c.id === KUNAI)).toBe(true);
  });
});

describe('chaque equipement du jeu sait dire si sa condition tient encore', () => {
  it('la condition est relue sur la carte du dessus, pour tous les equipements de personnage', () => {
    const equipements = getAllCards().filter((c) => c.card_type === 'attachment');
    expect(equipements.length, 'le balayage porte sur de vraies cartes').toBeGreaterThan(20);

    const sonique = {
      instanceId: 'x', isHidden: false, powerTokens: 0, attachments: [],
      card: getCardById(SAKON_SON) as CharacterCard,
      stack: [getCardById(SAKON_SON) as CharacterCard],
    } as unknown as CharacterInPlay;
    const feuille = {
      ...sonique,
      card: getCardById(SAKURA_FEUILLE) as CharacterCard,
      stack: [getCardById(SAKURA_FEUILLE) as CharacterCard],
    } as CharacterInPlay;

    for (const equipement of equipements) {
      const spec = parseAttachSpec(equipement as unknown as CardData);
      if (spec.toMission) continue;
      expect(
        typeof hostMatchesAttachSpec(sonique, spec),
        `${equipement.id} doit repondre pour un porteur du Son`,
      ).toBe('boolean');
      expect(
        typeof hostMatchesAttachSpec(feuille, spec),
        `${equipement.id} doit repondre pour un porteur de la Feuille`,
      ).toBe('boolean');
    }

    const specEpee = parseAttachSpec(getCardById(EPEE_SERPENT) as CardData);
    expect(hostMatchesAttachSpec(sonique, specEpee), 'l EPEE SERPENT accepte le Village du Son').toBe(true);
    expect(hostMatchesAttachSpec(feuille, specEpee), 'et refuse la Feuille').toBe(false);
  });
});

describe('quand le retrait fait disparaitre le personnage entier', () => {
  it('la pile chassee par la regle de non repetition emmene l equipement a la defausse de son proprietaire', () => {
    let avant = buildSimState({
      p1: [
        simChar(SAKON_SON, { owner: 'player1', instanceId: 'hote' }),
        simChar('KS-127-R', { owner: 'player1', instanceId: 'jumeau' }),
      ],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    avant.phase = 'action';
    const hote = avant.activeMissions[0].player1Characters[0];
    const dessus = getCardById(UKON) as CharacterCard;
    hote.stack = [...hote.stack, dessus];
    hote.card = dessus;
    avant = attachCardToCharacter(avant, 'player1', getCardById(EPEE_SERPENT) as CardData, 'hote');

    const apres = rescueOrphanedAttachments(avant, defausseLeDessus(avant));

    expect(
      apres.activeMissions[0].player1Characters.some((c) => c.instanceId === 'hote'),
      'SAKON refait surface a cote d un autre SAKON, la pile quitte le jeu',
    ).toBe(false);
    expect(
      apres.player1.discardPile.some((c) => c.id === EPEE_SERPENT),
      'l equipement ne disparait pas avec elle, il rejoint la defausse de son proprietaire',
    ).toBe(true);
  });
});
